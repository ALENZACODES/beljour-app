/**
 * E04 core buffers: float and byte images, sRGB <-> linear light, and resampling.
 *
 * Layout is row-major and interleaved: value (x, y, c) sits at (y * width + x) * channels + c.
 * Masks are float images with one channel and values in [0, 1].
 * Rounding to bytes is round-half-to-even, as NumPy's rint does, so these functions
 * match api/plumb_api/engines/core/{composite,resample}.py (parity, CONTRACTS.md §16).
 *
 * Author: John Khan.
 */
export const MAX_SIDE = 16384;
export function checkSize(width, height, channels = 1) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
        throw new RangeError("image size must be positive whole numbers");
    }
    if (width > MAX_SIDE || height > MAX_SIDE)
        throw new RangeError(`image sides must be at most ${MAX_SIDE}`);
    if (!Number.isInteger(channels) || channels < 1 || channels > 4)
        throw new RangeError("channels must be 1 to 4");
}
export function floatImage(width, height, channels = 1, precise = false) {
    checkSize(width, height, channels);
    const n = width * height * channels;
    return { width, height, channels, data: precise ? new Float64Array(n) : new Float32Array(n) };
}
export function byteImage(width, height, channels = 3) {
    checkSize(width, height, channels);
    return { width, height, channels, data: new Uint8Array(width * height * channels) };
}
export function sameSize(a, b) {
    return a.width === b.width && a.height === b.height;
}
export function requireSameSize(a, b, what = "images") {
    if (!sameSize(a, b))
        throw new RangeError(`${what} must be the same size`);
}
export function requireColour(img) {
    if (img.channels !== 3 && img.channels !== 4)
        throw new RangeError("expected an RGB or RGBA image");
    if (img.data.length !== img.width * img.height * img.channels)
        throw new RangeError("image data does not match its size");
}
/** A mask: one channel, finite, every value in [0, 1]. Returns it unchanged. */
export function requireMask(mask, width, height) {
    if (mask.channels !== 1)
        throw new RangeError("a mask has one channel");
    if (width !== undefined && height !== undefined && (mask.width !== width || mask.height !== height)) {
        throw new RangeError("mask must match the image size");
    }
    for (let i = 0; i < mask.data.length; i++) {
        const v = mask.data[i];
        if (!(v >= 0 && v <= 1))
            throw new RangeError("mask alpha must be finite and in [0, 1]");
    }
    return mask;
}
/** RGBA bytes from a canvas ImageData (or anything shaped like it). */
export function fromRGBA(source) {
    checkSize(source.width, source.height, 4);
    if (source.data.length !== source.width * source.height * 4)
        throw new RangeError("RGBA data does not match its size");
    return { width: source.width, height: source.height, channels: 4, data: new Uint8ClampedArray(source.data) };
}
/** RGBA bytes ready for `new ImageData(data, width, height)`; RGB gets opaque alpha. */
export function toRGBA(img) {
    requireColour(img);
    if (img.channels === 4)
        return new Uint8ClampedArray(img.data);
    const out = new Uint8ClampedArray(img.width * img.height * 4);
    for (let p = 0, q = 0; p < img.data.length; p += 3, q += 4) {
        out[q] = img.data[p];
        out[q + 1] = img.data[p + 1];
        out[q + 2] = img.data[p + 2];
        out[q + 3] = 255;
    }
    return out;
}
export function roundHalfEven(x) {
    const r = Math.round(x);
    return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
}
export function decodeChannel(v) {
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}
export function encodeChannel(v) {
    return v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
}
/** Linear-light value of each 8-bit sRGB code. */
export const SRGB_TO_LINEAR = (() => {
    const t = new Float64Array(256);
    for (let i = 0; i < 256; i++)
        t[i] = decodeChannel(i / 255);
    return t;
})();
export function toByte(unit) {
    return roundHalfEven(Math.min(1, Math.max(0, unit)) * 255);
}
export function encodeByte(linear) {
    return roundHalfEven(encodeChannel(Math.min(1, Math.max(0, linear))) * 255);
}
/** RGB of a byte image decoded to linear light (alpha dropped). */
export function decode(img, precise = true) {
    requireColour(img);
    const out = floatImage(img.width, img.height, 3, precise);
    for (let p = 0, q = 0; q < out.data.length; p += img.channels, q += 3) {
        out.data[q] = SRGB_TO_LINEAR[img.data[p]];
        out.data[q + 1] = SRGB_TO_LINEAR[img.data[p + 1]];
        out.data[q + 2] = SRGB_TO_LINEAR[img.data[p + 2]];
    }
    return out;
}
/** RGB of a byte image as encoded values in [0, 1] (alpha dropped). */
export function toUnit(img, precise = true) {
    requireColour(img);
    const out = floatImage(img.width, img.height, 3, precise);
    for (let p = 0, q = 0; q < out.data.length; p += img.channels, q += 3) {
        out.data[q] = img.data[p] / 255;
        out.data[q + 1] = img.data[p + 1] / 255;
        out.data[q + 2] = img.data[p + 2] / 255;
    }
    return out;
}
/** Linear-light RGB floats to sRGB bytes; out-of-range values are clipped first. */
export function encode(linear) {
    if (linear.channels !== 3)
        throw new RangeError("encode expects three linear channels");
    const out = byteImage(linear.width, linear.height, 3);
    for (let i = 0; i < linear.data.length; i++) {
        const v = linear.data[i];
        if (!Number.isFinite(v))
            throw new RangeError("linear pixels must be finite");
        out.data[i] = encodeByte(v);
    }
    return out;
}
/** Keep the base's alpha channel (if any) next to new RGB bytes. */
export function withAlphaOf(rgb, base, alpha) {
    if (base.channels !== 4)
        return rgb;
    const out = byteImage(rgb.width, rgb.height, 4);
    for (let i = 0, p = 0; i < rgb.width * rgb.height; i++, p += 3) {
        out.data[i * 4] = rgb.data[p];
        out.data[i * 4 + 1] = rgb.data[p + 1];
        out.data[i * 4 + 2] = rgb.data[p + 2];
        out.data[i * 4 + 3] = alpha ? alpha(i) : base.data[i * 4 + 3];
    }
    return out;
}
export function identityMaps(width, height) {
    const mapX = floatImage(width, height, 1, true);
    const mapY = floatImage(width, height, 1, true);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            mapX.data[y * width + x] = x;
            mapY.data[y * width + x] = y;
        }
    }
    return { mapX, mapY };
}
/**
 * Backward-mapped bilinear resampling: output (x, y) reads the source at (mapX, mapY).
 * Taps are mixed in linear light by default and premultiplied by alpha for RGBA.
 * "edge" clamps coordinates; "constant" counts outside taps as transparent black.
 */
