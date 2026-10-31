/** Local image import (free-library plan §6 P0 step 3): the browser counterpart of Glide's
 * decode/orient/bound role, written for this app with no new dependency.
 *
 * - The file type comes from its magic bytes, never from its name or MIME claim: JPEG, PNG
 *   and WEBP only. Anything else is refused with a typed code.
 * - Width and height are read from the header before any pixel decode, so a decompression
 *   bomb is refused while it is still a few bytes.
 * - JPEG EXIF orientation is parsed here (APP1, TIFF IFD0 tag 0x0112) and applied exactly
 *   once, to the decoded pixels. The decoded photo carries no metadata onward.
 * - Transparent PNG/WEBP keep their alpha unless the caller asks to flatten it on a
 *   chosen background; flattening is explicit, never silent.
 *
 * The actual pixel decoder is injected (`createImageBitmap` + canvas in the browser, a
 * stub in node tests), so every rule here is a pure, testable function.
 * Nothing is uploaded: decode runs on the device.
 * Author: John Khan.
 */
export class DecodeError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = "DecodeError";
    }
}
/** 25 MB, 24 megapixels and 8192 px: a 12 MP phone photo fits with room; a bomb does not. */
export const DEFAULT_LIMITS = Object.freeze({
    maxBytes: 25 * 1024 * 1024, maxPixels: 24_000_000, maxSide: 8192, minSide: 16,
});
function u16be(b, i) { return (b[i] << 8) | b[i + 1]; }
function u32be(b, i) { return ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3]; }
function u16le(b, i) { return b[i] | (b[i + 1] << 8); }
function u24le(b, i) { return b[i] | (b[i + 1] << 8) | (b[i + 2] << 16); }
function u32le(b, i) { return (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16)) + b[i + 3] * 0x1000000; }
function ascii(b, i, n) {
    let s = "";
    for (let k = 0; k < n && i + k < b.length; k++)
        s += String.fromCharCode(b[i + k]);
    return s;
}
/** The format from magic bytes alone, or null. */
export function sniff(bytes) {
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
        return "jpeg";
    if (bytes.length >= 8 && bytes[0] === 0x89 && ascii(bytes, 1, 3) === "PNG" && bytes[4] === 0x0d && bytes[5] === 0x0a
        && bytes[6] === 0x1a && bytes[7] === 0x0a)
        return "png";
    if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP")
        return "webp";
    return null;
}
function corrupt(what) {
    throw new DecodeError("corrupt", `This photo file is damaged (${what}). Try exporting it again.`);
}
/** EXIF orientation from a TIFF block (the APP1 payload after "Exif\0\0"). 1 when absent. */
export function tiffOrientation(tiff) {
    if (tiff.length < 8)
        return 1;
    const order = ascii(tiff, 0, 2);
    const le = order === "II";
    if (!le && order !== "MM")
        return 1;
    const r16 = (i) => le ? u16le(tiff, i) : u16be(tiff, i);
    const r32 = (i) => le ? u32le(tiff, i) : u32be(tiff, i);
    if (r16(2) !== 42)
        return 1;
    const ifd = r32(4);
    if (ifd + 2 > tiff.length)
        return 1;
    const count = r16(ifd);
    for (let k = 0; k < count; k++) {
        const entry = ifd + 2 + k * 12;
        if (entry + 12 > tiff.length)
            return 1;
        if (r16(entry) === 0x0112) {
            const type = r16(entry + 2);
            const value = type === 3 ? r16(entry + 8) : type === 4 ? r32(entry + 8) : 1;
            return value >= 1 && value <= 8 ? value : 1;
        }
    }
    return 1;
}
function scanJpeg(b) {
    let i = 2, orientation = 1;
    while (i + 4 <= b.length) {
        if (b[i] !== 0xff)
            corrupt("marker expected");
        let marker = b[i + 1];
        while (marker === 0xff && i + 2 < b.length) {
            i++;
            marker = b[i + 1];
        }
        if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
            i += 2;
            continue;
        }
        if (marker === 0xd9 || marker === 0xda)
            break;
        if (i + 4 > b.length)
            corrupt("truncated marker");
        const len = u16be(b, i + 2);
        if (len < 2 || i + 2 + len > b.length)
            corrupt("segment runs past the end");
        const body = i + 4;
        if (marker === 0xe1 && len >= 8 && ascii(b, body, 6) === "Exif\u0000\u0000") {
            orientation = tiffOrientation(b.subarray(body + 6, i + 2 + len));
        }
        const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
        if (isSof) {
            if (len < 8)
                corrupt("short frame header");
            const height = u16be(b, body + 1), width = u16be(b, body + 3);
            return { width, height, orientation };
        }
        i += 2 + len;
    }
    return corrupt("no frame header");
}
function scanPng(b) {
    if (b.length < 33 || ascii(b, 12, 4) !== "IHDR")
        corrupt("missing IHDR");
    const width = u32be(b, 16), height = u32be(b, 20);
    const colourType = b[25];
    if (![0, 2, 3, 4, 6].includes(colourType))
        corrupt("unknown colour type");
    // Palette images may carry a tRNS chunk; look for one before the first IDAT.
    let alpha = colourType === 4 || colourType === 6;
    let i = 33;
    while (!alpha && i + 8 <= b.length) {
        const len = u32be(b, i), type = ascii(b, i + 4, 4);
        if (type === "tRNS")
            alpha = true;
        if (type === "IDAT" || type === "IEND")
            break;
        i += 12 + len;
    }
    return { width, height, alpha };
}
function scanWebp(b) {
    const chunk = ascii(b, 12, 4);
    if (chunk === "VP8 ") {
        if (b.length < 30)
            corrupt("short VP8 header");
        if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a)
            corrupt("bad VP8 start code");
        return { width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff, alpha: false };
    }
    if (chunk === "VP8L") {
        if (b.length < 25 || b[20] !== 0x2f)
            corrupt("bad VP8L signature");
        const bits = u32le(b, 21);
        return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1, alpha: ((bits >>> 28) & 1) === 1 };
    }
    if (chunk === "VP8X") {
        if (b.length < 30)
            corrupt("short VP8X header");
        return { width: u24le(b, 24) + 1, height: u24le(b, 27) + 1, alpha: (b[20] & 0x10) !== 0 };
    }
    return corrupt("unknown WEBP chunk");
}
function limitsOf(partial) {
    const out = { ...DEFAULT_LIMITS, ...(partial ?? {}) };
    for (const [key, value] of Object.entries(out)) {
        if (!Number.isFinite(value) || value <= 0)
            throw new RangeError(`decode limit ${key} must be positive`);
    }
    return out;
}
/** Read and check the header only. Throws a DecodeError with a typed code. */
export function readHeader(bytes, partial) {
    const limits = limitsOf(partial);
    if (!(bytes instanceof Uint8Array) || bytes.length === 0)
        throw new DecodeError("empty", "The file is empty.");
    if (bytes.length > limits.maxBytes) {
        throw new DecodeError("too_large_bytes", `This file is larger than ${Math.round(limits.maxBytes / 1048576)} MB.`);
    }
    const format = sniff(bytes);
    if (!format)
        throw new DecodeError("unsupported_format", "Only JPEG, PNG and WEBP photos can be opened.");
    let width, height, orientation = 1, hasAlpha = false;
    if (format === "jpeg")
        ({ width, height, orientation } = scanJpeg(bytes));
    else if (format === "png")
        ({ width, height, alpha: hasAlpha } = scanPng(bytes));
    else
        ({ width, height, alpha: hasAlpha } = scanWebp(bytes));
    if (!(width > 0 && height > 0))
        corrupt("zero size");
    if (Math.min(width, height) < limits.minSide)
        throw new DecodeError("too_small", `The photo is smaller than ${limits.minSide} pixels on a side.`);
    if (Math.max(width, height) > limits.maxSide)
        throw new DecodeError("too_large_side", `The photo is wider or taller than ${limits.maxSide} pixels.`);
    if (width * height > limits.maxPixels) {
        throw new DecodeError("too_large_pixels", `The photo has more than ${Math.round(limits.maxPixels / 1e6)} megapixels.`);
    }
    return { format, width, height, orientation, hasAlpha };
}
/** Output size after EXIF orientation: 5..8 swap the sides. */
export function orientedSize(width, height, orientation) {
    return orientation >= 5 && orientation <= 8 ? { width: height, height: width } : { width, height };
}
/** Apply EXIF orientation 1..8 to stored-order RGBA pixels. Pure; the input is untouched. */
export function applyOrientation(src, orientation) {
    if (!Number.isInteger(orientation) || orientation < 1 || orientation > 8)
        throw new RangeError("orientation must be 1..8");
    const { width: w, height: h } = src;
    if (src.data.length !== w * h * 4)
        throw new DecodeError("dimension_mismatch", "Decoded pixels do not match the photo size.");
    const size = orientedSize(w, h, orientation);
    const out = new Uint8ClampedArray(size.width * size.height * 4);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            let dx, dy;
            switch (orientation) {
                case 2:
                    dx = w - 1 - x;
                    dy = y;
                    break;
                case 3:
                    dx = w - 1 - x;
                    dy = h - 1 - y;
                    break;
                case 4:
                    dx = x;
                    dy = h - 1 - y;
                    break;
                case 5:
                    dx = y;
                    dy = x;
                    break;
                case 6:
                    dx = h - 1 - y;
                    dy = x;
                    break;
                case 7:
                    dx = h - 1 - y;
                    dy = w - 1 - x;
                    break;
                case 8:
                    dx = y;
                    dy = w - 1 - x;
                    break;
                default:
                    dx = x;
                    dy = y;
            }
            const s = (y * w + x) * 4, d = (dy * size.width + dx) * 4;
            out[d] = src.data[s];
            out[d + 1] = src.data[s + 1];
            out[d + 2] = src.data[s + 2];
            out[d + 3] = src.data[s + 3];
        }
    }
    return { width: size.width, height: size.height, data: out };
}
/** Composite straight-alpha RGBA onto an opaque colour; alpha becomes 255. */
export function flatten(src, background) {
    if (background.length !== 3 || background.some((v) => !Number.isFinite(v) || v < 0 || v > 255)) {
        throw new RangeError("background must be three values 0..255");
    }
    const out = new Uint8ClampedArray(src.data.length);
    for (let i = 0; i < src.data.length; i += 4) {
        const a = src.data[i + 3] / 255;
        for (let c = 0; c < 3; c++)
            out[i + c] = Math.round(src.data[i + c] * a + background[c] * (1 - a));
        out[i + 3] = 255;
    }
    return out;
}
/** Full local decode: header checks, injected pixel decode, one orientation pass, optional flatten. */
export async function decodePhoto(bytes, decoder, options = {}) {
    const header = readHeader(bytes, options.limits);
    if (options.signal?.aborted)
        throw new DecodeError("aborted", "The photo import was cancelled.");
    let pixels;
    try {
        pixels = await decoder(bytes, header, options.signal);
    }
    catch (error) {
        if (error instanceof DecodeError)
            throw error;
        if (options.signal?.aborted)
            throw new DecodeError("aborted", "The photo import was cancelled.");
        throw new DecodeError("decoder_failed", "This photo could not be decoded on this device.");
    }
    if (options.signal?.aborted)
        throw new DecodeError("aborted", "The photo import was cancelled.");
    if (pixels.width !== header.width || pixels.height !== header.height || pixels.data.length !== header.width * header.height * 4) {
        throw new DecodeError("dimension_mismatch", "Decoded pixels do not match the photo header.");
    }
    const upright = applyOrientation(pixels, header.orientation);
    let hadAlpha = false;
    for (let i = 3; i < upright.data.length; i += 4)
        if (upright.data[i] !== 255) {
            hadAlpha = true;
            break;
        }
    const flattened = options.flattenOn !== undefined && hadAlpha;
    const data = flattened ? flatten(upright, options.flattenOn) : new Uint8ClampedArray(upright.data);
    return { format: header.format, width: upright.width, height: upright.height, data,
        orientationApplied: header.orientation, hadAlpha, flattened, metadata: {} };
}
/** The browser decoder: createImageBitmap with orientation left to us ("none"), read via canvas. */
export function browserDecoder() {
    return async (bytes, header) => {
        const g = globalThis;
        if (!g.createImageBitmap || !g.OffscreenCanvas)
            throw new DecodeError("decoder_failed", "This browser cannot decode photos locally.");
        const blob = new Blob([bytes], { type: `image/${header.format}` });
        const bitmap = await g.createImageBitmap(blob, { imageOrientation: "none", premultiplyAlpha: "none", colorSpaceConversion: "default" });
        try {
            const canvas = new g.OffscreenCanvas(bitmap.width, bitmap.height);
            const ctx = canvas.getContext("2d");
            if (!ctx)
                throw new DecodeError("decoder_failed", "No 2D canvas is available.");
            ctx.drawImage(bitmap, 0, 0);
            const img = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
            return { width: img.width, height: img.height, data: img.data };
        }
        finally {
            bitmap.close();
        }
    };
}
