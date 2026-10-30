/** Final byte-level privacy boundary for pro and extracted reel frames.
 * JPEG APP1/APP3+ and COM are removed using the established Save System helper.
 * PNG text, EXIF, timestamps and any unknown ancillary extension are dropped.
 * Critical image chunks and safe colour rendering chunks are kept unchanged.
 */
import { stripJpegMetadata } from "../save/export.js";
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const ALLOWED_ANCILLARY = new Set(["tRNS", "gAMA", "sRGB", "cHRM", "iCCP"]);
const CRITICAL = new Set(["IHDR", "PLTE", "IDAT", "IEND"]);
export const MAX_ENCODED_BYTES = 64 * 1024 * 1024;
function isPng(input) {
    return input.length >= 8 && PNG_SIGNATURE.every((value, offset) => input[offset] === value);
}
/** Copy only known safe PNG chunks. Reuse original CRC for unmodified chunks. */
export function stripPngMetadata(input) {
    if (!isPng(input))
        throw new RangeError("Not a PNG image");
    if (input.byteLength > MAX_ENCODED_BYTES)
        throw new RangeError("Encoded image exceeds local limit");
    const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
    const fragments = [input.subarray(0, 8)];
    let offset = 8;
    let ended = false;
    let hasHeader = false;
    let hasPixels = false;
    while (offset + 12 <= input.length) {
        const length = view.getUint32(offset, false);
        if (length > input.length - offset - 12)
            throw new RangeError("Damaged PNG chunk size");
        const kind = String.fromCharCode(...input.subarray(offset + 4, offset + 8));
        if (!/^[A-Za-z]{4}$/.test(kind))
            throw new RangeError("Invalid PNG chunk tag");
        if (kind === "IHDR") {
            if (hasHeader || offset !== 8 || length !== 13)
                throw new RangeError("Invalid PNG header");
            hasHeader = true;
        }
        if (kind === "IDAT")
            hasPixels = true;
        if (kind === "IEND") {
            if (length !== 0 || !hasHeader || !hasPixels)
                throw new RangeError("Incomplete PNG image");
            ended = true;
        }
        if (CRITICAL.has(kind) || ALLOWED_ANCILLARY.has(kind)) {
            fragments.push(input.subarray(offset, offset + 12 + length));
        }
        else if (kind[0] === kind[0].toUpperCase()) {
            throw new RangeError("Unknown critical PNG chunk");
        }
        offset += length + 12;
        if (ended)
            break;
    }
    if (!ended || offset !== input.length)
        throw new RangeError("Truncated or trailing PNG data");
    const total = fragments.reduce((sum, fragment) => sum + fragment.byteLength, 0);
    const output = new Uint8Array(total);
    let position = 0;
    for (const fragment of fragments) {
        output.set(fragment, position);
        position += fragment.byteLength;
    }
    return output;
}
export function stripImageMetadata(input, mime) {
    if (!(input instanceof Uint8Array) || input.byteLength > MAX_ENCODED_BYTES || input.byteLength === 0) {
        throw new RangeError("Invalid or oversized encoded image");
    }
    if (mime === "image/jpeg")
        return stripJpegMetadata(input);
    if (mime === "image/png")
        return stripPngMetadata(input);
    throw new RangeError("Unsupported image format");
}
export async function scrubEncodedBlob(blob, mime) {
    if (blob.type !== mime || blob.size > MAX_ENCODED_BYTES || blob.size === 0) {
        throw new RangeError("Unexpected image codec or size");
    }
    const cleaned = stripImageMetadata(new Uint8Array(await blob.arrayBuffer()), mime);
    // Allocate an explicitly ArrayBuffer-backed copy for TS7/Blob typing.
    const owned = new Uint8Array(new ArrayBuffer(cleaned.length));
    owned.set(cleaned);
    return new Blob([owned.buffer], { type: mime });
}
//# sourceMappingURL=export-privacy.js.map