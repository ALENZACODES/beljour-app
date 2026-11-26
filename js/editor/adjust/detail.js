/** Spatial parts of Adjust: the local brightness base, noise reduction, clarity and sharpen.
 *
 * Every radius is a share of the photo's short side, so a 640 px preview and a full-size export
 * get the same look. Edge-aware smoothing is a guided filter (box means only, so it is linear in
 * the pixel count): it follows edges instead of bleeding across them, which is what keeps
 * shadows/highlights and clarity free of halos and keeps skin from turning crunchy.
 * All planes are Float32Array, encoded values in [0, 1]; images are interleaved RGB.
 * Author: John Khan.
 */
import { LUMA, clamp01, skinWeight, smoothstep } from "./colour.js";
/** Mean over a (2r+1)^2 window clipped to the image, by running sums (two passes). */
export function boxMean(src, width, height, r) {
    const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
    if (r <= 0) {
        out.set(src);
        return out;
    }
    for (let y = 0; y < height; y++) {
        const row = y * width;
        let sum = 0;
        for (let x = 0; x <= Math.min(r, width - 1); x++)
            sum += src[row + x];
        for (let x = 0; x < width; x++) {
            const lo = Math.max(0, x - r), hi = Math.min(width - 1, x + r);
            tmp[row + x] = sum / (hi - lo + 1);
            if (x + r + 1 < width)
                sum += src[row + x + r + 1];
            if (x - r >= 0)
                sum -= src[row + x - r];
        }
    }
    for (let x = 0; x < width; x++) {
        let sum = 0;
        for (let y = 0; y <= Math.min(r, height - 1); y++)
            sum += tmp[y * width + x];
        for (let y = 0; y < height; y++) {
            const lo = Math.max(0, y - r), hi = Math.min(height - 1, y + r);
            out[y * width + x] = sum / (hi - lo + 1);
            if (y + r + 1 < height)
                sum += tmp[(y + r + 1) * width + x];
            if (y - r >= 0)
                sum -= tmp[(y - r) * width + x];
        }
    }
    return out;
}
/** Guided filter of `p` steered by `guide` (He, Sun and Tang's local linear model). */
export function guidedFilter(guide, p, width, height, r, eps) {
    const n = guide.length, ip = new Float32Array(n), ii = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        ip[i] = guide[i] * p[i];
        ii[i] = guide[i] * guide[i];
    }
    const mI = boxMean(guide, width, height, r), mP = boxMean(p, width, height, r);
    const mIP = boxMean(ip, width, height, r), mII = boxMean(ii, width, height, r);
    const a = new Float32Array(n), b = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        const v = mII[i] - mI[i] * mI[i], cov = mIP[i] - mI[i] * mP[i];
        a[i] = cov / (v + eps);
        b[i] = mP[i] - a[i] * mI[i];
    }
    const mA = boxMean(a, width, height, r), mB = boxMean(b, width, height, r), out = new Float32Array(n);
    for (let i = 0; i < n; i++)
        out[i] = mA[i] * guide[i] + mB[i];
    return out;
}
export function lumaPlane(rgb, n) {
    const y = new Float32Array(n);
    for (let i = 0; i < n; i++)
        y[i] = LUMA[0] * rgb[i * 3] + LUMA[1] * rgb[i * 3 + 1] + LUMA[2] * rgb[i * 3 + 2];
    return y;
}
export const BASE_SHORT_SIDE = 160;
export function localBase(luma, width, height) {
    const factor = Math.max(1, Math.floor(Math.min(width, height) / BASE_SHORT_SIDE));
    const bw = Math.ceil(width / factor), bh = Math.ceil(height / factor);
    const sum = new Float32Array(bw * bh), count = new Float32Array(bw * bh);
    for (let y = 0; y < height; y++) {
        const by = Math.floor(y / factor) * bw;
        for (let x = 0; x < width; x++) {
            const k = by + Math.floor(x / factor);
            sum[k] += luma[y * width + x];
            count[k]++;
        }
    }
    for (let i = 0; i < sum.length; i++)
        sum[i] /= count[i];
    const r = Math.max(2, Math.round(Math.min(bw, bh) * 0.04));
    const data = guidedFilter(sum, sum, bw, bh, r, 0.015);
    for (let i = 0; i < data.length; i++)
        data[i] = clamp01(data[i]);
    return { data, width: bw, height: bh, factor };
}
/** Bilinear sample of the base at full-size pixel (x, y); the shader does the same sums. */
export function sampleBase(base, x, y) {
    const fx = Math.min(base.width - 1, Math.max(0, (x + 0.5) / base.factor - 0.5));
    const fy = Math.min(base.height - 1, Math.max(0, (y + 0.5) / base.factor - 0.5));
    const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(base.width - 1, x0 + 1), y1 = Math.min(base.height - 1, y0 + 1);
    const tx = fx - x0, ty = fy - y0, d = base.data, w = base.width;
    const top = d[y0 * w + x0] + (d[y0 * w + x1] - d[y0 * w + x0]) * tx;
    const bottom = d[y1 * w + x0] + (d[y1 * w + x1] - d[y1 * w + x0]) * tx;
    return top + (bottom - top) * ty;
}
function addLuma(rgb, i, dy) {
    for (let c = 0; c < 3; c++)
        rgb[i * 3 + c] = clamp01(rgb[i * 3 + c] + dy);
}
/** Noise reduction, `amount` 0..1: edge-aware luma smoothing plus stronger chroma smoothing. */
export function reduceNoise(rgb, width, height, amount) {
    if (!(amount > 0))
        return;
    const n = width * height, r = Math.max(1, Math.round(Math.min(width, height) / 320));
    const y = lumaPlane(rgb, n), cb = new Float32Array(n), cr = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        cb[i] = rgb[i * 3 + 2] - y[i];
        cr[i] = rgb[i * 3] - y[i];
    }
    const eps = Math.pow(0.008 + 0.05 * amount, 2);
    const ys = guidedFilter(y, y, width, height, r, eps);
    const cbs = boxMean(cb, width, height, 2 * r + 1), crs = boxMean(cr, width, height, 2 * r + 1);
    const kc = Math.min(1, 1.3 * amount);
    for (let i = 0; i < n; i++) {
        const yy = y[i] + (ys[i] - y[i]) * amount, b = cb[i] + (cbs[i] - cb[i]) * kc, rr = cr[i] + (crs[i] - cr[i]) * kc;
        const red = yy + rr, blue = yy + b, green = (yy - LUMA[0] * red - LUMA[2] * blue) / LUMA[1];
        rgb[i * 3] = clamp01(red);
        rgb[i * 3 + 1] = clamp01(green);
        rgb[i * 3 + 2] = clamp01(blue);
    }
}
/** Clarity, `amount` -1..1: mid-size local contrast against the edge-aware base. The change is
 * soft-limited, strongest in the mid tones and cut by 60% on skin. */
