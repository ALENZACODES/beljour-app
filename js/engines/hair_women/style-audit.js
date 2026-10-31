import { definition } from "./style-guides.js";
const groupKinds = new Set(["monk", "gender", "age", "yaw", "texture", "occlusion", "intersection"]);
function checkedMask(mask, expected) {
    if (mask.length !== expected)
        throw new RangeError("evaluation mask has wrong dimensions");
    for (const alpha of mask) {
        if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) {
            throw new RangeError("evaluation mask outside [0,1]");
        }
    }
}
/** No synthetic evidence can return PASS, even when all byte invariants hold. */
export function auditStyle(photo, preview, allowedMask, protectedMask) {
    if (preview.status !== "rendered")
        throw new RangeError("refused preview cannot be scored as rendered");
    definition(preview.styleId);
    const total = photo.width * photo.height;
    const channels = photo.channels;
    if (channels !== 3 && channels !== 4 || photo.data.length !== total * channels ||
        preview.data.length !== total * channels) {
        throw new RangeError("image pair dimensions do not match");
    }
    checkedMask(allowedMask, total);
    if (protectedMask !== undefined)
        checkedMask(protectedMask, total);
    let selectedCount = 0;
    let changedCount = 0;
    let outsideCount = 0;
    let protectedCount = 0;
    let alphaCount = 0;
    let clippedCount = 0;
    let selectedSum = 0;
    let selectedMaximum = 0;
    let errors = false;
    for (let pixel = 0; pixel < total; pixel++) {
        const offset = pixel * channels;
        const allowed = allowedMask[pixel] > 0;
        const protectedPixel = (protectedMask?.[pixel] ?? 0) > 0;
        const selected = allowed && !protectedPixel;
        if (selected)
            selectedCount++;
        let changed = false;
        for (let channel = 0; channel < 3; channel++) {
            const before = photo.data[offset + channel];
            const after = preview.data[offset + channel];
            const difference = Math.abs(before - after);
            if (difference !== 0)
                changed = true;
            if (selected) {
                selectedSum += difference;
                selectedMaximum = Math.max(selectedMaximum, difference);
                if ((after === 0 || after === 255) && before !== 0 && before !== 255)
                    clippedCount++;
            }
        }
        if (changed) {
            changedCount++;
            if (!allowed)
                outsideCount++;
            if (protectedPixel)
                protectedCount++;
        }
        if (channels === 4 && photo.data[offset + 3] !== preview.data[offset + 3])
            alphaCount++;
        if (preview.coverage.length !== total)
            errors = true;
        else if (preview.coverage[pixel] > 0 && !selected)
            errors = true;
    }
    const mean = selectedCount > 0 ? selectedSum / (selectedCount * 3) : 0;
    errors ||= outsideCount > 0 || protectedCount > 0 || alphaCount > 0 || !preview.guardCalled;
    errors ||= preview.level === 1 && changedCount > 0;
    errors ||= !Number.isFinite(mean) || selectedMaximum > 255;
    return {
        styleId: preview.styleId, texture: preview.texture, level: preview.level,
        selectedPixelCount: selectedCount, changedPixelCount: changedCount,
        outsidePixelCount: outsideCount, protectedPixelCount: protectedCount,
        alphaPixelCount: alphaCount, clippedChannelCount: clippedCount,
        meanSelectedDelta: mean, maximumSelectedDelta: selectedMaximum,
        guardCalled: preview.guardCalled, status: errors ? "FAIL" : "UNPROVEN",
    };
}
export function monotoneCoverage(rows) {
    if (rows.length === 0)
        throw new RangeError("coverage sequence is empty");
    const reference = rows[0];
    const visited = new Set();
    let previous = -1;
    for (const row of [...rows].sort((a, b) => a.level - b.level)) {
        if (row.styleId !== reference.styleId || row.texture !== reference.texture ||
            row.coverage.length !== reference.coverage.length) {
            throw new RangeError("mixed styles or dimensions");
        }
        if (visited.has(row.level))
            throw new RangeError("duplicate level");
        visited.add(row.level);
        let count = 0;
        for (const value of row.coverage)
            if (value > 0)
                count++;
        if (count < previous)
            return false;
        previous = count;
    }
    return true;
}
export function countGroups(records) {
    const totals = new Map();
    for (const [kind, name, row] of records) {
        if (!groupKinds.has(kind) || !/^[a-zA-Z0-9 _+\-]{1,40}$/.test(name)) {
            throw new RangeError("unsafe group label");
        }
        const key = `${kind}:${name}`;
        const previous = totals.get(key);
        totals.set(key, {
            groupKind: kind, groupName: name,
            observed: (previous?.observed ?? 0) + 1,
            failed: (previous?.failed ?? 0) + (row.status === "FAIL" ? 1 : 0),
            unproven: (previous?.unproven ?? 0) + (row.status === "UNPROVEN" ? 1 : 0),
            outsideMaskErrors: (previous?.outsideMaskErrors ?? 0) + row.outsidePixelCount + row.protectedPixelCount,
            alphaErrors: (previous?.alphaErrors ?? 0) + row.alphaPixelCount,
        });
    }
    return [...totals.values()].sort((a, b) => a.groupKind.localeCompare(b.groupKind) || a.groupName.localeCompare(b.groupName));
}
export function assertEvidenceSchema(rows) {
    const fields = ["groupKind", "groupName", "observed", "failed", "unproven",
        "outsideMaskErrors", "alphaErrors"];
    let count = 0;
    for (const entry of rows) {
        if (Object.keys(entry).sort().join("|") !== [...fields].sort().join("|")) {
            throw new RangeError("unexpected evidence fields");
        }
        if (!groupKinds.has(String(entry.groupKind)) ||
            !/^[a-zA-Z0-9 _+\-]{1,40}$/.test(String(entry.groupName))) {
            throw new RangeError("invalid group identity");
        }
        for (const field of fields.slice(2)) {
            const value = entry[field];
            if (!Number.isInteger(value) || Number(value) < 0)
                throw new RangeError("invalid evidence count");
        }
        if (entry.observed !== Number(entry.failed) + Number(entry.unproven)) {
            throw new RangeError("synthetic evidence cannot claim a pass");
        }
        count += Number(entry.observed);
    }
    return count;
}
