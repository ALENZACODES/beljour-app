/** LS4 synthetic figures: drawn front and side bodies on a grid, with exact control points.
 * Mirrors api/plumb_api/engines/posture/synthetic.py (parity vectors sample the masks).
 * Inspiration: MediaPipe Pose Landmarker (which body points a posture edit needs, runtime
 * data) and Bookstein thin-plate splines (smooth control-point warps tested on a grid);
 * concept only, no code copied. Not a person and not a photo.
 * Author: John Khan.
 */
import { byteImage, floatImage, roundHalfEven } from "../core/buffer.js";
import { polygon } from "../core/mask.js";
import { hashNoise } from "../../quality/harness.js";
import { gridScene } from "../../quality/warpfill.js";
import { makeControls } from "./posture.js";
export const GRID = { spacing: 10, offset: 5, thickness: 1 };
export const SKIN = [196, 152, 128];
export const CLOTH = [70, 96, 150];
export function capsule(width, height, a, b, radius) {
    const out = floatImage(width, height, 1);
    const dx = b[0] - a[0], dy = b[1] - a[1], length2 = dx * dx + dy * dy;
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
            const px = x + 0.5, py = y + 0.5;
            const t = length2 > 0 ? Math.min(1, Math.max(0, ((px - a[0]) * dx + (py - a[1]) * dy) / length2)) : 0;
            const dist = Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
            out.data[y * width + x] = Math.min(1, Math.max(0, radius + 0.5 - dist));
        }
    return out;
}
export function oval(width, height, cx, cy, rx, ry) {
    const out = floatImage(width, height, 1), edge = Math.min(rx, ry);
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
            const r = Math.hypot((x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry);
            out.data[y * width + x] = Math.min(1, Math.max(0, (1 - r) * edge + 0.5));
        }
    return out;
}
function rot(p, centre, degrees) {
    const t = degrees * Math.PI / 180, dx = p[0] - centre[0], dy = p[1] - centre[1];
    return [centre[0] + dx * Math.cos(t) - dy * Math.sin(t), centre[1] + dx * Math.sin(t) + dy * Math.cos(t)];
}
/** Layers painted in order over the grid, in float64 with float32 masks (as NumPy does). */
function paint(width, height, layers, seed) {
    const base = gridScene(height, width, GRID.spacing, GRID.offset, GRID.thickness);
    const img = Float64Array.from(base.data), person = floatImage(width, height, 1), noise = hashNoise(seed, width, height);
    for (const [mask, tone] of layers) {
        for (let i = 0; i < width * height; i++) {
            const m = mask.data[i], keep = Math.fround(1 - m), n = 12 * noise[i];
            for (let c = 0; c < 3; c++)
                img[i * 3 + c] = img[i * 3 + c] * keep + (tone[c] + n) * m;
            if (m > person.data[i])
                person.data[i] = m;
        }
    }
    const image = byteImage(width, height, 3);
    for (let i = 0; i < img.length; i++)
        image.data[i] = Math.min(255, Math.max(0, roundHalfEven(img[i])));
    return { image, person };
}
export function frontFigure({ width = 160, height = 200, lean = 0, shoulderDrop = 0, seed = 1 } = {}) {
    const hip = [0.5 * width, 0.58 * height], torso = 0.27 * height;
    const halfShoulders = 0.15 * width, halfHips = 0.095 * width;
    const rs = rot([hip[0] - halfShoulders, hip[1] - torso], hip, lean);
    const ls = rot([hip[0] + halfShoulders, hip[1] - torso + shoulderDrop], hip, lean);
    const rh = [hip[0] - halfHips, hip[1]], lh = [hip[0] + halfHips, hip[1]];
    const sm = [(rs[0] + ls[0]) / 2, (rs[1] + ls[1]) / 2];
    const neck = rot([sm[0], sm[1] - 0.035 * height], sm, lean);
    const up = [sm[0] - hip[0], sm[1] - hip[1]], norm = Math.hypot(up[0], up[1]);
    const head = [neck[0] + up[0] / norm * 0.08 * height, neck[1] + up[1] / norm * 0.08 * height];
    const armR = 0.032 * width, legR = 0.042 * width;
    const layers = [
        [capsule(width, height, rh, [rh[0] - 0.01 * width, rh[1] + 0.2 * height], legR), CLOTH],
        [capsule(width, height, lh, [lh[0] + 0.01 * width, lh[1] + 0.2 * height], legR), CLOTH],
        [capsule(width, height, rs, [rs[0] - 0.03 * width, rs[1] + 0.24 * height], armR), SKIN],
        [capsule(width, height, ls, [ls[0] + 0.03 * width, ls[1] + 0.24 * height], armR), SKIN],
        [polygon(width, height, [rs, ls, lh, rh], 4), CLOTH],
        [capsule(width, height, sm, neck, 0.03 * width), SKIN],
        [oval(width, height, head[0], head[1], 0.06 * height, 0.075 * height), SKIN],
    ];
    const { image, person } = paint(width, height, layers, seed);
    const at = (share) => [sm[0] + share * (hip[0] - sm[0]), sm[1] + share * (hip[1] - sm[1])];
    const controls = makeControls("front", { right_shoulder: rs, left_shoulder: ls, right_hip: rh, left_hip: lh,
        mid_chest: at(0.3), navel: at(0.72) }, width, height);
    return { image, person, controls, grid: GRID, params: { view: "front", lean, shoulder_drop: shoulderDrop, seed } };
}
export function sideFigure({ width = 160, height = 200, facing = 1, headForward = 0, roundShoulder = 0, slouch = 0, sway = 0, belly = 0, ankle = true, seed = 1 } = {}) {
    if (facing !== 1 && facing !== -1)
        throw new RangeError("facing must be -1 or 1");
    const f = facing, cx = 0.5 * width;
    const hip = [cx + f * sway, 0.58 * height], knee = [cx + f * 0.02 * width, 0.78 * height];
    const ank = [cx, 0.96 * height], shoulder = [cx + f * roundShoulder, 0.31 * height];
    const ear = [shoulder[0] + f * headForward, 0.19 * height];
    const neck = [shoulder[0] + 0.3 * (ear[0] - shoulder[0]), shoulder[1] + 0.3 * (ear[1] - shoulder[1])];
    const depth = 0.075 * width;
    const back = [shoulder[0] + 0.45 * (hip[0] - shoulder[0]) - f * (depth + slouch), shoulder[1] + 0.45 * (hip[1] - shoulder[1])];
    const torso = [
        [neck[0] - f * 0.03 * width, neck[1]], back, [hip[0] - f * 0.065 * width, hip[1] - 0.04 * height],
        [hip[0] - f * 0.06 * width, hip[1] + 0.03 * height], [hip[0] + f * 0.06 * width, hip[1] + 0.03 * height],
        [hip[0] + f * (0.07 * width + belly), hip[1] - 0.06 * height],
        [shoulder[0] + f * 0.075 * width, shoulder[1] + 0.06 * height], [neck[0] + f * 0.035 * width, neck[1]],
    ];
    const layers = [
        [capsule(width, height, hip, knee, 0.05 * width), CLOTH],
        [capsule(width, height, knee, ank, 0.04 * width), CLOTH],
        [polygon(width, height, torso, 4), CLOTH],
        [capsule(width, height, shoulder, [shoulder[0] + f * 0.01 * width, shoulder[1] + 0.25 * height], 0.03 * width), SKIN],
        [capsule(width, height, neck, ear, 0.03 * width), SKIN],
        [oval(width, height, ear[0] + f * 0.025 * width, ear[1] - 0.01 * height, 0.06 * height, 0.072 * height), SKIN],
    ];
    const { image, person } = paint(width, height, layers, seed);
    const points = { ear, neck_base: neck, shoulder, mid_back: back, hip, knee };
    if (ankle)
        points.ankle = ank;
    return { image, person, controls: makeControls("side", points, width, height, facing), grid: GRID,
        params: { view: "side", facing, head_forward: headForward, round_shoulder: roundShoulder, slouch, sway, belly, ankle, seed } };
}
/** The LS4 synthetic set, same as synthetic.cases() in Python. */
export function figureCases() {
    return [
        frontFigure({ lean: 4, shoulderDrop: 4, seed: 1 }),
        frontFigure({ lean: -3, shoulderDrop: -3, seed: 2 }),
        frontFigure({ lean: 6, shoulderDrop: 2, seed: 3, width: 150, height: 210 }),
        sideFigure({ headForward: 10, roundShoulder: 4, slouch: 4, sway: 5, belly: 3, seed: 4 }),
        sideFigure({ facing: -1, headForward: 2, roundShoulder: 12, slouch: 3, sway: 1, belly: 4, seed: 5 }),
        sideFigure({ headForward: 6, roundShoulder: 3, slouch: 5, sway: 6, belly: 2, ankle: false, seed: 6 }),
    ];
}
/** Body area from the control points alone (until the person segmenter is cleared): thick
 * capsules along the skeleton plus a head ellipse. Mirrors posture/render.approximate_person. */
