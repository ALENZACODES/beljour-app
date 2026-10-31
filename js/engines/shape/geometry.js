/**
 * E08 face outline, jaw, chin and forehead: 15 controls, shareable signed recipes.
 * Face-mapping inspiration: 3DDFA_V2 (dense mesh fitting), FLAME (shape separated from
 * pose), DECA (parametric shape controls), face-alignment (face local frame).
 * concept only, no code copied. Index loops come from R4 topology; facial pairs and
 * midline from R5 anatomy. Own algorithms, no third-party weights or tables copied.
 * Mirrors api/plumb_api/engines/shape/geometry.py. Author: John Khan.
 */
import { CONTOURS } from "../../data/regions/generated/topology.js";
import { LANDMARKS, MIDLINE, REGION_PAIRS, MESH_POINTS } from "../../data/face/generated/anatomy.js";
import { floatImage, requireColour } from "../core/buffer.js";
import { apply, moveMagnitude } from "../warp/field.js";
import { anchorRing, layout, meshWarp } from "../warp/mesh.js";
import { deform } from "../warp/mls.js";
import { CONTROLS } from "./generated/controls.js";
export { CONTROLS };
export const VERSION = "shape-spike-r6/1";
export const SIMULATION = "Face shape simulation; results from one photo are not a prediction.";
const OVAL = CONTOURS.face_oval;
const CHANGED_THRESHOLD = 0.02;
export const MAX_IOD_SHARE = 0.12;
/** Image-pixel coordinates, not normalized MediaPipe outputs. No caller data is mutated. */
export function checkFace(face) {
    if (!Array.isArray(face) || face.length !== MESH_POINTS)
        throw new RangeError("face requires 478 pixel-space landmarks");
    for (const p of face) {
        if (!Array.isArray(p) || p.length !== 2 || !p.every((v) => Number.isFinite(v) && Math.abs(v) <= 1e6)) {
            throw new RangeError("face requires finite pixel-space [x,y] landmarks");
        }
    }
}
export function faceFrame(face) {
    checkFace(face);
    const top = face[LANDMARKS.mesh_top], chin = face[LANDMARKS.chin];
    const length = Math.hypot(chin[0] - top[0], chin[1] - top[1]);
    if (length < 1)
        throw new RangeError("face top and chin must be distinct");
    const down = [(chin[0] - top[0]) / length, (chin[1] - top[1]) / length];
    const across = [down[1], -down[0]];
    const a = face[LANDMARKS.right_pupil], b = face[LANDMARKS.left_pupil];
    const iod = Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (iod < 1)
        throw new RangeError("pupil distance must be at least one pixel");
    return { top, down, across, centre: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], length, iod };
}
export function faceUV(p, f) {
    return [(p[0] - f.centre[0]) * f.across[0] + (p[1] - f.centre[1]) * f.across[1],
        ((p[0] - f.top[0]) * f.down[0] + (p[1] - f.top[1]) * f.down[1]) / f.length];
}
/** Create anatomical memberships from the R4 contour and R5 pair tables. */
export function regionIndices(region, face, f) {
    const v = new Map(OVAL.map((id) => [id, faceUV(face[id], f)[1]]));
    const ids = new Set();
    const inBand = (lower, upper) => OVAL.forEach((i) => { const z = v.get(i); if (z >= lower && z <= upper)
        ids.add(i); });
    switch (region) {
        case "outline": return [...OVAL];
        case "outline_midline": return [...new Set([...OVAL, ...MIDLINE])].sort((a, b) => a - b);
        case "cheeks":
            inBand(0.33, 0.77);
            REGION_PAIRS.cheeks.forEach(([a, b]) => { ids.add(a); ids.add(b); });
            break;
        case "jaw":
        case "jaw_midline":
            inBand(0.55, Infinity);
            REGION_PAIRS.jaw.forEach(([a, b]) => { ids.add(a); ids.add(b); });
            if (region === "jaw_midline")
                MIDLINE.forEach((i) => { if (faceUV(face[i], f)[1] > 0.7)
                    ids.add(i); });
            break;
        case "chin":
        case "chin_midline":
            inBand(0.79, Infinity);
            if (region === "chin_midline")
                MIDLINE.forEach((i) => { if (faceUV(face[i], f)[1] > 0.85)
                    ids.add(i); });
            break;
        case "forehead":
        case "forehead_midline":
            inBand(-Infinity, 0.36);
            REGION_PAIRS.forehead.forEach(([a, b]) => { ids.add(a); ids.add(b); });
            if (region === "forehead_midline")
                MIDLINE.forEach((i) => { if (faceUV(face[i], f)[1] < 0.3)
                    ids.add(i); });
            break;
        default: throw new RangeError(`unknown shape region: ${region}`);
    }
    return [...ids].sort((a, b) => a - b);
}
/** Magnitudes are in local across/down coordinates, before multiplying the IOD cap. */
export function direction(mode, u, v, iod, side) {
    const sign = u > 1e-9 ? 1 : u < -1e-9 ? -1 : 0;
    switch (mode) {
        case "symmetric_x": return [sign * Math.min(1, Math.abs(u) / (0.2 * iod)), 0];
        case "length": return [0, (v - 0.5) * 2];
        case "puff": return [sign, -0.16];
        case "side_x": return [(side === "right" && u < 0 || side === "left" && u > 0) ? sign : 0, 0];
        case "corner": return [sign, -0.26];
        case "slope": return [0, Math.min(1, Math.abs(u) / iod)];
        case "jowl": return [sign, 0.30];
        case "lower_y": return [0, 1];
        case "projection": return [0.55, -0.20];
        case "pointed": return [-sign, 0.22];
        case "upper_y": return [0, -1];
        default: throw new RangeError("unsupported shape direction");
    }
}
function clampMove(dx, dy, limit) {
    const len = Math.hypot(dx, dy);
    return len > limit ? [dx * limit / len, dy * limit / len] : [dx, dy];
}
export function validateValues(values, opts = {}) {
    if (!values || typeof values !== "object" || Array.isArray(values))
        throw new RangeError("shape amounts must be an object");
    const strength = opts.strength ?? 1, spread = opts.spread ?? 0.22;
    if (!(Number.isFinite(strength) && strength >= 0 && strength <= 1 && Number.isFinite(spread) && spread >= 0 && spread <= 1)) {
        throw new RangeError("strength and spread must be [0, 1]");
    }
    for (const [id, value] of Object.entries(values)) {
        if (!CONTROLS.some((c) => c.id === id) || typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > 100) {
            throw new RangeError(`unknown or invalid shape amount: ${id}`);
        }
    }
    return { strength, spread };
}
/** The R6 E08 target builder: sparse anatomical handles, MLS similarity, anchor ring. */
export function targetMesh(face, values, options = {}) {
    checkFace(face);
    const { strength, spread } = validateValues(values, options), f = faceFrame(face);
    const deltaX = new Float64Array(face.length), deltaY = new Float64Array(face.length);
    for (const [key, amount] of Object.entries(values)) {
        if (!amount)
            continue;
        const spec = CONTROLS.find((c) => c.id === key);
        const side = "side" in spec ? spec.side : "none";
        const amplitude = amount / 100 * strength * spec.cap_iod / 100 * f.iod;
        for (const idx of regionIndices(spec.region, face, f)) {
            const [u, v] = faceUV(face[idx], f);
            if (side === "right" && u >= 0 || side === "left" && u <= 0)
                continue;
            const weight = Math.exp(-0.5 * ((v - spec.center_v) / spec.sigma_v) ** 2);
            if (weight < 0.025)
                continue;
            const [dx, dy] = direction(spec.mode, u, v, f.iod, side);
            deltaX[idx] += amplitude * weight * (dx * f.across[0] + dy * f.down[0]);
            deltaY[idx] += amplitude * weight * (dx * f.across[1] + dy * f.down[1]);
        }
    }
    const limit = f.iod * MAX_IOD_SHARE, changed = [];
    for (let i = 0; i < face.length; i++) {
        [deltaX[i], deltaY[i]] = clampMove(deltaX[i], deltaY[i], limit);
        if (Math.hypot(deltaX[i], deltaY[i]) > CHANGED_THRESHOLD)
            changed.push(i);
    }
    if (changed.length === 0)
        return face.map(([x, y]) => [x, y]);
    if (spread > 0) {
        const selected = new Set(changed);
        const stable = MIDLINE.filter((i) => !selected.has(i) && faceUV(face[i], f)[1] >= 0.30 && faceUV(face[i], f)[1] <= 0.76);
        const pins = anchorRing(face);
        const sources = [...changed.map((i) => face[i]), ...stable.map((i) => face[i]), ...pins];
        const targets = [...changed.map((i) => [face[i][0] + deltaX[i], face[i][1] + deltaY[i]]),
            ...stable.map((i) => face[i]), ...pins];
        // Duplicate pixel coordinates can occur in hand-entered fixture meshes; MLS forbids them.
        const uniq = [];
        for (let i = 0; i < sources.length; i++) {
            if (uniq.every((j) => (sources[i][0] - sources[j][0]) ** 2 + (sources[i][1] - sources[j][1]) ** 2 > 1e-8))
                uniq.push(i);
        }
        if (uniq.length >= 2) {
            const mapped = deform(face, uniq.map((i) => sources[i]), uniq.map((i) => targets[i]), "similarity");
            const radius = 0.30 * f.iod;
            for (let i = 0; i < face.length; i++) {
                if (selected.has(i))
                    continue;
                let distance = Infinity;
                for (const j of changed)
                    distance = Math.min(distance, Math.hypot(face[i][0] - face[j][0], face[i][1] - face[j][1]));
                const weight = Math.exp(-0.5 * (distance / radius) ** 2);
                if (weight > 0.03) {
                    const [dx, dy] = clampMove(mapped[i][0] - face[i][0], mapped[i][1] - face[i][1], limit);
                    deltaX[i] += spread * weight * dx;
                    deltaY[i] += spread * weight * dy;
                }
            }
        }
    }
    return face.map(([x, y], i) => [x + deltaX[i], y + deltaY[i]]);
}
export function displacement(face, target) {
    checkFace(face);
    checkFace(target);
    const iod = faceFrame(face).iod;
    let max = 0, sum = 0, count = 0;
    for (let i = 0; i < face.length; i++) {
        const d = Math.hypot(target[i][0] - face[i][0], target[i][1] - face[i][1]);
        max = Math.max(max, d);
        sum += d;
        if (d > CHANGED_THRESHOLD)
            count++;
    }
    return { max_iod_percent: max / iod * 100, mean_iod_percent: sum / face.length / iod * 100, moving_landmarks: count };
}
/** Composes R5 target generator, piecewise mesh warp, fold guard and edit mask. */
export function renderShape(image, face, values, options = {}) {
    requireColour(image);
    checkFace(face);
    const target0 = targetMesh(face, values, options), target = options.adjust ? options.adjust(target0) : target0;
    const asked = options.strength ?? 1;
    const moved = displacement(face, target);
    if (moved.max_iod_percent < 1e-9) {
        const editMask = floatImage(image.width, image.height, 1);
        return { image: { ...image, data: new Uint8Array(image.data) }, editMask, target, label: SIMULATION,
            metrics: { strength_used: asked, guard_scale: 1, min_area_ratio: 1, ...moved } };
    }
    const lay = options.lay ?? layout(face, image.width, image.height);
    const warp = meshWarp(image.width, image.height, face, target, { lay, guard: true });
    const movedField = moveMagnitude(warp.result.field), editMask = floatImage(image.width, image.height, 1);
    for (let i = 0; i < editMask.data.length; i++)
        editMask.data[i] = movedField.data[i] > 1e-6 ? 1 : 0;
    const actualTarget = face.map((p, i) => [p[0] + (target[i][0] - p[0]) * warp.strengthUsed,
        p[1] + (target[i][1] - p[1]) * warp.strengthUsed]);
    return { image: apply(image, warp.result.field), editMask, target: actualTarget, label: SIMULATION, field: warp.result.field,
        metrics: { strength_used: asked * warp.strengthUsed, guard_scale: warp.strengthUsed,
            min_area_ratio: warp.flips.minAreaRatio, ...displacement(face, actualTarget) } };
}
/** Contract-13 adapter for on-device face-shape photo simulations. */
export class ShapeEngine {
    version = VERSION;
    run(image, landmarks, _masks, params, _seed) {
        const flat = landmarks;
        if (!Array.isArray(flat))
            throw new RangeError("shape engine requires 478 pixel landmarks");
        const face = flat;
        const values = {};
        for (const spec of CONTROLS) {
            const v = params[spec.id];
            if (v !== undefined) {
                if (typeof v !== "number")
                    throw new RangeError(`${spec.id} must be a number`);
                values[spec.id] = v;
            }
        }
        for (const name of Object.keys(params))
            if (!CONTROLS.some((s) => s.id === name) && name !== "strength" && name !== "spread") {
                throw new RangeError(`unknown shape param: ${name}`);
            }
        const strength = params.strength ?? 1, spread = params.spread ?? 0.22;
        if (typeof strength !== "number" || typeof spread !== "number")
            throw new RangeError("strength and spread must be numbers");
        const result = renderShape(image, face, values, { strength, spread });
        return { image: result.image, editMask: result.editMask, metrics: result.metrics,
            provenance: "local", pipelineVersion: this.version };
    }
}
