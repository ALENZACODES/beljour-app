/**
 * E04 masks: one-channel alpha fields in [0, 1], zero meaning "untouched".
 *
 * Shapes (rectangle, ellipse, anti-aliased polygon), boolean combinations, box blur,
 * the exact Euclidean distance transform, round dilation and erosion, distance-based
 * feathering and edge-aware feathering with the guided filter. Every function returns
 * a new mask and mirrors api/plumb_api/engines/core/{masks,distance,guided,regions}.py.
 *
 * Author: John Khan.
 */
import { floatImage, requireMask, requireSameSize } from "./buffer.js";
import { boxMean } from "./filters.js";
export const MAX_SUPERSAMPLE = 16;
export function emptyMask(width, height) {
    return floatImage(width, height, 1);
}
export function fullMask(width, height) {
    const m = floatImage(width, height, 1);
    m.data.fill(1);
    return m;
}
/** Half-open rectangle [left, right) x [top, bottom), clipped to the mask. */
export function rectangle(width, height, left, top, right, bottom) {
    if (right < left || bottom < top)
        throw new RangeError("reversed rectangle");
    const m = emptyMask(width, height);
    for (let y = Math.max(0, top); y < Math.min(height, bottom); y++) {
        for (let x = Math.max(0, left); x < Math.min(width, right); x++)
            m.data[y * width + x] = 1;
    }
    return m;
}
/** Ellipse at pixel centres; feather in [0, 1) softens the outer share of the radius. */
export function ellipse(width, height, cx, cy, rx, ry, feather = 0) {
    if (!(rx > 0 && ry > 0) || !(feather >= 0 && feather < 1))
        throw new RangeError("ellipse radii must be positive and feather in [0, 1)");
    const m = emptyMask(width, height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const dx = (x - cx) / rx, dy = (y - cy) / ry;
            const r = Math.sqrt(dx * dx + dy * dy);
            m.data[y * width + x] = feather === 0 ? (r <= 1 ? 1 : 0) : Math.min(1, Math.max(0, (1 - r) / feather));
        }
    }
    return m;
}
/** Sorted x positions where the closed polygon crosses the line y (edges half-open in y). */
export function scanlineCrossings(points, y) {
    const out = [];
    for (let k = 0; k < points.length; k++) {
        const [x0, y0] = points[k];
        const [x1, y1] = points[(k + 1) % points.length];
        if ((y0 <= y && y < y1) || (y1 <= y && y < y0))
            out.push(x0 + ((y - y0) * (x1 - x0)) / (y1 - y0));
    }
    return out.sort((a, b) => a - b);
}
/** Add the inside samples of one sub-row to the column counts. A sample at
 * x = col + (sx + 0.5) / s is inside when an odd number of crossings lie strictly left of it,
 * so with the crossings sorted the inside samples are whole runs: from the first sample past
 * crossing 0 up to (not including) the first sample past crossing 1, and so on. Each run's
 * ends are found by comparing against exactly that sample expression; a run adds its partial
 * end columns directly and its whole columns through `full`, a difference array the caller
 * sums once per row. Integer counts, so the result equals testing every sample one by one.
 * (Speed round.) */
function addSpans(counts, full, crossings, left, cols, s) {
    const total = cols * s;
    for (let k = 0; k < crossings.length; k += 2) {
        const from = firstPast(crossings[k], left, total, s);
        const to = k + 1 < crossings.length ? firstPast(crossings[k + 1], left, total, s) : total;
        if (to <= from)
            continue;
        const c0 = Math.floor(from / s), c1 = Math.floor((to - 1) / s);
        if (c0 === c1) {
            counts[c0] += to - from;
            continue;
        }
        counts[c0] += (c0 + 1) * s - from;
        counts[c1] += to - c1 * s;
        if (c1 > c0 + 1) {
            full[c0 + 1]++;
            full[c1]--;
        } // columns c0+1 .. c1-1 get all s samples
    }
}
/** Smallest sample index (from the left edge) whose x = col + (sx + 0.5) / s is strictly
 * greater than c, or total when none is. */
