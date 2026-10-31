/**
 * Face part controls of the 40-control set: nose, lips, eyes and brows.
 * Mirrors api/plumb_api/engines/shape/parts.py; shared vectors in api/tests/goldens/face-parts.json.
 *
 * A control moves its part in the face-aligned frame. Mesh points inside the part's hull
 * follow exactly, points in a margin around it follow with a smoothstep falloff, and a ring
 * of fixed pins sits outside the margin. Only the points inside the ring are triangulated,
 * so the R5 piecewise warp with its flip and raster Jacobian guard cannot change a pixel
 * outside the ring; unmoved pixels and the alpha channel are copied byte for byte. The
 * margin shrinks to stay clear of the other parts and the face outline; eye opening changes
 * at most 12% and no landmark moves more than 6% of the eye distance. Opt-in only.
 * Face-mapping inspiration: FLAME (named shape parameters) and 3DDFA_V2 (dense mesh driving
 * an image warp); concept only, no code copied. Mesh index layout: MediaPipe Face Landmarker
 * (runtime data). Author: John Khan.
 */
import { CONTOURS, IRISES } from "../../data/regions/generated/topology.js";
import { EYE_CLOSED_RATIO, EYE_LIDS, convexHull } from "../../data/regions/index.js";
import { LANDMARKS, MIDLINE, REGION_PAIRS } from "../../data/face/generated/anatomy.js";
import { requireColour } from "../core/buffer.js";
import { apply, moveMagnitude } from "../warp/field.js";
import { meshWarp } from "../warp/mesh.js";
import { delaunay } from "../warp/triangulate.js";
import { checkFace, faceFrame } from "./geometry.js";
import { PART_SPEC } from "./generated/parts.js";
export { PART_SPEC };
export const VERSION = "face-parts/1";
export const SIMULATION = "Face part simulation; results from one photo are not a prediction.";
export const CONTROLS = PART_SPEC.controls;
export const RING_FACTOR = 1.25; // ASSUMED, as parts.py
export const LAYOUT_FACTOR = 1.1; // ASSUMED
export const CLEARANCE = 0.95; // ASSUMED
export const MIN_MARGIN_IOD = 0.025; // ASSUMED
export const MIN_PART_IOD = 0.05; // ASSUMED
export const MAX_MOVE_IOD = 0.06; // ASSUMED
export const APERTURE_CAP = 0.12; // feature 41: +12%; the -12% floor is ASSUMED
export const BAND_SOFT = 0.2; // ASSUMED
export const IDENTITY_MINIMUM = 0.99; // ASSUMED
export const MIN_STRENGTH = 0.05; // shape_guard.py MIN_STRENGTH
export const GEOMETRY_TAU = 0.03; // arena/identity.py GEOMETRY_TAU
const ARC_STEP = Math.PI / 8, MOVED = 1e-9;
export const REFUSALS = {
    not_opted_in: "Face part previews are opt-in. Turn them on to see one.",
    part_too_small: "This part is too small in the photo to preview reliably. Use a closer photo.",
    part_outside_photo: "Part of this feature lies outside the photo.",
    part_crowded: "Another feature sits too close to this one to change it on its own.",
    eye_closed: "This eye looks closed, so its size cannot be previewed.",
    fold_guard: "This change would fold the photo, so it was not applied.",
    identity_guard: "This change moved features it must leave alone, so it was not applied.",
};
/** A coded refusal: the photo and part cannot take this change; the original is kept. */
export class PartRefusal extends RangeError {
    code;
    part;
    constructor(code, part) {
        super(REFUSALS[code]);
        this.code = code;
        this.part = part;
        this.name = "PartRefusal";
    }
    toJSON() {
        return { module: "face_parts", refused: true, reason_code: this.code, part: this.part, message: this.message };
    }
}
const L = LANDMARKS;
const NOSE_MIDLINE = MIDLINE.slice(MIDLINE.indexOf(L.nasion), MIDLINE.indexOf(L.subnasale) + 1);
const NOSE_CORE = [...NOSE_MIDLINE, ...REGION_PAIRS.nose.flat()];
const IRIS_IDS = { right: [IRISES.right_iris[0], ...IRISES.right_iris[1]], left: [IRISES.left_iris[0], ...IRISES.left_iris[1]] };
export const INSTANCES = [
    ["brows", "right", CONTOURS.right_brow], ["brows", "left", CONTOURS.left_brow],
    ["eyes", "right", [...CONTOURS.right_eye, ...IRIS_IDS.right]], ["eyes", "left", [...CONTOURS.left_eye, ...IRIS_IDS.left]],
    ["nose", "centre", NOSE_CORE], ["lips", "centre", CONTOURS.lips_outer],
];
/** arena/identity.py PROTECTED["young"]: landmarks a part edit must leave in place. */
export const IDENTITY_IDS = [L.right_eye_outer, L.right_eye_inner, L.left_eye_inner, L.left_eye_outer,
    L.right_pupil, L.left_pupil, L.nasion, L.nose_tip, L.subnasale, L.right_ala, L.left_ala, L.right_mouth, L.left_mouth];
