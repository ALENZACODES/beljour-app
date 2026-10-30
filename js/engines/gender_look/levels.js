/** Local gender-presentation levels, identity guard and photo-scoped caching. Author: John Khan. */
import { renderGenderLook } from "./index.js";
import { SIGNAL_PRESETS } from "./presets.js";
export const DEFAULT_LOCK_LEVEL = 5;
const anchors = [1, 2, 3.5, 5];
const names = ["neutral", "normal", "extra", "hyper"];
export function checkedLevel(value) {
    if (!Number.isFinite(value) || value < 1 || value > 5 || Math.abs(value * 10 - Math.round(value * 10)) > 1e-8) {
        throw new RangeError("level must be 1.0..5.0 in 0.1 steps");
    }
    return Math.round(value * 10) / 10;
}
export function namedLevel(value) {
    const mapped = { normal: 2, extra: 3.5, hyper: 5 };
    return mapped[value];
}
export function checkedDirection(value) {
    if (value !== "feminine" && value !== "masculine")
        throw new RangeError("unsupported direction");
    return value;
}
export function signalAt(level) {
    const value = checkedLevel(level);
    const zero = {
        level: "normal", browTint: 0, browDensity: 0, skinTexture: 0, stubbleSignal: 0, geometryChange: 0,
    };
    const rows = [zero, SIGNAL_PRESETS.normal, SIGNAL_PRESETS.extra, SIGNAL_PRESETS.hyper];
    for (let index = 0; index < anchors.length - 1; index++) {
        const low = anchors[index];
        const high = anchors[index + 1];
        if (value < low || value > high)
            continue;
        const weight = (value - low) / (high - low);
        const first = rows[index];
        const last = rows[index + 1];
        return {
            level: value <= 2 ? "normal" : value <= 3.5 ? "extra" : "hyper",
            browTint: first.browTint + (last.browTint - first.browTint) * weight,
            browDensity: first.browDensity + (last.browDensity - first.browDensity) * weight,
            skinTexture: first.skinTexture + (last.skinTexture - first.skinTexture) * weight,
            stubbleSignal: first.stubbleSignal + (last.stubbleSignal - first.stubbleSignal) * weight,
            geometryChange: 0,
        };
    }
    throw new RangeError("no matching level interval");
}
function copy(value) {
    const result = new Uint8ClampedArray(new ArrayBuffer(value.length));
    result.set(value);
    return result;
}
function interpolate(before, after, channels, weight) {
    const result = copy(before);
    for (let pixel = 0; pixel < result.length / channels; pixel++) {
        for (let channel = 0; channel < 3; channel++) {
            const offset = pixel * channels + channel;
            result[offset] = Math.trunc(before[offset] + (after[offset] - before[offset]) * weight);
        }
    }
    return result;
}
function primaryMask(width, height, box) {
    if (!box.every(Number.isFinite) || box[0] < 0 || box[1] < 0 || box[2] > 1 || box[3] > 1 ||
        box[0] >= box[2] || box[1] >= box[3]) {
        throw new RangeError("invalid primary face box");
    }
    const mask = new Float32Array(new ArrayBuffer(width * height * 4));
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            mask[y * width + x] = x >= box[0] * width && x < box[2] * width &&
                y >= box[1] * height && y < box[3] * height ? 1 : 0;
        }
    }
    return mask;
}
function masked(masks, gate, width, height) {
    const result = {};
    for (const name of ["brow", "skin", "stubble"]) {
        const original = masks[name] ?? new Float32Array(width * height);
        if (original.length !== width * height)
            throw new RangeError("invalid mask length");
        const selection = new Float32Array(width * height);
        for (let index = 0; index < selection.length; index++) {
            const alpha = original[index];
            if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1)
                throw new RangeError("invalid mask value");
            selection[index] = alpha * gate[index];
        }
        result[name] = selection;
    }
    return result;
}
/** Default lock is a pixel-change bound, not facial recognition or an identity score. */
export class PixelChangeGuard {
    guard(before, after, channels, lockLevel) {
        const strength = checkedLevel(lockLevel);
        let total = 0;
        for (let pixel = 0; pixel < before.length / channels; pixel++) {
            for (let channel = 0; channel < 3; channel++) {
                const offset = pixel * channels + channel;
                total += Math.abs(before[offset] - after[offset]);
            }
        }
        const difference = total / (before.length / channels * 3);
        const similarity = 1 - difference / 255;
        const limit = 0.0015 + 0.0185 * (5 - strength) / 4;
        if (difference === 0 || similarity >= 1 - limit) {
            return { image: copy(after), similarity, blendedBack: false };
        }
        return {
            image: interpolate(before, after, channels, limit * 255 / difference),
            similarity,
            blendedBack: true,
        };
    }
}
/** Hash injected by caller is a photo digest; no photos or masks are persisted. */
export class GenderLevelEngine {
    masksByPhoto = new Map();
    candidates = new Map();
    maskSource;
    guard;
    maskComputations = 0;
    constructor(source, guard = new PixelChangeGuard()) {
        this.maskSource = source;
        this.guard = guard;
    }
    invalidate(photoHash) {
        if (photoHash === undefined) {
            this.masksByPhoto.clear();
            this.candidates.clear();
            return;
        }
        this.masksByPhoto.delete(photoHash);
        for (const key of this.candidates.keys()) {
            if (key.startsWith(`${photoHash}:`))
                this.candidates.delete(key);
        }
    }
    render(photo, photoHash, direction, level, options) {
        const selected = checkedLevel(level);
        checkedDirection(direction);
        const lock = checkedLevel(options.lockLevel ?? DEFAULT_LOCK_LEVEL);
        if (photo.data.length !== photo.width * photo.height * photo.channels)
            throw new RangeError("invalid photo bytes");
        if (options.primaryBox === null) {
            return {
                data: copy(photo.data), direction, level: selected, status: "no_mesh", changedShare: 0,
                guardCalled: false, similarity: null, blendedBack: false, simulation: true,
            };
        }
        let observed = this.masksByPhoto.get(photoHash);
        if (observed === undefined) {
            observed = this.maskSource.masks(photoHash, photo);
            if (!observed.brow || !observed.skin)
                throw new RangeError("required mask absent");
            this.masksByPhoto.set(photoHash, observed);
            this.maskComputations++;
        }
        const key = `${photoHash}:${direction}:${selected}:${options.primaryBox.join(",")}`;
        let candidate = this.candidates.get(key);
        if (candidate === undefined) {
            const scope = primaryMask(photo.width, photo.height, options.primaryBox);
            const masks = masked(observed, scope, photo.width, photo.height);
            for (let index = 0; index < anchors.length - 1; index++) {
                const low = anchors[index];
                const high = anchors[index + 1];
                if (selected < low || selected > high)
                    continue;
                const first = low === 1 ? photo.data : renderGenderLook(photo, masks, {
                    direction, level: names[index], amount: 1,
                }).data;
                const last = renderGenderLook(photo, masks, {
                    direction, level: names[index + 1], amount: 1,
                }).data;
                candidate = interpolate(first, last, photo.channels, (selected - low) / (high - low));
                break;
            }
            if (candidate === undefined)
                throw new RangeError("level interval missing");
            this.candidates.set(key, candidate);
        }
        const decision = this.guard.guard(photo.data, copy(candidate), photo.channels, lock);
        if (decision.image.length !== photo.data.length)
            throw new RangeError("incompatible guarded image");
        const safe = copy(decision.image);
        const scope = primaryMask(photo.width, photo.height, options.primaryBox);
        for (let pixel = 0; pixel < scope.length; pixel++) {
            const offset = pixel * photo.channels;
            if (scope[pixel] === 0) {
                for (let channel = 0; channel < 3; channel++)
                    safe[offset + channel] = photo.data[offset + channel];
            }
            if (photo.channels === 4)
                safe[offset + 3] = photo.data[offset + 3];
        }
        let changed = 0;
        for (let pixel = 0; pixel < photo.width * photo.height; pixel++) {
            const offset = pixel * photo.channels;
            if ([0, 1, 2].some(channel => safe[offset + channel] !== photo.data[offset + channel]))
                changed++;
        }
        let result = safe;
        if (options.previewEdge !== undefined) {
            if (options.previewEdge < 16)
                throw new RangeError("preview edge must be >= 16");
            const scale = Math.min(1, options.previewEdge / Math.max(photo.width, photo.height));
            const width = Math.max(1, Math.round(photo.width * scale));
            const height = Math.max(1, Math.round(photo.height * scale));
            const smaller = new Uint8ClampedArray(width * height * photo.channels);
            for (let y = 0; y < height; y++) {
                const sourceY = Math.trunc(y * (photo.height - 1) / Math.max(height - 1, 1));
                for (let x = 0; x < width; x++) {
                    const sourceX = Math.trunc(x * (photo.width - 1) / Math.max(width - 1, 1));
                    const offset = (y * width + x) * photo.channels;
                    const source = (sourceY * photo.width + sourceX) * photo.channels;
                    for (let channel = 0; channel < photo.channels; channel++) {
                        smaller[offset + channel] = result[source + channel];
                    }
                }
            }
            result = smaller;
        }
        return {
            data: result, direction, level: selected, status: "rendered",
            changedShare: changed / (photo.width * photo.height), guardCalled: true,
            similarity: decision.similarity, blendedBack: decision.blendedBack, simulation: true,
        };
    }
}
//# sourceMappingURL=levels.js.map