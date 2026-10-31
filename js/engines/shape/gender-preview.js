/** Exact sparse Q4 samples for the gender candidate search. The contour score
 * depends only on each band pixel's four gradient neighbours. Sample those same
 * integer coordinates with the canonical first-triangle ownership and linear,
 * premultiplied-alpha resampler; the chosen target still needs a full raster and
 * guard confirmation. No photo, mesh or sample cache survives a render invocation.
 * Concept source: MediaPipe Face Landmarker mesh topology (runtime data only);
 * independent sparse evaluation and cache design; concept only, no code copied.
 * Author: John Khan.
 */
import { requireColour, requireMask, requireSameSize, SRGB_TO_LINEAR, encodeByte, toByte } from "../core/buffer.js";
import { gradientMagnitude, quantile } from "../core/filters.js";
import { EDGE_GRADIENT_FLOOR, luma, maskEdge } from "../../quality/metrics.js";
import { DEGENERATE_AREA, EDGE_TOLERANCE } from "../warp/piecewise.js";
import { signedArea } from "../warp/triangulate.js";
const BUCKET_SIDE = 16;
/** Euclidean radius-one dilation, clipped at the image border. Read only from
 * the original edge so diagonal and later-written pixels cannot extend it. */
export function onePixelBand(edge, width, height) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || edge.length !== width * height) {
        throw new RangeError("edge dimensions must match its pixels");
    }
    const band = new Uint8Array(edge);
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
            const i = y * width + x;
            if (!edge[i])
                continue;
            if (x > 0)
                band[i - 1] = 1;
            if (x + 1 < width)
                band[i + 1] = 1;
            if (y > 0)
                band[i - width] = 1;
            if (y + 1 < height)
                band[i + width] = 1;
        }
    return band;
}
/** The core remap arithmetic on selected coordinates only. Unlike remap, it
 * decodes only selected taps instead of building a full linear-light image. */
export function sampleSeamPixels(image, x, y) {
    requireColour(image);
    if (x.length !== y.length)
        throw new RangeError("sample coordinates must match");
    const { width, height, channels, data } = image, alphaPresent = channels === 4;
    const pixels = new Uint8Array(x.length * channels), accumulator = new Float64Array(4);
    for (let i = 0; i < x.length; i++) {
        if (!Number.isFinite(x[i]) || !Number.isFinite(y[i]))
            throw new RangeError("sample coordinates must be finite");
        const mx = Math.min(Math.max(x[i], 0), width - 1), my = Math.min(Math.max(y[i], 0), height - 1);
        const x0 = Math.floor(mx), y0 = Math.floor(my), fx = mx - x0, fy = my - y0;
        accumulator.fill(0);
        for (let dy = 0; dy < 2; dy++) {
            const wy = dy === 0 ? 1 - fy : fy;
            for (let dx = 0; dx < 2; dx++) {
                const wx = dx === 0 ? 1 - fx : fx, weight = wx * wy;
                const p = (Math.min(y0 + dy, height - 1) * width + Math.min(x0 + dx, width - 1)) * channels;
                const alpha = alphaPresent ? data[p + 3] / 255 : 1;
                for (let c = 0; c < 3; c++)
                    accumulator[c] = accumulator[c] + (SRGB_TO_LINEAR[data[p + c]] * alpha) * weight;
                accumulator[3] = accumulator[3] + alpha * weight;
            }
        }
        const alpha = accumulator[3];
        for (let c = 0; c < 3; c++) {
            const colour = alphaPresent ? (alpha > 0 ? accumulator[c] / alpha : 0) : accumulator[c];
            pixels[i * channels + c] = encodeByte(colour);
        }
        if (alphaPresent)
            pixels[i * channels + 3] = toByte(alpha);
    }
    return pixels;
}
/** Per-render contour and input-gradient cache. Only exact output coordinates
 * are omitted from intermediate rasters; no spatial downsampling is involved. */
