/** A picked photo made ready for My photos: decoded by the browser (createImageBitmap, which
 * decodes off the page's main thread where the browser can, with the EXIF orientation applied),
 * drawn upright onto white at most LONG_SIDE px on its long side, and saved as a JPEG copy plus a
 * square thumbnail. Canvas output carries no file metadata. HEIC files this browser can't decode
 * get a plain message instead of an error code. Author: John Khan.
 */
/** ASSUMED: large enough for every local tool (they work at 640 to 2048 px), small enough that
 * 60 copies fit comfortably in browser storage. */
export const LONG_SIDE = 1600;
export const PHOTO_QUALITY = 0.9;
export const THUMB_SIDE = 160;
export const THUMB_QUALITY = 0.8;
/** ASSUMED: refuse files above this before decoding, so a huge file can't stall the page. */
export const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MAX_PIXELS = 80_000_000;
export const HEIC_MESSAGE = "This browser can't open HEIC photos. Pick it from your phone's photo library, which hands over a JPEG, or save it as a JPEG first.";
export const OPEN_MESSAGE = "This photo couldn't be opened on this device. Try a JPEG, PNG or WebP.";
export class PhotoOpenError extends Error {
}
const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs", "mif1", "msf1", "avci"]);
/** HEIC or HEIF, from the file's type, name or its "ftyp" box. */
export function looksLikeHeic(file, head) {
    if (/^image\/hei[cf]/i.test(file.type ?? "") || /\.(heic|heif)$/i.test(file.name ?? ""))
        return true;
    if (head.length < 12)
        return false;
    const text = String.fromCharCode(...head.subarray(4, 12));
    return text.startsWith("ftyp") && HEIC_BRANDS.has(text.slice(4).toLowerCase());
}
export function fitLongSide(width, height, max) {
    const scale = Math.min(1, max / Math.max(width, height));
    return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
/** The centred square that fills a thumbnail. */
export function squareCrop(width, height) {
    const side = Math.min(width, height);
    return { x: Math.round((width - side) / 2), y: Math.round((height - side) / 2), w: side, h: side };
}
export async function head(file, bytes = 16) {
    try {
        return new Uint8Array(await file.slice(0, bytes).arrayBuffer());
    }
    catch {
        return new Uint8Array(0);
    }
}
export async function preparePhoto(file, deps = browserPrepare()) {
    if (file.size > MAX_FILE_BYTES)
        throw new PhotoOpenError(`This photo is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB. Choose a smaller copy.`);
    const first = await head(file);
    let picture;
    try {
        picture = await deps.decode(file);
    }
    catch {
        throw new PhotoOpenError(looksLikeHeic(file, first) ? HEIC_MESSAGE : OPEN_MESSAGE);
    }
    try {
        if (picture.width < 8 || picture.height < 8)
            throw new PhotoOpenError("This photo is too small to use.");
        if (picture.width * picture.height > MAX_PIXELS)
            throw new PhotoOpenError("This photo has too many pixels to open here. Choose a smaller copy.");
        const size = fitLongSide(picture.width, picture.height, LONG_SIDE);
        const photo = await deps.encode(picture, { x: 0, y: 0, w: picture.width, h: picture.height }, size.width, size.height, PHOTO_QUALITY);
        const side = Math.min(THUMB_SIDE, size.width, size.height);
        const thumb = await deps.encode(picture, squareCrop(picture.width, picture.height), side, side, THUMB_QUALITY);
        return { photo, thumb, width: size.width, height: size.height };
    }
    finally {
        picture.close();
    }
}
/** The browser's decoder and encoder. createImageBitmap with imageOrientation "from-image" turns
 * the picture upright; where it is missing or refuses the file, an <img> decodes it (browsers
 * apply EXIF orientation to images by default). */
export function browserPrepare() {
    return {
        async decode(file) {
            const g = globalThis;
            if (g.createImageBitmap) {
                try {
                    const bitmap = await g.createImageBitmap(file, { imageOrientation: "from-image" });
                    return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
                }
                catch { /* try an <img> below */ }
            }
            const url = URL.createObjectURL(file);
            try {
                const img = new Image();
                img.decoding = "async";
                img.src = url;
                await img.decode();
                return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
            }
            catch (error) {
                URL.revokeObjectURL(url);
                throw error;
            }
        },
        async encode(src, crop, width, height, quality) {
            const g = globalThis;
            const draw = (ctx) => {
                ctx.fillStyle = "#ffffff";
                ctx.fillRect(0, 0, width, height);
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = "high";
                ctx.drawImage(src.source, crop.x, crop.y, crop.w, crop.h, 0, 0, width, height);
            };
            if (g.OffscreenCanvas) {
                const canvas = new g.OffscreenCanvas(width, height);
                const ctx = canvas.getContext("2d");
                if (ctx) {
                    draw(ctx);
                    return canvas.convertToBlob({ type: "image/jpeg", quality });
                }
            }
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            if (!ctx)
                throw new PhotoOpenError("This browser has no canvas to prepare the photo.");
            draw(ctx);
            return new Promise((resolve, reject) => canvas.toBlob((b) => b ? resolve(b) : reject(new PhotoOpenError(OPEN_MESSAGE)), "image/jpeg", quality));
        },
    };
}
//# sourceMappingURL=prepare.js.map