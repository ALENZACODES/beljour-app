import { regionMask } from "../../data/regions/index.js";
import { findMarks, retention } from "../../layout/still-you.js";
import { srgbToLab } from "../colour/space.js";
import { fromLandmarks, keepOriginal, maskCentre } from "../masks/blend.js";
import { MARKS_KEPT } from "../qa/still-her.js";
import { render as renderFilter } from "../runtime/engine.js";
import { portraitLook } from "./looks.js";
import * as P from "./polish.js";
import * as SP from "./sparkle.js";
export const LABEL = "Portrait look: a local simulation of skin polish, feature definition and colour. " +
    "Not a prediction and not medical advice.";
export const LIFT_LIMIT = 1; // mean skin L* rise allowed, the guard's LIFT_OVER_GREY; ASSUMED
export const POLISH_STEPS = [1, 0.5, 0.25];
export const MIN_SIDE = 16;
export const MESH_POINTS = 478;
export const REFUSALS = ["bad_photo", "no_face_points", "unknown_look", "bad_strength", "marks_not_kept", "skin_lightened"];
export class PortraitRefused extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}
/** The last photo's face masks, so moving the slider on the same photo does not rebuild them.
 * The key is the photo itself: a copy of its bytes, its size and its face points, compared in
 * full (no hash, so no collision can return another photo's masks; points with Object.is, so
 * even the sign of a zero must match). Masks go out as structured clones, so a caller that
 * changes them cannot change the remembered copy. One photo only (speed round). */