export class SparseSeam {
    image;
    x;
    y;
    left;
    right;
    above;
    below;
    xDivisor;
    yDivisor;
    beforeGradient;
    reference;
    buckets;
    bucketColumns;
    bucketPrefix;
    constructor(image, mask) {
        this.image = image;
        requireColour(image);
        requireMask(mask, image.width, image.height);
        const { width, height } = image, count = width * height;
        const band = onePixelBand(maskEdge(mask), width, height);
        const rows = [], selected = new Uint8Array(count);
        for (let i = 0; i < count; i++) {
            if (!band[i])
                continue;
            rows.push(i);
            const x = i % width, y = Math.floor(i / width);
            selected[y * width + Math.max(x - 1, 0)] = 1;
            selected[y * width + Math.min(x + 1, width - 1)] = 1;
            selected[Math.max(y - 1, 0) * width + x] = 1;
            selected[Math.min(y + 1, height - 1) * width + x] = 1;
        }
        const indices = new Int32Array(count).fill(-1), positions = [];
        for (let i = 0; i < count; i++)
            if (selected[i]) {
                indices[i] = positions.length;
                positions.push(i);
            }
        this.x = Float64Array.from(positions, p => p % width);
        this.y = Float64Array.from(positions, p => Math.floor(p / width));
        this.left = new Int32Array(rows.length);
        this.right = new Int32Array(rows.length);
        this.above = new Int32Array(rows.length);
        this.below = new Int32Array(rows.length);
        this.xDivisor = new Uint8Array(rows.length);
        this.yDivisor = new Uint8Array(rows.length);
        rows.forEach((p, i) => {
            const x = p % width, y = Math.floor(p / width);
            this.left[i] = indices[y * width + Math.max(x - 1, 0)];
            this.right[i] = indices[y * width + Math.min(x + 1, width - 1)];
            this.above[i] = indices[Math.max(y - 1, 0) * width + x];
            this.below[i] = indices[Math.min(y + 1, height - 1) * width + x];
            this.xDivisor[i] = x === 0 || x === width - 1 ? 1 : 2;
            this.yDivisor[i] = y === 0 || y === height - 1 ? 1 : 2;
        });
        const before = gradientMagnitude(luma(image)), edges = [];
        for (const value of before.data)
            if (value >= EDGE_GRADIENT_FLOOR)
                edges.push(value);
        this.beforeGradient = Float64Array.from(rows, p => before.data[p]);
        this.reference = edges.length ? quantile(edges, .5) : EDGE_GRADIENT_FLOOR;
        this.bucketColumns = Math.ceil(width / BUCKET_SIDE);
        const bucketRows = Math.ceil(height / BUCKET_SIDE);
        const buckets = Array.from({ length: this.bucketColumns * bucketRows }, () => []);
        positions.forEach((_, i) => buckets[Math.floor(this.y[i] / BUCKET_SIDE) * this.bucketColumns + Math.floor(this.x[i] / BUCKET_SIDE)].push(i));
        this.buckets = buckets;
        const stride = this.bucketColumns + 1;
        this.bucketPrefix = new Int32Array(stride * (bucketRows + 1));
        for (let y = 0; y < bucketRows; y++)
            for (let x = 0; x < this.bucketColumns; x++) {
                this.bucketPrefix[(y + 1) * stride + x + 1] = Number(buckets[y * this.bucketColumns + x].length > 0)
                    + this.bucketPrefix[y * stride + x + 1] + this.bucketPrefix[(y + 1) * stride + x] - this.bucketPrefix[y * stride + x];
            }
    }
    get sampleCount() { return this.x.length; }
    /** Same piecewise map at selected integer pixels, including first ownership
     * on triangle boundaries and unchanged coordinates outside all triangles. */
    maps(layout, targets) {
        if (targets.length !== layout.meshCount || targets.some(p => !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) {
            throw new RangeError("sparse targets must match the finite mesh");
        }
        const source = layout.points, destination = source.map((point, i) => i < layout.meshCount ? targets[i] : point);
        const mappedX = new Float64Array(this.x), mappedY = new Float64Array(this.y), owned = new Uint8Array(this.sampleCount);
        const { width, height } = this.image, stride = this.bucketColumns + 1, prefix = this.bucketPrefix;
        for (const [ia, ib, ic] of layout.triangles) {
            const a = destination[ia], b = destination[ib], c = destination[ic];
            if (Math.abs(signedArea(a, b, c)) <= DEGENERATE_AREA)
                continue;
            const x0 = Math.max(0, Math.ceil(Math.min(a[0], b[0], c[0]) - EDGE_TOLERANCE));
            const x1 = Math.min(width - 1, Math.floor(Math.max(a[0], b[0], c[0]) + EDGE_TOLERANCE));
            const y0 = Math.max(0, Math.ceil(Math.min(a[1], b[1], c[1]) - EDGE_TOLERANCE));
            const y1 = Math.min(height - 1, Math.floor(Math.max(a[1], b[1], c[1]) + EDGE_TOLERANCE));
            if (x0 > x1 || y0 > y1)
                continue;
            const bx0 = Math.floor(x0 / BUCKET_SIDE), bx1 = Math.floor(x1 / BUCKET_SIDE) + 1;
            const by0 = Math.floor(y0 / BUCKET_SIDE), by1 = Math.floor(y1 / BUCKET_SIDE) + 1;
            if (prefix[by1 * stride + bx1] - prefix[by0 * stride + bx1] - prefix[by1 * stride + bx0] + prefix[by0 * stride + bx0] === 0)
                continue;
            const det = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
            const sa = source[ia], sb = source[ib], sc = source[ic];
            for (let by = by0; by < by1; by++)
                for (let bx = bx0; bx < bx1; bx++) {
                    for (const index of this.buckets[by * this.bucketColumns + bx]) {
                        const x = this.x[index], y = this.y[index];
                        if (owned[index] || x < x0 || x > x1 || y < y0 || y > y1)
                            continue;
                        const first = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / det;
                        const second = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / det;
                        const third = 1 - first - second;
                        if (first < -EDGE_TOLERANCE || second < -EDGE_TOLERANCE || third < -EDGE_TOLERANCE)
                            continue;
                        mappedX[index] = first * sa[0] + second * sb[0] + third * sc[0];
                        mappedY[index] = first * sa[1] + second * sb[1] + third * sc[1];
                        owned[index] = 1;
                    }
                }
        }
        return { x: mappedX, y: mappedY };
    }
    ratio(layout, targets) {
        if (!this.sampleCount)
            return 0;
        const maps = this.maps(layout, targets);
        return this.ratioFromPixels(sampleSeamPixels(this.image, maps.x, maps.y));
    }
    /** Confirm Q4 from the actual full raster, retaining the same input reference
     * and contour. This never substitutes for the warp's complete Q3 guard. */
    fullRatio(output) {
        requireColour(output);
        requireSameSize(output, this.image, "Q4 full output and input");
        if (output.channels !== this.image.channels)
            throw new RangeError("Q4 full output must have matching channels");
        if (!this.sampleCount)
            return 0;
        const pixels = new Uint8Array(this.sampleCount * output.channels);
        for (let i = 0; i < this.sampleCount; i++) {
            const p = (this.y[i] * output.width + this.x[i]) * output.channels;
            for (let c = 0; c < output.channels; c++)
                pixels[i * output.channels + c] = output.data[p + c];
        }
        return this.ratioFromPixels(pixels);
    }
    ratioFromPixels(pixels) {
        const channels = this.image.channels, light = new Float64Array(this.sampleCount);
        for (let i = 0; i < this.sampleCount; i++) {
            const p = i * channels;
            light[i] = .2126 * (pixels[p] / 255) + .7152 * (pixels[p + 1] / 255) + .0722 * (pixels[p + 2] / 255);
        }
        const excess = new Float64Array(this.left.length);
        for (let i = 0; i < excess.length; i++) {
            const gx = (light[this.right[i]] - light[this.left[i]]) / this.xDivisor[i];
            const gy = (light[this.below[i]] - light[this.above[i]]) / this.yDivisor[i];
            excess[i] = Math.max(0, Math.sqrt(gx * gx + gy * gy) - this.beforeGradient[i]);
        }
        return quantile(excess, .9) / this.reference;
    }
}
