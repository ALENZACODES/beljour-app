/**
 * E10 symmetry analysis on the 478-point mesh (mirrors api/plumb_api/engines/proportions/symmetry.py).
 *
 * Midline = principal axis of the midline landmarks. Each [right, left] pair: the right point
 * is mirrored across the midline and compared with its partner, split into across / along
 * components in IOD (inter-pupil distance). Regions report mean offset sizes: a descriptive
 * asymmetry map, never a score. `targets` moves pairs toward mirror images by `strength`
 * (offsets shrink by exactly 1 - strength) and `controls` turns that into E06 warp handles.
 * Face-mapping credits (licences.json "concepts"): runtime data from MediaPipe Face
 * Landmarker (Bucket A); concept only, no code copied: OpenFace and dlib (left/right pairs by
 * facial part), InsightFace (comparing faces in a normalised frame) and Farkas anthropometry
 * (midline and paired measurements), from publications and docs.
 *
 * Author: John Khan.
 */
import { LANDMARKS, MESH_POINTS, MIDLINE, REGION_PAIRS, SYMMETRY_REGIONS } from "../../data/face/generated/anatomy.js";
export const SIDES = ["average", "right", "left"];
export const FACING_LIMIT = 0.08;
export function checkMesh(points, minimum = 468) {
    if (!Array.isArray(points) || points.length < minimum || points.length > MESH_POINTS) {
        throw new RangeError(`need a face mesh of ${minimum} to ${MESH_POINTS} (x, y) points`);
    }
    for (const p of points)
        if (!Number.isFinite(p[0]) || !Number.isFinite(p[1]))
            throw new RangeError("landmarks must be finite");
}
/** Normalised MediaPipe landmarks ({x, y} in 0..1) to pixel points. */
export function toPixels(points, width, height) {
    return points.map((p) => [p.x * width, p.y * height]);
}
export function fitMidline(points) {
    checkMesh(points);
    const mid = MIDLINE.map((i) => points[i]);
    let cx = 0, cy = 0;
    for (const [x, y] of mid) {
        cx += x;
        cy += y;
    }
    cx /= mid.length;
    cy /= mid.length;
    let sxx = 0, syy = 0, sxy = 0;
    for (const [x, y] of mid) {
        sxx += (x - cx) ** 2;
        syy += (y - cy) ** 2;
        sxy += (x - cx) * (y - cy);
    }
    const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    let dx = Math.cos(theta), dy = Math.sin(theta);
    if (dy < 0) {
        dx = -dx;
        dy = -dy;
    }
    return { cx, cy, dx, dy };
}
export function reflect(p, line) {
    const along = (p[0] - line.cx) * line.dx + (p[1] - line.cy) * line.dy;
    return [2 * (line.cx + along * line.dx) - p[0], 2 * (line.cy + along * line.dy) - p[1]];
}
export function project(p, line) {
    const along = (p[0] - line.cx) * line.dx + (p[1] - line.cy) * line.dy;
    return [line.cx + along * line.dx, line.cy + along * line.dy];
}
/** [across, along] components of a vector; across runs from the subject's right to left. */
export function frame(v, line) {
    return [v[0] * line.dy - v[1] * line.dx, v[0] * line.dx + v[1] * line.dy];
}
export const tiltDegrees = (line) => (Math.atan2(line.dx, line.dy) * 180) / Math.PI;
export function interocular(points) {
    checkMesh(points);
    let a, b;
    if (points.length >= MESH_POINTS) {
        a = points[LANDMARKS.right_pupil];
        b = points[LANDMARKS.left_pupil];
    }
    else {
        a = [(points[33][0] + points[133][0]) / 2, (points[33][1] + points[133][1]) / 2];
        b = [(points[362][0] + points[263][0]) / 2, (points[362][1] + points[263][1]) / 2];
    }
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!(d > 1e-9))
        throw new RangeError("the eyes coincide; the mesh is degenerate");
    return d;
}
function chosen(regions) {
    const list = regions ? [...regions] : [...SYMMETRY_REGIONS];
    if (!list.length || list.some((r) => !SYMMETRY_REGIONS.includes(r)))
        throw new RangeError(`regions must be among ${SYMMETRY_REGIONS.join(", ")}`);
    return list;
}
export function yawShare(points, line) {
    const at = (i) => frame([points[i][0] - line.cx, points[i][1] - line.cy], line)[0];
    const r = at(LANDMARKS.right_face_edge), l = at(LANDMARKS.left_face_edge), nose = at(LANDMARKS.nose_tip);
    const width = Math.abs(l - r);
    if (!(width > 1e-9))
        throw new RangeError("the face has no width; the mesh is degenerate");
    return (nose - (r + l) / 2) / width;
}
export function analyse(points, regions) {
    checkMesh(points);
    const line = fitMidline(points), iod = interocular(points);
    let spread = 0;
    for (const i of MIDLINE)
        spread += frame([points[i][0] - line.cx, points[i][1] - line.cy], line)[0] ** 2;
    const midlineSpread = Math.sqrt(spread / MIDLINE.length) / iod;
    const out = [], pairs = [];
    for (const name of chosen(regions)) {
        let sum = 0, max = 0, across = 0, along = 0;
        const table = REGION_PAIRS[name];
        for (const [r, l] of table) {
            const m = reflect(points[r], line);
            const [a, b] = frame([m[0] - points[l][0], m[1] - points[l][1]], line);
            const ai = a / iod, bi = b / iod, size = Math.hypot(ai, bi);
            sum += size;
            max = Math.max(max, size);
            across += ai;
            along += bi;
            pairs.push({ right: r, left: l, across: ai, along: bi, size });
        }
        const n = table.length;
        out.push({ name, pairs: n, mean: sum / n, max, across: across / n, along: along / n });
    }
    const yaw = yawShare(points, line);
    return { midline: line, tiltDegrees: tiltDegrees(line), iod, midlineSpread, regions: out, pairs,
        mean: out.reduce((s, r) => s + r.mean, 0) / out.length, yawShare: yaw, facingCamera: Math.abs(yaw) < FACING_LIMIT };
}
/** Points moved toward mirror symmetry by `strength` (0 = unchanged, 1 = mirrored). */
export function targets(points, strength, { side = "average", regions, midline = true } = {}) {
    checkMesh(points);
    if (!(Number.isFinite(strength) && strength >= 0 && strength <= 1))
        throw new RangeError("strength must be in [0, 1]");
    if (!SIDES.includes(side))
        throw new RangeError(`side must be one of ${SIDES.join(", ")}`);
    const line = fitMidline(points);
    const out = points.map((p) => [p[0], p[1]]);
    const toward = (p, q, s) => [p[0] + s * (q[0] - p[0]), p[1] + s * (q[1] - p[1])];
    for (const name of chosen(regions)) {
        for (const [r, l] of REGION_PAIRS[name]) {
            const mr = reflect(points[r], line), ml = reflect(points[l], line);
            if (side === "average") {
                out[r] = toward(points[r], ml, strength / 2);
                out[l] = toward(points[l], mr, strength / 2);
            }
            else if (side === "right")
                out[l] = toward(points[l], mr, strength);
            else
                out[r] = toward(points[r], ml, strength);
        }
    }
    if (midline)
        for (const i of MIDLINE)
            out[i] = toward(points[i], project(points[i], line), strength);
    return out;
}
/** [from, to, indices] of the points that moved more than `minMove` px: E06 warp handles. */
export function controls(before, after, minMove = 0.05) {
    checkMesh(before);
    checkMesh(after);
    if (before.length !== after.length)
        throw new RangeError("before and after must be the same mesh");
    const from = [], to = [], indices = [];
    before.forEach((p, i) => {
        if (Math.hypot(after[i][0] - p[0], after[i][1] - p[1]) > minMove) {
            from.push(p);
            to.push(after[i]);
            indices.push(i);
        }
    });
    return { from, to, indices };
}
/** R13 gate 9: no target moves a point more than 15% of the eye distance, and turned
 * (|yaw| > 15 deg) or tilted (|roll| > 10 deg) heads are refused with a reason.
 * Mirrors safe_targets in api/plumb_api/engines/proportions/symmetry.py. */