export function clarity(rgb, width, height, amount) {
    if (amount === 0)
        return;
    const n = width * height, y = lumaPlane(rgb, n), base = localBase(y, width, height);
    for (let yy = 0; yy < height; yy++)
        for (let x = 0; x < width; x++) {
            const i = yy * width + x, detail = y[i] - sampleBase(base, x, yy);
            const soft = detail / (1 + Math.abs(detail) * 4), mid = clamp01(4 * y[i] * (1 - y[i]));
            const skin = skinWeight(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]);
            // Up to 1.4x more detail; at most 90% less (never inverted).
            addLuma(rgb, i, amount * (amount > 0 ? 1.4 : 0.9) * soft * mid * (1 - 0.6 * skin));
        }
}
/** Separable Gaussian blur of one plane, sigma in pixels, edge clamp. */
export function gaussian(src, width, height, sigma) {
    const r = Math.max(1, Math.ceil(2.5 * sigma)), k = new Float32Array(2 * r + 1);
    let total = 0;
    for (let i = -r; i <= r; i++) {
        k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma));
        total += k[i + r];
    }
    for (let i = 0; i < k.length; i++)
        k[i] /= total;
    const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
            let acc = 0;
            for (let i = -r; i <= r; i++)
                acc += k[i + r] * src[y * width + Math.min(width - 1, Math.max(0, x + i))];
            tmp[y * width + x] = acc;
        }
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
            let acc = 0;
            for (let i = -r; i <= r; i++)
                acc += k[i + r] * tmp[Math.min(height - 1, Math.max(0, y + i)) * width + x];
            out[y * width + x] = acc;
        }
    return out;
}
/** Sharpen, `amount` 0..1: unsharp mask on luma with a noise threshold and a halo cap. */
export function sharpen(rgb, width, height, amount) {
    if (!(amount > 0))
        return;
    const n = width * height, y = lumaPlane(rgb, n);
    const blur = gaussian(y, width, height, Math.max(0.6, Math.min(width, height) / 900));
    for (let i = 0; i < n; i++) {
        const d = y[i] - blur[i], gate = smoothstep(0.004, 0.02, Math.abs(d));
        const skin = skinWeight(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]);
        addLuma(rgb, i, Math.max(-0.15, Math.min(0.15, amount * 1.6 * d * gate * (1 - 0.4 * skin))));
    }
}
//# sourceMappingURL=detail.js.map