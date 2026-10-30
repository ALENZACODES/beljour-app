/** Local decoding, consent-only clean upload and drawn synthetic demonstration.
 * No test face photos, pretrained models or vendor assets are included.
 * Author: John Khan.
 */
import { PALETTE } from "../ui/palette.js";
export const MAX_INPUT_BYTES = 8_000_000;
export const MAX_INPUT_PIXELS = 24_000_000;
export const MAX_PREVIEW_SIDE = 1280;
const MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
export function validatePhotoInput(file) {
    if (!MIME.has(file.type))
        throw Error("Choose a JPEG, PNG or WEBP photo.");
    if (!Number.isSafeInteger(file.size) || file.size < 1 || file.size > MAX_INPUT_BYTES) {
        throw Error("The photo must be under 8 MB.");
    }
}
export function previewSize(width, height) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 16 || height < 16 ||
        width * height > MAX_INPUT_PIXELS)
        throw Error("The photo dimensions are unsupported.");
    const ratio = Math.min(1, MAX_PREVIEW_SIDE / Math.max(width, height));
    return [Math.max(1, Math.round(width * ratio)), Math.max(1, Math.round(height * ratio))];
}
export async function decodePrivate(file) {
    validatePhotoInput(file);
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    try {
        const [width, height] = previewSize(bitmap.width, bitmap.height);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d", { willReadFrequently: false });
        if (!context)
            throw Error("Your browser cannot create a preview canvas.");
        context.drawImage(bitmap, 0, 0, width, height);
        return { canvas, mime: file.type, name: file.name.slice(0, 120), synthetic: false,
            sourceWidth: bitmap.width, sourceHeight: bitmap.height };
    }
    finally {
        bitmap.close();
    }
}
/** A geometric sample drawn from canvas primitives, not a generated or real test face. */
export function syntheticPortrait() {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 720;
    const c = canvas.getContext("2d");
    if (!c)
        throw Error("This browser cannot draw a local sample.");
    c.fillStyle = PALETTE.blush;
    c.fillRect(0, 0, 640, 720); // frame and caption: interface palette; the drawn face keeps its colours
    c.fillStyle = PALETTE.plum;
    c.fillRect(0, 0, 640, 8);
    c.fillStyle = PALETTE.wine;
    c.fillRect(0, 712, 640, 8);
    c.fillStyle = "#554038";
    c.beginPath();
    c.ellipse(320, 355, 155, 225, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#986651";
    c.beginPath();
    c.ellipse(320, 395, 142, 206, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#674436";
    for (const x of [264, 376]) {
        c.beginPath();
        c.ellipse(x, 336, 28, 9, 0, 0, Math.PI * 2);
        c.fill();
    }
    c.beginPath();
    c.ellipse(320, 493, 48, 11, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = PALETTE.plum;
    c.fillRect(0, 686, 640, 26);
    c.fillStyle = PALETTE.cream;
    c.font = "15px system-ui";
    c.fillText("Synthetic illustration · not a measurement", 145, 704);
    return { canvas, mime: "image/png", name: "Drawn synthetic portrait", synthetic: true,
        sourceWidth: 640, sourceHeight: 720 };
}
export async function cleanUpload(photo) {
    // Canvas re-encoding removes file metadata, maker notes and GPS EXIF before upload.
    return new Promise((resolve, reject) => photo.canvas.toBlob((blob) => {
        if (!blob) {
            reject(Error("Could not create a clean photo for the consented upload."));
            return;
        }
        if (blob.size > MAX_INPUT_BYTES) {
            reject(Error("The encoded photo exceeds the upload size limit."));
            return;
        }
        resolve(blob);
    }, "image/jpeg", 0.88));
}
//# sourceMappingURL=image.js.map