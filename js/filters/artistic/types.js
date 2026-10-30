/** Shared validation and numerical contract for original artistic simulations.
 * RGB/RGBA bytes, normalized 478-point mesh, masks in 0..1. Author: John Khan.
 */
export const VERSION = "artistic-local/1";
export const MAX_PIXELS = 4_194_304;
export const MAX_SIDE = 8192;
export class EffectUnavailable extends RangeError {
    code;
    constructor(code, message) {
        super(message);
        this.name = "EffectUnavailable";
        this.code = code;
    }
}
export function photo(value, maxPixels = MAX_PIXELS) {
    if (!value || (value.channels !== 3 && value.channels !== 4)
        || !(value.data instanceof Uint8Array || value.data instanceof Uint8ClampedArray)) {
        throw new RangeError("photo must be a uint8 RGB or RGBA image");
    }
    const { width: w, height: h, channels: c } = value;
    if (!Number.isInteger(w) || !Number.isInteger(h) || Math.min(w, h) < 2
        || Math.max(w, h) > MAX_SIDE || w * h > maxPixels || value.data.length !== w * h * c) {
        throw new RangeError("artistic working photo size is invalid or exceeds the working budget");
    }
    return value;
}
export function mask(value, count, name) {
    if (value === undefined || value === null) {
        throw new EffectUnavailable(`missing_${name}`, `${name.replaceAll("_", " ")} is required; add an observed or manual mask`);
    }
    if (value.length !== count)
        throw new RangeError(`${name} must match the photo`);
    const out = new Float64Array(count);
    for (let i = 0; i < count; i++) {
        if (typeof value[i] !== "number" || !Number.isFinite(value[i]) || value[i] < 0 || value[i] > 1) {
            throw new RangeError(`${name} must contain finite 0..1 values`);
        }
        out[i] = value[i];
    }
    return out;
}
export function landmarks(value, w, h) {
    if (value === undefined || value === null)
        throw new EffectUnavailable("missing_landmarks", "a confirmed face mesh is required");
    if (!Array.isArray(value) || value.length !== 478)
        throw new RangeError("landmarks must contain 478 normalized x,y points");
    const points = value.map((p) => {
        if (!Array.isArray(p) || (p.length !== 2 && p.length !== 3)
            || p.some((v) => typeof v !== "number" || !Number.isFinite(v))
            || p[0] < -0.5 || p[0] > 1.5 || p[1] < -0.5 || p[1] > 1.5) {
            throw new RangeError("landmarks must be finite normalized coordinates near the frame");
        }
        return [p[0] * w, p[1] * h];
    });
    const iod = Math.hypot(points[468][0] - points[473][0], points[468][1] - points[473][1]);
    if (iod < 4 || iod > Math.max(w, h))
        throw new EffectUnavailable("mesh_too_small", "the confirmed eye distance must be at least four pixels");
    return points;
}
export function number(value, name, low, high) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < low || value > high) {
        throw new RangeError(`${name} must be a finite number in ${low}..${high}`);
    }
    return value;
}
export function integer(value, name, low, high) {
    const result = number(value, name, low, high);
    if (!Number.isInteger(result))
        throw new RangeError(`${name} must be an integer`);
    return result;
}
export function parameters(value, defaults) {
    if (value === undefined)
        return { ...defaults };
    if (value === null || typeof value !== "object" || Array.isArray(value))
        throw new RangeError("params must be a mapping");
    for (const key of Object.keys(value)) {
        if (!Object.hasOwn(defaults, key))
            throw new RangeError(`unknown artistic parameters: ${key}`);
    }
    return { ...defaults, ...value };
}
export const clamp01 = (v) => Math.min(1, Math.max(0, v));
export const byteRound = (v) => Math.floor(Math.min(255, Math.max(0, v)) + 0.5);
export const smooth01 = (v) => {
    const t = clamp01(v);
    return t * t * (3 - 2 * t);
};
export const luma = (r, g, b) => r * 0.2126 + g * 0.7152 + b * 0.0722;
export function rgbValues(source) {
    const rgb = new Float64Array(source.width * source.height * 3);
    for (let i = 0; i < source.width * source.height; i++) {
        for (let c = 0; c < 3; c++)
            rgb[i * 3 + c] = source.data[i * source.channels + c];
    }
    return rgb;
}
export function blend(source, rgb, coverage) {
    const out = Uint8ClampedArray.from(source.data);
    for (let i = 0; i < coverage.length; i++) {
        const o = i * source.channels;
        const a = source.channels === 4 && source.data[o + 3] === 0 ? 0 : clamp01(coverage[i]);
        for (let c = 0; c < 3; c++)
            out[o + c] = byteRound(source.data[o + c] * (1 - a) + rgb[i * 3 + c] * a);
    }
    return out;
}
export function evidence(before, after, support) {
    let changed = 0, total = 0, outside = 0, alphaSame = true, transparentSame = true, finite = true;
    for (let i = 0; i < support.length; i++) {
        const o = i * before.channels;
        let pixelChanged = false;
        for (let c = 0; c < 3; c++) {
            const delta = Math.abs(after[o + c] - before.data[o + c]);
            pixelChanged ||= delta !== 0;
            total += delta;
            finite &&= Number.isFinite(after[o + c]);
            if (support[i] <= 0)
                outside = Math.max(outside, delta);
            if (before.channels === 4 && before.data[o + 3] === 0 && delta !== 0)
                transparentSame = false;
        }
        if (pixelChanged)
            changed++;
        if (before.channels === 4 && before.data[o + 3] !== after[o + 3])
            alphaSame = false;
    }
    return { finite, changed_pixels: changed, mean_channel_change: total / (support.length * 3),
        outside_max_error: outside, alpha_unchanged: alphaSame, transparent_unchanged: transparentSame };
}
export function result(effectId, before, after, support, label, metrics = {}, warnings = [], geometry = {}) {
    return { image: after, support, metrics: { ...evidence(before, after, support), ...metrics },
        warnings, label, effect_id: effectId, version: VERSION, geometry };
}
export function hashNoise(x, y, seed) {
    let a = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 2246822519)) >>> 0;
    a = Math.imul(a ^ (a >>> 13), 1274126177) >>> 0;
    a ^= a >>> 16;
    return (a >>> 0) / 4294967295;
}
export function bilinear(source, x, y) {
    const out = new Float64Array(x.length * 3);
    const { width: w, height: h, channels: c, data } = source;
    for (let i = 0; i < x.length; i++) {
        const px = Math.min(w - 1, Math.max(0, x[i])), py = Math.min(h - 1, Math.max(0, y[i]));
        const ix = Math.floor(px), iy = Math.floor(py), jx = Math.min(w - 1, ix + 1), jy = Math.min(h - 1, iy + 1);
        const fx = px - ix, fy = py - iy;
        for (let k = 0; k < 3; k++) {
            const top = data[(iy * w + ix) * c + k] * (1 - fx) + data[(iy * w + jx) * c + k] * fx;
            const bottom = data[(jy * w + ix) * c + k] * (1 - fx) + data[(jy * w + jx) * c + k] * fx;
            out[i * 3 + k] = top * (1 - fy) + bottom * fy;
        }
    }
    return out;
}
//# sourceMappingURL=types.js.map