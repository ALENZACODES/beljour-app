import { MESSAGES, checkPhoto, copyImage, meshPoints, meshRefusal } from "./photo-fix.js";
export const PRESETS = {
    "35x45mm": { aspect: 35 / 45, head_min: 0.70, head_max: 0.80 },
    "2x2in": { aspect: 1.0, head_min: 0.50, head_max: 0.69 },
};
export const CROWN_ALLOWANCE = 0.15, TOP_SHARE = 0.45, ROLL_LIMIT = 5, FRONTAL_LIMIT = 0.06;
export const GUIDE_RGB = [0, 140, 255];
export const LABEL = "Crop guide only: head size and centring for a common photo size. It does not check any official rules; confirm the size, background and head height your issuing office asks for.";
const halfUp = (x) => Math.floor(x + 0.5);
const round = (x, digits) => Math.round(x * 10 ** digits) / 10 ** digits;
function result(image, status, reasonCode, box = null, guides = {}, checks = {}) {
    return { image, status, reasonCode, message: MESSAGES[reasonCode], label: LABEL, box, guides, checks };
}
export function idCrop(image, landmarks, { preset = "35x45mm" } = {}) {
    checkPhoto(image, 100);
    const pts = meshPoints(landmarks), { width: w, height: h, channels: c } = image;
    if (!Object.hasOwn(PRESETS, preset))
        return result(copyImage(image), "refused", "unknown_preset");
    const code = meshRefusal(pts, h, w);
    if (code)
        return result(copyImage(image), "refused", code);
    const spec = PRESETS[preset];
    const topFace = pts[10][1], chin = pts[152][1], crown = topFace - CROWN_ALLOWANCE * (chin - topFace), head = chin - crown;
    const share = (spec.head_min + spec.head_max) / 2, cropH = head / share, cropW = cropH * spec.aspect;
    const cx = (pts[234][0] + pts[454][0]) / 2;
    const left = halfUp(cx - cropW / 2), top = halfUp(crown - TOP_SHARE * (cropH - head)), width = halfUp(cropW), height = halfUp(cropH);
    const r = pts[468], le = pts[473], roll = Math.atan2(le[1] - r[1], le[0] - r[0]) * 180 / Math.PI;
    const faceWidth = pts[454][0] - pts[234][0], offset = faceWidth > 0 ? (pts[1][0] - cx) / faceWidth : 0;
    // Python's round() is half-even; values here are never exact halves at these digits.
    const checks = { preset, head_share: round(head / height, 4), head_band: [spec.head_min, spec.head_max],
        roll_degrees: round(roll, 2), level: Math.abs(roll) <= ROLL_LIMIT, nose_offset: round(offset, 4), frontal: Math.abs(offset) <= FRONTAL_LIMIT };
    const box = [left, top, width, height];
    if (left < 0 || top < 0 || left + width > w || top + height > h)
        return result(copyImage(image), "refused", "not_enough_margin", box, {}, checks);
    const eyeY = (r[1] + le[1]) / 2;
    const guides = { crown_y: crown - top, chin_y: chin - top, eye_y: eyeY - top, centre_x: cx - left };
    const crop = { width, height, channels: c, data: new Uint8ClampedArray(width * height * c) };
    for (let y = 0; y < height; y++)
        crop.data.set(image.data.subarray(((top + y) * w + left) * c, ((top + y) * w + left + width) * c), y * width * c);
    return result(crop, "edited", "edited", box, guides, checks);
}
/** The crop with 1 px guide lines (crown, chin, eye line, centre) for display only. */
export function guideOverlay(crop) {
    const out = copyImage(crop.image);
    if (crop.status !== "edited")
        return out;
    const { width: w, height: h, channels: c } = out;
    const paint = (i) => { for (let k = 0; k < 3; k++)
        out.data[i * c + k] = GUIDE_RGB[k]; };
    for (const key of ["crown_y", "chin_y", "eye_y"]) {
        const y = halfUp(crop.guides[key]);
        if (y >= 0 && y < h)
            for (let x = 0; x < w; x++)
                paint(y * w + x);
    }
    const x = halfUp(crop.guides.centre_x);
    if (x >= 0 && x < w)
        for (let y = 0; y < h; y++)
            paint(y * w + x);
    return out;
}
//# sourceMappingURL=id-crop.js.map