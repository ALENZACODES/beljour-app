/**
 * E04 separable filters with exact border rules (mirrors api/plumb_api/engines/core/filters.py):
 * box mean with replicated edges, 1D correlation with reflect101 borders, central-difference
 * gradients (one-sided on the outer rows and columns) and linear-interpolated quantiles.
 *
 * Results are Float64Array images so long sums keep their precision.
 * Author: John Khan.
 */
import { floatImage } from "./buffer.js";
export const MAX_RADIUS = 512;
export function reflect101(i, n) {
    if (n <= 0)
        throw new RangeError("length must be positive");
    if (n === 1)
        return 0;
    const period = 2 * n - 2;
    let k = i % period;
    if (k < 0)
        k += period;
    return k >= n ? period - k : k;
}
function requireFinite(img) {
    for (let i = 0; i < img.data.length; i++) {
        if (!Number.isFinite(img.data[i]))
            throw new RangeError("values must be finite");
    }
}
/** The vertical pass of boxMean, walked row by row instead of column by column (a column
 * walk jumps a whole row per sample). Every column keeps its own running sum and prefix
 * values, added in the same order as the column walk, and each output is the same
 * difference of two prefix values, so the result is identical to the column walk.
 * Only the last size + 1 prefix rows are kept. (R7 measurements.) */
function verticalBoxPass(data, w, h, ch, radius) {
    const row = w * ch, size = 2 * radius + 1, ring = size + 1, total = h + 2 * radius;
    const prefix = new Float64Array(ring * row); // prefix row k lives at (k % ring) * row
    const sum = new Float64Array(row);
    const source = new Float64Array(h * row);
    source.set(data);
    // prefix[0] = 0 for every column (the ring starts zeroed)
    for (let k = 0; k < total; k++) {
        const src = Math.min(Math.max(k - radius, 0), h - 1) * row;
        const at = ((k + 1) % ring) * row;
        for (let j = 0; j < row; j++) {
            sum[j] += source[src + j];
            prefix[at + j] = sum[j];
        }
        const i = k + 1 - size; // output row whose window just closed
        if (i >= 0 && i < h) {
            const hi = ((i + size) % ring) * row, lo = (i % ring) * row, o = i * row;
            for (let j = 0; j < row; j++)
                data[o + j] = (prefix[hi + j] - prefix[lo + j]) / size;
        }
    }
}
/** Mean over a (2r+1)^2 window, edges extended; vertical pass first, as in Python. */
export function boxMean(img, radius) {
    if (!Number.isInteger(radius) || radius < 0 || radius > MAX_RADIUS) {
        throw new RangeError(`radius must be a whole number between 0 and ${MAX_RADIUS}`);
    }
    requireFinite(img);
    const { width: w, height: h, channels: ch } = img;
    const out = floatImage(w, h, ch, true);
    out.data.set(img.data);
    if (radius === 0)
        return out;
    const size = 2 * radius + 1;
    verticalBoxPass(out.data, w, h, ch, radius);
    // Horizontal pass: one line per row and channel, samples ch apart.
    const length = w, stride = ch;
    const prefix = new Float64Array(length + 2 * radius + 1);
    const line = new Float64Array(length);
    for (let y = 0; y < h; y++)
        for (let c = 0; c < ch; c++) {
            const start = y * w * ch + c;
            for (let i = 0; i < length; i++)
                line[i] = out.data[start + i * stride];
            let sum = 0;
            prefix[0] = 0;
            for (let k = 0; k < length + 2 * radius; k++) {
                const src = Math.min(Math.max(k - radius, 0), length - 1);
                sum += line[src];
                prefix[k + 1] = sum;
            }
            for (let i = 0; i < length; i++)
                out.data[start + i * stride] = (prefix[i + size] - prefix[i]) / size;
        }
    return out;
}
/** Correlate along an axis (0 = down the rows, 1 = along each row) with an odd kernel. */
export function convolve(img, kernel, axis) {
    if (kernel.length % 2 !== 1)
        throw new RangeError("kernel must have odd length");
    const { width: w, height: h, channels: ch } = img;
    const r = (kernel.length - 1) / 2;
    const out = floatImage(w, h, ch, true);
    const length = axis === 0 ? h : w;
    const idx = new Int32Array(length * kernel.length);
    for (let i = 0; i < length; i++)
        for (let k = 0; k < kernel.length; k++)
            idx[i * kernel.length + k] = reflect101(i + k - r, length);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = axis === 0 ? y : x;
            for (let c = 0; c < ch; c++) {
                let acc = 0;
                for (let k = 0; k < kernel.length; k++) {
                    const j = idx[i * kernel.length + k];
                    const src = axis === 0 ? (j * w + x) * ch + c : (y * w + j) * ch + c;
                    acc = acc + kernel[k] * img.data[src];
                }
                out.data[(y * w + x) * ch + c] = acc;
            }
        }
    }
    return out;
}
/** [d/dx, d/dy] of a one-channel image (NumPy np.gradient, edge_order 1). */
export function gradient(plane) {
    if (plane.channels !== 1)
        throw new RangeError("gradient works on one channel");
    const { width: w, height: h, data } = plane;
    const gx = floatImage(w, h, 1, true), gy = floatImage(w, h, 1, true);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = y * w + x;
            if (w > 1) {
                gx.data[i] = x === 0 ? data[i + 1] - data[i] : x === w - 1 ? data[i] - data[i - 1] : (data[i + 1] - data[i - 1]) / 2;
            }
            if (h > 1) {
                gy.data[i] = y === 0 ? data[i + w] - data[i] : y === h - 1 ? data[i] - data[i - w] : (data[i + w] - data[i - w]) / 2;
            }
        }
    }
    return [gx, gy];
}
export function gradientMagnitude(plane) {
    const [gx, gy] = gradient(plane);
    const out = floatImage(plane.width, plane.height, 1, true);
    for (let i = 0; i < out.data.length; i++)
        out.data[i] = Math.sqrt(gx.data[i] * gx.data[i] + gy.data[i] * gy.data[i]);
    return out;
}
/** Quantile q of a non-empty sample, interpolating linearly between order statistics. */
export function quantile(values, q) {
    if (values.length === 0)
        throw new RangeError("quantile of an empty sample");
    if (!(q >= 0 && q <= 1))
        throw new RangeError("q must be in [0, 1]");
    const work = Float64Array.from(values);
    const pos = q * (work.length - 1);
    const lo = Math.floor(pos), hi = Math.min(lo + 1, work.length - 1);
    const [a, b] = orderStatistics(work, lo, hi);
    return a + (b - a) * (pos - lo);
}
/** Typed-array sort order: -0 before +0 (NaN never reaches here). */
const before = (a, b) => a < b || (a === 0 && b === 0 && Object.is(a, -0) && Object.is(b, 0));
/** The values at sorted positions lo and hi (hi is lo or lo + 1) without sorting everything:
 * a quickselect puts the lo-th value in place with every smaller value to its left, and the
 * hi-th is then the smallest value to its right. Same values as Float64Array.sort() gives
 * (R7 measurements); a sample with NaN, or a selection that degrades, falls back to sorting. */
