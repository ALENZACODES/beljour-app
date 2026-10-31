export const clamp01 = (x) => Math.max(0, Math.min(1, x));
export const smooth01 = (x) => { const u = clamp01(x); return u * u * (3 - 2 * u); };
export const byte = (x) => Math.max(0, Math.min(255, Math.round(x)));
export const renderClock = () => typeof performance !== "undefined" ? performance.now() : Date.now();
export const lumaAt = (image, i) => {
    const j = i * image.channels;
    return 0.2126 * image.data[j] + 0.7152 * image.data[j + 1] + 0.0722 * image.data[j + 2];
};
/** O(N) box mean with clamped support at the frame boundary. */
export function boxPlane(src, w, h, r) {
    if (src.length !== w * h || w < 1 || h < 1)
        throw new RangeError("plane dimensions do not match");
    const radius = Math.max(0, Math.floor(r)), stride = w + 1;
    if (radius === 0)
        return Float64Array.from(src);
    const integral = new Float64Array((w + 1) * (h + 1));
    for (let y = 1; y <= h; y++) {
        let sum = 0;
        for (let x = 1; x <= w; x++) {
            sum += src[(y - 1) * w + x - 1];
            integral[y * stride + x] = integral[(y - 1) * stride + x] + sum;
        }
    }
    const out = new Float64Array(w * h);
    for (let y = 0; y < h; y++) {
        const y0 = Math.max(0, y - radius), y1 = Math.min(h, y + radius + 1);
        for (let x = 0; x < w; x++) {
            const x0 = Math.max(0, x - radius), x1 = Math.min(w, x + radius + 1);
            out[y * w + x] = (integral[y1 * stride + x1] - integral[y0 * stride + x1]
                - integral[y1 * stride + x0] + integral[y0 * stride + x0]) / ((x1 - x0) * (y1 - y0));
        }
    }
    return out;
}
/** Exact source high-band restoration for a scalar channel, except for 8-bit clipping. */
export function replaceLowBand(original, newLow, w, h, radius) {
    if (newLow.length !== w * h)
        throw new RangeError("low band dimensions do not match");
    const oldLow = boxPlane(original, w, h, radius), out = new Float64Array(w * h);
    for (let i = 0; i < out.length; i++)
        out[i] = newLow[i] + original[i] - oldLow[i];
    return out;
}
export function highBandEnergy(values, w, h, mask, radius = 2) {
    if (values.length !== w * h || mask.length !== w * h)
        throw new RangeError("energy dimensions do not match");
    const low = boxPlane(values, w, h, radius);
    let s = 0, s2 = 0, count = 0;
    for (let i = 0; i < values.length; i++)
        if (mask[i] >= 0.9) {
            const v = values[i] - low[i];
            s += v;
            s2 += v * v;
            count++;
        }
    return count > 16 ? Math.sqrt(Math.max(0, s2 / count - (s / count) ** 2)) : 0;
}
export function lumaPlane(img) {
    const n = img.width * img.height, result = new Float64Array(n);
    for (let i = 0; i < n; i++)
        result[i] = lumaAt(img, i);
    return result;
}
export function deltaCoverage(before, after, mask, threshold = 8) {
    const n = before.width * before.height;
    if (before.width !== after.width || before.height !== after.height || mask.length !== n)
        throw new RangeError("coverage dimensions do not match");
    let changed = 0, total = 0;
    for (let i = 0; i < n; i++)
        if (mask[i] > 0.5) {
            total++;
            const j = i * before.channels, k = i * after.channels;
            if (Math.max(Math.abs(before.data[j] - after.data[k]), Math.abs(before.data[j + 1] - after.data[k + 1]), Math.abs(before.data[j + 2] - after.data[k + 2])) > threshold)
                changed++;
        }
    return total ? changed / total : 0;
}
export function seeded(seed) {
    let state = seed >>> 0;
    return () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state / 4294967296; };
}
export function fieldHash(x, y, seed) {
    let n = (Math.imul(x + 0x63d83595, 0x7feb352d) ^ Math.imul(y + 0x394757, 0x846ca68b) ^ seed) >>> 0;
    n = Math.imul(n ^ (n >>> 16), 0x7feb352d) >>> 0;
    return ((n ^ (n >>> 15)) >>> 0) / 4294967296;
}
/** Border of the supported matte. Constrains edits to supplied/photometrically verified skin. */
export function softMask(mask, w, h, r = 2) {
    const base = Float64Array.from(mask, clamp01), smooth = boxPlane(base, w, h, r);
    const out = new Float64Array(w * h);
    for (let i = 0; i < out.length; i++)
        out[i] = clamp01(smooth[i]);
    return out;
}
/**
 * Texture Law in one step: keep only the low-frequency part of an edit. The per-channel change (out - input) is
 * blurred with a Gaussian of `sigma` px and added back to the input, so the person's own high band (pores, fine
 * lines, marks) is carried through at its original absolute amplitude. Pixels with zero weight are left as input.
 */
export function lowBandOnly(input, out, sigma, weight, blur = (p, w, h, s) => boxPlane(p, w, h, Math.max(1, Math.round(s)))) {
    const { width: w, height: h, channels: ch } = input, n = w * h, src = input.data;
    const res = Uint8Array.from(out);
    for (let c = 0; c < Math.min(3, ch); c++) {
        const d = new Float64Array(n);
        for (let i = 0; i < n; i++)
            d[i] = out[i * ch + c] - src[i * ch + c];
        const low = blur(d, w, h, sigma);
        for (let i = 0; i < n; i++) {
            if (weight && !(weight[i] > 0)) {
                res[i * ch + c] = src[i * ch + c];
                continue;
            }
            res[i * ch + c] = byte(src[i * ch + c] + low[i]);
        }
    }
    return res;
}
