/** Pictures for the face shape tools: starting photos of AI-generated example people
 * (assets/shape/shape-01..20.png) and one plum line icon per control (assets/icons/icon-*.png).
 * John makes them outside the app; until a file is there the screens look as they do today
 * (text-only controls, no example people). The build lists the files present in each folder
 * (scripts/copy-static.mjs writes shape-assets.js), so the page asks only for pictures that exist
 * and the local screens make no request to find out.
 *
 * The example people are starting photos only: every "after" is made on this device by the
 * app's own shape engines. No pre-made after picture exists or is shown.
 * Author: John Khan.
 */
import { symmetricFace } from "../engines/local/face-synthetic.js";
import { FACE_FILES, ICON_FILES, SHAPE_FILES } from "./shape-assets.js";
export const SHAPE_DIR = "assets/shape";
export const ICON_DIR = "assets/icons";
export const SHAPE_COUNT = 20;
export const EXAMPLE_LABEL = "AI-generated example person";
/** Each icon, the web controls it sits next to (shape, face-part and expression ids), and the
 * matching ids in api/plumb_api/services/procedures.py. An icon with no web control yet is kept
 * so the server catalogue and the picture set stay one list. */
export const ICONS = {
    "eye-size": { controls: ["eye_size"], procedures: [] },
    "eye-colour": { controls: ["eye_colour"], procedures: [] },
    "brow-reshape": { controls: ["brow_arch", "brow_tail"], procedures: [] },
    "brow-lift": { controls: ["brow_height", "raised_brows"], procedures: ["brow_lift"] },
    "upper-lid": { controls: ["eye_opening"], procedures: ["upper_bleph"] },
    "eye-corner": { controls: [], procedures: ["canthal_tilt"] },
    "eye-bags": { controls: [], procedures: ["lower_bleph"] },
    "nose-bridge": { controls: ["nose_bridge"], procedures: ["rhino_bridge"] },
    "nose-tip": { controls: ["nose_tip"], procedures: ["rhino_tip", "rhino_lift"] },
    "nose-size": { controls: ["nose_width", "nose_length"], procedures: ["rhino_size", "nose_filler"] },
    "nostrils": { controls: [], procedures: ["rhino_wings"] },
    "lips-fuller": { controls: ["lip_fullness", "lower_lip"], procedures: ["lip_filler"] },
    "cupids-bow": { controls: ["upper_lip"], procedures: ["lip_peak"] },
    "lips-thinner": { controls: ["mouth_width"], procedures: ["lip_reduce"] },
    "lip-lift": { controls: [], procedures: ["lip_lift"] },
    "chin-forward": { controls: ["chin_length", "chin_projection_2d"], procedures: ["chin_augment"] },
    "chin-shorter": { controls: [], procedures: ["chin_reduce"] },
    "chin-narrow": { controls: ["chin_width", "chin_shape"], procedures: ["chin_slim"] },
    "chin-dimple": { controls: [], procedures: ["cleft_chin"] },
    "cheek-dimples": { controls: [], procedures: [] },
    "jaw-slim": { controls: ["jaw_width_left", "jaw_width_right", "jawline_slope"], procedures: ["jaw_slim"] },
    "jaw-defined": { controls: ["jaw_angle_sharpness", "jaw_length"], procedures: ["jaw_filler"] },
    "cheekbones": { controls: [], procedures: ["cheekbone_contour"] },
    "cheeks-fuller": { controls: ["cheek_fullness"], procedures: ["cheek_filler"] },
    "cheeks-hollow": { controls: ["jowl_fullness"], procedures: ["buccal_fat_removal"] },
    "face-slim": { controls: ["face_width"], procedures: ["face_slim"] },
    "forehead": { controls: ["forehead_height", "forehead_width"], procedures: [] },
    "face-length": { controls: ["face_length"], procedures: [] },
    "symmetry": { controls: [], procedures: [] },
    "ears": { controls: [], procedures: ["otoplasty"] },
    "smile": { controls: ["soft_smile", "lip_corners"], procedures: [] },
    "wink": { controls: [], procedures: [] },
    "surprise": { controls: ["surprise"], procedures: [] },
    "head-pose": { controls: [], procedures: [] },
    "forehead-lines": { controls: [], procedures: ["wrinkle_relax"] },
    "smile-lines": { controls: [], procedures: ["smile_lines"] },
    "skin-firm": { controls: [], procedures: ["skin_tightening", "facelift"] },
};
export const ICON_NAMES = Object.keys(ICONS);
const BY_CONTROL = new Map();
for (const [icon, row] of Object.entries(ICONS))
    for (const id of row.controls)
        BY_CONTROL.set(id, icon);
