/** Cheap image-header preflight before handing untrusted local files to the decoder. */
import { validateJudgeDimensions, validateJudgeUpload } from "../../layout/judge-contract.js";
const MAX_HEADER_BYTES = 64 * 1024;
function readU32BE(bytes, at) {
    return (bytes[at] * 0x1000000) + (bytes[at + 1] << 16)
        + (bytes[at + 2] << 8) + bytes[at + 3];
}
function readU16BE(bytes, at) {
    return bytes[at] * 256 + bytes[at + 1];
}
function ascii(bytes, at, expected) {
    if (at < 0 || at + expected.length > bytes.length)
        return false;
    return [...expected].every((character, offset) => bytes[at + offset] === character.charCodeAt(0));
}
function pngDimensions(bytes) {
    const magic = [137, 80, 78, 71, 13, 10, 26, 10];
    if (bytes.length < 24 || magic.some((value, index) => bytes[index] !== value))
        return null;
    if (!ascii(bytes, 12, "IHDR") || readU32BE(bytes, 8) !== 13)
        return null;
    return { width: readU32BE(bytes, 16), height: readU32BE(bytes, 20) };
}
function webpDimensions(bytes) {
    if (!ascii(bytes, 0, "RIFF") || !ascii(bytes, 8, "WEBP"))
        return null;
    if (ascii(bytes, 12, "VP8X") && bytes.length >= 30) {
        const width = 1 + bytes[24] + bytes[25] * 256 + bytes[26] * 65_536;
        const height = 1 + bytes[27] + bytes[28] * 256 + bytes[29] * 65_536;
        return { width, height };
    }
    if (ascii(bytes, 12, "VP8L") && bytes.length >= 25 && bytes[20] === 0x2F) {
        const width = 1 + bytes[21] + ((bytes[22] & 0x3F) << 8);
        const height = 1 + ((bytes[22] & 0xC0) >> 6) + (bytes[23] << 2)
            + ((bytes[24] & 0xF) << 10);
        return { width, height };
    }
    return null;
}
/** JPEG metadata sections may precede a frame marker: absence is not a fabricated size. */
function jpegDimensions(bytes) {
    if (bytes.length < 4 || bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255)
        return null;
    let offset = 2;
    while (offset + 4 <= bytes.length) {
        if (bytes[offset] !== 255)
            return null;
        while (offset < bytes.length && bytes[offset] === 255)
            offset += 1;
        if (offset >= bytes.length)
            return null;
        const marker = bytes[offset];
        offset += 1;
        if (marker === 0xD9 || marker === 0xDA)
            return null;
        if (marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7))
            continue;
        if (offset + 2 > bytes.length)
            return null;
        const length = readU16BE(bytes, offset);
        if (length < 2 || offset + length > bytes.length)
            return null;
        if ((marker >= 0xC0 && marker <= 0xC3)
            || (marker >= 0xC5 && marker <= 0xC7)
            || (marker >= 0xC9 && marker <= 0xCB)
            || (marker >= 0xCD && marker <= 0xCF)) {
            if (length < 7)
                return null;
            return {
                width: readU16BE(bytes, offset + 5),
                height: readU16BE(bytes, offset + 3),
            };
        }
        offset += length;
    }
    return null;
}
export function inspectJudgeHeader(bytes, mime) {
    let format;
    let dimensions;
    if (mime === "image/png") {
        format = "png";
        dimensions = pngDimensions(bytes);
        if (!dimensions)
            throw new Error("The PNG header is missing or invalid.");
    }
    else if (mime === "image/jpeg") {
        format = "jpeg";
        if (bytes.length < 3 || bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255) {
            throw new Error("The JPEG header does not match the file type.");
        }
        dimensions = jpegDimensions(bytes);
    }
    else if (mime === "image/webp") {
        format = "webp";
        if (!ascii(bytes, 0, "RIFF") || !ascii(bytes, 8, "WEBP")) {
            throw new Error("The WebP header does not match the file type.");
        }
        dimensions = webpDimensions(bytes);
    }
    else {
        throw new Error("Choose a JPEG, PNG or WebP image.");
    }
    if (dimensions) {
        const error = validateJudgeDimensions(dimensions.width, dimensions.height);
        if (error)
            throw new Error(error);
    }
    return {
        format,
        checkedBytes: bytes.byteLength,
        width: dimensions?.width ?? null,
        height: dimensions?.height ?? null,
        dimensionSource: dimensions ? "header" : "decoder",
    };
}
/** Does not upload, log, store or decode pixels. The decoder performs final validation. */
export async function preflightJudgeFile(file) {
    const error = validateJudgeUpload(file);
    if (error)
        throw new Error(error);
    const header = new Uint8Array(await file.slice(0, MAX_HEADER_BYTES).arrayBuffer());
    if (header.length < 12)
        throw new Error("The selected image appears incomplete.");
    return inspectJudgeHeader(header, file.type);
}