export function smoothstep(x) {
    const z = Math.min(1, Math.max(0, x));
    return z * z * (3 - 2 * z);
}
function hullArea(hull) {
    let sum = 0;
    for (let i = 0; i < hull.length; i++) {
        const a = hull[i], b = hull[(i + 1) % hull.length];
        sum += a[0] * b[1] - a[1] * b[0];
    }
    return sum / 2;
}
/** Distance to the convex hull, zero inside. */
export function hullDistance(hull, p) {
    let inside = true, best = Infinity;
    for (let i = 0; i < hull.length; i++) {
        const a = hull[i], b = hull[(i + 1) % hull.length], ex = b[0] - a[0], ey = b[1] - a[1];
        if (ex * (p[1] - a[1]) - ey * (p[0] - a[0]) < -1e-12)
            inside = false;
        const t = Math.min(1, Math.max(0, ((p[0] - a[0]) * ex + (p[1] - a[1]) * ey) / (ex * ex + ey * ey)));
        best = Math.min(best, Math.hypot(p[0] - a[0] - t * ex, p[1] - a[1] - t * ey));
    }
    return inside ? 0 : best;
}
/** The hull grown by `radius`: arcs at its corners and offset edges between them. */
export function dilatedRing(hull, radius) {
    const n = hull.length, normals = [];
    for (let i = 0; i < n; i++) {
        const ex = hull[(i + 1) % n][0] - hull[i][0], ey = hull[(i + 1) % n][1] - hull[i][1], len = Math.hypot(ex, ey);
        normals.push([ey / len, -ex / len]);
    }
    const out = [];
    for (let i = 0; i < n; i++) {
        const [vx, vy] = hull[i], prev = normals[(i - 1 + n) % n], next = normals[i];
        const a0 = Math.atan2(prev[1], prev[0]);
        let delta = Math.atan2(next[1], next[0]) - a0;
        while (delta <= -Math.PI)
            delta += 2 * Math.PI;
        while (delta > Math.PI)
            delta -= 2 * Math.PI;
        const k = Math.max(1, Math.ceil(Math.abs(delta) / ARC_STEP - 1e-9));
        for (let j = 0; j <= k; j++) {
            const angle = a0 + delta * j / k;
            out.push([vx + radius * Math.cos(angle), vy + radius * Math.sin(angle)]);
        }
        const [wx, wy] = hull[(i + 1) % n], steps = Math.ceil(Math.hypot(wx - vx, wy - vy) / radius - 1e-9);
        for (let j = 1; j < steps; j++)
            out.push([vx + (wx - vx) * j / steps + radius * next[0], vy + (wy - vy) * j / steps + radius * next[1]]);
    }
    const kept = [];
    for (const p of out)
        if (!kept.length || Math.hypot(p[0] - kept[kept.length - 1][0], p[1] - kept[kept.length - 1][1]) > 1e-9)
            kept.push(p);
    if (kept.length > 1 && Math.hypot(kept[0][0] - kept[kept.length - 1][0], kept[0][1] - kept[kept.length - 1][1]) <= 1e-9)
        kept.pop();
    return kept;
}
export function validateValues(values, strength) {
    if (typeof strength !== "number" || !Number.isFinite(strength) || strength < 0 || strength > 1)
        throw new RangeError("strength must be in [0,1]");
    if (!values || typeof values !== "object" || Array.isArray(values))
        throw new RangeError("part amounts must be an object");
    for (const [id, value] of Object.entries(values)) {
        if (!CONTROLS.some((c) => c.id === id) || typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > 100) {
            throw new RangeError(`unknown or invalid part amount: ${id}`);
        }
    }
}
function protectedIds(part, side) {
    const own = new Set(INSTANCES.find(([p, s]) => p === part && s === side)[2]);
    const ids = new Set(CONTOURS.face_oval);
    for (const [p, s, core] of INSTANCES)
        if (p !== part || s !== side)
            core.forEach((i) => ids.add(i));
    return [...ids].filter((i) => !own.has(i)).sort((a, b) => a - b);
}
export function partRegion(face, f, part, side, core) {
    const hull = convexHull(core.map((i) => face[i]));
    let extent = 0;
    if (hull.length >= 3) {
        const xs = hull.map((p) => p[0]), ys = hull.map((p) => p[1]);
        extent = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    }
    if (hull.length < 3 || hullArea(hull) <= 1e-9 || extent < MIN_PART_IOD * f.iod)
        throw new PartRefusal("part_too_small", part);
    const nominal = PART_SPEC.parts[part].margin_iod * f.iod;
    let nearest = Infinity;
    for (const i of protectedIds(part, side))
        nearest = Math.min(nearest, hullDistance(hull, face[i]));
    const margin = Math.min(nominal, CLEARANCE * nearest / RING_FACTOR);
    if (margin < MIN_MARGIN_IOD * f.iod)
        throw new PartRefusal("part_crowded", part);
    return { part, side, core, hull, margin, ring: dilatedRing(hull, RING_FACTOR * margin) };
}
function anchorPoint(face, part, side, name, core) {
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    if (part === "nose")
        return name === "top" ? face[L.nasion] : face[L.nose_tip];
    if (part === "lips")
        return name === "mouth_line" ? mid(face[L.stomion_upper], face[L.stomion_lower]) : mid(face[L.right_mouth], face[L.left_mouth]);
    if (part === "eyes")
        return face[side === "right" ? L.right_pupil : L.left_pupil];
    let x = 0, y = 0;
    for (const i of core) {
        x += face[i][0];
        y += face[i][1];
    }
    return [x / core.length, y / core.length];
}
function band(x, lo, hi) {
    let out = 1;
    if (lo > 0)
        out *= smoothstep((x - (lo - BAND_SOFT)) / BAND_SOFT);
    if (hi < 1)
        out *= 1 - smoothstep((x - hi) / BAND_SOFT);
    return out;
}
function span(values) {
    const lo = Math.min(...values), hi = Math.max(...values);
    return [lo, Math.max(hi - lo, 1e-9)];
}
/** Unweighted motion of every mesh point for one control at a signed -100..100 amount. */
export function controlDisplacement(face, f, region, control, amount) {
    const { part, side, core } = region, c = amount / 100 * control.cap;
    const anchor = anchorPoint(face, part, side, control.anchor, core);
    const [ax, ay] = f.across, [dx, dy] = f.down;
    const s = face.map((p) => (p[0] - anchor[0]) * ax + (p[1] - anchor[1]) * ay);
    const t = face.map((p) => (p[0] - anchor[0]) * dx + (p[1] - anchor[1]) * dy);
    const half = Math.max(Math.max(...core.map((i) => Math.abs(s[i]))), 1e-9);
    const [tLo, tSpan] = span(core.map((i) => t[i]));
    const out = side === "right" ? -1 : 1; // outward, toward the brow tail
    const u = face.map((p) => (p[0] - anchor[0]) * ax * out + (p[1] - anchor[1]) * ay * out);
    const [uLo, uSpan] = span(core.map((i) => u[i]));
    const lift = -c / 100 * f.iod;
    return face.map((_, i) => {
        let profile = 1;
        if ("band_t" in control)
            profile *= band((t[i] - tLo) / tSpan, control.band_t[0], control.band_t[1]);
        if ("band_s" in control)
            profile *= 1 - smoothstep((Math.abs(s[i]) / half - control.band_s) / BAND_SOFT);
        if ("half" in control)
            profile *= control.half === "upper" ? (t[i] <= 0 ? 1 : 0) : (t[i] >= 0 ? 1 : 0);
        let across = 0, down = 0;
        switch (control.mode) {
            case "scale_x":
                across = c * s[i];
                break;
            case "scale_y":
                down = c * t[i];
                break;
            case "scale":
                across = c * s[i];
                down = c * t[i];
                break;
            case "shift_y":
                down = lift;
                break;
            case "corner_y":
                down = lift * Math.min(1, (s[i] / half) ** 2);
                break;
            case "tail_y": {
                const v = Math.min(1, Math.max(0, (u[i] - uLo) / uSpan));
                down = lift * v * v;
                break;
            }
            case "arch_y": {
                const v = Math.min(1, Math.max(0, (u[i] - uLo) / uSpan)), peak = control.peak, width = v <= peak ? peak : 1 - peak;
                down = lift * Math.min(1, Math.max(0, 1 - ((v - peak) / width) ** 2));
                break;
            }
            default: throw new RangeError("unknown part mode");
        }
        return [(across * profile) * ax + (down * profile) * dx, (across * profile) * ay + (down * profile) * dy];
    });
}
function aperture(points, side) {
    const [a, b] = EYE_LIDS[side];
    return Math.hypot(points[a][0] - points[b][0], points[a][1] - points[b][1]);
}
function apertureScale(face, move, side) {
    const [a, b] = EYE_LIDS[side];
    const v = [face[a][0] - face[b][0], face[a][1] - face[b][1]], w = [move[a][0] - move[b][0], move[a][1] - move[b][1]];
    const before2 = v[0] * v[0] + v[1] * v[1], after2 = (v[0] + w[0]) ** 2 + (v[1] + w[1]) ** 2;
    const limit = after2 >= before2 ? 1 + APERTURE_CAP : 1 - APERTURE_CAP;
    if (Math.abs(Math.sqrt(after2 / before2) - 1) <= APERTURE_CAP)
        return 1;
    const qa = w[0] * w[0] + w[1] * w[1], qb = 2 * (v[0] * w[0] + v[1] * w[1]), qc = before2 * (1 - limit * limit);
    const disc = Math.max(qb * qb - 4 * qa * qc, 0);
    const roots = [(-qb + Math.sqrt(disc)) / (2 * qa), (-qb - Math.sqrt(disc)) / (2 * qa)].filter((r) => r >= 0 && r <= 1);
    return roots.length ? Math.min(...roots) : 0;
}
/** Capped landmark motion per part (brows, eyes, nose, lips); no pixels yet. */
export function planParts(face, values, strength = 1) {
    checkFace(face);
    validateValues(values, strength);
    const f = faceFrame(face), plans = [];
    const active = new Map(Object.entries(values).filter(([, v]) => Math.abs(v) > 1e-12));
    for (const [part, side, core] of INSTANCES) {
        const chosen = CONTROLS.filter((c) => active.has(c.id) && c.part === part);
        if (!chosen.length || strength === 0)
            continue;
        const region = partRegion(face, f, part, side, core);
        const raw = face.map(() => [0, 0]);
        for (const control of chosen) {
            controlDisplacement(face, f, region, control, active.get(control.id)).forEach(([x, y], i) => { raw[i][0] += x; raw[i][1] += y; });
        }
        let move = face.map((p, i) => {
            const w = 1 - smoothstep(hullDistance(region.hull, p) / region.margin);
            return [raw[i][0] * w, raw[i][1] * w];
        });
        let scale = 1, before = null, after = null;
        if (part === "eyes") {
            const eye = side;
            before = aperture(face, eye);
            const [, , outer, inner] = EYE_LIDS[eye];
            if (before < EYE_CLOSED_RATIO * Math.hypot(face[outer][0] - face[inner][0], face[outer][1] - face[inner][1]))
                throw new PartRefusal("eye_closed", part);
            scale = apertureScale(face, move, eye);
        }
        const largest = Math.max(...move.map(([x, y]) => Math.hypot(x, y))) * scale;
        if (largest > MAX_MOVE_IOD * f.iod)
            scale *= MAX_MOVE_IOD * f.iod / largest;
        move = move.map(([x, y]) => [x * (scale * strength), y * (scale * strength)]);
        if (part === "eyes")
            after = aperture(face.map((p, i) => [p[0] + move[i][0], p[1] + move[i][1]]), side);
        plans.push({ region, displacement: move, capScale: scale, apertureBefore: before, apertureAfter: after });
    }
    return plans;
}
/** Requested 478-point targets before the fold guard; the input is not changed. */
export function targetMesh(face, values, strength = 1) {
    const out = face.map(([x, y]) => [x, y]);
    for (const plan of planParts(face, values, strength))
        plan.displacement.forEach(([x, y], i) => { out[i][0] += x; out[i][1] += y; });
    return out.map(([x, y]) => [x, y]);
}
/** Mesh points near the part and its fixed ring, triangulated on their own. */
export function localLayout(current, plan) {
    const { region } = plan, chosen = [];
    current.forEach((p, i) => {
        if (hullDistance(region.hull, p) < LAYOUT_FACTOR * region.margin
            && chosen.every((j) => Math.hypot(p[0] - current[j][0], p[1] - current[j][1]) > 1e-6))
            chosen.push(i);
    });
    const points = [...chosen.map((i) => current[i]), ...region.ring];
    return { chosen, lay: { points, meshCount: chosen.length, triangles: delaunay(points) } };
}
/** Proxy geometry similarity of the landmarks outside every edited part (1 = unmoved). */
export function identitySimilarity(before, after, parts) {
    const touched = new Set();
    for (const [p, , core] of INSTANCES)
        if (parts.includes(p))
            core.forEach((i) => touched.add(i));
    const ids = IDENTITY_IDS.filter((i) => !touched.has(i));
    if (ids.length < 2)
        return 1;
    const signature = (pts) => {
        const iod = Math.hypot(pts[L.left_pupil][0] - pts[L.right_pupil][0], pts[L.left_pupil][1] - pts[L.right_pupil][1]);
        if (!(iod > 0))
            throw new RangeError("pupils must be apart");
        const out = [];
        for (let i = 0; i < ids.length; i++)
            for (let j = i + 1; j < ids.length; j++) {
                out.push(Math.hypot(pts[ids[i]][0] - pts[ids[j]][0], pts[ids[i]][1] - pts[ids[j]][1]) / iod);
            }
        return out;
    };
    const a = signature(before), b = signature(after);
    const rms = Math.sqrt(a.reduce((sum, v, i) => sum + (v - b[i]) ** 2, 0) / a.length);
    return Math.exp(-rms / GEOMETRY_TAU);
}
function labelsFor(parts) {
    return [SIMULATION, ...parts.map((p) => PART_SPEC.parts[p].label)];
}
/** Guarded local preview. Throws a coded `PartRefusal` rather than returning a bad picture. */
export function renderParts(image, face, values, { strength = 1, optedIn = false } = {}) {
    requireColour(image);
    checkFace(face);
    validateValues(values, strength);
    const { width, height, channels } = image;
    const copy = () => ({ ...image, data: new Uint8Array(image.data) });
    const base = { strengthRequested: strength, strengthUsed: strength, guardScale: 1, changedPixels: 0, maxMoveIodPercent: 0,
        identitySimilarity: 1, minJacobian: 1, minAreaRatio: 1, apertureChangePercent: {}, parts: [] };
    if (strength === 0 || Object.values(values).every((v) => Math.abs(v) <= 1e-12)) {
        return { image: copy(), targets: face.map(([x, y]) => [x, y]), changed: new Uint8Array(width * height), plans: [], labels: [SIMULATION], metrics: base };
    }
    if (optedIn !== true)
        throw new PartRefusal("not_opted_in", "all");
    const plans = planParts(face, values, strength);
    for (const plan of plans) {
        if (plan.region.core.some((i) => face[i][0] < 0 || face[i][1] < 0 || face[i][0] > width - 1 || face[i][1] > height - 1)) {
            throw new PartRefusal("part_outside_photo", plan.region.part);
        }
    }
    let current = face.map(([x, y]) => [x, y]);
    const output = copy(), changed = new Uint8Array(width * height), rows = [];
    for (const plan of plans) {
        const { chosen, lay } = localLayout(current, plan);
        const before = chosen.map((i) => current[i]);
        const after = chosen.map((i) => [current[i][0] + plan.displacement[i][0], current[i][1] + plan.displacement[i][1]]);
        const warp = meshWarp(width, height, before, after, { lay });
        if (warp.strengthUsed < MIN_STRENGTH)
            throw new PartRefusal("fold_guard", plan.region.part);
        const move = moveMagnitude(warp.result.field), warped = apply(output, warp.result.field);
        for (let i = 0; i < move.data.length; i++) {
            if (move.data[i] <= MOVED)
                continue;
            changed[i] = 1;
            for (let c = 0; c < 3; c++)
                output.data[i * channels + c] = warped.data[i * channels + c];
        }
        current = current.map((p, i) => [p[0] + plan.displacement[i][0] * warp.strengthUsed, p[1] + plan.displacement[i][1] * warp.strengthUsed]);
        rows.push({ part: plan.region.part, side: plan.region.side, marginPx: plan.region.margin, guardScale: warp.strengthUsed,
            capScale: plan.capScale, minAreaRatio: warp.flips.minAreaRatio, minJacobian: warp.jacobian.minDet, guardReason: warp.guardReason });
    }
    if (channels === 4)
        for (let i = 0; i < width * height; i++)
            output.data[i * 4 + 3] = image.data[i * 4 + 3];
    const parts = [...new Set(plans.map((p) => p.region.part))];
    const similarity = identitySimilarity(face, current, parts);
    if (similarity < IDENTITY_MINIMUM)
        throw new PartRefusal("identity_guard", parts.join(","));
    const iod = faceFrame(face).iod;
    let maxMove = 0, changedPixels = 0;
    current.forEach((p, i) => { maxMove = Math.max(maxMove, Math.hypot(p[0] - face[i][0], p[1] - face[i][1])); });
    changed.forEach((v) => { changedPixels += v; });
    const apertureChangePercent = {};
    for (const side of ["right", "left"]) {
        if (plans.some((p) => p.region.part === "eyes" && p.region.side === side))
            apertureChangePercent[side] = (aperture(current, side) / aperture(face, side) - 1) * 100;
    }
    const guard = Math.min(...rows.map((r) => r.guardScale));
    return { image: output, targets: current, changed, plans, labels: labelsFor(parts),
        metrics: { strengthRequested: strength, strengthUsed: strength * guard, guardScale: guard, changedPixels,
            maxMoveIodPercent: maxMove / iod * 100, identitySimilarity: similarity, minJacobian: Math.min(...rows.map((r) => r.minJacobian)),
            minAreaRatio: Math.min(...rows.map((r) => r.minAreaRatio)), apertureChangePercent, parts: rows } };
}
