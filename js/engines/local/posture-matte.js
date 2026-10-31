import { floatImage } from "../core/buffer.js";
const clamp = (v) => Math.max(0, Math.min(1, v));
/** Box mean by integral image; unchanged at borders, deterministic CPU path. */
function mean(v, w, h, r) {
    const stride = w + 1, prefix = new Float64Array((w + 1) * (h + 1));
    for (let y = 1; y <= h; y++) {
        let row = 0;
        for (let x = 1; x <= w; x++) {
            row += v[(y - 1) * w + x - 1];
            prefix[y * stride + x] = prefix[(y - 1) * stride + x] + row;
        }
    }
    const out = new Float64Array(w * h);
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
            const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
            out[y * w + x] = (prefix[y1 * stride + x1] - prefix[y0 * stride + x1]
                - prefix[y1 * stride + x0] + prefix[y0 * stride + x0]) / ((x1 - x0) * (y1 - y0));
        }
    return out;
}
/**
 * Edge-aware guided alpha refinement. This does not claim full hair matting:
 * unknown translucent hair / motion blur requires a real matte or must fail QA.
 * Segmentation and all source pixels remain local to the device.
 */
export function guidedPersonMatte(image, mask, radius = 5, eps = 0.0025) {
    const { width: w, height: h, channels: ch } = image, n = w * h;
    if (mask.width !== w || mask.height !== h || mask.data.length !== n)
        throw new RangeError("person mask size mismatch");
    if (!(Number.isInteger(radius) && radius >= 1 && radius <= 32))
        throw new RangeError("matte radius must be 1..32");
    const input = Float64Array.from(mask.data, clamp);
    const guide = new Float64Array(n), g2 = new Float64Array(n), gp = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        const j = i * ch;
        const g = (0.2126 * image.data[j] + 0.7152 * image.data[j + 1] + 0.0722 * image.data[j + 2]) / 255;
        guide[i] = g;
        g2[i] = g * g;
        gp[i] = g * input[i];
    }
    const mg = mean(guide, w, h, radius), mp = mean(input, w, h, radius);
    const mgg = mean(g2, w, h, radius), mgp = mean(gp, w, h, radius);
    const a = new Float64Array(n), b = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        const variance = Math.max(0, mgg[i] - mg[i] * mg[i]);
        a[i] = (mgp[i] - mg[i] * mp[i]) / (variance + eps);
        b[i] = mp[i] - a[i] * mg[i];
    }
    const aa = mean(a, w, h, radius), bb = mean(b, w, h, radius);
    const certainty = mean(input, w, h, radius * 2), matte = floatImage(w, h, 1);
    for (let i = 0; i < n; i++) {
        const edge = clamp(aa[i] * guide[i] + bb[i]);
        const soft = 0.88 * edge + 0.12 * mp[i];
        matte.data[i] = certainty[i] > 0.999 ? 1 : certainty[i] < 0.001 ? 0 : soft;
    }
    return matte;
}
/** Compare a matte to its warped coverage; only newly revealed original silhouettes require inpainting. */
export function vacantBodyMask(oldMatte, newMatte, oldPerson) {
    if (oldMatte.width !== newMatte.width || oldMatte.height !== newMatte.height
        || oldMatte.width !== oldPerson.width || oldMatte.height !== oldPerson.height)
        throw new RangeError("matte mismatch");
    const { width: w, height: h } = oldMatte, result = floatImage(w, h, 1);
    for (let i = 0; i < w * h; i++) {
        const previous = Math.max(oldMatte.data[i], oldPerson.data[i]);
        const exposed = previous * (1 - newMatte.data[i]);
        result.data[i] = previous > 0.012 && exposed > 0.04 ? 1 : 0;
    }
    return result;
}
