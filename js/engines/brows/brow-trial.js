export const SIDES = ["right_brow", "left_brow"];
export const MODES = ["tint", "powder", "lamination"];
export const SIMULATION_LABEL = "Brow tone simulation. No hair or facial structure is generated.";
export const SHADES = {
    deep: [42, 35, 32], neutral: [82, 71, 64], ash: [95, 89, 86], warm: [105, 72, 57],
};
const OPACITY = {
    tint: 0.48, powder: 0.36, lamination: 0.20,
};
export function checkedLevel(input) {
    if (typeof input !== "number" || !Number.isFinite(input) || input < 1 || input > 5) {
        throw new RangeError("level must stay between 1.0 and 5.0");
    }
    const tick = Math.round(input * 10);
    if (Math.abs(input * 10 - tick) > 1e-8)
        throw new RangeError("level must use 0.1 increments");
    return tick / 10;
}
function checkedPhoto(image) {
    if (!image || !(image.data instanceof Uint8Array || image.data instanceof Uint8ClampedArray)) {
        throw new RangeError("brow trial needs byte image pixels");
    }
    const { width, height, channels } = image;
    if ((channels !== 3 && channels !== 4) || !Number.isInteger(width) || !Number.isInteger(height) ||
        Math.min(width, height) < 8 || Math.max(width, height) > 4096 ||
        width * height > 4194304 || image.data.length !== width * height * channels) {
        throw new RangeError("brow trial image dimensions are invalid");
    }
}
export function checkedBox(box) {
    if (box == null)
        return null;
    if (!Array.isArray(box) || box.length !== 4 || box.some(v => !Number.isFinite(v))) {
        throw new RangeError("primary face box needs four finite values");
    }
    if (!(0 <= box[0] && box[0] < box[2] && box[2] <= 1 &&
        0 <= box[1] && box[1] < box[3] && box[3] <= 1)) {
        throw new RangeError("primary face box must have normalized positive area");
    }
    return [box[0], box[1], box[2], box[3]];
}
export function checkedMask(value, size) {
    if (!value || value.length !== size)
        throw new RangeError("brow mask size mismatch");
    const output = new Float64Array(size);
    for (let i = 0; i < size; i++) {
        const alpha = value[i];
        if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) {
            throw new RangeError("brow mask alpha must be in 0..1");
        }
        output[i] = alpha;
    }
    return output;
}
function prepared(value, size) {
    if (!value || !value.masks || !value.states ||
        Object.keys(value.masks).sort().join() !== [...SIDES].sort().join() ||
        Object.keys(value.states).sort().join() !== [...SIDES].sort().join()) {
        throw new RangeError("both observed brow masks and states are required");
    }
    if (value.source !== "manual_or_measured" && value.source !== "observed_geometry") {
        throw new RangeError("brow observation requires reviewed provenance");
    }
    for (const side of SIDES) {
        if (!["visible", "not_visible:hidden_by_turn", "not_visible:occluded"].includes(value.states[side])) {
            throw new RangeError("unknown brow visibility state");
        }
    }
    return {
        masks: {
            right_brow: checkedMask(value.masks.right_brow, size),
            left_brow: checkedMask(value.masks.left_brow, size),
        },
        states: { ...value.states }, source: value.source,
        protected: value.protected ? checkedMask(value.protected, size) : undefined,
    };
}
/** Cache revision hint only, not a security or biometric content digest. */
function fingerprint(bytes) {
    let first = 2166136261;
    let second = 2246822519;
    for (let i = 0; i < bytes.length; i++) {
        first = Math.imul(first ^ bytes[i], 16777619);
        second = Math.imul(second ^ (bytes[i] + i), 3266489917);
    }
    return `${bytes.length}:${first >>> 0}:${second >>> 0}`;
}
export class PixelGuard {
    channels;
    constructor(channels = 3) {
        this.channels = channels;
    }
    guard(before, after, lock) {
        const limit = Math.trunc(12 + (5 - checkedLevel(lock)) * 10);
        const revised = new Uint8ClampedArray(before);
        let total = 0;
        let limited = false;
        for (let i = 0; i < before.length; i++) {
            if (this.channels === 4 && i % 4 === 3)
                continue;
            const delta = after[i] - before[i];
            const bounded = Math.max(-limit, Math.min(limit, delta));
            if (bounded !== delta)
                limited = true;
            revised[i] = before[i] + bounded;
            total += Math.abs(delta);
        }
        const count = before.length / this.channels * 3;
        return { image: revised, similarity: 1 - total / (count * 255), limited };
    }
}
function refused(image, mode, level, status, reason) {
    return { image: new Uint8ClampedArray(image.data), mode, level, status, reason,
        visibleBrows: 0, changedPixels: 0, guardCalled: false, limited: false,
        similarityProxy: null, label: SIMULATION_LABEL };
}
export function safeReport(result) {
    return { format: "beljour-brow-trial/1", status: result.status, reason: result.reason,
        mode: result.mode, level: result.level, visible_brows: result.visibleBrows,
        changed_pixels: result.changedPixels, guard_called: result.guardCalled,
        limited: result.limited, quality_verdict: "UNPROVEN", simulation: true };
}
export class BrowTrialSession {
    source;
    guard;
    capacity;
    observations = new Map();
    photoIds = new WeakMap();
    nextPhotoId = 1;
    maskComputations = 0;
    constructor(source, guard, capacity = 4) {
        this.source = source;
        this.guard = guard;
        this.capacity = capacity;
        if (!Number.isInteger(capacity) || capacity < 1 || capacity > 16) {
            throw new RangeError("brow cache capacity must be 1..16");
        }
    }
    get retainedObservations() { return this.observations.size; }
    invalidate() { this.observations.clear(); }
    render(photo, box, options = {}) {
        checkedPhoto(photo);
        const level = checkedLevel(options.level ?? 2);
        const lock = checkedLevel(options.lockLevel ?? 5);
        const mode = options.mode ?? "tint";
        const shade = options.shade ?? "neutral";
        if (!MODES.includes(mode) || !Object.hasOwn(SHADES, shade)) {
            throw new RangeError("unknown brow mode or illustrative shade");
        }
        const revision = options.revision ?? "0";
        if (typeof revision !== "string" || revision.length < 1 || revision.length > 64) {
            throw new RangeError("mask revision must be bounded text");
        }
        const primary = checkedBox(box);
        if (!primary)
            return refused(photo, mode, level, "no_mesh", "primary_face_unavailable");
        let objectId = this.photoIds.get(photo.data);
        if (objectId === undefined) {
            objectId = this.nextPhotoId++;
            this.photoIds.set(photo.data, objectId);
        }
        const key = `${objectId}:${fingerprint(photo.data)}:${primary.join(",")}:${revision}`;
        let observed = this.observations.get(key);
        if (!observed) {
            const safePhoto = { ...photo, data: new Uint8ClampedArray(photo.data) };
            observed = prepared(this.source.observe(key, safePhoto), photo.width * photo.height);
            this.observations.set(key, observed);
            this.maskComputations++;
            if (this.observations.size > this.capacity) {
                const oldest = this.observations.keys().next().value;
                if (oldest)
                    this.observations.delete(oldest);
            }
        }
        const support = new Float64Array(photo.width * photo.height);
        let visibleBrows = 0;
        for (const side of SIDES) {
            const mask = observed.masks[side];
            const state = observed.states[side];
            let count = 0;
            for (let index = 0; index < mask.length; index++) {
                if (mask[index] < 0.5)
                    continue;
                count++;
                const x = index % photo.width;
                const y = Math.floor(index / photo.width);
                const inBox = x >= primary[0] * photo.width && x < primary[2] * photo.width &&
                    y >= primary[1] * photo.height && y < primary[3] * photo.height;
                if (!inBox)
                    return refused(photo, mode, level, "refused", "brow_outside_primary_face");
                if (state !== "visible")
                    continue;
                if (support[index] > 0) {
                    return refused(photo, mode, level, "refused", "overlapping_brow_masks");
                }
                support[index] = mask[index];
            }
            if (state === "visible" && count < 8) {
                return refused(photo, mode, level, "refused", "unexplained_missing_brow");
            }
            if (state !== "visible" && count > 0) {
                return refused(photo, mode, level, "refused", "contradictory_brow_visibility");
            }
            if (state === "visible")
                visibleBrows++;
        }
        if (visibleBrows === 0)
            return refused(photo, mode, level, "no_observation", "no_visible_brow");
        let selected = 0;
        for (let i = 0; i < support.length; i++) {
            const protectedPixel = observed.protected !== undefined && observed.protected[i] >= 0.5;
            const transparent = photo.channels === 4 && photo.data[i * 4 + 3] === 0;
            if (protectedPixel || transparent)
                support[i] = 0;
            if (support[i] > 0)
                selected++;
        }
        if (!selected)
            return refused(photo, mode, level, "no_observation", "brow_fully_protected");
        const candidate = new Uint8ClampedArray(photo.data);
        const colour = SHADES[shade];
        const scale = ((level - 1) / 4) * OPACITY[mode];
        for (let i = 0; i < support.length; i++) {
            const amount = support[i] * scale;
            for (let channel = 0; channel < 3; channel++) {
                const index = i * photo.channels + channel;
                const original = photo.data[index];
                const target = Math.min(original, colour[channel]);
                candidate[index] = Math.floor(original * (1 - amount) + target * amount + 0.5);
            }
        }
        const guard = this.guard ?? new PixelGuard(photo.channels);
        const decision = guard.guard(new Uint8ClampedArray(photo.data), candidate, lock);
        if (!Number.isFinite(decision.similarity) || decision.similarity < 0 || decision.similarity > 1 ||
            typeof decision.limited !== "boolean") {
            throw new RangeError("brow guard returned invalid decision fields");
        }
        if (!(decision.image instanceof Uint8ClampedArray) || decision.image.length !== photo.data.length) {
            throw new RangeError("brow guard must return a matching byte image");
        }
        const image = new Uint8ClampedArray(photo.data);
        let changedPixels = 0;
        for (let i = 0; i < support.length; i++) {
            if (support[i] <= 0)
                continue;
            let changed = false;
            for (let channel = 0; channel < 3; channel++) {
                const index = i * photo.channels + channel;
                image[index] = decision.image[index];
                changed ||= image[index] !== photo.data[index];
            }
            if (changed)
                changedPixels++;
        }
        return { image, status: changedPixels ? "rendered" : "neutral",
            reason: "observed_local_simulation", mode, level, visibleBrows, changedPixels,
            guardCalled: true, limited: decision.limited,
            similarityProxy: decision.similarity, label: SIMULATION_LABEL };
    }
}
//# sourceMappingURL=brow-trial.js.map