export const MAX_TARGET_MOVE_IOD = 0.15;
export const YAW_LIMIT_DEGREES = 15;
export const ROLL_LIMIT_DEGREES = 10;
/** ASSUMED nose depth as a share of face width when no depth is supplied. */
export const NOSE_DEPTH_SHARE = 0.33;
/** [yaw, roll] in degrees from the mesh; depth is used when every point has a finite z. */
export function headAngles(points) {
    const flat = points.map((p) => [p[0], p[1]]);
    checkMesh(flat);
    let a, b;
    if (flat.length >= MESH_POINTS) {
        a = flat[LANDMARKS.right_pupil];
        b = flat[LANDMARKS.left_pupil];
    }
    else {
        a = [(flat[33][0] + flat[133][0]) / 2, (flat[33][1] + flat[133][1]) / 2];
        b = [(flat[362][0] + flat[263][0]) / 2, (flat[362][1] + flat[263][1]) / 2];
    }
    const roll = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
    const line = fitMidline(flat);
    const hasDepth = points.every((p) => p.length >= 3 && Number.isFinite(p[2]));
    let yaw;
    if (hasDepth) {
        const r = points[LANDMARKS.right_face_edge], l = points[LANDMARKS.left_face_edge];
        const [across] = frame([l[0] - r[0], l[1] - r[1]], line);
        yaw = Math.atan2(l[2] - r[2], across) * 180 / Math.PI;
    }
    else {
        const share = yawShare(flat, line);
        yaw = Math.asin(Math.max(-1, Math.min(1, share / NOSE_DEPTH_SHARE))) * 180 / Math.PI;
    }
    return [yaw, roll];
}
/** Production symmetry targets: head-angle gated, the whole move field capped at 15% IOD. */
export function safeTargets(points, strength, options = {}) {
    const flat = points.map((p) => [p[0], p[1]]);
    checkMesh(flat);
    if (!(Number.isFinite(strength) && strength >= 0 && strength <= 1))
        throw new RangeError("strength must be in [0, 1]");
    const iod = interocular(flat);
    const [yaw, roll] = headAngles(points);
    const same = (reason, refused, scale) => ({
        points: flat.map((p) => [p[0], p[1]]), refused, reason, yawDegrees: yaw, rollDegrees: roll,
        scale, maxMoveIod: 0, rawMaxMoveIod: 0
    });
    if (Math.abs(yaw) > YAW_LIMIT_DEGREES)
        return same("head_turned", true, 0);
    if (Math.abs(roll) > ROLL_LIMIT_DEGREES)
        return same("head_tilted", true, 0);
    const moved = targets(flat, strength, options);
    let rawMax = 0;
    moved.forEach((p, i) => { rawMax = Math.max(rawMax, Math.hypot(p[0] - flat[i][0], p[1] - flat[i][1])); });
    rawMax /= iod;
    if (!(rawMax > 0))
        return same("no_movement", false, 1);
    const scale = rawMax > MAX_TARGET_MOVE_IOD ? MAX_TARGET_MOVE_IOD * (1 - 1e-9) / rawMax : 1;
    const out = moved.map((p, i) => [flat[i][0] + (p[0] - flat[i][0]) * scale, flat[i][1] + (p[1] - flat[i][1]) * scale]);
    let final = 0;
    out.forEach((p, i) => { final = Math.max(final, Math.hypot(p[0] - flat[i][0], p[1] - flat[i][1])); });
    return { points: out, refused: false, reason: "ok", yawDegrees: yaw, rollDegrees: roll, scale,
        maxMoveIod: final / iod, rawMaxMoveIod: rawMax };
}
