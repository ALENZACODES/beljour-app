/** Multiscale turn compositing; original independent implementation.
 * Concept: Burt and Adelson Laplacian pyramid, "The Laplacian Pyramid as a
 * Compact Image Code" (IEEE Transactions on Communications, 1983).
 * The Burt and Adelson Laplacian pyramid is concept only, no code copied.
 * Mirrors api/plumb_api/engines/shape/turn_pyramid.py, including its hard guards.
 * All operations are display-encoded float32, not radiometric relighting.
 * No provider, model, photograph, or third-party rendering implementation is used.
 * Author: John Khan.
 */
import { byteImage, requireColour, requireMask, roundHalfEven, } from "../core/buffer.js";
const KERNEL = [1, 4, 6, 4, 1];
const MAX_LEVELS = 4;
function reflected(index, count) {
    if (count < 2)
        return 0;
    const period = 2 * count - 2;
    const wrapped = ((index % period) + period) % period;
    return wrapped < count ? wrapped : period - wrapped;
}
function blur(image) {
    const { width, height, channels, data } = image;
    const horizontal = new Float32Array(data.length);
    const out = new Float32Array(data.length);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            for (let c = 0; c < channels; c++) {
                let value = 0;
                for (let tap = 0; tap < 5; tap++) {
                    const sx = reflected(x + tap - 2, width);
                    value = Math.fround(value + Math.fround(KERNEL[tap] * data[(y * width + sx) * channels + c]));
                }
                horizontal[(y * width + x) * channels + c] = Math.fround(value / 16);
            }
        }
    }
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            for (let c = 0; c < channels; c++) {
                let value = 0;
                for (let tap = 0; tap < 5; tap++) {
                    const sy = reflected(y + tap - 2, height);
                    value = Math.fround(value + Math.fround(KERNEL[tap] * horizontal[(sy * width + x) * channels + c]));
                }
                out[(y * width + x) * channels + c] = Math.fround(value / 16);
            }
        }
    }
    return { width, height, channels, data: out };
}
function down(image) {
    const blurred = blur(image);
    const width = Math.ceil(image.width / 2);
    const height = Math.ceil(image.height / 2);
    const { channels } = image;
    const data = new Float32Array(width * height * channels);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            for (let c = 0; c < channels; c++) {
                data[(y * width + x) * channels + c] = blurred.data[(2 * y * image.width + 2 * x) * channels + c];
            }
        }
    }
    return { width, height, channels, data };
}
function up(coarse, width, height) {
    if (Math.ceil(width / 2) !== coarse.width || Math.ceil(height / 2) !== coarse.height) {
        throw new RangeError("pyramid expansion shape is not a matching even-pixel grid");
    }
    const { channels } = coarse;
    const data = new Float32Array(width * height * channels);
    for (let y = 0; y < height; y++) {
        const loY = Math.min(Math.floor(y / 2), coarse.height - 1);
        const hiY = Math.min(loY + 1, coarse.height - 1);
        const wy = Math.fround(y / 2 - loY);
        for (let x = 0; x < width; x++) {
            const loX = Math.min(Math.floor(x / 2), coarse.width - 1);
            const hiX = Math.min(loX + 1, coarse.width - 1);
            const wx = Math.fround(x / 2 - loX);
            for (let c = 0; c < channels; c++) {
                const ul = coarse.data[(loY * coarse.width + loX) * channels + c];
                const dl = coarse.data[(hiY * coarse.width + loX) * channels + c];
                const ur = coarse.data[(loY * coarse.width + hiX) * channels + c];
                const dr = coarse.data[(hiY * coarse.width + hiX) * channels + c];
                const left = Math.fround(Math.fround(ul * Math.fround(1 - wy)) + Math.fround(dl * wy));
                const right = Math.fround(Math.fround(ur * Math.fround(1 - wy)) + Math.fround(dr * wy));
                data[(y * width + x) * channels + c] = Math.fround(Math.fround(left * Math.fround(1 - wx)) + Math.fround(right * wx));
            }
        }
    }
    return { width, height, channels, data };
}
function levels(image, depth) {
    const result = [image];
    for (let i = 1; i < depth; i++)
        result.push(down(result[result.length - 1]));
    return result;
}
function laplacian(gaussians) {
    return gaussians.map((image, i) => {
        if (i === gaussians.length - 1)
            return image;
        const low = up(gaussians[i + 1], image.width, image.height);
        return {
            width: image.width, height: image.height, channels: image.channels,
            data: Float32Array.from(image.data, (value, j) => Math.fround(value - low.data[j])),
        };
    });
}
function mixed(a, b, mask) {
    const data = new Float32Array(a.data.length);
    for (let i = 0; i < data.length; i++) {
        const alpha = Math.max(0, Math.min(1, mask.data[Math.floor(i / a.channels)]));
        data[i] = Math.fround(Math.fround(a.data[i] * Math.fround(1 - alpha)) + Math.fround(b.data[i] * alpha));
    }
    return { width: a.width, height: a.height, channels: a.channels, data };
}
/** Blend warped colours with source details, snapping excluded/full pixels exactly.
 * This is not a new face synthesis step; it changes compositing only.
 */
export function turnPyramidComposite(original, turned, support, requestedLevels = 4) {
    requireColour(original);
    requireColour(turned);
    requireMask(support, original.width, original.height);
    if (original.width !== turned.width || original.height !== turned.height || original.channels !== turned.channels) {
        throw new RangeError("turn pyramid needs matching input images");
    }
    if (Math.min(original.width, original.height) < 2)
        throw new RangeError("turn pyramid image too small");
    if (!Number.isInteger(requestedLevels) || requestedLevels < 1 || requestedLevels > MAX_LEVELS) {
        throw new RangeError("turn pyramid levels must be between 1 and 4");
    }
    if (support.data.every((value) => value === 0) || original.data.every((value, i) => value === turned.data[i])) {
        return { ...original, data: Uint8Array.from(original.data) };
    }
    if (support.data.every((value) => value === 1))
        return { ...turned, data: Uint8Array.from(turned.data) };
    const { width, height, channels } = original;
    const depth = Math.min(requestedLevels, Math.max(1, Math.floor(Math.log2(Math.min(height, width))) - 2));
    const src = levels({ width, height, channels, data: Float32Array.from(original.data) }, depth);
    const dst = levels({ width, height, channels, data: Float32Array.from(turned.data) }, depth);
    const masks = levels({ width, height, channels: 1, data: Float32Array.from(support.data) }, depth);
    const bandsA = laplacian(src), bandsB = laplacian(dst);
    let current = mixed(bandsA[depth - 1], bandsB[depth - 1], masks[depth - 1]);
    for (let i = depth - 2; i >= 0; i--) {
        const expanded = up(current, src[i].width, src[i].height);
        const detail = mixed(bandsA[i], bandsB[i], masks[i]);
        current = {
            width: src[i].width, height: src[i].height, channels,
            data: Float32Array.from(expanded.data, (v, j) => Math.fround(v + detail.data[j])),
        };
    }
    const out = byteImage(width, height, channels);
    for (let p = 0; p < width * height; p++) {
        const alpha = support.data[p];
        for (let c = 0; c < channels; c++) {
            const j = p * channels + c;
            out.data[j] = alpha === 0 ? original.data[j] : alpha === 1 ? turned.data[j]
                : Math.max(0, Math.min(255, roundHalfEven(current.data[j])));
        }
    }
    return out;
}
