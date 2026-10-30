/** Photographic building blocks for the face tools: CIELAB planes of a crop, Gaussian blur in
 * linear time, the guided (edge-preserving) filter, anti-aliased polygon masks and a masked
 * write-back that leaves every pixel outside the weight, and alpha, byte for byte as it was.
 * Every tool in this folder works on a crop around the face, so a 12 MP photo costs about what
 * the face costs. Plain TypeScript, deterministic, no packages.
 * Author: John Khan.
 */
import { SRGB_TO_LINEAR } from "../core/buffer.js";
const EPS = 216 / 24389, KAPPA = 24389 / 27;
const XN = 0.95047, ZN = 1.08883;
function f(t) { return t > EPS ? Math.cbrt(t) : (KAPPA * t + 16) / 116; }
function finv(t) { const t3 = t * t * t; return t3 > EPS ? t3 : (116 * t - 16) / KAPPA; }
/** Linear light to an sRGB byte (rounded, clamped). A 4096-step table with interpolation keeps
 * the error under 0.1 of a byte step. */
const ENCODE_STEPS = 4096;
const ENCODE_TABLE = (() => {
    const t = new Float32Array(ENCODE_STEPS + 2);
    for (let i = 0; i <= ENCODE_STEPS + 1; i++) {
        const v = Math.min(1, i / ENCODE_STEPS);
        t[i] = 255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);
    }
    return t;
})();
export function linearToByte(v) {
    if (!(v > 0))
        return 0;
    if (v >= 1)
        return 255;
    // Below 1/4096 the curve is steep; work it out exactly.
    if (v < 1 / ENCODE_STEPS)
        return Math.round(255 * 12.92 * v);
    const x = v * ENCODE_STEPS, i = Math.floor(x), t = x - i;
    return Math.round(ENCODE_TABLE[i] + t * (ENCODE_TABLE[i + 1] - ENCODE_TABLE[i]));
}
export function clampRect(x0, y0, x1, y1, width, height) {
    const a = Math.max(0, Math.floor(x0)), b = Math.max(0, Math.floor(y0));
    const c = Math.min(width, Math.ceil(x1)), d = Math.min(height, Math.ceil(y1));
    return { x0: a, y0: b, w: Math.max(1, c - a), h: Math.max(1, d - b) };
}
/** The rectangle around points, grown by `margin` pixels and kept inside the photo. */
export function rectAround(points, margin, width, height) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of points) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
    }
    return clampRect(x0 - margin, y0 - margin, x1 + margin + 1, y1 + margin + 1, width, height);
}
export function rgbToLab(r, g, b) {
    const R = SRGB_TO_LINEAR[r], G = SRGB_TO_LINEAR[g], B = SRGB_TO_LINEAR[b];
    const fx = f((0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / XN);
    const fy = f(0.2126729 * R + 0.7151522 * G + 0.0721750 * B);
    const fz = f((0.0193339 * R + 0.1191920 * G + 0.9503041 * B) / ZN);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
/** Lab to linear RGB (unclamped). */
export function labToLinear(L, a, b) {
    const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
    const X = XN * finv(fx), Y = L > KAPPA * EPS ? fy * fy * fy : L / KAPPA, Z = ZN * finv(fz);
    return [3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z,
        -0.9692660 * X + 1.8760108 * Y + 0.0415560 * Z,
        0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z];
}
export function labCrop(image, rect) {
    const n = rect.w * rect.h, ch = image.channels, d = image.data;
    const L = new Float32Array(n), A = new Float32Array(n), B = new Float32Array(n);
    for (let y = 0; y < rect.h; y++)
        for (let x = 0; x < rect.w; x++) {
            const p = ((rect.y0 + y) * image.width + rect.x0 + x) * ch, i = y * rect.w + x;
            const lab = rgbToLab(d[p], d[p + 1], d[p + 2]);
            L[i] = lab[0];
            A[i] = lab[1];
            B[i] = lab[2];
        }
    return { rect, L, a: A, b: B };
}
/** Linear-light planes of a crop (0..1). */
export function linearCrop(image, rect) {
    const n = rect.w * rect.h, ch = image.channels, d = image.data;
    const out = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
    for (let y = 0; y < rect.h; y++)
        for (let x = 0; x < rect.w; x++) {
            const p = ((rect.y0 + y) * image.width + rect.x0 + x) * ch, i = y * rect.w + x;
            for (let c = 0; c < 3; c++)
                out[c][i] = SRGB_TO_LINEAR[d[p + c]];
        }
    return out;
}
/** A copy of the photo with the crop's Lab written back where `weight` > 0, mixed with the
 * original by that weight in linear light. Pixels with zero weight and every alpha byte are
 * copied unchanged. */
export function writeLab(image, lab, weight) {
    const out = Uint8Array.from(image.data), ch = image.channels, { rect } = lab;
    for (let y = 0; y < rect.h; y++)
        for (let x = 0; x < rect.w; x++) {
            const i = y * rect.w + x, w = weight[i];
            if (!(w > 0))
                continue;
            const p = ((rect.y0 + y) * image.width + rect.x0 + x) * ch;
            const rgb = labToLinear(lab.L[i], lab.a[i], lab.b[i]);
            const k = Math.min(1, w);
            for (let c = 0; c < 3; c++) {
                const before = SRGB_TO_LINEAR[image.data[p + c]];
                out[p + c] = linearToByte(before + k * (rgb[c] - before));
            }
        }
    return out;
}
/** The same write-back for linear-light planes. */
export function writeLinear(image, rect, rgb, weight) {
    const out = Uint8Array.from(image.data), ch = image.channels;
    for (let y = 0; y < rect.h; y++)
        for (let x = 0; x < rect.w; x++) {
            const i = y * rect.w + x, w = weight[i];
            if (!(w > 0))
                continue;
            const p = ((rect.y0 + y) * image.width + rect.x0 + x) * ch, k = Math.min(1, w);
            for (let c = 0; c < 3; c++) {
                const before = SRGB_TO_LINEAR[image.data[p + c]];
                out[p + c] = linearToByte(before + k * (rgb[c][i] - before));
            }
        }
    return out;
}
/** Running mean over 2r+1 along rows then columns, edges clamped. O(n) for any radius. */
export function boxBlur(src, w, h, r) {
    const out = new Float32Array(src.length);
    if (r < 1) {
        out.set(src);
        return out;
    }
    const tmp = new Float32Array(src.length), span = 2 * r + 1;
    for (let y = 0; y < h; y++) {
        const row = y * w;
        let acc = 0;
        for (let k = -r; k <= r; k++)
            acc += src[row + Math.min(w - 1, Math.max(0, k))];
        for (let x = 0; x < w; x++) {
            tmp[row + x] = acc / span;
            acc += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
        }
    }
    for (let x = 0; x < w; x++) {
        let acc = 0;
        for (let k = -r; k <= r; k++)
            acc += tmp[Math.min(h - 1, Math.max(0, k)) * w + x];
        for (let y = 0; y < h; y++) {
            out[y * w + x] = acc / span;
            acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
        }
    }
    return out;
}
/** Gaussian blur of standard deviation `sigma` px, as three box passes (within a few per cent of
 * a true Gaussian). Sigma below 0.5 returns a copy. */
export function blur(src, w, h, sigma) {
    if (!(sigma >= 0.5))
        return Float32Array.from(src);
    // Box widths for three passes (Kovesi's method).
    const ideal = Math.sqrt(12 * sigma * sigma / 3 + 1);
    let wl = Math.floor(ideal);
    if (wl % 2 === 0)
        wl--;
    const wu = wl + 2, m = Math.round((12 * sigma * sigma - 3 * wl * wl - 12 * wl - 9) / (-4 * wl - 4));
    let out = src;
    for (let i = 0; i < 3; i++)
        out = boxBlur(out, w, h, ((i < m ? wl : wu) - 1) / 2);
    return out;
}
/** Blur of `plane` over the pixels `mask` covers only (normalised convolution), so colour from
 * outside the mask never bleeds in. Where the mask has no support the plane is kept. */
export function maskedBlur(plane, mask, w, h, sigma) {
    const num = new Float32Array(plane.length);
    for (let i = 0; i < plane.length; i++)
        num[i] = plane[i] * mask[i];
    const top = blur(num, w, h, sigma), bottom = blur(mask, w, h, sigma), out = new Float32Array(plane.length);
    for (let i = 0; i < plane.length; i++)
        out[i] = bottom[i] > 1e-4 ? top[i] / bottom[i] : plane[i];
    return out;
}
/** He, Sun and Tang's guided filter with a grey guide: edges in `guide` stay sharp in the result,
 * flat areas are averaged over radius r. `eps` is in the guide's units squared. */
export function guided(guide, src, w, h, r, eps) {
    const n = guide.length, ip = new Float32Array(n), ii = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        ip[i] = guide[i] * src[i];
        ii[i] = guide[i] * guide[i];
    }
    const mI = boxBlur(guide, w, h, r), mP = boxBlur(src, w, h, r), mIP = boxBlur(ip, w, h, r), mII = boxBlur(ii, w, h, r);
    const A = new Float32Array(n), B = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        const v = mII[i] - mI[i] * mI[i], cov = mIP[i] - mI[i] * mP[i];
        A[i] = cov / (v + eps);
        B[i] = mP[i] - A[i] * mI[i];
    }
    const mA = boxBlur(A, w, h, r), mB = boxBlur(B, w, h, r), out = new Float32Array(n);
    for (let i = 0; i < n; i++)
        out[i] = mA[i] * guide[i] + mB[i];
    return out;
}
/** Anti-aliased coverage (0..1) of a closed polygon over the crop, sampled on an s x s grid per
 * pixel (even-odd rule). Points are in photo pixels with pixel centres at +0.5. */
