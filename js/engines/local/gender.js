/** LS2: continuous feminine/masculine stylized face mesh recipes, seven stops.
 * Inspirations: FLAME, DECA, 3DDFA_V2 and OpenFace, concept only, no code copied.
 * Uses R4 contour loops, R5 pair/anatomy table and R6 E08 target geometry.
 * No demographic inference, scoring, YouCam requests or hidden network operations.
 * Author: John Khan.
 */
import { CONTOURS } from "../../data/regions/generated/topology.js";
import { LANDMARKS, REGION_PAIRS } from "../../data/face/generated/anatomy.js";
import { faceFrame, faceUV, checkFace, targetMesh } from "../shape/geometry.js";
import { GENDER } from "../shape/generated/gender.js";
import { regularizeTargets, PreparedNeighbourGraph } from "../warp/regularize.js";
import { EDGE_STRAIN_SHARE, regulariseTargets } from "../warp/turn-field.js";
export { GENDER };
export const STOPS = [-100, -66, -33, 0, 33, 66, 100];
export const REGIONS = ["jaw", "chin", "brows", "brow_ridge", "cheekbones", "nose", "lips", "eyes", "forehead"];
export const SCOPES = ["face_only", "full_look", "keep_my_hair"];
export const LABEL = "Masculine/feminine appearance simulation, not a measure of identity or sex.";
export const VERSION = "gender-p0-r13/1";
export const IDENTITY_PINS = [168, 468, 469, 470, 471, 472, 473, 474, 475, 476, 477];
export function bands(slider) {
    if (!(Number.isFinite(slider) && slider >= -100 && slider <= 100))
        throw new RangeError("slider must be -100..100");
    const data = slider > 0 ? GENDER.masculine : GENDER.feminine;
    const magnitude = Math.abs(slider), stops = GENDER.stops;
    let i = 1;
    while (i < stops.length - 1 && magnitude > stops[i])
        i++;
    const t = (magnitude - stops[i - 1]) / (stops[i] - stops[i - 1]);
    const out = {};
    for (const key of Object.keys(data)) {
        const values = data[key];
        out[key] = values[i - 1] * (1 - t) + values[i] * t;
    }
    return out;
}
export function validateOptions(options = {}) {
    const scope = options.scope ?? "face_only";
    if (!SCOPES.includes(scope))
        throw new RangeError("invalid gender scope");
    const factors = Object.fromEntries(REGIONS.map((r) => [r, 1]));
    for (const [key, value] of Object.entries(options.regionStrengths ?? {})) {
        if (!REGIONS.includes(key) || typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1.5) {
            throw new RangeError("unknown gender region or factor outside 0..1.5");
        }
        factors[key] = value;
    }
    return { factors, scope };
}
export function genderTargets(face, slider, options = {}) {
    return targets(face, slider, options);
}
/** Invocation-owned source graph and starter geometry for a candidate search.
 * The closure takes a source snapshot, exposes fresh outputs, and is discarded
 * when that render completes. Standalone targets retain the uncached reference. */
