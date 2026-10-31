/** #111 Face lenses page: the parts that do not need a browser, so they are tested in Node.
 *
 * Example people are the AI-generated faces John made for Skin Moment (assets/skin-moment/
 * faces/face-XX-day0.png, listed by the build); on them the lens is placed with the fixed
 * passport framing (shape-art.ts framingPoints) when no face reader runs here, and the page
 * says so. Her own photo needs the face reader; without it no lens is drawn on her photo.
 * Captures go through the app's export (save/export.ts): no metadata, the Simulation label
 * from the Trust Centre setting, Beljour_<lens name>_NN.jpg. Author: John Khan.
 */
import { resizeArea, toRGBA } from "../engines/core/buffer.js";
import { applyLens } from "../lenses/render.js";
import { exportPhoto } from "../save/export.js";
export const LENS_LABEL = "Face lens: our own drawn props on this photo. A simulation.";
export const EXAMPLE_LABEL = "AI-generated example person";
export const FRAMING_NOTE = "Without the face reader in this build, lenses use the pictures' fixed framing and leave out lip and eye tints.";
export const NEEDS_READER = "Lenses on your own photo need the face reader, which is not installed in this build. Try an example person.";
export const NO_FACE = "No face was found in this photo, so no lens is drawn. Try a front-facing photo.";
export const THUMB_SIDE = 132;
export const PREVIEW_SIDE = 720;
const FACE_FILE = /^faces\/face-(\d{2})-day0\.png$/;
/** The example people the picker offers, chosen for a spread of skin tones (very fair to very
 * deep), ages and genders from the AI-generated set: by picture number, in the order shown. */
export const PICKER_PEOPLE = [1, 8, 5, 6, 12, 22, 24, 25];
/** The picker's example people that are in this build, in PICKER_PEOPLE order; when none of
 * those is there, the first eight listed. */
export function examplePeople(listed, chosen = PICKER_PEOPLE) {
    const all = [...listed].map((f) => [f, FACE_FILE.exec(f)]).filter(([, m]) => m)
        .map(([file, m]) => ({ n: Number(m[1]), file })).sort((a, b) => a.n - b.n);
    const picked = chosen.map((n) => all.find((p) => p.n === n)).filter((p) => !!p);
    return picked.length ? picked : all.slice(0, 8);
}
/** The image reduced so its long side is at most `side` (never enlarged), with the face points
 * scaled to match. */
export function fitted(image, points, side) {
    const k = Math.min(1, side / Math.max(image.width, image.height));
    if (k === 1)
        return { image, points: points ? points.map(([x, y]) => [x, y]) : null };
    const w = Math.max(1, Math.round(image.width * k)), hgt = Math.max(1, Math.round(image.height * k));
    const sx = w / image.width, sy = hgt / image.height;
    return { image: resizeArea(image, w, hgt), points: points ? points.map(([x, y]) => [x * sx, y * sy]) : null };
}
/** A small lens preview for the picker: the lens drawn on the reduced photo. */
export function thumbnail(image, points, lens, sprites, side = THUMB_SIDE, precise = true) {
    const small = fitted(image, points, side);
    return applyLens(small.image, small.points, lens, 100, { t: 0.6, sprites, precise }).image;
}
/** Save the shown picture through the app's export: plain JPEG, no metadata, labelled. */
export async function capture(image, lens, index, encoder, simulationLabel = true) {
    const rgba = { width: image.width, height: image.height, data: toRGBA(image) };
    return exportPhoto(rgba, encoder, { lookName: lens.title, index, simulationLabel, isSimulation: true });
}