export function remap(img, mapX, mapY, options = {}) {
    requireColour(img);
    const border = options.border ?? "edge";
    const linear = options.linearLight ?? true;
    if (mapX.channels !== 1 || mapY.channels !== 1)
        throw new RangeError("maps have one channel");
    requireSameSize(mapX, mapY, "mapX and mapY");
    const { width: w, height: h, channels } = img;
    const hasAlpha = channels === 4;
    const work = new Float64Array(w * h * 4);
    for (let i = 0; i < w * h; i++) {
        const a = hasAlpha ? img.data[i * 4 + 3] / 255 : 1;
        for (let c = 0; c < 3; c++) {
            const v = img.data[i * channels + c];
            work[i * 4 + c] = (linear ? SRGB_TO_LINEAR[v] : v / 255) * a;
        }
        work[i * 4 + 3] = a;
    }
    const out = byteImage(mapX.width, mapX.height, channels);
    const acc = new Float64Array(4);
    for (let i = 0; i < mapX.width * mapX.height; i++) {
        let mx = mapX.data[i], my = mapY.data[i];
        if (!Number.isFinite(mx) || !Number.isFinite(my))
            throw new RangeError("maps must be finite");
        if (border === "edge") {
            mx = Math.min(Math.max(mx, 0), w - 1);
            my = Math.min(Math.max(my, 0), h - 1);
        }
        const x0 = Math.floor(mx), y0 = Math.floor(my);
        const fx = mx - x0, fy = my - y0;
        acc.fill(0);
        for (let dy = 0; dy < 2; dy++) {
            const wy = dy === 0 ? 1 - fy : fy;
            for (let dx = 0; dx < 2; dx++) {
                const wx = dx === 0 ? 1 - fx : fx;
                let xi = x0 + dx, yi = y0 + dy;
                if (border === "edge") {
                    xi = Math.min(xi, w - 1);
                    yi = Math.min(yi, h - 1);
                }
                else if (xi < 0 || xi >= w || yi < 0 || yi >= h)
                    continue;
                const weight = wx * wy, base = (yi * w + xi) * 4;
                for (let c = 0; c < 4; c++)
                    acc[c] = acc[c] + work[base + c] * weight;
            }
        }
        const alpha = acc[3];
        for (let c = 0; c < 3; c++) {
            const colour = hasAlpha ? (alpha > 0 ? acc[c] / alpha : 0) : acc[c];
            out.data[i * channels + c] = linear ? encodeByte(colour) : toByte(colour);
        }
        if (hasAlpha)
            out.data[i * 4 + 3] = toByte(alpha);
    }
    return out;
}
// Resizing ------------------------------------------------------------------------------
/** Rows of a target x source matrix: each output sample averages the source span it covers. */
export function areaWeights(source, target) {
    const scale = source / target, rows = [];
    for (let i = 0; i < target; i++) {
        const start = i * scale, stop = (i + 1) * scale, row = [];
        for (let j = Math.floor(start); j < Math.min(source, Math.ceil(stop)); j++)
            row.push([j, (Math.min(stop, j + 1) - Math.max(start, j)) / scale]);
        rows.push(row);
    }
    return rows;
}
/** Shrink by exact area averaging in linear light, premultiplied for RGBA (matches resample.py). */
export function resizeArea(img, width, height) {
    requireColour(img);
    const { width: w, height: h, channels } = img;
    if (!(width >= 1 && width <= w && height >= 1 && height <= h))
        throw new RangeError("area resize only shrinks; the target must be 1..source size");
    const hasAlpha = channels === 4;
    const work = new Float64Array(w * h * 4);
    for (let i = 0; i < w * h; i++) {
        const a = hasAlpha ? img.data[i * 4 + 3] / 255 : 1;
        for (let c = 0; c < 3; c++)
            work[i * 4 + c] = SRGB_TO_LINEAR[img.data[i * channels + c]] * a;
        work[i * 4 + 3] = a;
    }
    const wy = areaWeights(h, height), wx = areaWeights(w, width);
    const rows = new Float64Array(height * w * 4);
    for (let i = 0; i < height; i++) {
        for (const [j, weight] of wy[i])
            for (let k = 0; k < w * 4; k++)
                rows[i * w * 4 + k] += weight * work[j * w * 4 + k];
    }
    const out = byteImage(width, height, channels);
    for (let i = 0; i < height; i++) {
        for (let l = 0; l < width; l++) {
            const acc = [0, 0, 0, 0];
            for (const [k, weight] of wx[l])
                for (let c = 0; c < 4; c++)
                    acc[c] += weight * rows[(i * w + k) * 4 + c];
            const p = (i * width + l) * channels;
            for (let c = 0; c < 3; c++)
                out.data[p + c] = encodeByte(hasAlpha ? (acc[3] > 0 ? acc[c] / acc[3] : 0) : acc[c]);
            if (hasAlpha)
                out.data[p + 3] = toByte(acc[3]);
        }
    }
    return out;
}
/** Pixel-centre aligned bilinear resize in linear light, edges clamped. */
export function resizeBilinear(img, width, height) {
    requireColour(img);
    if (!(width >= 1 && height >= 1))
        throw new RangeError("target size must be positive");
    const mapX = floatImage(width, height, 1, true), mapY = floatImage(width, height, 1, true);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            mapX.data[y * width + x] = (x + 0.5) * (img.width / width) - 0.5;
            mapY.data[y * width + x] = (y + 0.5) * (img.height / height) - 0.5;
        }
    }
    return remap(img, mapX, mapY, { border: "edge", linearLight: true });
}
/** Area averaging when both sides shrink or stay, bilinear otherwise. */
export function resize(img, width, height) {
    return width <= img.width && height <= img.height ? resizeArea(img, width, height) : resizeBilinear(img, width, height);
}