function firstPast(c, left, total, s) {
    let j = Math.floor((c - left) * s);
    j = j < 0 ? 0 : j > total ? total : j;
    while (j > 0) {
        const col = left + Math.floor((j - 1) / s);
        if (!(col + ((j - 1) - (col - left) * s + 0.5) / s > c))
            break;
        j--;
    }
    while (j < total) {
        const col = left + Math.floor(j / s);
        if (col + (j - (col - left) * s + 0.5) / s > c)
            break;
        j++;
    }
    return j;
}
/**
 * Anti-aliased even-odd fill. Pixel (col, row) covers [col, col+1) x [row, row+1) and is
 * sampled on an S x S grid; coverage = samples inside / S^2 (identical to regions.py).
 */
export function polygon(width, height, points, supersample = 4) {
    if (points.length < 3)
        throw new RangeError("a polygon needs at least three points");
    if (!points.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y)))
        throw new RangeError("polygon points must be finite");
    if (!Number.isInteger(supersample) || supersample < 1 || supersample > MAX_SUPERSAMPLE) {
        throw new RangeError(`supersample must be 1..${MAX_SUPERSAMPLE}`);
    }
    const m = emptyMask(width, height);
    const ys = points.map((p) => p[1]), xs = points.map((p) => p[0]);
    const top = Math.max(0, Math.floor(Math.min(...ys))), bottom = Math.min(height, Math.ceil(Math.max(...ys)) + 1);
    const left = Math.max(0, Math.floor(Math.min(...xs))), right = Math.min(width, Math.ceil(Math.max(...xs)) + 1);
    const s = supersample;
    for (let row = top; row < bottom; row++) {
        const cols = Math.max(0, right - left);
        const counts = new Int32Array(cols), full = new Int32Array(cols + 1);
        for (let sy = 0; sy < s; sy++) {
            const crossings = scanlineCrossings(points, row + (sy + 0.5) / s);
            if (!crossings.length)
                continue;
            addSpans(counts, full, crossings, left, cols, s);
        }
        for (let col = 0, run = 0; col < cols; col++) {
            run += full[col];
            counts[col] += run * s;
        }
        for (let col = left; col < right; col++)
            m.data[row * width + col] = counts[col - left] / (s * s);
    }
    return m;
}
function combine(a, b, f) {
    requireMask(a);
    requireMask(b, a.width, a.height);
    const out = emptyMask(a.width, a.height);
    for (let i = 0; i < out.data.length; i++)
        out.data[i] = f(a.data[i], b.data[i]);
    return out;
}
export function union(...layers) {
    if (!layers.length)
        throw new RangeError("at least one mask is required");
    return layers.slice(1).reduce((acc, m) => combine(acc, m, (x, y) => 1 - (1 - x) * (1 - y)), requireMask(layers[0]));
}
export function intersection(...layers) {
    if (!layers.length)
        throw new RangeError("at least one mask is required");
    return layers.slice(1).reduce((acc, m) => combine(acc, m, (x, y) => x * y), requireMask(layers[0]));
}
export const subtract = (source, removal) => combine(source, removal, (x, y) => x * (1 - y));
export function invert(mask) {
    requireMask(mask);
    const out = emptyMask(mask.width, mask.height);
    for (let i = 0; i < out.data.length; i++)
        out.data[i] = 1 - mask.data[i];
    return out;
}
export function threshold(mask, minimum = 0.5) {
    if (!(minimum >= 0 && minimum <= 1))
        throw new RangeError("threshold must be in [0, 1]");
    requireMask(mask);
    const out = emptyMask(mask.width, mask.height);
    for (let i = 0; i < out.data.length; i++)
        out.data[i] = mask.data[i] >= minimum ? 1 : 0;
    return out;
}
export function blur(mask, radius) {
    requireMask(mask);
    const blurred = boxMean(mask, radius);
    const out = emptyMask(mask.width, mask.height);
    for (let i = 0; i < out.data.length; i++)
        out.data[i] = Math.min(1, Math.max(0, blurred.data[i]));
    return out;
}
export function coverage(mask) {
    requireMask(mask);
    let sum = 0;
    for (let i = 0; i < mask.data.length; i++)
        sum += mask.data[i];
    return sum / mask.data.length;
}
/** [left, top, right, bottom) of values above `minimum`, or null. */
export function boundingBox(mask, minimum = 0) {
    let l = Infinity, t = Infinity, r = -1, b = -1;
    for (let y = 0; y < mask.height; y++) {
        for (let x = 0; x < mask.width; x++) {
            if (mask.data[y * mask.width + x] > minimum) {
                l = Math.min(l, x);
                t = Math.min(t, y);
                r = Math.max(r, x);
                b = Math.max(b, y);
            }
        }
    }
    return r < 0 ? null : [l, t, r + 1, b + 1];
}
// Distance transform -------------------------------------------------------------
/**
 * Squared Euclidean distance to the nearest `true` pixel (Meijster et al., 2000), exact.
 * All -1 when there is no true pixel.
 */
