/** Shared pieces of the local photo studio: photo and mask checks, coded refusals, seeded
 * hash noise, mask-weighted blurs, the guided matte filter and the face box (from her own
 * face points only). Mirrors api/plumb_api/engines/studio/common.py in the same operation
 * order. Planes are Float64Array (height x width); RGB is interleaved Float64Array (x3).
 * Author: John Khan.
 */
import { boxMean, MAX_RADIUS } from "../core/filters.js";
import { toByte } from "../shade/colourspace.js";
export const MAX_PIXELS = 4096 * 4096;
export const MIN_SIDE = 32;
export class StudioRefusal extends RangeError {
    code;
    constructor(code, message) { super(message); this.name = "StudioRefusal"; this.code = code; }
}
export function photo(image) {
    const { width: w, height: h, channels: c, data } = image;
    if ((c !== 3 && c !== 4) || data.length !== w * h * c)
        throw new RangeError("photo must be RGB or RGBA uint8");
    if (Math.min(w, h) < MIN_SIDE || w * h > MAX_PIXELS) {
        throw new StudioRefusal("photo_size", `photo must be at least ${MIN_SIDE} px a side and at most ${MAX_PIXELS} pixels`);
    }
    const n = w * h, rgb = new Float64Array(n * 3), alpha = c === 4 ? new Uint8Array(n) : null;
    for (let i = 0; i < n; i++) {
        for (let k = 0; k < 3; k++)
            rgb[i * 3 + k] = data[i * c + k];
        if (alpha)
            alpha[i] = data[i * c + 3];
    }
    return { width: w, height: h, rgb, alpha };
}
export function personMask(mask, width, height) {
    if (!mask)
        throw new StudioRefusal("no_person_mask", "Mark the person area or run the person segmenter on this device first.");
    if (mask.length !== width * height)
        throw new RangeError("person mask must be a finite height x width plane");
    const out = new Float64Array(mask.length);
    let sum = 0;
    for (let i = 0; i < mask.length; i++) {
        if (!Number.isFinite(mask[i]))
            throw new RangeError("person mask must be a finite height x width plane");
        out[i] = Math.min(1, Math.max(0, mask[i]));
        sum += out[i];
    }
    const share = sum / mask.length;
    if (share < 0.02 || share > 0.98)
        throw new StudioRefusal("person_mask_unusable", "The person area covers almost none or almost all of the photo.");
    return out;
}
export function strength(value) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100)
        throw new RangeError("strength must be 0..100");
    return value / 100;
}
export function hashNoise(width, height, seed) {
    const out = new Float64Array(width * height);
    const s = Math.imul(seed >>> 0, 2246822519);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + s) >>> 0;
            h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
            h = (h ^ (h >>> 16)) >>> 0;
            out[y * width + x] = h / 4294967296;
        }
    }
    return out;
}
export const halfUp = (v) => Math.floor(v + 0.5);
export function radiusFor(width, height, share) {
    return Math.min(MAX_RADIUS, Math.max(1, halfUp(Math.min(width, height) * share)));
}
/** Box mean of a plane or an interleaved multi-channel array. */
export function box(values, width, height, radius, channels = 1) {
    return boxMean({ width, height, channels, data: values }, radius).data;
}
export function softBlur(values, width, height, radius, channels = 1) {
    let out = values;
    for (let pass = 0; pass < 3; pass++)
        out = box(out, width, height, radius, channels);
    return out;
}
export function weightedBlur(rgb, weight, width, height, radius) {
    const n = width * height, num = new Float64Array(n * 3);
    for (let i = 0; i < n; i++)
        for (let k = 0; k < 3; k++)
            num[i * 3 + k] = rgb[i * 3 + k] * weight[i];
    const a = softBlur(num, width, height, radius, 3), d = softBlur(weight, width, height, radius);
    const out = new Float64Array(n * 3);
    for (let i = 0; i < n; i++) {
        const den = Math.max(d[i], 1e-6);
        for (let k = 0; k < 3; k++)
            out[i * 3 + k] = a[i * 3 + k] / den;
    }
    return out;
}
export function grey(rgb) {
    const n = rgb.length / 3, out = new Float64Array(n);
    for (let i = 0; i < n; i++)
        out[i] = (rgb[i * 3] * 0.2126 + rgb[i * 3 + 1] * 0.7152 + rgb[i * 3 + 2] * 0.0722) / 255;
    return out;
}
/** Guided filter of `source` steered by `guide`, written from the published equations
 * (He, Sun and Tang, 2010) with box means. */
export function guided(guide, source, width, height, radius, eps) {
    const n = guide.length, ip = new Float64Array(n), ii = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        ip[i] = guide[i] * source[i];
        ii[i] = guide[i] * guide[i];
    }
    const mi = box(guide, width, height, radius), mp = box(source, width, height, radius);
    const cip = box(ip, width, height, radius), cii = box(ii, width, height, radius);
    const a = new Float64Array(n), b = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        const variance = cii[i] - mi[i] * mi[i];
        a[i] = (cip[i] - mi[i] * mp[i]) / (variance + eps);
        b[i] = mp[i] - a[i] * mi[i];
    }
    const ma = box(a, width, height, radius), mb = box(b, width, height, radius);
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++)
        out[i] = ma[i] * guide[i] + mb[i];
    return out;
}
export function faceBox(points) {
    if (!points)
        throw new StudioRefusal("no_face_points", "Read face points on this device first.");
    if (points.length !== 478)
        throw new RangeError("face points must be 478 finite (x, y) pairs");
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of points) {
        if (!Number.isFinite(p[0]) || !Number.isFinite(p[1]))
            throw new RangeError("face points must be 478 finite (x, y) pairs");
        x0 = Math.min(x0, p[0]);
        y0 = Math.min(y0, p[1]);
        x1 = Math.max(x1, p[0]);
        y1 = Math.max(y1, p[1]);
    }
    return [x0, y0, x1, y1];
}
/** [row0, row1, col0, col1) of the face box, clipped to the photo. */
export function faceRange(box, width, height) {
    const [x0, y0, x1, y1] = box.map(halfUp);
    return [Math.max(0, y0), Math.min(height, y1 + 1), Math.max(0, x0), Math.min(width, x1 + 1)];
}
export function finish(rgb, alpha) {
    const n = rgb.length / 3, c = alpha ? 4 : 3, out = new Uint8Array(n * c);
    for (let i = 0; i < n; i++) {
        for (let k = 0; k < 3; k++)
            out[i * c + k] = toByte(rgb[i * 3 + k]);
        if (alpha)
            out[i * c + 3] = alpha[i];
    }
    return { data: out, channels: c };
}
export function changedShare(before, after, channels, where) {
    let moved = 0, total = 0;
    for (let i = 0; i < where.length; i++) {
        let diff = false;
        for (let k = 0; k < 3; k++)
            diff ||= toByte(before[i * 3 + k]) !== after[i * channels + k];
        moved += (diff ? 1 : 0) * where[i];
        total += where[i];
    }
    return total ? moved / total : 0;
}
//# sourceMappingURL=common.js.map