export function approximatePerson(c) {
    const w = c.width, h = c.height, p = c.points;
    const t = c.view === "front"
        ? Math.hypot((p.right_hip[0] + p.left_hip[0]) / 2 - (p.right_shoulder[0] + p.left_shoulder[0]) / 2, (p.right_hip[1] + p.left_hip[1]) / 2 - (p.right_shoulder[1] + p.left_shoulder[1]) / 2)
        : Math.hypot(p.hip[0] - p.shoulder[0], p.hip[1] - p.shoulder[1]);
    const layers = [];
    if (c.view === "front") {
        const rs = p.right_shoulder, ls = p.left_shoulder, rh = p.right_hip, lh = p.left_hip;
        layers.push(polygon(w, h, [rs, ls, lh, rh], 2));
        for (const [a, b] of [[rs, ls], [rs, rh], [ls, lh], [rh, lh]])
            layers.push(capsule(w, h, a, b, 0.12 * t));
        layers.push(oval(w, h, (rs[0] + ls[0]) / 2, (rs[1] + ls[1]) / 2 - 0.45 * t, 0.22 * t, 0.28 * t));
    }
    else {
        const chain = ["ear", "neck_base", "shoulder", "mid_back", "hip", "knee", ...(p.ankle ? ["ankle"] : [])];
        for (let k = 0; k + 1 < chain.length; k++)
            layers.push(capsule(w, h, p[chain[k]], p[chain[k + 1]], 0.16 * t));
        layers.push(oval(w, h, p.ear[0], p.ear[1], 0.24 * t, 0.28 * t));
    }
    const out = floatImage(w, h, 1);
    for (const m of layers)
        for (let i = 0; i < out.data.length; i++)
            if (m.data[i] > out.data[i])
                out.data[i] = m.data[i];
    return out;
}