export function polygonMask(points, rect, s = 4) {
    const out = new Float32Array(rect.w * rect.h);
    const n = points.length;
    if (n < 3)
        return out;
    let minY = Infinity, maxY = -Infinity;
    for (const p of points) {
        minY = Math.min(minY, p[1]);
        maxY = Math.max(maxY, p[1]);
    }
    const y0 = Math.max(0, Math.floor(minY - rect.y0)), y1 = Math.min(rect.h - 1, Math.ceil(maxY - rect.y0));
    const xs = [], share = 1 / (s * s);
    for (let y = y0; y <= y1; y++)
        for (let sy = 0; sy < s; sy++) {
            const py = rect.y0 + y + (sy + 0.5) / s;
            xs.length = 0;
            for (let k = 0; k < n; k++) {
                const [ax, ay] = points[k], [bx, by] = points[(k + 1) % n];
                if ((ay <= py && by > py) || (by <= py && ay > py))
                    xs.push(ax + (py - ay) / (by - ay) * (bx - ax));
            }
            xs.sort((p, q) => p - q);
            for (let k = 0; k + 1 < xs.length; k += 2) {
                // Sub-sample columns whose centre x + (sx + 0.5)/s lies in [xs[k], xs[k + 1]).
                const a = (xs[k] - rect.x0) * s - 0.5, b = (xs[k + 1] - rect.x0) * s - 0.5;
                const first = Math.max(0, Math.ceil(a)), last = Math.min(rect.w * s - 1, Math.ceil(b) - 1);
                for (let c = first; c <= last; c++)
                    out[y * rect.w + Math.floor(c / s)] += share;
            }
        }
    for (let i = 0; i < out.length; i++)
        if (out[i] > 1)
            out[i] = 1;
    return out;
}
/** A soft round spot: 1 at the centre falling as a Gaussian, with separate x/y spreads along a
 * rotated axis (angle in radians). Values below 1/256 are left at 0. */