export function squaredEdt(on, width, height) {
    const n = width * height;
    if (on.length !== n)
        throw new RangeError("mask data does not match its size");
    const out = new Float64Array(n);
    let any = false;
    for (let i = 0; i < n && !any; i++)
        any = !!on[i];
    if (!any)
        return out.fill(-1);
    const inf = width + height;
    const g = new Float64Array(n);
    for (let x = 0; x < width; x++) {
        g[x] = on[x] ? 0 : inf;
        for (let y = 1; y < height; y++)
            g[y * width + x] = on[y * width + x] ? 0 : Math.min(g[(y - 1) * width + x] + 1, inf);
        for (let y = height - 2; y >= 0; y--)
            g[y * width + x] = Math.min(g[y * width + x], g[(y + 1) * width + x] + 1);
    }
    const s = new Int32Array(width), t = new Int32Array(width);
    for (let y = 0; y < height; y++) {
        const row = y * width;
        const g2 = (i) => g[row + i] * g[row + i];
        const f = (x, i) => (x - i) * (x - i) + g2(i);
        let q = 0;
        s[0] = 0;
        t[0] = 0;
        for (let u = 1; u < width; u++) {
            while (q >= 0 && f(t[q], s[q]) > f(t[q], u))
                q--;
            if (q < 0) {
                q = 0;
                s[0] = u;
            }
            else {
                const start = 1 + Math.floor((u * u - s[q] * s[q] + g2(u) - g2(s[q])) / (2 * (u - s[q])));
                if (start < width) {
                    q++;
                    s[q] = u;
                    t[q] = start;
                }
            }
        }
        for (let u = width - 1; u >= 0; u--) {
            out[row + u] = f(u, s[q]);
            if (u === t[q])
                q--;
        }
    }
    return out;
}
function binary(mask, level) {
    if (!(level > 0 && level <= 1))
        throw new RangeError("threshold must be in (0, 1]");
    requireMask(mask);
    const on = new Uint8Array(mask.data.length);
    for (let i = 0; i < on.length; i++)
        on[i] = mask.data[i] >= level ? 1 : 0;
    return on;
}
function sqrtField(d2, width, height) {
    const out = floatImage(width, height, 1, true);
    for (let i = 0; i < d2.length; i++)
        out.data[i] = d2[i] < 0 ? Infinity : Math.sqrt(d2[i]);
    return out;
}
/** Pixel distance to the nearest on pixel (0 on it, Infinity for an empty mask). */
export function distanceTo(mask, level = 0.5) {
    return sqrtField(squaredEdt(binary(mask, level), mask.width, mask.height), mask.width, mask.height);
}
/** Distance from each on pixel to the nearest off pixel (0 off; the border is not "off"). */
export function distanceInside(mask, level = 0.5) {
    const on = binary(mask, level);
    const off = on.map((v) => 1 - v);
    const field = sqrtField(squaredEdt(off, mask.width, mask.height), mask.width, mask.height);
    for (let i = 0; i < on.length; i++)
        if (!on[i])
            field.data[i] = 0;
    return field;
}
function requireRadius(radius) {
    if (!Number.isFinite(radius) || radius < 0)
        throw new RangeError("radius must be finite and non-negative");
}
export function dilate(mask, radius, level = 0.5) {
    requireRadius(radius);
    const d = distanceTo(mask, level);
    const out = emptyMask(mask.width, mask.height);
    for (let i = 0; i < out.data.length; i++)
        out.data[i] = d.data[i] <= radius ? 1 : 0;
    return out;
}
export function erode(mask, radius, level = 0.5) {
    requireRadius(radius);
    if (radius === 0)
        return threshold(mask, level);
    const d = distanceInside(mask, level);
    const out = emptyMask(mask.width, mask.height);
    for (let i = 0; i < out.data.length; i++)
        out.data[i] = d.data[i] > radius ? 1 : 0;
    return out;
}
/** Smoothstep feather of `radius` pixels: inside, centred on, or outside the edge. */
export function feather(mask, radius, mode = "inside", level = 0.5) {
    requireRadius(radius);
    if (!["inside", "centered", "outside"].includes(mode))
        throw new RangeError("mode must be inside, centered or outside");
    const on = binary(mask, level);
    const out = emptyMask(mask.width, mask.height);
    if (radius === 0) {
        for (let i = 0; i < on.length; i++)
            out.data[i] = on[i];
        return out;
    }
    const depth = distanceInside(mask, level), reach = distanceTo(mask, level);
    for (let i = 0; i < on.length; i++) {
        let ramp;
        if (mode === "inside")
            ramp = on[i] ? (depth.data[i] - 0.5) / radius : 0;
        else if (mode === "outside")
            ramp = on[i] ? 1 : 1 - (reach.data[i] - 0.5) / radius;
        else
            ramp = 0.5 + (on[i] ? depth.data[i] - 0.5 : 0.5 - reach.data[i]) / radius;
        ramp = Math.min(1, Math.max(0, ramp));
        out.data[i] = ramp * ramp * (3 - 2 * ramp);
    }
    return out;
}
// Guided filter --------------------------------------------------------------------
/** A guide as float values in [0, 1]: bytes / 255 (RGB kept, alpha dropped) or a float plane. */
export function asGuide(guide) {
    if (guide.data instanceof Float32Array || guide.data instanceof Float64Array) {
        if (guide.channels !== 1 && guide.channels !== 3)
            throw new RangeError("float guides have 1 or 3 channels");
        return guide;
    }
    const channels = guide.channels === 1 ? 1 : 3;
    if (guide.channels === 2)
        throw new RangeError("guide must have 1, 3 or 4 channels");
    const out = floatImage(guide.width, guide.height, channels, true);
    for (let i = 0; i < guide.width * guide.height; i++) {
        for (let c = 0; c < channels; c++)
            out.data[i * channels + c] = guide.data[i * guide.channels + c] / 255;
    }
    return out;
}
function product(a, ca, b, cb) {
    const out = floatImage(a.width, a.height, 1, true);
    for (let i = 0; i < out.data.length; i++)
        out.data[i] = a.data[i * a.channels + ca] * b.data[i * b.channels + cb];
    return out;
}
function channel(img, c) {
    const out = floatImage(img.width, img.height, 1, true);
    for (let i = 0; i < out.data.length; i++)
        out.data[i] = img.data[i * img.channels + c];
    return out;
}
/** He, Sun and Tang's guided filter of `source` (one channel), grey or colour guide. Not clipped. */
export function guidedFilter(guideImage, source, radius, eps) {
    if (!Number.isInteger(radius) || radius < 1 || radius > 256)
        throw new RangeError("radius must be between 1 and 256");
    if (!(Number.isFinite(eps) && eps > 0))
        throw new RangeError("eps must be positive");
    const g = asGuide(guideImage);
    if (source.channels !== 1)
        throw new RangeError("source has one channel");
    requireSameSize(g, source, "guide and source");
    const n = source.width * source.height;
    const meanP = boxMean(source, radius);
    const out = floatImage(source.width, source.height, 1, true);
    if (g.channels === 1) {
        const meanI = boxMean(g, radius);
        const meanIP = boxMean(product(g, 0, source, 0), radius);
        const meanII = boxMean(product(g, 0, g, 0), radius);
        const a = floatImage(source.width, source.height, 1, true), b = floatImage(source.width, source.height, 1, true);
        for (let i = 0; i < n; i++) {
            const cov = meanIP.data[i] - meanI.data[i] * meanP.data[i];
            const v = meanII.data[i] - meanI.data[i] * meanI.data[i];
            a.data[i] = cov / (v + eps);
            b.data[i] = meanP.data[i] - a.data[i] * meanI.data[i];
        }
        const ma = boxMean(a, radius), mb = boxMean(b, radius);
        for (let i = 0; i < n; i++)
            out.data[i] = ma.data[i] * g.data[i] + mb.data[i];
        return out;
    }
    const mean = [0, 1, 2].map((c) => boxMean(channel(g, c), radius));
    const cov = [0, 1, 2].map((c) => boxMean(product(g, c, source, 0), radius));
    const pair = (i, j) => boxMean(product(g, i, g, j), radius);
    const [crr, crg, crb, cgg, cgb, cbb] = [pair(0, 0), pair(0, 1), pair(0, 2), pair(1, 1), pair(1, 2), pair(2, 2)];
    const ar = floatImage(source.width, source.height, 1, true), ag = floatImage(source.width, source.height, 1, true);
    const ab = floatImage(source.width, source.height, 1, true), bb = floatImage(source.width, source.height, 1, true);
    for (let i = 0; i < n; i++) {
        const mr = mean[0].data[i], mg = mean[1].data[i], mbv = mean[2].data[i], mp = meanP.data[i];
        const srr = crr.data[i] - mr * mr + eps, srg = crg.data[i] - mr * mg, srb = crb.data[i] - mr * mbv;
        const sgg = cgg.data[i] - mg * mg + eps, sgb = cgb.data[i] - mg * mbv, sbb = cbb.data[i] - mbv * mbv + eps;
        const cr = cov[0].data[i] - mr * mp, cg = cov[1].data[i] - mg * mp, cb = cov[2].data[i] - mbv * mp;
        const irr = sgg * sbb - sgb * sgb, irg = sgb * srb - srg * sbb, irb = srg * sgb - sgg * srb;
        const igg = srr * sbb - srb * srb, igb = srb * srg - srr * sgb, ibb = srr * sgg - srg * srg;
        const det = srr * irr + srg * irg + srb * irb;
        ar.data[i] = (irr * cr + irg * cg + irb * cb) / det;
        ag.data[i] = (irg * cr + igg * cg + igb * cb) / det;
        ab.data[i] = (irb * cr + igb * cg + ibb * cb) / det;
        bb.data[i] = mp - ar.data[i] * mr - ag.data[i] * mg - ab.data[i] * mbv;
    }
    const [mar, mag, mab, mbb] = [ar, ag, ab, bb].map((x) => boxMean(x, radius));
    for (let i = 0; i < n; i++) {
        out.data[i] = mar.data[i] * g.data[i * 3] + mag.data[i] * g.data[i * 3 + 1] + mab.data[i] * g.data[i * 3 + 2] + mbb.data[i];
    }
    return out;
}
/** Pixels within `band` pixels of the mask's 0.5 edge, on either side (1 or 0). */
export function edgeBand(mask, band, level = 0.5) {
    requireRadius(band);
    const on = binary(mask, level);
    const out = new Uint8Array(on.length);
    const count = on.reduce((a, v) => a + v, 0);
    if (count === 0 || count === on.length)
        return out;
    const depth = distanceInside(mask, level), reach = distanceTo(mask, level);
    for (let i = 0; i < on.length; i++)
        out[i] = (on[i] ? depth.data[i] : reach.data[i]) <= band ? 1 : 0;
    return out;
}
/** Move a mask's soft edge onto the photo's edges; `band` limits the change to a strip. */
export function edgeAwareFeather(mask, guide, radius = 8, eps = 1e-3, band = null) {
    requireMask(mask);
    const refined = guidedFilter(guide, mask, radius, eps);
    const strip = band === null ? null : edgeBand(mask, band);
    const out = emptyMask(mask.width, mask.height);
    for (let i = 0; i < out.data.length; i++) {
        const soft = Math.min(1, Math.max(0, refined.data[i]));
        out.data[i] = strip && !strip[i] ? (mask.data[i] >= 0.5 ? 1 : 0) : soft;
    }
    return out;
}
