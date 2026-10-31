/** One entry for the five skin tools: Freckles, Tan, Matte, Glow and Even tone.
 * Mirrors api/plumb_api/engines/skin/studio.py and the mesh checks of
 * api/plumb_api/engines/core/refusal.py: a face the tools cannot edit safely returns a
 * coded refusal instead of throwing. Wrong arguments still throw RangeError.
 * Author: John Khan.
 */
import { CONTOURS } from "../../data/regions/index.js";
import { checkPhoto, checkStrength, frame, MIN_SKIN_PIXELS, skinMask, xy } from "./common.js";
import { freckles } from "./freckles.js";
import { LighteningNotChosen, tan } from "./tan.js";
import { glow, matte } from "./finish.js";
import { evenTone } from "./tone.js";
export const TOOLS = ["freckles", "tan", "matte", "glow", "tone"];
export const REASONS = Object.freeze({
    wrong_shape: "The face mesh does not have the expected 478 points.",
    not_finite: "The face mesh has missing or infinite coordinates.",
    duplicate_points: "Two landmarks sit on the same spot, so the face cannot be triangulated.",
    face_too_small: "The face is too small in this photo to edit safely.",
    eyes_coincide: "The two eye centres coincide, so the face has no scale.",
    no_face_width: "The face outline has no width.",
    no_face_length: "The top of the face and the chin coincide.",
    zero_area_face: "The face outline encloses almost no area.",
    outside_frame: "Most of the face lies outside the photo.",
    no_visible_skin: "Too little skin is visible in this photo for the skin tools; try a closer photo.",
});
const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
/** Reason codes for a mesh no face tool should edit, in the order core/refusal.py lists them. */
export function meshProblems(points, width, height) {
    if (!points || points.length !== 478)
        return ["wrong_shape"];
    const pts = points.map(xy);
    if (pts.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 1e6 || Math.abs(y) > 1e6))
        return ["not_finite"];
    const codes = [];
    let duplicate = false;
    for (let i = 0; i < pts.length && !duplicate; i++)
        for (let j = i + 1; j < pts.length; j++) {
            const dx = pts[i][0] - pts[j][0], dy = pts[i][1] - pts[j][1];
            if (dx * dx + dy * dy <= 1e-12) {
                duplicate = true;
                break;
            }
        }
    if (duplicate)
        codes.push("duplicate_points");
    const iod = dist(pts[473], pts[468]);
    if (iod <= 1e-9)
        codes.push("eyes_coincide");
    else if (iod < 6)
        codes.push("face_too_small");
    if (dist(pts[152], pts[10]) < 1)
        codes.push("no_face_length");
    const faceWidth = dist(pts[454], pts[234]);
    if (faceWidth <= 1e-9)
        codes.push("no_face_width");
    else if (faceWidth < 16 && !codes.includes("face_too_small"))
        codes.push("face_too_small");
    const oval = CONTOURS.face_oval.map((i) => pts[i]);
    let twice = 0;
    for (let k = 0; k < oval.length; k++) {
        const [x0, y0] = oval[k], [x1, y1] = oval[(k + 1) % oval.length];
        twice += x0 * y1 - y0 * x1;
    }
    if (Math.abs(twice) / 2 < 64)
        codes.push("zero_area_face");
    const inside = pts.filter(([x, y]) => x >= 0 && x < width && y >= 0 && y < height).length;
    if (inside / pts.length < 0.5)
        codes.push("outside_frame");
    return codes;
}
export function isRefusal(value) { return value.refused === true; }
export function renderSkinTool(tool, image, points, strength = 30, params = {}) {
    if (!TOOLS.includes(tool))
        throw new RangeError(`tool must be one of ${TOOLS.join(", ")}`);
    checkPhoto(image);
    checkStrength(strength);
    const module = `skin.${tool}`;
    const refuse = (code, message = REASONS[code]) => ({ refused: true, module, code, message });
    const problems = meshProblems(points, image.width, image.height);
    if (problems.length)
        return refuse(problems[0]);
    const skin = skinMask(points, image.width, image.height);
    let visible = 0;
    for (const v of skin)
        if (v >= 0.5)
            visible++;
    if (visible < MIN_SKIN_PIXELS)
        return refuse("no_visible_skin");
    const face = frame(points);
    try {
        if (tool === "freckles")
            return freckles(image, skin, face, strength, params.density ?? 50, params.seed ?? 7);
        if (tool === "tan")
            return tan(image, skin, params.direction ?? "add", strength, params.undertone ?? "neutral", params.allowLightening ?? false, { mesh: points });
        if (tool === "matte")
            return matte(image, skin, face, strength);
        if (tool === "glow")
            return glow(image, skin, face, strength, params.style ?? "cassis");
        return evenTone(image, skin, face, strength, params.redness ?? 50);
    }
    catch (error) {
        if (error instanceof LighteningNotChosen)
            return refuse(error.code, error.message);
        throw error;
    }
}
