/**
 * E04 pyramids (Burt and Adelson, 1983), mirroring api/plumb_api/engines/core/pyramid.py:
 * 5-tap binomial blur with reflect101 borders, `down` keeps even rows and columns,
 * `up` expands to an explicit size, Laplacian bands collapse back exactly.
 *
 * Author: John Khan.
 */
import { floatImage } from "./buffer.js";
import { convolve } from "./filters.js";
export const KERNEL = [1 / 16, 4 / 16, 6 / 16, 4 / 16, 1 / 16];
function requirePlane(img) {
    if (img.data.length !== img.width * img.height * img.channels)
        throw new RangeError("image data does not match its size");
    for (let i = 0; i < img.data.length; i++)
        if (!Number.isFinite(img.data[i]))
            throw new RangeError("values must be finite");
}
export function blur(img) {
    requirePlane(img);
    return convolve(convolve(img, KERNEL, 1), KERNEL, 0);
}
export function down(img) {
    const b = blur(img);
    const w = Math.ceil(img.width / 2), h = Math.ceil(img.height / 2), ch = img.channels;
    const out = floatImage(w, h, ch, true);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            for (let c = 0; c < ch; c++)
                out.data[(y * w + x) * ch + c] = b.data[((2 * y) * img.width + 2 * x) * ch + c];
        }
    }
    return out;
}
function expandAxis(img, length, axis) {
    const coarse = axis === 0 ? img.height : img.width;
    if (coarse !== Math.floor((length + 1) / 2))
        throw new RangeError(`cannot expand ${coarse} samples to ${length}`);
    const w = axis === 1 ? length : img.width, h = axis === 0 ? length : img.height, ch = img.channels;
    const zeros = floatImage(w, h, ch, true);
    for (let y = 0; y < img.height; y++) {
        for (let x = 0; x < img.width; x++) {
            const ty = axis === 0 ? 2 * y : y, tx = axis === 1 ? 2 * x : x;
            for (let c = 0; c < ch; c++)
                zeros.data[(ty * w + tx) * ch + c] = img.data[(y * img.width + x) * ch + c];
        }
    }
    const blurred = convolve(zeros, KERNEL, axis);
    for (let i = 0; i < blurred.data.length; i++)
        blurred.data[i] = 2 * blurred.data[i];
    return blurred;
}
/** Expand to exactly width x height; the input must be the matching coarse size. */
export function up(img, width, height) {
    requirePlane(img);
    if (!(width >= 1 && height >= 1))
        throw new RangeError("target size must be positive");
    return expandAxis(expandAxis(img, width, 1), height, 0);
}
export function maxLevels(width, height, minSide = 8) {
    if (width < 1 || height < 1 || minSide < 1)
        throw new RangeError("sizes must be positive");
    let levels = 1, w = width, h = height;
    while (Math.min(Math.floor((h + 1) / 2), Math.floor((w + 1) / 2)) >= minSide) {
        h = Math.floor((h + 1) / 2);
        w = Math.floor((w + 1) / 2);
        levels++;
    }
    return levels;
}
export function gaussian(img, levels) {
    requirePlane(img);
    if (!(levels >= 1))
        throw new RangeError("levels must be at least 1");
    const out = [img];
    for (let k = 1; k < levels; k++) {
        const last = out[out.length - 1];
        if (Math.min(last.width, last.height) <= 1)
            break;
        out.push(down(last));
    }
    return out;
}
function combine(a, b, sign) {
    const out = floatImage(a.width, a.height, a.channels, true);
    for (let i = 0; i < out.data.length; i++)
        out.data[i] = a.data[i] + sign * b.data[i];
    return out;
}
export function laplacian(img, levels) {
    const g = gaussian(img, levels);
    const bands = g.slice(0, -1).map((level, k) => combine(level, up(g[k + 1], level.width, level.height), -1));
    bands.push(g[g.length - 1]);
    return bands;
}
export function collapse(bands) {
    if (!bands.length)
        throw new RangeError("an empty pyramid has nothing to collapse");
    let out = bands[bands.length - 1];
    for (let k = bands.length - 2; k >= 0; k--)
        out = combine(bands[k], up(out, bands[k].width, bands[k].height), 1);
    return out;
}
/** The finest Laplacian band: detail removed by one blur-and-halve step. */
export function highFrequency(img) {
    requirePlane(img);
    if (Math.min(img.width, img.height) < 2)
        return floatImage(img.width, img.height, img.channels, true);
    return combine(img, up(down(img), img.width, img.height), -1);
}
//# sourceMappingURL=pyramid.js.map