function orderStatistics(work, lo, hi) {
    const sorted = () => { work.sort(); return [work[lo], work[hi]]; };
    for (let i = 0; i < work.length; i++)
        if (work[i] !== work[i])
            return sorted();
    let left = 0, right = work.length - 1, rounds = 0;
    while (right > left) {
        if (++rounds > 64)
            return sorted();
        // median of three as the pivot, then a three-way partition (equal values gather in the middle)
        const mid = (left + right) >>> 1;
        const x = work[left], y = work[mid], z = work[right];
        const pivot = before(x, y) ? (before(y, z) ? y : before(x, z) ? z : x) : (before(x, z) ? x : before(y, z) ? z : y);
        let lt = left, gt = right, i = left;
        while (i <= gt) {
            const v = work[i];
            if (before(v, pivot)) {
                work[i] = work[lt];
                work[lt] = v;
                lt++;
                i++;
            }
            else if (before(pivot, v)) {
                work[i] = work[gt];
                work[gt] = v;
                gt--;
            }
            else
                i++;
        }
        if (lo < lt)
            right = lt - 1;
        else if (lo > gt)
            left = gt + 1;
        else
            break; // lo sits among the values equal to the pivot
    }
    const a = work[lo];
    if (hi === lo)
        return [a, a];
    let b = Infinity, found = false;
    for (let i = lo + 1; i < work.length; i++)
        if (!found || before(work[i], b)) {
            b = work[i];
            found = true;
        }
    return [a, b];
}
/** Local area scale of a backward map (mapX, mapY); <= 0 where the mapping folds. */
export function jacobianDeterminant(mapX, mapY) {
    if (mapX.width !== mapY.width || mapX.height !== mapY.height)
        throw new RangeError("maps must be the same size");
    const [xx, xy] = gradient(mapX), [yx, yy] = gradient(mapY);
    const out = floatImage(mapX.width, mapX.height, 1, true);
    for (let i = 0; i < out.data.length; i++)
        out.data[i] = xx.data[i] * yy.data[i] - xy.data[i] * yx.data[i];
    return out;
}
//# sourceMappingURL=filters.js.map