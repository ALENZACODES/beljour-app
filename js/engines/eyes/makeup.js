/** #35 Eyeshadow, eyeliner and mascara as one local eye look, on the existing eyes engine.
 * Mirrors api/plumb_api/engines/eyes/makeup.py step for step: W66 shadow, then W64 liner,
 * then W63 mascara on traced lashes only (no lash is invented; without traces mascara is
 * skipped with "needs_lash_trace"). The eyeball is protected, geometry and eye colour never
 * change, alpha is copied, and strength 0 or every element at 0 returns an exact copy. Meshes
 * no face tool should edit are refused with the core codes. Landmarks and traces are 0..1.
 * Look colours and liner sizes are ASSUMED. Local route only: never calls YouCam.
 * Author: John Khan.
 */
import { ANATOMIES, SIDES, validatePhoto, validatePoints } from "./contracts.js";
import { renderEyes } from "./engine.js";
import { frames } from "./geometry.js";
import { combine } from "./raster.js";
import { meshProblems, REASONS } from "../skin/studio.js";
export const MODULE = "eyes.makeup";
export const LABEL = "Local eye makeup simulation. Placement and colour are estimates, not a product result.";
export const ELEMENTS = ["shadow", "liner", "mascara"];
export const FEATURE = { shadow: "W66", liner: "W64", mascara: "W63" };
export const MESSAGES = Object.freeze({
    zero_strength: "Strength is zero, so the photo is unchanged.",
    nothing_chosen: "Eyeshadow, liner and mascara are all off, so the photo is unchanged.",
    eyes_closed: "Both eyes are closed or too small for a reliable preview.",
    eye_too_small: "The eyes are too small in this photo to place makeup.",
    needs_lash_trace: "Trace your visible lashes first; a face mesh cannot show where they are.",
});
/** Original named looks (ASSUMED colours and liner sizes, as shares of the eye width). */
export const LOOKS = Object.freeze({
    vezelay: { name: "Vézelay", shadowStyle: "halo", shadowColour: [150, 112, 96], linerStyle: "soft_wing", linerColour: [66, 44, 36],
        linerThickness: 0.010, linerLength: 0.10, mascaraStyle: "lengthening", mascaraColour: [34, 26, 24] },
    locronan: { name: "Locronan", shadowStyle: "smokey", shadowColour: [78, 64, 72], linerStyle: "wing", linerColour: [26, 22, 24],
        linerThickness: 0.014, linerLength: 0.16, mascaraStyle: "volumising", mascaraColour: [18, 16, 17] },
    rocamadour: { name: "Rocamadour", shadowStyle: "cut_crease", shadowColour: [122, 80, 58], linerStyle: "tightline", linerColour: [40, 28, 26],
        linerThickness: 0.012, linerLength: 0.12, mascaraStyle: "tubing", mascaraColour: [30, 22, 20] },
});
export function isMakeupRefusal(value) {
    return value.refused === true;
}
function amount(value, name, high) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > high)
        throw new RangeError(`${name} must be 0..${high}`);
    return value;
}
function colour(value, name) {
    if (!Array.isArray(value) || value.length !== 3 || !value.every(v => Number.isInteger(v) && v >= 0 && v <= 255)) {
        throw new RangeError(`${name} must contain three byte channels`);
    }
    return [value[0], value[1], value[2]];
}
function anatomyOf(value) {
    if (value === undefined || value === null)
        return { right: "open", left: "open" };
    const input = value;
    if (typeof value !== "object" || Object.keys(input).length !== 2 || !SIDES.every(s => ANATOMIES.includes(input[s]))) {
        throw new RangeError("anatomy needs right and left selections from open, hooded, monolid or deep_set");
    }
    return { right: input.right, left: input.left };
}
const refuse = (code) => ({ refused: true, module: MODULE, code, message: MESSAGES[code] ?? REASONS[code] });
export function renderEyeMakeup(photo, landmarks, options = {}) {
    validatePhoto(photo);
    const level = amount(options.strength ?? 60, "strength", 100) / 100;
    const lookId = options.look ?? "vezelay";
    if (!Object.hasOwn(LOOKS, lookId))
        throw new RangeError(`look must be one of ${Object.keys(LOOKS).join(", ")}`);
    const chosen = { shadow: amount(options.shadow ?? 1, "shadow", 1), liner: amount(options.liner ?? 1, "liner", 1),
        mascara: amount(options.mascara ?? 1, "mascara", 1) };
    const sides = anatomyOf(options.anatomy);
    const lashes = options.lashes ?? [];
    if (!Array.isArray(lashes))
        throw new RangeError("lashes must be a list of traced lashes");
    const look = LOOKS[lookId];
    const tint = { shadow: look.shadowColour, liner: look.linerColour, mascara: look.mascaraColour };
    for (const [key, value] of Object.entries(options.colours ?? {})) {
        if (!ELEMENTS.includes(key))
            throw new RangeError("colours may name shadow, liner or mascara only");
        tint[key] = colour(value, `${key} colour`);
    }
    const points = validatePoints(landmarks);
    const { width, height } = photo;
    const problems = meshProblems(points.map(([x, y]) => [x * width, y * height]), width, height);
    if (problems.length)
        return { refused: true, module: MODULE, code: problems[0], message: REASONS[problems[0]] };
    const report = { look: lookId, look_name: look.name, strength: level * 100, anatomy: sides, provider: "local",
        simulation: true, geometry_changed: false, eye_colour_changed: false, real_face_quality: "Not tested", elements: {}, skipped: {}, warnings: [] };
    const elements = report.elements, skipped = report.skipped;
    let warnings = [];
    const unchanged = (code) => {
        Object.assign(report, { status: "unchanged", reason_code: code, message: MESSAGES[code], changed_pixels: 0 });
        return { image: Uint8ClampedArray.from(photo.data), coverage: new Float64Array(width * height), label: LABEL, report };
    };
    if (level === 0)
        return unchanged("zero_strength");
    if (!ELEMENTS.some(e => chosen[e] > 0))
        return unchanged("nothing_chosen");
    let eyeFrames;
    try {
        eyeFrames = frames(points, width, height);
    }
    catch {
        return refuse("eye_too_small");
    }
    if (!eyeFrames.some(f => f.visible))
        return refuse("eyes_closed");
    const active = ELEMENTS.filter(e => chosen[e] > 0);
    if (active.length === 1 && active[0] === "mascara" && lashes.length === 0)
        return refuse("needs_lash_trace");
    const styles = { shadow: look.shadowStyle, liner: look.linerStyle, mascara: look.mascaraStyle };
    let current = photo;
    let coverage = new Float64Array(width * height);
    for (const name of active) {
        if (name === "mascara" && lashes.length === 0) {
            skipped.mascara = "needs_lash_trace";
            continue;
        }
        const request = { feature: FEATURE[name], amount: level * chosen[name], style: styles[name], anatomy: sides, colour: [...tint[name]] };
        if (name === "liner")
            Object.assign(request, { thickness: look.linerThickness, length: look.linerLength });
        if (name === "mascara")
            Object.assign(request, { observed_lashes: [...lashes], lower: true });
        const step = renderEyes(current, points, request);
        if (step.report.status === "unavailable") {
            skipped[name] = name === "mascara" ? "needs_lash_trace" : "eyes_closed";
            continue;
        }
        coverage = combine(coverage, step.coverage);
        elements[name] = { feature: FEATURE[name], amount: request.amount, style: styles[name], colour: [...tint[name]],
            changed_pixels: step.report.changed_pixels };
        warnings.push(...step.report.warnings);
        current = { ...photo, data: step.image };
    }
    if (Object.keys(elements).length === 0)
        return refuse("needs_lash_trace");
    if (skipped.mascara)
        warnings.push("Mascara is off until you trace your visible lashes; no lash is invented.");
    warnings = [...new Set(warnings)];
    let changed = 0;
    for (let i = 0; i < width * height; i++) {
        const o = i * photo.channels;
        if (photo.data[o] !== current.data[o] || photo.data[o + 1] !== current.data[o + 1] || photo.data[o + 2] !== current.data[o + 2])
            changed++;
    }
    Object.assign(report, { warnings, status: "edited", reason_code: "edited", changed_pixels: changed });
    return { image: Uint8ClampedArray.from(current.data), coverage, label: LABEL, report };
}
//# sourceMappingURL=makeup.js.map