import { MAX_POSTURE_SOURCE_PIXELS } from "./posture-safe.js";
/** ASSUMED: 25 MiB covers a full-resolution phone JPEG or PNG without unbounded reads. */
export const MAX_POSTURE_FILE_BYTES = 25 * 1024 * 1024;
export const POSTURE_FILE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export class PostureFileRefused extends RangeError {
    code;
    constructor(code) {
        super(code);
        this.code = code;
        this.name = "PostureFileRefused";
    }
}
export async function sha256Hex(bytes) {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle)
        throw new RangeError("This browser cannot hash files locally.");
    const owned = new Uint8Array(bytes.byteLength);
    owned.set(bytes);
    const digest = new Uint8Array(await subtle.digest("SHA-256", owned.buffer));
    return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
/** Browser decoder: createImageBitmap plus a canvas readback, entirely local. */
export const browserImageDecoder = async (bytes, type) => {
    const owned = new Uint8Array(bytes.byteLength);
    owned.set(bytes);
    const bitmap = await createImageBitmap(new Blob([owned.buffer], { type }));
    try {
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const context = canvas.getContext("2d");
        if (!context)
            throw new RangeError("no 2d canvas");
        context.drawImage(bitmap, 0, 0);
        const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height);
        return { width: pixels.width, height: pixels.height, data: pixels.data };
    }
    finally {
        bitmap.close();
    }
};
function checkCancelled(signal) {
    if (signal?.aborted)
        throw new PostureFileRefused("import_cancelled");
}
/** Read, bound, hash and decode one user-chosen image file into owned RGBA pixels. */
export async function importPostureFile(file, { decoder = browserImageDecoder, signal } = {}) {
    const type = file.type;
    if (!POSTURE_FILE_TYPES.includes(type))
        throw new PostureFileRefused("unsupported_file_type");
    if (file.size > MAX_POSTURE_FILE_BYTES)
        throw new PostureFileRefused("file_too_large");
    if (file.size === 0)
        throw new PostureFileRefused("empty_file");
    checkCancelled(signal);
    const bytes = new Uint8Array(await file.arrayBuffer());
    checkCancelled(signal);
    if (bytes.byteLength !== file.size || bytes.byteLength > MAX_POSTURE_FILE_BYTES) {
        throw new PostureFileRefused("file_too_large");
    }
    const digest = await sha256Hex(bytes);
    checkCancelled(signal);
    let decoded;
    try {
        decoded = await decoder(bytes, type, signal);
    }
    catch {
        checkCancelled(signal);
        throw new PostureFileRefused("decode_failed");
    }
    finally {
        bytes.fill(0);
    }
    checkCancelled(signal);
    const { width, height, data } = decoded;
    if (!(Number.isInteger(width) && Number.isInteger(height)) || data.length !== width * height * 4) {
        throw new PostureFileRefused("decode_failed");
    }
    if (width < 8 || height < 8)
        throw new PostureFileRefused("image_too_small");
    if (width > 16384 || height > 16384 || width * height > MAX_POSTURE_SOURCE_PIXELS) {
        throw new PostureFileRefused("image_too_large");
    }
    const owned = new Uint8Array(data.length);
    owned.set(data);
    return { digest, type, bytes: file.size, image: { width, height, channels: 4, data: owned } };
}