export function ellipseSpot(rect, cx, cy, sx, sy, angle) {
    const out = new Float32Array(rect.w * rect.h), c = Math.cos(angle), s = Math.sin(angle);
    for (let y = 0; y < rect.h; y++)
        for (let x = 0; x < rect.w; x++) {
            const dx = rect.x0 + x + 0.5 - cx, dy = rect.y0 + y + 0.5 - cy;
            const u = (dx * c + dy * s) / sx, v = (-dx * s + dy * c) / sy, e = Math.exp(-0.5 * (u * u + v * v));
            if (e > 1 / 256)
                out[y * rect.w + x] = e;
        }
    return out;
}
/** Crop of a full-photo mask (Float32/Float64 0..1, one value per pixel). */
export function cropMask(mask, width, rect) {
    const out = new Float32Array(rect.w * rect.h);
    for (let y = 0; y < rect.h; y++)
        for (let x = 0; x < rect.w; x++) {
            const v = mask[(rect.y0 + y) * width + rect.x0 + x];
            out[y * rect.w + x] = v > 0 ? Math.min(1, v) : 0;
        }
    return out;
}
export function smoothstep(e0, e1, x) {
    const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
}
/** Weighted median of a plane over pixels whose weight is at least `min`. */
export function weightedMedian(plane, weight, min = 0.5) {
    const values = [];
    for (let i = 0; i < plane.length; i++)
        if (weight[i] >= min)
            values.push(plane[i]);
    if (!values.length)
        return NaN;
    values.sort((p, q) => p - q);
    return values[values.length >> 1];
}
export function percentile(values, q) {
    if (!values.length)
        return NaN;
    const sorted = [...values].sort((p, r) => p - r);
    return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))];
}
/** How strongly a 0..100 slider acts: 0 is nothing, the app's default (30) already reads
 * clearly, 100 is the full amount. A gentle ease-out, ASSUMED from looking at the example faces. */
export function amountOf(strength) {
    if (!Number.isFinite(strength) || strength < 0 || strength > 100)
        throw new RangeError("strength must be 0..100");
    const s = strength / 100;
    return 1 - (1 - s) ** 1.7;
}
//# sourceMappingURL=photo-ops.js.map