/** Validate the bytes exported from the local Save System, without retaining them.
 *
 * No EXIF, comments, textual PNG metadata, GPS or app-specific chunks may be
 * present in a checked export. The caller keeps the image; only integer counts
 * and a status leave this function. This is not an image-quality measurement.
 * Author: John Khan.
 */
import { crc32, jpegSegments } from "./export.js";
export const EXPORT_PROOF_FORMAT = "beljour-export-proof/1";
const MAX_BYTES = 64 * 1024 * 1024;
const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const PNG_METADATA = new Set(["eXIf", "iTXt", "tEXt", "zTXt", "tIME", "sPLT", "sTER", "oFFs"]);
const JPEG_METADATA = new Set([0xe1, 0xed, 0xfe]);
function result(status, reason, media, bytes, metadataChunks, reviewedChunks) {
    return { format: EXPORT_PROOF_FORMAT, status, reason, media, bytes, metadataChunks, reviewedChunks };
}
function equalPrefix(bytes, prefix) {
    if (bytes.length < prefix.length)
        return false;
    for (let index = 0; index < prefix.length; index++) {
        if (bytes[index] !== prefix[index])
            return false;
    }
    return true;
}
function read32(bytes, index) {
    return ((bytes[index] * 0x1000000) +
        (bytes[index + 1] << 16) + (bytes[index + 2] << 8) + bytes[index + 3]) >>> 0;
}
function pngProof(bytes) {
    let index = PNG_SIGNATURE.length;
    let reviewed = 0;
    let metadata = 0;
    let sawIHDR = false;
    let sawIDAT = false;
    let sawIEND = false;
    let afterIDAT = false;
    while (index < bytes.length) {
        if (index + 12 > bytes.length)
            return result("FAIL", "invalid_structure", "png", bytes.length, metadata, reviewed);
        const length = read32(bytes, index);
        const typeStart = index + 4;
        const bodyStart = index + 8;
        const bodyEnd = bodyStart + length;
        if (!Number.isSafeInteger(bodyEnd) || bodyEnd + 4 > bytes.length) {
            return result("FAIL", "invalid_structure", "png", bytes.length, metadata, reviewed);
        }
        const name = String.fromCharCode(...bytes.subarray(typeStart, typeStart + 4));
        if (!/^[A-Za-z]{4}$/.test(name))
            return result("FAIL", "invalid_structure", "png", bytes.length, metadata, reviewed);
        const expectedCrc = read32(bytes, bodyEnd);
        const actualCrc = crc32(bytes.subarray(typeStart, bodyEnd));
        if (expectedCrc !== actualCrc)
            return result("FAIL", "invalid_structure", "png", bytes.length, metadata, reviewed);
        reviewed++;
        if (PNG_METADATA.has(name))
            metadata++;
        if (name === "IHDR") {
            if (sawIHDR || reviewed !== 1 || length !== 13 || read32(bytes, bodyStart) === 0 || read32(bytes, bodyStart + 4) === 0) {
                return result("FAIL", "invalid_structure", "png", bytes.length, metadata, reviewed);
            }
            sawIHDR = true;
            const compression = bytes[bodyStart + 10];
            const filter = bytes[bodyStart + 11];
            const interlace = bytes[bodyStart + 12];
            if (compression !== 0 || filter !== 0 || interlace > 1) {
                return result("FAIL", "invalid_structure", "png", bytes.length, metadata, reviewed);
            }
        }
        else if (!sawIHDR) {
            return result("FAIL", "invalid_structure", "png", bytes.length, metadata, reviewed);
        }
        else if (name === "IDAT") {
            if (sawIEND || afterIDAT)
                return result("FAIL", "invalid_structure", "png", bytes.length, metadata, reviewed);
            sawIDAT = true;
        }
        else if (name === "IEND") {
            if (sawIEND || !sawIDAT || length !== 0 || bodyEnd + 4 !== bytes.length) {
                return result("FAIL", "invalid_structure", "png", bytes.length, metadata, reviewed);
            }
            sawIEND = true;
        }
        else if (sawIDAT) {
            afterIDAT = true;
        }
        // Critical unrecognized PNG extensions are unsafe to silently ignore.
        if (name !== "IHDR" && name !== "IDAT" && name !== "IEND" &&
            name.charCodeAt(0) >= 65 && name.charCodeAt(0) <= 90) {
            return result("FAIL", "unsupported_profile", "png", bytes.length, metadata, reviewed);
        }
        index = bodyEnd + 4;
    }
    if (!sawIHDR || !sawIDAT || !sawIEND) {
        return result("FAIL", "invalid_structure", "png", bytes.length, metadata, reviewed);
    }
    if (metadata > 0)
        return result("FAIL", "metadata_present", "png", bytes.length, metadata, reviewed);
    return result("PASS", "ok", "png", bytes.length, 0, reviewed);
}
function jpegProof(bytes) {
    let segments;
    try {
        segments = jpegSegments(bytes);
    }
    catch {
        return result("FAIL", "invalid_structure", "jpeg", bytes.length, 0, 0);
    }
    if (segments.length === 0 || segments[segments.length - 1].marker !== 0xda ||
        bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) {
        return result("FAIL", "invalid_structure", "jpeg", bytes.length, 0, segments.length);
    }
    let metadata = 0;
    for (const segment of segments) {
        if (JPEG_METADATA.has(segment.marker) || (segment.marker >= 0xe3 && segment.marker <= 0xef)) {
            metadata++;
        }
    }
    if (metadata > 0)
        return result("FAIL", "metadata_present", "jpeg", bytes.length, metadata, segments.length);
    return result("PASS", "ok", "jpeg", bytes.length, 0, segments.length);
}
/** Accepts encoded images, not a file name, URL, canvas or photo identifier. */
export function inspectExport(raw) {
    if (!(raw instanceof Uint8Array))
        return result("FAIL", "invalid_format", "unknown", 0, 0, 0);
    if (raw.length === 0)
        return result("FAIL", "empty", "unknown", 0, 0, 0);
    if (raw.length > MAX_BYTES)
        return result("FAIL", "too_large", "unknown", raw.length, 0, 0);
    if (equalPrefix(raw, PNG_SIGNATURE))
        return pngProof(raw);
    if (raw.length >= 2 && raw[0] === 0xff && raw[1] === 0xd8)
        return jpegProof(raw);
    return result("FAIL", "invalid_format", "unknown", raw.length, 0, 0);
}
/** A declared export count can PASS only when every inspected export passes. */
export function summarizeExports(outputs, expected) {
    if (!Number.isSafeInteger(expected) || expected < 1 || expected > 1000 || outputs.length > expected) {
        throw new RangeError("export batch must have 1 to 1000 declared results");
    }
    let passed = 0;
    let failed = 0;
    for (const output of outputs) {
        if (inspectExport(output).status === "PASS")
            passed++;
        else
            failed++;
    }
    const missing = expected - outputs.length;
    return {
        status: failed ? "FAIL" : missing ? "UNPROVEN" : "PASS",
        passed,
        failed,
        missing,
        expected,
    };
}
//# sourceMappingURL=proof-export.js.map