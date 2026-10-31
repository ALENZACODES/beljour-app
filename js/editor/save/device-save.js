/** Save an edited photo the way the phone saves photos, on this device only.
 * - iPhone and iPad: the share sheet with the JPEG file, so "Save Image" puts it in Photos.
 * - Android: the share sheet with the file, so it can go to Photos or Gallery.
 * - Anywhere the share sheet cannot take a file (most desktops): a normal download.
 * The file is a high-quality JPEG (browsers cannot write HEIC) named like a camera photo, and it
 * carries her original's own EXIF (exif-copy.ts) when her original had one. Nothing is uploaded:
 * the share sheet hands the file to the phone's own apps. Author: John Khan.
 */
import { copyExif } from "./exif-copy.js";
/** JPEG quality for saves; phone cameras write about this. ASSUMED. */
export const JPEG_QUALITY = 0.92;
/** iPhone, iPad (including iPadOS, which reports a Mac), Android, or something else. */
export function detectPlatform(d) {
    const ua = d.userAgent || "";
    if (/android/i.test(ua))
        return "android";
    if (/iphone|ipad|ipod/i.test(ua))
        return "ios";
    if ((d.platform === "MacIntel" || /Macintosh/.test(ua)) && (d.maxTouchPoints ?? 0) > 1)
        return "ios";
    return "other";
}
const pad = (n, w = 2) => String(n).padStart(w, "0");
/** Camera-style name in local time: IMG_YYYYMMDD_HHMMSS.jpg on iPhone and elsewhere,
 * PXL_YYYYMMDD_HHMMSSmmm.jpg on a Pixel, IMG_YYYYMMDD_HHMMSS.jpg on other Android phones. */
export function cameraFileName(platform, when, userAgent = "") {
    const day = `${when.getFullYear()}${pad(when.getMonth() + 1)}${pad(when.getDate())}`;
    const time = `${pad(when.getHours())}${pad(when.getMinutes())}${pad(when.getSeconds())}`;
    if (platform === "android" && /Pixel/i.test(userAgent))
        return `PXL_${day}_${time}${pad(when.getMilliseconds(), 3)}.jpg`;
    return `IMG_${day}_${time}.jpg`;
}
/** Hand the file to the share sheet when it accepts files, else download it. When she closes the
 * share sheet without choosing, nothing else happens. */
export async function saveFile(file, nav, download) {
    let shareable = false;
    try {
        shareable = !!nav.share && !!nav.canShare && nav.canShare({ files: [file] });
    }
    catch {
        shareable = false;
    }
    if (shareable) {
        try {
            await nav.share({ files: [file] });
            return "share";
        }
        catch (error) {
            if (error instanceof Error && error.name === "AbortError")
                return "cancelled";
            // NotAllowedError (no recent tap) or a share target failure: fall back to a download.
        }
    }
    download(file);
    return "download";
}
/** How long the download link's object URL stays alive after the click. */
export const DOWNLOAD_URL_REVOKE_MS = 1000;
export function downloadFile(file) {
    const url = URL.createObjectURL(file);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = file.name;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_URL_REVOKE_MS);
}
function jpegBlob(canvas) {
    return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't export this photo"))), "image/jpeg", JPEG_QUALITY));
}
/** Encode the canvas as a JPEG at its own size, copy her original's EXIF into it when there is one,
 * name it like a camera photo and save it the phone's way. */
export async function savePhoto(canvas, original, options = {}) {
    const nav = options.nav ?? navigator;
    const platform = detectPlatform(nav);
    const encoded = new Uint8Array(await (await jpegBlob(canvas)).arrayBuffer());
    let bytes = encoded, exif = false;
    if (original) {
        try {
            const r = copyExif(new Uint8Array(await original.arrayBuffer()), encoded, canvas.width, canvas.height);
            bytes = r.bytes;
            exif = r.copied;
        }
        catch {
            bytes = encoded;
            exif = false;
        } // a damaged EXIF block is left out, never guessed
    }
    const name = cameraFileName(platform, options.now ?? new Date(), nav.userAgent);
    const file = new File([bytes], name, { type: "image/jpeg", lastModified: (options.now ?? new Date()).getTime() });
    const route = await saveFile(file, nav, options.download ?? downloadFile);
    return { route, name, width: canvas.width, height: canvas.height, exif, platform };
}
