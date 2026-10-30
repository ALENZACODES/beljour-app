/** Per-subject pixel isolation contract for local, already-decoded RGBA frames. */
import { checkedSubjectBoxes, } from "./contract.js";
import { currentSubjectTicket } from "./authority.js";
const MAX_PIXELS = 24_000_000;
function checkedFrame(frame) {
    const { width, height, rgba } = frame;
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)) {
        throw new RangeError("Pixel dimensions must be integers");
    }
    if (width < 1 || height < 1 || width > 16_384 || height > 16_384) {
        throw new RangeError("Pixel dimensions are out of supported range");
    }
    const count = width * height;
    if (!Number.isSafeInteger(count) || count > MAX_PIXELS) {
        throw new RangeError("Image exceeds the local pixel budget");
    }
    if (!(rgba instanceof Uint8ClampedArray) || rgba.byteLength !== count * 4) {
        throw new TypeError("Frame must contain exact RGBA pixels");
    }
    return count;
}
/** Half-open raster footprint covering fractional Canvas antialiasing edges. */
export function pixelFootprint(box, width, height) {
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)) {
        throw new RangeError("Invalid raster size");
    }
    if (width < 1 || height < 1) {
        throw new RangeError("Empty raster is not permitted");
    }
    checkedSubjectBoxes([box]);
    const left = Math.max(0, Math.floor(box.x * width));
    const top = Math.max(0, Math.floor(box.y * height));
    const right = Math.min(width, Math.ceil((box.x + box.width) * width));
    const bottom = Math.min(height, Math.ceil((box.y + box.height) * height));
    if (left >= right || top >= bottom) {
        throw new RangeError("Subject has no visible raster footprint");
    }
    return Object.freeze({ left, top, right, bottom });
}
function protectedIntervals(row, target, bystanders) {
    const spans = [];
    for (const footprint of bystanders) {
        if (row < footprint.top || row >= footprint.bottom)
            continue;
        const left = Math.max(target.left, footprint.left);
        const right = Math.min(target.right, footprint.right);
        if (left < right)
            spans.push({ left, right });
    }
    spans.sort((a, b) => a.left - b.left || a.right - b.right);
    const merged = [];
    for (const current of spans) {
        const last = merged[merged.length - 1];
        if (last && current.left <= last.right) {
            merged[merged.length - 1] = { left: last.left, right: Math.max(last.right, current.right) };
        }
        else {
            merged.push(current);
        }
    }
    return merged;
}
function eligibleIntervals(row, target, bystanders) {
    if (row < target.top || row >= target.bottom)
        return [];
    const blocked = protectedIntervals(row, target, bystanders);
    const permitted = [];
    let cursor = target.left;
    for (const span of blocked) {
        if (cursor < span.left)
            permitted.push({ left: cursor, right: span.left });
        cursor = Math.max(cursor, span.right);
    }
    if (cursor < target.right)
        permitted.push({ left: cursor, right: target.right });
    return permitted;
}
/**
 * Accept only revisions and boxes authorized for the current photo. This
 * protects stale render responses when another photo selects the same ID.
 */
export function composeIsolatedSubject(original, proposed, ticket, snapshot) {
    const totalPixels = checkedFrame(original);
    if (checkedFrame(proposed) !== totalPixels
        || proposed.width !== original.width || proposed.height !== original.height) {
        throw new RangeError("Original and proposed images must have identical dimensions");
    }
    if (!currentSubjectTicket(ticket, snapshot)) {
        throw new Error("The subject selection changed; the proposed edit was rejected");
    }
    const boxes = checkedSubjectBoxes(snapshot.boxes);
    const selected = boxes.find((box) => box.id === snapshot.selectedId);
    if (!selected)
        throw new Error("A checked active subject is required");
    const target = pixelFootprint(selected, original.width, original.height);
    const bystanders = boxes.filter((box) => box.id !== selected.id).map((box) => {
        return pixelFootprint(box, original.width, original.height);
    });
    const output = new Uint8ClampedArray(original.rgba);
    let eligiblePixels = 0;
    let changedPixels = 0;
    let rejectedChanges = 0;
    let changedAlphaPixels = 0;
    let protectedChangedPixels = 0;
    let activeProposedChanges = 0;
    for (let y = 0; y < original.height; y += 1) {
        const intervals = eligibleIntervals(y, target, bystanders);
        let next = 0;
        for (let x = 0; x < original.width; x += 1) {
            while (next < intervals.length && x >= intervals[next].right)
                next += 1;
            const eligible = next < intervals.length
                && x >= intervals[next].left && x < intervals[next].right;
            const offset = (y * original.width + x) * 4;
            const alphaOriginal = original.rgba[offset + 3];
            const alphaProposed = proposed.rgba[offset + 3];
            if (alphaOriginal !== alphaProposed)
                changedAlphaPixels += 1;
            let different = false;
            for (let channel = 0; channel < 4; channel += 1) {
                if (original.rgba[offset + channel] !== proposed.rgba[offset + channel]) {
                    different = true;
                    break;
                }
            }
            if (eligible && alphaOriginal > 0) {
                eligiblePixels += 1;
                if (different)
                    activeProposedChanges += 1;
                // Preserve original transparency. Never copy hidden RGB into clear pixels.
                for (let channel = 0; channel < 3; channel += 1) {
                    output[offset + channel] = proposed.rgba[offset + channel];
                }
                if (output[offset] !== original.rgba[offset]
                    || output[offset + 1] !== original.rgba[offset + 1]
                    || output[offset + 2] !== original.rgba[offset + 2]) {
                    changedPixels += 1;
                }
            }
            else if (different) {
                rejectedChanges += 1;
            }
            if (!eligible && different && y >= target.top && y < target.bottom
                && x >= target.left && x < target.right) {
                protectedChangedPixels += 1;
            }
        }
    }
    const metrics = Object.freeze({
        totalPixels,
        eligiblePixels,
        protectedPixels: totalPixels - eligiblePixels,
        changedPixels,
        rejectedChanges,
        changedAlphaPixels,
        protectedChangedPixels,
        visualEvidence: "synthetic-contract-only",
    });
    if (changedPixels > activeProposedChanges) {
        throw new Error("Isolation count is inconsistent");
    }
    return Object.freeze({
        frame: { width: original.width, height: original.height, rgba: output },
        metrics,
    });
}
/**
 * Independent audit of an output. This is a strict byte-level invariant,
 * not facial identity or quality validation.
 */
export function auditIsolatedSubject(before, after, ticket, snapshot) {
    checkedFrame(before);
    checkedFrame(after);
    if (before.width !== after.width || before.height !== after.height) {
        throw new RangeError("Audit dimensions differ");
    }
    if (!currentSubjectTicket(ticket, snapshot)) {
        throw new Error("Audit target is stale");
    }
    const proposal = composeIsolatedSubject(before, after, ticket, snapshot);
    const count = before.width * before.height;
    for (let pixel = 0; pixel < count; pixel += 1) {
        const start = pixel * 4;
        for (let channel = 0; channel < 4; channel += 1) {
            if (after.rgba[start + channel] !== proposal.frame.rgba[start + channel]) {
                return Object.freeze({
                    ...proposal.metrics,
                    protectedChangedPixels: proposal.metrics.protectedChangedPixels + 1,
                });
            }
        }
    }
    return Object.freeze({ ...proposal.metrics, protectedChangedPixels: 0 });
}
export function subjectIsolationPass(metrics) {
    return metrics.changedAlphaPixels === 0 && metrics.protectedChangedPixels === 0;
}
//# sourceMappingURL=pixel-guard.js.map