let remembered = null;
function samePoints(stored, points) {
    if (stored.length !== points.length * 2)
        return false;
    for (let i = 0; i < points.length; i++) {
        if (!Object.is(stored[2 * i], points[i][0]) || !Object.is(stored[2 * i + 1], points[i][1]))
            return false;
    }
    return true;
}
function sameBytes(a, b) {
    if (a.length !== b.length)
        return false;
    for (let i = 0; i < a.length; i++)
        if (a[i] !== b[i])
            return false;
    return true;
}
export function rememberedFaceMasks(rgb, width, height, points) {
    const last = remembered;
    if (last && last.width === width && last.height === height && samePoints(last.points, points) && sameBytes(last.rgb, rgb)) {
        return structuredClone(last.masks);
    }
    const masks = faceMasks(rgb, width, height, points);
    const flat = new Float64Array(points.length * 2);
    points.forEach((p, i) => { flat[2 * i] = p[0]; flat[2 * i + 1] = p[1]; });
    remembered = { width, height, rgb: Uint8Array.from(rgb), points: flat, masks: structuredClone(masks) };
    return masks;
}
/** Forget the remembered masks (a test, or a new photo that should free the memory now). */
export function forgetFaceMasks() { remembered = null; }
export function faceMasks(rgb, width, height, points) {
    const pts = points.map((p) => [p[0], p[1]]);
    const region = (name) => regionMask(name, pts, width, height, { normalized: false, supersample: 2 });
    const fm = fromLandmarks(pts, width, height);
    if (!fm.skin || !fm.person)
        throw new PortraitRefused("no_face_points", "These face points give no skin outline.");
    const dx = pts[473][0] - pts[468][0], dy = pts[473][1] - pts[468][1];
    const iod = Math.sqrt(dx * dx + dy * dy);
    const marks = findMarks({ width, height, channels: 3, data: rgb }, fm.skin, iod);
    return { skin: fm.skin, person: fm.person,
        features: { eyes: region("eyes"), brows: region("brows"), lips: region("lips"), irises: region("irises") },
        marks, protect: P.markMask(marks, width, height), sparkle: SP.region(pts, fm.skin.data, width, height, iod),
        iod, centre: maskCentre(fm.person) };
}
export function skinLightness(rgb, skin) {
    const lab = [0, 0, 0];
    let sum = 0, n = 0;
    for (let p = 0; p < skin.data.length; p++) {
        if (!(skin.data[p] >= 0.5))
            continue;
        srgbToLab(rgb[p * 3] / 255, rgb[p * 3 + 1] / 255, rgb[p * 3 + 2] / 255, lab);
        sum += lab[0];
        n++;
    }
    return n ? sum / n : 0;
}
function validate(image, points, lookId, strength) {
    const { width, height, channels } = image;
    if (!(Number.isInteger(width) && Number.isInteger(height) && Math.min(width, height) >= MIN_SIDE &&
        (channels === 3 || channels === 4) && image.data.length === width * height * channels)) {
        throw new PortraitRefused("bad_photo", `A portrait look needs an RGB or RGBA photo at least ${MIN_SIDE} pixels a side.`);
    }
    if (!points || points.length !== MESH_POINTS || !points.every((p) => p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]))) {
        throw new PortraitRefused("no_face_points", "A portrait look needs the 478 face points of this photo, read on this device.");
    }
    const look = portraitLook(lookId);
    if (!look)
        throw new PortraitRefused("unknown_look", `There is no portrait look ${JSON.stringify(lookId)}.`);
    if (!(Number.isFinite(strength) && strength >= 0 && strength <= 100))
        throw new PortraitRefused("bad_strength", "Strength is 0 to 100.");
    return look;
}
function rgbOf(image) {
    if (image.channels === 3)
        return Uint8Array.from(image.data);
    const out = new Uint8Array(image.width * image.height * 3);
    for (let p = 0; p < image.width * image.height; p++)
        for (let c = 0; c < 3; c++)
            out[p * 3 + c] = image.data[p * 4 + c];
    return out;
}
export const NO_BOOST = { grade: 1, reach: 1 };
function steps(rgb, width, height, fm, look, strength, polishScale, boost = NO_BOOST) {
    const s = strength / 100;
    let x = P.polish(rgb, width, height, fm.skin, fm.protect, fm.iod, look.polish * s * polishScale);
    const e = look.emphasis;
    x = P.define(x, width, height, P.featureMask(fm.features, fm.iod, e.eyes, e.brows, e.lips), s);
    const masks = { skin: fm.skin, person: fm.person, source: "landmarks", note: "" };
    const graded = renderFilter({ width, height, channels: 3, data: x }, look.recipe, { strength: Math.min(100, strength * boost.grade) }, masks, fm.centre).image.data;
    const reach = boost.reach;
    if (reach > 1)
        for (let i = 0; i < graded.length; i++)
            graded[i] = Math.max(0, Math.min(255, Math.round(x[i] + reach * (graded[i] - x[i]))));
    const before = keepOriginal(rgb, graded, Float64Array.from(fm.features.irises.data));
    if (!look.sparkle)
        return { before, final: before, glints: 0 };
    const sparkled = SP.render(before, width, height, fm.sparkle, fm.iod, look.sparkle, s);
    return { before, final: sparkled.image, glints: sparkled.glints.count };
}
function identity(rgb, before, final, width, height, fm, used) {
    const kept = retention(fm.marks, { width, height, channels: 3, data: final }, fm.iod);
    let iris = 0, same = 0;
    for (let p = 0; p < width * height; p++) {
        if (!(fm.features.irises.data[p] >= 1))
            continue;
        iris++;
        if (final[p * 3] === rgb[p * 3] && final[p * 3 + 1] === rgb[p * 3 + 1] && final[p * 3 + 2] === rgb[p * 3 + 2])
            same++;
    }
    const lift = skinLightness(before, fm.skin) - skinLightness(rgb, fm.skin);
    const marksOk = kept.found === 0 || kept.kept / kept.found >= MARKS_KEPT;
    const irisKept = iris ? same / iris : 1;
    return { marksFound: kept.found, marksKept: kept.kept, irisKept, skinLift: lift, polishUsed: used,
        passed: marksOk && lift <= LIFT_LIMIT && irisKept === 1 };
}
export function renderPortrait(image, points, lookId, strength = 30, boost = NO_BOOST) {
    const look = validate(image, points, lookId, strength);
    const base = { look: look.id, name: look.name, strength, label: LABEL };
    if (strength === 0) {
        return { ...base, image: { ...image, data: Uint8Array.from(image.data) }, status: "identity", code: "", identity: null, glints: 0, notes: [] };
    }
    const { width, height } = image;
    const rgb = rgbOf(image);
    const fm = rememberedFaceMasks(rgb, width, height, points);
    const notes = [];
    let check = null, result = { before: rgb, final: rgb, glints: 0 };
    for (let step = 0; step < POLISH_STEPS.length; step++) {
        result = steps(rgb, width, height, fm, look, strength, POLISH_STEPS[step], boost);
        check = identity(rgb, result.before, result.final, width, height, fm, look.polish * strength / 100 * POLISH_STEPS[step]);
        if (check.passed || check.skinLift > LIFT_LIMIT || step + 1 === POLISH_STEPS.length)
            break;
        notes.push(`Polish eased to ${POLISH_STEPS[step + 1].toFixed(2)} of the look to keep your marks.`);
    }
    if (!check.passed) {
        return { ...base, image: { ...image, data: Uint8Array.from(image.data) }, status: "refused",
            code: check.skinLift > LIFT_LIMIT ? "skin_lightened" : "marks_not_kept", identity: check, glints: 0,
            notes: [...notes, "The look was not applied: it would have changed what makes this photo you."] };
    }
    const data = Uint8Array.from(image.data);
    for (let p = 0; p < width * height; p++)
        for (let c = 0; c < 3; c++)
            data[p * image.channels + c] = result.final[p * 3 + c];
    return { ...base, image: { width, height, channels: image.channels, data }, status: "applied", code: "",
        identity: check, glints: result.glints, notes };
}