/** The icon for a web control id, or null. */
export function iconFor(controlId) { return BY_CONTROL.get(controlId) ?? null; }
export function shapeFile(n) {
    if (!Number.isInteger(n) || n < 1 || n > SHAPE_COUNT)
        throw new RangeError(`no example person shape-${n}`);
    return `shape-${String(n).padStart(2, "0")}.png`;
}
export function isShapeFile(file) {
    const m = /^shape-(\d\d)\.png$/.exec(file);
    return !!m && Number(m[1]) >= 1 && Number(m[1]) <= SHAPE_COUNT;
}
export function isIconFile(file) {
    const m = /^icon-([a-z-]+)\.png$/.exec(file);
    return !!m && m[1] in ICONS;
}
/** The files of one of the two folders that are in this build (shape-assets.ts, written by the
 * build). No request is made: the local screens stay offline. */
export function presentIn(dir, listed = { shape: SHAPE_FILES, icons: ICON_FILES }) {
    return dir === SHAPE_DIR ? new Set(listed.shape.filter(isShapeFile)) : new Set(listed.icons.filter(isIconFile));
}
/** The Skin Moment example people (assets/skin-moment/faces/face-NN-day0.png): AI-generated adults in
 * the same passport framing, offered as starting photos when no shape-tool example is in the build. */
export const FACES_DIR = "assets/skin-moment/faces";
export function isFaceFile(file) { return /^face-\d{2}-day0\.png$/.test(file); }
/** The example people whose picture is in the build, in order: the shape-tool pictures when there are
 * any, otherwise the first day pictures of the Skin Moment example people. */
export async function examplePeople(listed = { shape: SHAPE_FILES, faces: FACE_FILES }) {
    const shapes = [...presentIn(SHAPE_DIR, { shape: listed.shape, icons: [] })].sort();
    const [dir, files] = shapes.length ? [SHAPE_DIR, shapes] : [FACES_DIR, listed.faces.filter(isFaceFile).sort()];
    return files.map((file, i) => ({ file, url: `${dir}/${file}`, label: `${EXAMPLE_LABEL} ${i + 1}` }));
}
/** A small slot for a control's icon: empty (the text-only look) until the picture is known to
 * exist, then a decorative image beside the control's own text label. */
export function controlIcon(controlId) {
    const box = document.createElement("span");
    box.className = "shape-icon";
    box.setAttribute("aria-hidden", "true");
    const name = iconFor(controlId);
    if (!name)
        return box;
    const file = `icon-${name}.png`;
    if (!presentIn(ICON_DIR).has(file))
        return box;
    const img = document.createElement("img");
    img.alt = "";
    img.decoding = "async";
    img.width = 40;
    img.height = 40;
    img.onload = () => { box.replaceChildren(img); box.classList.add("has-icon"); };
    img.src = `${ICON_DIR}/${file}`;
    return box;
}
/** Face points for an example-person picture when no face reading is available on this device:
 * the drawn-face mesh placed where the pictures' fixed passport framing puts the face (centred,
 * about 47% of the width and 63% of the height, from face-01). An estimate of the face area for
 * the example pictures only, never used on her own photo. ASSUMED proportions. */
export function framingPoints(width, height) {
    return symmetricFace(width, height, Math.round(width * 0.47), Math.round(height * 0.63)).map(([x, y]) => [x, y]);
}
