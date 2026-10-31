/** Auto fix: a one-tap photo enhancement that makes a dull photo look like a better photo, not a
 * filter. Every step works on CIELAB lightness and chroma so hues stay where they were:
 *   1. white balance: the colour cast of near-neutral pixels (walls, shirts, whites of the eyes),
 *      skin left out, is taken back by up to 70 per cent;
 *   2. levels: black and white points from the histogram (0.4 and 99.6 per cent), stretched only
 *      as far as a believable limit, then a gentle S-curve;
 *   3. local contrast: lightness against a wide blur (about 3 per cent of the photo), a cheap
 *      relative of CLAHE, held down on skin so faces never get gritty;
 *   4. noise: a guided filter on lightness, only as strong as the measured noise;
 *   5. vibrance: dull colours gain chroma, already rich colours and skin barely do;
 *   6. a light skin smoothing on the face only (skin-retouch.ts), and a fine sharpen off the skin.
 * Her face's average lightness may rise only when the photo was dark (face L* under 50), and then
 * no further than L* 56; on a normally lit photo it never rises.
 * Author: John Khan.
 */
import { amountOf, blur, guided, labToLinear, linearToByte, rgbToLab, smoothstep } from "./photo-ops.js";
import { meshProblem, skinMap } from "./face-regions.js";
import { smoothSkin, isRetouchRefusal } from "./skin-retouch.js";
export const LABEL = "Auto fix on this device: white balance, light, contrast, noise and colour. No detail is invented.";
function percentileOf(values, q, stride) {
    const sample = [];
    for (let i = 0; i < values.length; i += stride)
        sample.push(values[i]);
    sample.sort((p, r) => p - r);
    return sample[Math.min(sample.length - 1, Math.max(0, Math.round(q * (sample.length - 1))))];
}
/** Noise in lightness units: median absolute Laplacian-like residual (MAD / 0.6745). */
function noiseOf(L, w, h) {
    const vals = [];
    const step = Math.max(1, Math.floor(Math.sqrt((w * h) / 40000)));
    for (let y = 1; y < h - 1; y += step)
        for (let x = 1; x < w - 1; x += step) {
            const i = y * w + x;
            vals.push(Math.abs(4 * L[i] - L[i - 1] - L[i + 1] - L[i - w] - L[i + w]) / Math.sqrt(20));
        }
    vals.sort((p, q) => p - q);
    return vals[vals.length >> 1] / 0.6745;
}
export function autoFix(image, mesh, strength, steps = {}) {
    const on = (k) => steps[k] !== false;
    const e = amountOf(strength);
    if (e === 0)
        return { image: Uint8Array.from(image.data), label: LABEL, metrics: { unchanged: true } };
    const { width: w, height: h, channels: ch } = image, n = w * h, d = image.data;
    const L0 = new Float32Array(n), A = new Float32Array(n), B = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        const lab = rgbToLab(d[i * ch], d[i * ch + 1], d[i * ch + 2]);
        L0[i] = lab[0];
        A[i] = lab[1];
        B[i] = lab[2];
    }
    // Her skin, full size (0..1), when the face points are usable.
    let skin = null;
    if (mesh && !meshProblem(mesh, w, h)) {
        try {
            const map = skinMap(image, mesh);
            skin = new Float32Array(n);
            for (let y = 0; y < map.rect.h; y++)
                for (let x = 0; x < map.rect.w; x++)
                    skin[(map.rect.y0 + y) * w + map.rect.x0 + x] = map.skin[y * map.rect.w + x];
        }
        catch (error) {
            if (!(error instanceof RangeError))
                throw error;
        }
    }
    const stride = Math.max(1, Math.floor(n / 60000));
    // 1. White balance from near-neutral, non-skin, well-exposed pixels.
    let sa = 0, sb = 0, sw = 0;
    for (let i = 0; i < n; i += stride) {
        if (skin && skin[i] > 0.1)
            continue;
        const c = Math.hypot(A[i], B[i]);
        if (L0[i] < 20 || L0[i] > 97 || c > 14)
            continue;
        const wt = 1 - c / 14;
        sa += wt * A[i];
        sb += wt * B[i];
        sw += wt;
    }
    const castA = sw > 50 && on("white_balance") ? sa / sw : 0, castB = sw > 50 && on("white_balance") ? sb / sw : 0;
    const fixA = -Math.max(-8, Math.min(8, castA)) * 0.7 * e, fixB = -Math.max(-8, Math.min(8, castB)) * 0.7 * e;
    // 2. Levels and a gentle S-curve.
    const lo = percentileOf(L0, 0.004, stride), hi = percentileOf(L0, 0.996, stride);
    const tone = on("exposure") ? e : 0;
    const black = Math.min(lo, 12) * tone, white = hi + (Math.min(98, hi + 12) - hi) * tone;
    const gain = Math.min(1.6, white / Math.max(20, hi - black));
    const L = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        const v = Math.max(0, Math.min(100, (L0[i] - black) * gain));
        const t = v / 100, s = t * t * (3 - 2 * t);
        L[i] = 100 * (t + 0.22 * tone * (s - t));
    }
    // Exposure: a dark photo's midtones are lifted toward a median of L* 50 (a gamma on lightness).
    const med = percentileOf(L, 0.5, stride);
    let gamma = 1;
    if (med < 46 && tone > 0) {
        const target = med + (50 - med) * tone;
        gamma = Math.log(target / 100) / Math.log(Math.max(1, med) / 100);
        for (let i = 0; i < n; i++)
            L[i] = 100 * (L[i] / 100) ** gamma;
    }
    // 3. Local contrast against a wide blur; little on skin.
    const g0 = new Float32Array(n);
    for (let i = 0; i < n; i++)
        g0[i] = L[i] / 100;
    // Edge-aware base (guided filter), so a bright wall next to dark hair gets no halo.
    const wide = guided(g0, g0, w, h, Math.max(3, Math.round(0.03 * Math.max(w, h))), 0.01);
    for (let i = 0; i < n; i++)
        wide[i] *= 100;
    for (let i = 0; i < n; i++) {
        const k = (on("deblur") ? 0.35 * e : 0) * (1 - 0.8 * (skin ? skin[i] : 0));
        L[i] += k * (L[i] - wide[i]) * smoothstep(2, 15, L[i]) * (1 - smoothstep(88, 99, L[i]));
    }
    // 4. Noise: guided filter on lightness, scaled by the measured noise.
    const sigma = noiseOf(L0, w, h);
    let denoised = false;
    if (sigma > 1.2 && on("denoise")) {
        const g = new Float32Array(n);
        for (let i = 0; i < n; i++)
            g[i] = L[i] / 100;
        const eps = (Math.min(8, 1.5 * sigma) / 100) ** 2, smooth = guided(g, g, w, h, 2, eps), mix = e * smoothstep(1.2, 4, sigma);
        for (let i = 0; i < n; i++)
            L[i] += mix * (smooth[i] * 100 - L[i]);
        const sa2 = blur(A, w, h, 1.2), sb2 = blur(B, w, h, 1.2);
        for (let i = 0; i < n; i++) {
            A[i] += mix * (sa2[i] - A[i]);
            B[i] += mix * (sb2[i] - B[i]);
        }
        denoised = true;
    }
    // 5. White balance, then vibrance (dull colours more, skin and rich colours less).
    for (let i = 0; i < n; i++) {
        const a = A[i] + fixA, b = B[i] + fixB, c = Math.hypot(a, b);
        const boost = 1 + (on("colour") ? 0.28 * e : 0) * (1 - smoothstep(10, 45, c)) * (1 - 0.9 * (skin ? skin[i] : 0));
        A[i] = a * boost;
        B[i] = b * boost;
    }
    // 6. Fine sharpen off the skin.
    const fine = blur(L, w, h, 1.0);
    const sharp = on("sharpen") ? 0.45 * e : 0;
    for (let i = 0; i < n; i++)
        L[i] += sharp * (1 - (skin ? skin[i] : 0)) * (L[i] - fine[i]);
    // Her face's average lightness: only a dark photo may lift it, and only to L* 56.
    let faceRise = 0, allowed = 0, faceBefore = NaN;
    if (skin) {
        let s0 = 0, s1 = 0, sk = 0;
        for (let i = 0; i < n; i++)
            if (skin[i] > 0) {
                s0 += skin[i] * L0[i];
                s1 += skin[i] * L[i];
                sk += skin[i];
            }
        faceBefore = s0 / sk;
        faceRise = (s1 - s0) / sk;
        allowed = faceBefore < 50 ? Math.max(0, 56 - faceBefore) : 0;
        // Never darker than she was either: contrast must not push deep skin down.
        if (faceRise > allowed || faceRise < 0) {
            const excess = faceRise > allowed ? faceRise - allowed : faceRise;
            // Take the excess back where her skin is (and softly around it), not from the whole photo.
            const near = blur(skin, w, h, Math.max(4, 0.02 * Math.max(w, h)));
            for (let i = 0; i < n; i++)
                L[i] -= excess * Math.min(1, Math.max(skin[i], near[i] * 1.5));
        }
    }
    const out = Uint8Array.from(d);
    for (let i = 0; i < n; i++) {
        const rgb = labToLinear(Math.max(0, Math.min(100, L[i])), A[i], B[i]);
        for (let c = 0; c < 3; c++)
            out[i * ch + c] = linearToByte(rgb[c]);
    }
    let finished = out;
    if (mesh && skin) {
        const smoothed = smoothSkin({ width: w, height: h, channels: ch, data: out }, mesh, 30 * e);
        if (!isRetouchRefusal(smoothed))
            finished = smoothed.image;
    }
    const r2 = (v) => Math.round(v * 100) / 100;
    return { image: finished, label: LABEL, metrics: { amount: r2(e), cast_a: r2(castA), cast_b: r2(castB), black_point: r2(lo), white_point: r2(hi),
            noise_sigma: r2(sigma), denoised, gamma: r2(gamma), face_metering: skin ? "face points" : "unmeasured",
            ...(skin ? { face_l_before: r2(faceBefore), face_l_rise: r2(Math.max(0, Math.min(faceRise, allowed))), face_l_allowed_rise: r2(allowed) } : {}) } };
}
