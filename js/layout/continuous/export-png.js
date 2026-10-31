/** Strict local PNG verification before a simulated image download. */
/** Author: John Khan. */
const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const MAX_PNG_BYTES = 48 * 1024 * 1024;
const MAX_PNG_PIXELS = 12_000_000;
const MAX_CHUNKS = 4096;
const CRC_POLYNOMIAL = 0xedb88320;
const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
        const mask = -(value & 1);
        value = (value >>> 1) ^ (CRC_POLYNOMIAL & mask);
    }
    return value >>> 0;
});
function be32(bytes, index) {
    return (bytes[index] * 0x1000000
        + bytes[index + 1] * 0x10000
        + bytes[index + 2] * 0x100
        + bytes[index + 3]) >>> 0;
}
function crcRange(bytes, first, end) {
    let crc = 0xffffffff;
    for (let offset = first; offset < end; offset += 1) {
        crc = CRC_TABLE[(crc ^ bytes[offset]) & 255] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}
export function verifyPngBytes(data, expectedWidth, expectedHeight) {
    if (!(data instanceof Uint8Array) || data.byteLength < 57 || data.byteLength > MAX_PNG_BYTES) {
        throw new Error("PNG output size was refused");
    }
    if (!Number.isSafeInteger(expectedWidth) || !Number.isSafeInteger(expectedHeight)
        || expectedWidth < 1 || expectedHeight < 1
        || expectedWidth * expectedHeight > MAX_PNG_PIXELS) {
        throw new RangeError("Invalid expected image dimensions");
    }
    for (let index = 0; index < SIGNATURE.length; index += 1) {
        if (data[index] !== SIGNATURE[index])
            throw new Error("PNG signature does not match");
    }
    let offset = SIGNATURE.length;
    let chunks = 0;
    let seenHeader = false;
    let seenData = false;
    let endedData = false;
    let seenEnd = false;
    let width = 0;
    let height = 0;
    while (offset < data.byteLength) {
        chunks += 1;
        if (chunks > MAX_CHUNKS || offset + 12 > data.byteLength) {
            throw new Error("PNG chunk table was truncated or excessive");
        }
        const length = be32(data, offset);
        const typeOffset = offset + 4;
        const contentOffset = typeOffset + 4;
        const checksumAt = contentOffset + length;
        if (length > MAX_PNG_BYTES || checksumAt + 4 > data.byteLength) {
            throw new Error("PNG chunk length is invalid");
        }
        const type = String.fromCharCode(...data.subarray(typeOffset, typeOffset + 4));
        if (!/^[A-Za-z]{4}$/.test(type))
            throw new Error("Invalid PNG chunk type");
        const expectedCrc = be32(data, checksumAt);
        const actualCrc = crcRange(data, typeOffset, checksumAt);
        if (expectedCrc !== actualCrc)
            throw new Error("PNG chunk integrity check failed");
        if (!seenHeader && type !== "IHDR")
            throw new Error("PNG header is not first");
        if (["eXIf", "iTXt", "tEXt", "zTXt", "iCCP"].includes(type)) {
            throw new Error("PNG contains unnecessary embedded metadata");
        }
        if (type === "IHDR") {
            if (seenHeader || length !== 13)
                throw new Error("PNG has an invalid image header");
            seenHeader = true;
            width = be32(data, contentOffset);
            height = be32(data, contentOffset + 4);
            if (width !== expectedWidth || height !== expectedHeight) {
                throw new Error("Encoded PNG dimensions do not match the selected drawing");
            }
            const depth = data[contentOffset + 8];
            const color = data[contentOffset + 9];
            if (![2, 6].includes(color) || depth !== 8
                || data[contentOffset + 10] !== 0
                || data[contentOffset + 11] !== 0
                || data[contentOffset + 12] !== 0) {
                throw new Error("Unexpected PNG colour or scan mode");
            }
        }
        else if (type === "IDAT") {
            if (endedData || length < 1)
                throw new Error("PNG pixel chunks are malformed");
            seenData = true;
        }
        else if (type === "IEND") {
            if (!seenData || length !== 0 || checksumAt + 4 !== data.byteLength) {
                throw new Error("PNG end marker or pixel data is incomplete");
            }
            seenEnd = true;
        }
        else {
            if (seenData)
                endedData = true;
            // Reject unknown critical chunks. Ancillary hints are allowed only if
            // they contain no textual or EXIF metadata (checked above).
            if (type[0] === type[0].toUpperCase() && type !== "PLTE") {
                throw new Error("PNG includes an unsupported critical chunk");
            }
        }
        offset = checksumAt + 4;
        if (seenEnd)
            break;
    }
    if (!seenHeader || !seenData || !seenEnd || offset !== data.byteLength) {
        throw new Error("PNG output is incomplete");
    }
    return Object.freeze({
        width, height, size: data.byteLength,
        hasPixels: true,
        hasTextMetadata: false,
    });
}
/** Read only bounded on-device bytes and never serialize them into diagnostics. */
export async function inspectExportedPng(blob, expectedWidth, expectedHeight) {
    if (!(blob instanceof Blob) || blob.type !== "image/png") {
        throw new TypeError("Only a browser-encoded PNG is accepted");
    }
    if (blob.size < 57 || blob.size > MAX_PNG_BYTES) {
        throw new Error("PNG output is empty or above the memory limit");
    }
    const data = new Uint8Array(await blob.arrayBuffer());
    if (data.byteLength !== blob.size)
        throw new Error("PNG bytes changed during validation");
    return verifyPngBytes(data, expectedWidth, expectedHeight);
}
