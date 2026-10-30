/**
 * E29 quality checks Q1, Q3, Q4, Q5, Q6, Q9, Q10 and Q12 (plan-r3-final §3) for the browser
 * engines. Same rules and defaults as api/plumb_api/quality/metrics.py:
 *   pixel change = max over R, G, B of |after - before| / 255
 *   luma = 0.2126 R' + 0.7152 G' + 0.0722 B' on encoded values / 255
 *   gradients = central differences, one-sided on the outer rows and columns
 *   dilation = Euclidean disc from the exact distance transform
 *
 * Author: John Khan.
 */
import { SRGB_TO_LINEAR, floatImage, requireColour, requireMask, requireSameSize } from "../engines/core/buffer.js";
import { ciede2000, hexToRgb, pixelLab, rgbToLab, srgbEncode } from "../engines/core/colour.js";
import { gradientMagnitude, jacobianDeterminant, quantile } from "../engines/core/filters.js";
import { dilate } from "../engines/core/mask.js";
import { highFrequency } from "../engines/core/pyramid.js";
export const NAMES = {
    Q1: "Outside-mask invariance",
    Q3: "Fold-free warp",
    Q4: "Seam score",
    Q5: "Determinism and parity",
    Q6: "Colour accuracy",
    Q9: "Monotonic strength",
    Q10: "Texture kept",
    Q12: "Straight lines kept",
};
export const PARITY_TOLERANCE = 1 / 255;
export const EDGE_GRADIENT_FLOOR = 2 / 255;
function check(code, passed, measured, rule, thresholds) {
    return { code, name: NAMES[code], passed, measured, rule, thresholds };
}
function pair(before, after) {
    requireColour(before);
    requireColour(after);
    requireSameSize(before, after, "before and after");
}
export function pixelChange(before, after) {
    pair(before, after);
    const n = before.width * before.height, out = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        let m = 0;
        for (let c = 0; c < 3; c++)
            m = Math.max(m, Math.abs(before.data[i * before.channels + c] - after.data[i * after.channels + c]));
        out[i] = m / 255;
    }
    return out;
}
export function luma(img) {
    requireColour(img);
    const out = floatImage(img.width, img.height, 1, true);
    for (let i = 0; i < out.data.length; i++) {
        const p = i * img.channels;
        out.data[i] = 0.2126 * (img.data[p] / 255) + 0.7152 * (img.data[p + 1] / 255) + 0.0722 * (img.data[p + 2] / 255);
    }
    return out;
}
const fmt = (x) => String(Number(x.toFixed(6)));
// Q1 ------------------------------------------------------------------------------
export function q1OutsideMask(before, after, editMask, { dilatePx = 8, meanMax = 1 / 255, maxMax = 4 / 255 } = {}) {
    const change = pixelChange(before, after);
    requireMask(editMask, before.width, before.height);
    const touched = floatImage(editMask.width, editMask.height, 1);
    let any = false;
    for (let i = 0; i < touched.data.length; i++) {
        touched.data[i] = editMask.data[i] > 0 ? 1 : 0;
        any ||= editMask.data[i] > 0;
    }
    const grown = any ? dilate(touched, dilatePx) : touched;
    let count = 0, sum = 0, peak = 0;
    for (let i = 0; i < change.length; i++) {
        if (grown.data[i] === 0) {
            count++;
            sum += change[i];
            peak = Math.max(peak, change[i]);
        }
    }
    const mean = count ? sum / count : 0;
    return check("Q1", mean <= meanMax && peak <= maxMax, { mean, max: peak, outside_pixels: count, outside_share: count / change.length }, `outside the mask dilated by ${fmt(dilatePx)} px: mean change <= ${fmt(meanMax * 255)}/255, max <= ${fmt(maxMax * 255)}/255`, { dilate_px: dilatePx, mean_max: meanMax, max_max: maxMax });
}
// Q3 ------------------------------------------------------------------------------
export function q3FoldFree(mapX, mapY, minimum = 0.2) {
    const det = jacobianDeterminant(mapX, mapY);
    let low = Infinity, folded = 0, below = 0;
    for (const v of det.data) {
        low = Math.min(low, v);
        if (v <= 0)
            folded++;
        if (v <= minimum)
            below++;
    }
    const n = det.data.length;
    return check("Q3", low > minimum, { min_det: low, folded_share: folded / n, below_share: below / n }, `Jacobian determinant > ${fmt(minimum)} everywhere`, { minimum });
}
// Q4 ------------------------------------------------------------------------------
/** 1 where the mask's on/off state (alpha >= 0.5) differs from a 4-neighbour. */
export function maskEdge(mask, level = 0.5) {
    requireMask(mask);
    const { width: w, height: h } = mask;
    const on = (i) => mask.data[i] >= level;
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = y * w + x;
            if (x + 1 < w && on(i) !== on(i + 1)) {
                out[i] = 1;
                out[i + 1] = 1;
            }
            if (y + 1 < h && on(i) !== on(i + w)) {
                out[i] = 1;
                out[i + w] = 1;
            }
        }
    }
    return out;
}
export function q4Seam(before, after, mask, { maximum = 1.5, percentile = 0.9 } = {}) {
    pair(before, after);
    requireMask(mask, before.width, before.height);
    const edge = maskEdge(mask);
    let band = edge;
    if (edge.some((v) => v)) {
        const asMask = floatImage(mask.width, mask.height, 1);
        edge.forEach((v, i) => (asMask.data[i] = v));
        const grown = dilate(asMask, 1);
        band = Uint8Array.from(grown.data, (v) => (v > 0 ? 1 : 0));
    }
    const gBefore = gradientMagnitude(luma(before)), gAfter = gradientMagnitude(luma(after));
    const edges = [];
    for (const v of gBefore.data)
        if (v >= EDGE_GRADIENT_FLOOR)
            edges.push(v);
    const reference = edges.length ? quantile(edges, 0.5) : EDGE_GRADIENT_FLOOR;
    const thresholds = { maximum, percentile };
    const excess = [];
    band.forEach((v, i) => { if (v)
        excess.push(Math.max(0, gAfter.data[i] - gBefore.data[i])); });
    if (!excess.length) {
        return check("Q4", true, { seam: 0, reference, ratio: 0, band_pixels: 0 }, "no mask edge in the image", thresholds);
    }
    const seam = quantile(excess, percentile), ratio = seam / reference;
    return check("Q4", ratio <= maximum, { seam, reference, ratio, band_pixels: excess.length }, `added edge gradient (p${fmt(percentile * 100)}) <= ${fmt(maximum)} x median edge gradient`, thresholds);
}
// Q5 ------------------------------------------------------------------------------
/** FNV-1a 64-bit digest of an image's size and bytes (fast, deterministic, not cryptographic). */
export function digest(img) {
    let h = 0xcbf29ce484222325n;
    const prime = 0x100000001b3n, mask64 = (1n << 64n) - 1n;
    const feed = (byte) => { h ^= BigInt(byte & 0xff); h = (h * prime) & mask64; };
    for (const v of [img.width, img.height, img.channels])
        for (let k = 0; k < 4; k++)
            feed(v >>> (8 * k));
    const bytes = img.data instanceof Uint8Array || img.data instanceof Uint8ClampedArray
        ? img.data
        : new Uint8Array(Float64Array.from(img.data).buffer);
    for (let i = 0; i < bytes.length; i++)
        feed(bytes[i]);
    return h.toString(16).padStart(16, "0");
}
export function q5Determinism(run, runs = 2) {
    if (runs < 2)
        throw new RangeError("determinism needs at least two runs");
    const digests = Array.from({ length: runs }, () => digest(run()));
    const distinct = new Set(digests).size;
    return check("Q5", distinct === 1, { runs, distinct_outputs: distinct, digest: digests[0] }, "same input, params and seed give byte-identical output", { runs });
}
/** Largest absolute difference between equally shaped nested values; null matches only null. */
export function maxAbsDifference(a, b) {
    if (a == null || b == null)
        return a == null && b == null ? 0 : Infinity;
    if (Array.isArray(a) || Array.isArray(b)) {
        if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length)
            return Infinity;
        let m = 0;
        for (let i = 0; i < a.length; i++)
            m = Math.max(m, maxAbsDifference(a[i], b[i]));
        return m;
    }
    if (typeof a === "object" || typeof b === "object") {
        if (typeof a !== "object" || typeof b !== "object")
            return Infinity;
        const ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
        if (ka.join("|") !== kb.join("|"))
            return Infinity;
        let m = 0;
        for (const k of ka)
            m = Math.max(m, maxAbsDifference(a[k], b[k]));
        return m;
    }
    if (typeof a === "boolean" || typeof b === "boolean" || typeof a === "string" || typeof b === "string")
        return a === b ? 0 : Infinity;
    const d = Math.abs(Number(a) - Number(b));
    return Number.isNaN(d) ? Infinity : d;
}
export function q5Parity(expected, actual, tolerance = PARITY_TOLERANCE) {
    const diff = maxAbsDifference(expected, actual);
    return check("Q5", diff <= tolerance, { max_abs_difference: Number.isFinite(diff) ? diff : null }, `TypeScript and Python agree within ${fmt(tolerance * 255)}/255`, { tolerance });
}
// Q6 ------------------------------------------------------------------------------
/** Mask-weighted mean colour in linear light, re-encoded to 0..255 sRGB floats; null if no weight. */
export function maskedMeanColour(img, mask) {
    requireColour(img);
    requireMask(mask, img.width, img.height);
    let total = 0;
    const sum = [0, 0, 0];
    for (let i = 0; i < mask.data.length; i++) {
        const w = mask.data[i];
        total += w;
        for (let c = 0; c < 3; c++)
            sum[c] += SRGB_TO_LINEAR[img.data[i * img.channels + c]] * w;
    }
    if (total <= 0)
        return null;
    return sum.map((s) => srgbEncode(s / total) * 255);
}
export function q6ColourAccuracy(img, mask, target, maximum = 3.0) {
    const targetRgb = typeof target === "string" ? hexToRgb(target) : target;
    const mean = maskedMeanColour(img, mask);
    const rule = `CIEDE2000(target, mean in mask) <= ${fmt(maximum)}`;
    if (!mean)
        return check("Q6", false, { delta_e: null, reason: "empty mask" }, rule, { maximum });
    const deltaE = ciede2000(rgbToLab(targetRgb), rgbToLab(mean));
    return check("Q6", deltaE <= maximum, { delta_e: deltaE, mean_rgb: mean, target_rgb: [...targetRgb] }, rule, { maximum });
}
// Q9 ------------------------------------------------------------------------------
/** Mask-weighted mean CIE76 difference between two renders (0 when the mask is empty). */
export function effectStrength(before, after, mask) {
    pair(before, after);
    if (mask)
        requireMask(mask, before.width, before.height);
    const la = new Float64Array(3), lb = new Float64Array(3);
    let total = 0, sum = 0;
    for (let i = 0; i < before.width * before.height; i++) {
        const w = mask ? mask.data[i] : 1;
        const p = i * before.channels, q = i * after.channels;
        pixelLab(before.data[p], before.data[p + 1], before.data[p + 2], la);
        pixelLab(after.data[q], after.data[q + 1], after.data[q + 2], lb);
        sum += Math.sqrt((la[0] - lb[0]) ** 2 + (la[1] - lb[1]) ** 2 + (la[2] - lb[2]) ** 2) * w;
        total += w;
    }
    return total > 0 ? sum / total : 0;
}
export function q9Monotonic(values, minStep = 0) {
    if (values.length < 2 || !values.every(Number.isFinite))
        throw new RangeError("need at least two finite stop values");
    let worst = Infinity;
    for (let i = 1; i < values.length; i++)
        worst = Math.min(worst, values[i] - values[i - 1]);
    return check("Q9", worst > minStep, { values: [...values], smallest_step: worst }, `each stop's effect exceeds the previous by more than ${fmt(minStep)}`, { min_step: minStep });
}
// Q10 -----------------------------------------------------------------------------
export function textureEnergy(img, mask) {
    const detail = highFrequency(luma(img));
    if (mask)
        requireMask(mask, img.width, img.height);
    let total = 0, sum = 0;
    for (let i = 0; i < detail.data.length; i++) {
        const w = mask ? mask.data[i] : 1;
        sum += detail.data[i] * detail.data[i] * w;
        total += w;
    }
    return total > 0 ? sum / total : 0;
}
export function q10TextureKept(before, after, skinMask, minimum = 0.6) {
    pair(before, after);
    const eBefore = textureEnergy(before, skinMask), eAfter = textureEnergy(after, skinMask);
    const rule = `texture energy ratio >= ${fmt(minimum)}`;
    if (eBefore <= 1e-12) {
        return check("Q10", true, { before: eBefore, after: eAfter, ratio: null, reason: "no texture in the mask to keep" }, rule, { minimum });
    }
    const ratio = eAfter / eBefore;
    return check("Q10", ratio >= minimum, { before: eBefore, after: eAfter, ratio }, rule, { minimum });
}
// Q12 -----------------------------------------------------------------------------
/** First row (or column) of each grid line of a synthetic grid along one axis. */
export function gridLines(length, spacing, offset, thickness = 1) {
    if (!(spacing >= 2 && thickness >= 1 && thickness < spacing && offset >= 0)) {
        throw new RangeError("grid needs spacing >= 2, 1 <= thickness < spacing and offset >= 0");
    }
    const out = [];
    for (let v = offset; v <= length - thickness; v += spacing)
        out.push(v);
    return out;
}
/** Largest residual from the least-squares line through (position, centre) samples. */
export function lineDeviation(samples) {
    const n = samples.length;
    let mx = 0, my = 0;
    for (const [x, y] of samples) {
        mx += x;
        my += y;
    }
    mx /= n;
    my /= n;
    let sxx = 0, sxy = 0;
    for (const [x, y] of samples) {
        sxx += (x - mx) ** 2;
        sxy += (x - mx) * (y - my);
    }
    const slope = sxx > 0 ? sxy / sxx : 0;
    let worst = 0;
    for (const [x, y] of samples)
        worst = Math.max(worst, Math.abs(y - (my + slope * (x - mx))));
    return worst;
}
/** Q12: synthetic grid lines outside the band stay within `maximum` px of straight
 * (same sampling and fit as api/plumb_api/quality/metrics.py q12_straight_lines). */