export function prepareGenderTargets(face, slider) {
    checkFace(face);
    bands(slider);
    const source = face.map(([x, y]) => [x, y]);
    const preparation = { graph: new PreparedNeighbourGraph(source, faceFrame(source).iod), starters: new Map() };
    return (options = {}) => targets(source, slider, options, preparation);
}
function targets(face, slider, options, preparation) {
    checkFace(face);
    const f = faceFrame(face), { factors, scope } = validateOptions(options), par = bands(slider);
    // E08 controls provide a geometry starter. The precise bands below use the same face frame.
    const controls = {
        chin_width: Math.max(-100, Math.min(100, par.chin_width_pct * 4.5 * factors.chin)),
        chin_length: Math.max(-100, Math.min(100, par.chin_height_fh * 11 * factors.chin)),
        cheek_fullness: Math.max(-100, Math.min(100, par.cheek_width_iod * 13 * factors.cheekbones)),
        forehead_height: Math.max(-100, Math.min(100, par.forehead_height_fh * 13 * factors.forehead)),
    };
    const key = Object.values(controls).join(",");
    let starter = preparation?.starters.get(key);
    if (!starter) {
        starter = targetMesh(face, controls, { spread: 0.12 });
        preparation?.starters.set(key, starter);
    }
    const dx = Float64Array.from(face.map((p, i) => starter[i][0] - p[0]));
    const dy = Float64Array.from(face.map((p, i) => starter[i][1] - p[1]));
    const faceWidth = Math.hypot(face[234][0] - face[454][0], face[234][1] - face[454][1]);
    const noseWidth = Math.hypot(face[129][0] - face[358][0], face[129][1] - face[358][1]);
    const add = (idx, u, v, factor) => {
        dx[idx] += (u * f.across[0] + v * f.down[0]) * factor;
        dy[idx] += (u * f.across[1] + v * f.down[1]) * factor;
    };
    for (const idx of CONTOURS.face_oval) {
        const [u, v] = faceUV(face[idx], f);
        if (v > 0.55) {
            const w = Math.exp(-0.5 * ((v - 0.71) / 0.19) ** 2);
            add(idx, (u > 0 ? 1 : -1) * faceWidth * par.jaw_width_fw / 200 * w, 0, factors.jaw);
        }
    }
    for (const ids of [CONTOURS.right_brow, CONTOURS.left_brow]) {
        const count = ids.length;
        ids.forEach((idx, k) => {
            const arch = Math.sin(Math.PI * k / (count - 1));
            add(idx, 0, -(par.brow_height_iod + par.brow_arch_iod * arch) / 100 * f.iod, factors.brows);
        });
    }
    for (const [right, left] of REGION_PAIRS.nose) {
        for (const idx of [right, left]) {
            const [u, v] = faceUV(face[idx], f);
            const width = v > 0.59 ? par.nose_width_pct : par.bridge_width_pct;
            add(idx, (u > 0 ? 1 : -1) * noseWidth * width / 200, 0, factors.nose);
        }
    }
    add(LANDMARKS.nose_tip, 0, -par.tip_lift_iod / 100 * f.iod, factors.nose);
    const mouth = [(face[13][0] + face[14][0]) / 2, (face[13][1] + face[14][1]) / 2];
    for (const idx of CONTOURS.lips_outer) {
        const localY = (face[idx][0] - mouth[0]) * f.down[0] + (face[idx][1] - mouth[1]) * f.down[1];
        add(idx, 0, localY * par.lip_height_pct / 100, factors.lips);
    }
    for (const idx of [61, 291]) {
        const [u] = faceUV(face[idx], f);
        add(idx, (u > 0 ? 1 : -1) * f.iod * par.mouth_width_iod / 100, 0, factors.lips);
    }
    for (const ids of [CONTOURS.right_eye, CONTOURS.left_eye]) {
        const centre = [ids.reduce((s, i) => s + face[i][0], 0) / ids.length,
            ids.reduce((s, i) => s + face[i][1], 0) / ids.length];
        for (const idx of ids) {
            const localY = (face[idx][0] - centre[0]) * f.down[0] + (face[idx][1] - centre[1]) * f.down[1];
            add(idx, 0, localY * par.eye_opening_pct / 100, factors.eyes);
        }
        add(ids[0], 0, -f.iod * Math.sin(par.eye_outer_tilt_deg * Math.PI / 180) * 0.45, factors.eyes);
    }
    for (const idx of CONTOURS.face_oval) {
        const [, v] = faceUV(face[idx], f);
        if (v > 0.74)
            add(idx, 0, f.length * par.face_length_fh / 100 * ((v - 0.74) / 0.26), factors.chin);
    }
    for (const idx of [152, 175])
        add(idx, 0, f.length * par.face_length_fh / 100, factors.chin);
    const limit = f.iod * 0.12;
    let max = 0, capped = 0;
    const requested = face.map(([x, y], i) => {
        const d = Math.hypot(dx[i], dy[i]), scale = d > limit ? limit / d : 1;
        if (scale < 1)
            capped++;
        const move = d * scale;
        max = Math.max(max, move);
        return [x + dx[i] * scale, y + dy[i] * scale];
    });
    // One direction-neutral local-spacing policy follows all nine contributions.
    const safety = regularizeTargets(face, requested, f.iod, IDENTITY_PINS, preparation?.graph);
    // R13: one strain rule for both directions (35% of the shortest adjacent edge).
    const strain = regulariseTargets(face, safety.points, f.iod, EDGE_STRAIN_SHARE, IDENTITY_PINS, true, preparation?.graph);
    const points = strain.points;
    max = Math.max(...points.map(([x, y], i) => Math.hypot(x - face[i][0], y - face[i][1])));
    const stop = slider === 0 ? "Original" : Math.abs(slider) === 33 ? "Normal" : Math.abs(slider) === 66 ? "Extra" : Math.abs(slider) === 100 ? "Hyper" : "Custom";
    return { points, report: { slider, stop, scope, styling_pending: scope !== "face_only", regions: factors,
            requested_bands: par, max_iod_percent: max / f.iod * 100,
            capped_landmarks: Math.max(capped, safety.report.capped_landmarks), target_safety: safety.report,
            strain: { requested_max: strain.requested_max, applied_max: strain.applied_max, capped_vertices: strain.capped_vertices,
                max_strain: strain.max_strain, retention: strain.retention },
            direction: slider === 0 ? "original" : slider > 0 ? "masculine" : "feminine",
            simulation: LABEL, validated_on_released_photos: false } };
}
//# sourceMappingURL=gender.js.map