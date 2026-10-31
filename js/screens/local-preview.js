/** Shared on-device photo boundary for the former recorded-example screens.
 * Bounded canvas decoding, strict measured mesh, and labelled output. No upload,
 * inferred age, copied face or default image persistence. Author: John Khan. */
import { h } from "../dom.js";
import { floatImage, requireColour, toRGBA } from "../engines/core/buffer.js";
import { boxMean } from "../engines/core/filters.js";
import { regionMask } from "../data/regions/index.js";
import { faceFrame } from "../engines/shape/geometry.js";
import { PALETTE } from "../ui/palette.js";
export const LOCAL_SIMULATION = "Local simulation";
export const PREVIEW_SIDE = 512;
class LocalPreviewError extends Error {
}
/** Only our fixed local validation messages are displayed; decoder internals stay private. */
export function localPreviewError(error) {
    return h("p", { class: "notice notice-warn", role: "alert" }, error instanceof LocalPreviewError
        ? error.message : "This local preview could not be made. Choose a clear front-facing photo and try again.");
}
export async function readPreview(source) {
    const image = new Image();
    image.decoding = "async";
    image.src = source;
    try {
        await image.decode();
    }
    catch {
        throw new LocalPreviewError("This photo could not be decoded. Choose it again.");
    }
    if (!image.naturalWidth || !image.naturalHeight)
        throw new LocalPreviewError("This photo could not be decoded.");
    const scale = Math.min(1, PREVIEW_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context)
        throw new LocalPreviewError("This browser cannot read local photo pixels.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const result = { width: canvas.width, height: canvas.height, channels: 4,
        data: context.getImageData(0, 0, canvas.width, canvas.height).data };
    canvas.width = canvas.height = 1;
    return result;
}
export function measuredMesh(points, width, height) {
    if (!points || points.length !== 478)
        throw new LocalPreviewError("This local tool needs 478 measured face points. Choose a clear front-facing photo.");
    if (!points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y) && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1)) {
        throw new LocalPreviewError("The face points must stay inside the photo. Choose the photo again.");
    }
    const mesh = points.map(point => [point.x * width, point.y * height]);
    let frame;
    try {
        frame = faceFrame(mesh);
    }
    catch {
        throw new LocalPreviewError("The face points do not describe a usable face. Choose a clear front-facing photo.");
    }
    if (frame.iod < 8 || frame.length < 24)
        throw new LocalPreviewError("The face is too small for a reliable local preview. Use a closer photo.");
    return mesh;
}
export function paintPreview(image, label) {
    requireColour(image);
    const canvas = h("canvas", { width: image.width, height: image.height, class: "local-preview-image",
        role: "img", "aria-label": `${LOCAL_SIMULATION}: ${label}` });
    const context = canvas.getContext("2d");
    if (!context)
        throw new LocalPreviewError("This browser cannot display the local preview.");
    const pixels = context.createImageData(image.width, image.height);
    pixels.data.set(toRGBA(image));
    context.putImageData(pixels, 0, 0);
    const strip = Math.max(24, Math.round(image.height / 20));
    context.fillStyle = PALETTE.plum; // the label strip travels with the image: fixed palette
    context.fillRect(0, image.height - strip, image.width, strip);
    context.fillStyle = PALETTE.cream;
    context.font = "12px sans-serif";
    context.textAlign = "center";
    context.fillText(LOCAL_SIMULATION, image.width / 2, image.height - strip / 2 + 4);
    return h("figure", {}, canvas, h("figcaption", {}, `${LOCAL_SIMULATION}. ${label}`));
}
export const localPreviewDependencies = { read: readPreview, paint: paintPreview };
export function needsLocalPhoto(ctx) {
    if (ctx.photoSrc)
        return false;
    ctx.go("photo");
    return true;
}
/** Uses the existing skin mask and low-pass primitive; no health-score inference. */
export function texturePreview(image, mesh, strength) {
    requireColour(image);
    if (!Number.isFinite(strength) || strength < 0 || strength > 1)
        throw new RangeError("Texture strength must be from zero to one.");
    const output = { ...image, data: new Uint8ClampedArray(image.data) };
    if (strength === 0)
        return output;
    const mask = regionMask("skin", mesh, image.width, image.height, { normalized: false });
    for (let channel = 0; channel < 3; channel++) {
        const plane = floatImage(image.width, image.height);
        for (let i = 0; i < plane.data.length; i++)
            plane.data[i] = image.data[i * image.channels + channel];
        const smooth = boxMean(plane, 2);
        for (let i = 0; i < plane.data.length; i++) {
            output.data[i * image.channels + channel] = plane.data[i] + (smooth.data[i] - plane.data[i]) * mask.data[i] * strength * .35;
        }
    }
    return output;
}