export function q12StraightLines(after, band, { spacing, offset, thickness = 1, maximum = 1, minSamples = 8 }) {
    requireColour(after);
    const { width: w, height: h } = after;
    if (band)
        requireMask(band, w, h);
    const outside = (x, y) => !band || band.data[y * w + x] < 0.5;
    const lum = luma(after).data;
    const off = offset ?? Math.floor(spacing / 2);
    const half = Math.floor((spacing - thickness) / 2);
    let worst = 0, worstLine = "", checked = 0, skipped = 0, total = 0;
    for (const axis of ["row", "col"]) {
        const length = axis === "row" ? h : w, other = axis === "row" ? w : h;
        for (const start of gridLines(length, spacing, off, thickness)) {
            const lo = start - half, hi = start + thickness - 1 + half;
            if (lo < 0 || hi >= length)
                continue;
            const samples = [];
            for (let pos = 0; pos < other; pos++) {
                let free = true;
                const d = [];
                for (let k = lo; k <= hi; k++) {
                    const x = axis === "row" ? pos : k, y = axis === "row" ? k : pos;
                    if (!outside(x, y)) {
                        free = false;
                        break;
                    }
                    d.push(1 - lum[y * w + x]);
                }
                if (!free)
                    continue;
                const min = Math.min(...d);
                let sum = 0, moment = 0;
                d.forEach((v, j) => { sum += v - min; moment += (lo + j) * (v - min); });
                if (sum > 1e-9)
                    samples.push([pos, moment / sum]);
            }
            if (samples.length < minSamples) {
                skipped++;
                continue;
            }
            checked++;
            total += samples.length;
            const dev = lineDeviation(samples);
            if (dev > worst || !worstLine) {
                worst = Math.max(worst, dev);
                worstLine = `${axis} ${start}`;
            }
        }
    }
    const rule = `grid lines outside the band within ${fmt(maximum)} px of straight`;
    const thresholds = { maximum, spacing, min_samples: minSamples };
    if (!checked) {
        return check("Q12", false, { max_deviation: null, lines_checked: 0, lines_skipped: skipped, samples: 0, reason: "no grid line outside the band" }, rule, thresholds);
    }
    return check("Q12", worst <= maximum, { max_deviation: worst, lines_checked: checked, lines_skipped: skipped, samples: total, worst_line: worstLine }, rule, thresholds);
}
//# sourceMappingURL=metrics.js.map