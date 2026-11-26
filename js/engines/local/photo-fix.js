import { MESSAGES as MESH_MESSAGES, checkPhoto as checkTouchUpPhoto, meshPoints, meshRefusal } from "../skin/local-zones.js";
export const VERSION = "photo-fix/1";
const REFUSALS = ["wrong_shape", "not_finite", "duplicate_points", "face_too_small", "eyes_coincide", "no_face_width",
    "no_face_length", "zero_area_face", "outside_frame", "zone_too_small"];
export const MESSAGES = {
    ...Object.fromEntries(REFUSALS.map((code) => [code, MESH_MESSAGES[code]])),
    edited: "Local photo fix made.",
    zero_strength: "Strength is zero, so the photo is unchanged.",
    eyes_not_visible: "Neither eye is open and visible enough in this photo.",
    no_red_eye: "No red pupil glow was found in the visible eyes.",
    no_glare: "No glasses glare was found beside the eyes.",
    no_scratches: "No scratches or dust specks were found, and the photo needed no tone or noise repair.",
    nothing_marked: "Nothing is marked for removal.",
    area_too_large: "The marked area is too large to fill from the rest of the photo.",
    covers_face: "The marked area covers the face, so it was not removed.",
    not_enough_margin: "The photo has too little space around the head for this crop.",
    unknown_preset: "That crop size is not one of the offered guides.",
};
export { meshPoints, meshRefusal };
export function checkPhoto(image, strength) {
    try {
        checkTouchUpPhoto(image, strength);
    }
    catch (error) {
        throw new RangeError(String(error.message).replace("skin touch-up", "photo fix"));
    }
}
export function copyImage(image) {
    return { width: image.width, height: image.height, channels: image.channels, data: Uint8ClampedArray.from(image.data) };
}
export function unchanged(image, status, code, label, report = {}) {
    return { image: copyImage(image), alpha: new Float64Array(image.width * image.height), status, reasonCode: code,
        message: MESSAGES[code], label, report: { ...report } };
}
export function edited(image, alpha, label, report) {
    return { image, alpha, status: "edited", reasonCode: "edited", message: MESSAGES.edited, label, report };
}
export const halfUp = (x) => Math.floor(x + 0.5);
const byte = (x) => Math.min(255, Math.max(0, halfUp(x)));
/** original + weight * (edited - original) on the colour channels; alpha is kept. */
export function blendBytes(original, edit, weight) {
    const out = copyImage(original), c = original.channels;
    for (let i = 0; i < weight.length; i++) {
        const w = weight[i];
        for (let k = 0; k < 3; k++) {
            const a = original.data[i * c + k], b = edit.data[i * c + k];
            out.data[i * c + k] = byte(a + w * (b - a));
        }
    }
    return out;
}
//# sourceMappingURL=photo-fix.js.map