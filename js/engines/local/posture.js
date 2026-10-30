/** LS4 posture spike (plan §8.5, J10-J16): control points, seven fixes and the band render.
 * Mirrors api/plumb_api/engines/posture/{points,fixes,render}.py; parity in parity/spikes-r7.json.
 * Inspiration: MediaPipe Pose Landmarker (33-point body landmarks used to prefill the
 * control points, runtime data) and Bookstein thin-plate splines (the smooth warp);
 * concept only, no code copied. The warp, fold guard and fill are the R5 engines.
 * Photo edit. Not a posture assessment and not medical advice.
 * Author: John Khan.
 */
import { floatImage, requireColour, requireMask } from "../core/buffer.js";
import { alphaBlend } from "../core/blend.js";
import { dilate } from "../core/mask.js";
import { fill } from "../fill/fill.js";
import { patchMatch } from "../fill/patchmatch.js";
import { bandWeights } from "../warp/falloff.js";
import { apply, identity, moveStats, samplePlane, scale, weighted } from "../warp/field.js";
import { safeStrength } from "../warp/fold.js";
import { tpsField } from "../warp/tps.js";
export const VERSION = "posture-spike-r7/1";
export const LABEL = "Simulation. Photo edit only, not medical advice.";
export const VIEWS = ["front", "side"];
export const FRONT = ["right_shoulder", "left_shoulder", "right_hip", "left_hip", "mid_chest", "navel"];
export const SIDE = ["ear", "neck_base", "shoulder", "mid_back", "hip", "knee"];
export const SIDE_OPTIONAL = ["ankle"];
export const POSE_INDEX = { nose: 0, left_ear: 7, right_ear: 8, left_shoulder: 11, right_shoulder: 12, left_hip: 23,
    right_hip: 24, left_knee: 25, right_knee: 26, left_ankle: 27, right_ankle: 28 };
export const VISIBLE = 0.5, MIN_TORSO_PX = 8;
export const CHEST_SHARE = 0.30, NAVEL_SHARE = 0.72, NECK_SHARE = 0.30, BACK_SHARE = 0.45, BACK_DEPTH = 0.12;
export const STOPS = { subtle: 0.33, normal: 0.66, full: 1.0 };
export const CAP_SHARE = 0.06, LEAN_MAX_DEGREES = 8, HALFWAY_AT_NORMAL = 0.5 / 0.66;
export const SLOUCH_CUT = 0.5, PELVIC_CUT = 0.4, NECK_FOLLOW = 0.5;
export const SHOULDER_MODES = ["higher", "lower", "both"];
export const BAND_SHARE = 0.03, MIN_BAND_PX = 3;
export const FILL_METHODS = ["patchmatch", "biharmonic", "fast-marching", "none"];
export const FIXES = {
    lean: { view: "front", id: "J10", measure: "torso_tilt_degrees",
        moves: ["right_shoulder", "left_shoulder", "mid_chest", "navel"], pins: ["right_hip", "left_hip"] },
    uneven_shoulders: { view: "front", id: "J11", measure: "shoulder_height_difference_px",
        moves: ["right_shoulder", "left_shoulder"], pins: ["right_hip", "left_hip", "mid_chest", "navel"] },
    rounded_shoulders: { view: "side", id: "J12", measure: "shoulder_ahead_of_ear_hip_line_px",
        moves: ["shoulder", "neck_base"], pins: ["ear", "mid_back", "hip", "knee"] },
    forward_head: { view: "side", id: "J13", measure: "ear_ahead_of_shoulder_px",
        moves: ["ear", "neck_base"], pins: ["shoulder", "mid_back", "hip", "knee"] },
    slouch: { view: "side", id: "J14", measure: "upper_back_curve_px",
        moves: ["mid_back"], pins: ["ear", "neck_base", "shoulder", "hip", "knee"] },
    swayback: { view: "side", id: "J15", measure: "hip_ahead_of_ankle_shoulder_line_px",
        moves: ["hip"], pins: ["ear", "neck_base", "shoulder", "mid_back", "knee"] },
    pelvic_tilt: { view: "side", id: "J16", measure: "lower_curve_px",
        moves: ["hip"], pins: ["ear", "neck_base", "shoulder", "mid_back", "knee"] },
};
const finite = (v) => typeof v === "number" && Number.isFinite(v);
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
export function torsoHeight(view, p) {
    if (view === "front") {
        const s = mid(p.right_shoulder, p.left_shoulder), h = mid(p.right_hip, p.left_hip);
        return Math.hypot(h[0] - s[0], h[1] - s[1]);
    }
    return Math.hypot(p.hip[0] - p.shoulder[0], p.hip[1] - p.shoulder[1]);
}
export function validate(view, points, width, height, facing = 0) {
    if (!VIEWS.includes(view))
        throw new RangeError("view must be front or side");
    if (!(Number.isInteger(width) && Number.isInteger(height) && width >= 8 && height >= 8 && width <= 16384 && height <= 16384)) {
        throw new RangeError("image size must be whole numbers from 8 to 16384");
    }
    const required = view === "front" ? FRONT : SIDE;
    const allowed = new Set([...required, ...(view === "side" ? SIDE_OPTIONAL : [])]);
    const missing = required.filter((n) => !(n in points)), extra = Object.keys(points).filter((n) => !allowed.has(n));
    if (missing.length || extra.length) {
        throw new RangeError(`${view} view needs points ${required.join(", ")}; missing [${missing}], unknown [${extra}]`);
    }
    for (const [name, value] of Object.entries(points)) {
        if (!Array.isArray(value) || value.length !== 2 || !value.every(finite))
            throw new RangeError(`point ${name} must be two finite numbers`);
        if (!(value[0] >= -0.5 && value[0] <= width - 0.5 && value[1] >= -0.5 && value[1] <= height - 0.5)) {
            throw new RangeError(`point ${name} lies outside the photo`);
        }
    }
    if (torsoHeight(view, points) < MIN_TORSO_PX)
        throw new RangeError("the torso is too small to edit (under 8 px)");
    if (view === "front") {
        if (facing !== 0)
            throw new RangeError("front view has no facing direction");
        if (Math.max(points.right_shoulder[1], points.left_shoulder[1]) >= Math.min(points.right_hip[1], points.left_hip[1])) {
            throw new RangeError("both shoulders must sit above both hips");
        }
    }
    else {
        if (facing !== -1 && facing !== 1)
            throw new RangeError("side view needs facing -1 (image left) or +1 (image right)");
        const order = ["ear", "shoulder", "hip", "knee"].map((n) => points[n][1]);
        if (!order.every((v, i) => i === 0 || order[i - 1] < v))
            throw new RangeError("side points must run top to bottom: ear, shoulder, hip, knee");
        if (points.ankle && points.ankle[1] <= points.knee[1])
            throw new RangeError("the ankle must sit below the knee");
    }
}
export function makeControls(view, points, width, height, facing = 0, estimated = [], manual = []) {
    validate(view, points, width, height, facing);
    const copy = {};
    for (const [k, v] of Object.entries(points))
        copy[k] = [v[0], v[1]];
    return { view, points: copy, width, height, facing, estimated: [...estimated], manual: [...manual] };
}
export function withMoves(c, changes) {
    return makeControls(c.view, { ...c.points, ...changes }, c.width, c.height, c.facing, c.estimated, c.manual);
}
/** Prefill a view's control points from 33 normalised MediaPipe Pose landmarks. */
export function fromPose(landmarks, width, height, view, side) {
    if (!Array.isArray(landmarks) || landmarks.length !== 33)
        throw new RangeError("MediaPipe Pose gives 33 landmarks");
    const mark = (name) => {
        const m = landmarks[POSE_INDEX[name]];
        const vis = m.visibility ?? 1;
        if (!finite(m.x) || !finite(m.y) || !finite(vis))
            throw new RangeError("pose landmarks must be finite numbers");
        return { p: [Math.min(Math.max(m.x, 0), 1) * (width - 1), Math.min(Math.max(m.y, 0), 1) * (height - 1)], vis };
    };
    if (view === "front") {
        const rs = mark("right_shoulder"), ls = mark("left_shoulder"), rh = mark("right_hip"), lh = mark("left_hip");
        const sm = mid(rs.p, ls.p), hm = mid(rh.p, lh.p);
        const at = (share) => [sm[0] + share * (hm[0] - sm[0]), sm[1] + share * (hm[1] - sm[1])];
        const manual = ["right_shoulder", "left_shoulder", "right_hip", "left_hip"].filter((n) => mark(n).vis < VISIBLE);
        return makeControls("front", { right_shoulder: rs.p, left_shoulder: ls.p, right_hip: rh.p, left_hip: lh.p,
            mid_chest: at(CHEST_SHARE), navel: at(NAVEL_SHARE) }, width, height, 0, ["mid_chest", "navel"], manual);
    }
    if (view !== "side")
        throw new RangeError("view must be front or side");
    const parts = ["ear", "shoulder", "hip", "knee"];
    const chosen = side ?? (parts.reduce((s, p) => s + mark(`left_${p}`).vis, 0) >= parts.reduce((s, p) => s + mark(`right_${p}`).vis, 0) ? "left" : "right");
    if (chosen !== "left" && chosen !== "right")
        throw new RangeError("side must be left or right");
    const ear = mark(`${chosen}_ear`), shoulder = mark(`${chosen}_shoulder`), hip = mark(`${chosen}_hip`), knee = mark(`${chosen}_knee`);
    const facing = mark("nose").p[0] >= ear.p[0] ? 1 : -1;
    const torso = Math.hypot(hip.p[0] - shoulder.p[0], hip.p[1] - shoulder.p[1]);
    const neck = [shoulder.p[0] + NECK_SHARE * (ear.p[0] - shoulder.p[0]), shoulder.p[1] + NECK_SHARE * (ear.p[1] - shoulder.p[1])];
    const back = [shoulder.p[0] + BACK_SHARE * (hip.p[0] - shoulder.p[0]) - facing * BACK_DEPTH * torso,
        shoulder.p[1] + BACK_SHARE * (hip.p[1] - shoulder.p[1])];
    const points = { ear: ear.p, neck_base: neck, shoulder: shoulder.p, mid_back: back, hip: hip.p, knee: knee.p };
    const ankle = mark(`${chosen}_ankle`);
    if (ankle.vis >= VISIBLE)
        points.ankle = ankle.p;
    const low = parts.filter((p) => mark(`${chosen}_${p}`).vis < VISIBLE);
    return makeControls("side", points, width, height, facing, ["neck_base", "mid_back"], low.length ? low : [...parts]);
}
/** Unit normal of line a-b pointing to the facing side (the front of the body). */
export function facingNormal(a, b, facing) {
    const dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy);
    if (length < 1e-9)
        throw new RangeError("reference line needs two distinct points");
    let n = [-dy / length, dx / length];
    if (n[0] * facing < 0 || (n[0] === 0 && facing < 0))
        n = [-n[0], -n[1]];
    return n;
}
export function signedOffset(p, a, b, facing) {
    const n = facingNormal(a, b, facing);
    return (p[0] - a[0]) * n[0] + (p[1] - a[1]) * n[1];
}
export function strengthOf(value) {
    if (typeof value === "string") {
        if (!(value in STOPS))
            throw new RangeError(`strength must be one of ${Object.keys(STOPS).join(", ")} or 0..1`);
        return STOPS[value];
    }
    if (!(finite(value) && value >= 0 && value <= 1))
        throw new RangeError("strength must be 0..1");
    return value;
}
export function torsoTilt(c) {
    const s = mid(c.points.right_shoulder, c.points.left_shoulder), h = mid(c.points.right_hip, c.points.left_hip);
    return Math.atan2(s[0] - h[0], -(s[1] - h[1])) * 180 / Math.PI;
}
const swayBase = (c) => c.points.ankle ?? c.points.knee;
export function measure(fix, c) {
    const p = c.points, f = c.facing;
    switch (fix) {
        case "lean": return torsoTilt(c);
        case "uneven_shoulders": return p.left_shoulder[1] - p.right_shoulder[1];
        case "rounded_shoulders": return signedOffset(p.shoulder, p.ear, p.hip, f);
        case "forward_head": return (p.ear[0] - p.shoulder[0]) * f;
        case "slouch": return -signedOffset(p.mid_back, p.neck_base, p.hip, f);
        case "swayback": return signedOffset(p.hip, swayBase(c), p.shoulder, f);
        case "pelvic_tilt": return signedOffset(p.hip, p.mid_back, p.knee, f);
        default: throw new RangeError(`unknown fix ${String(fix)}`);
    }
}
function rotate(p, centre, degrees) {
    const t = degrees * Math.PI / 180, dx = p[0] - centre[0], dy = p[1] - centre[1];
    return [centre[0] + dx * Math.cos(t) - dy * Math.sin(t), centre[1] + dx * Math.sin(t) + dy * Math.cos(t)];
}
/** Per-point move (px) of the Full correction, and notes about it (mirror of fixes.full_moves). */
export function fullMoves(fix, c, shoulder = "higher") {
    const spec = FIXES[fix];
    if (!spec)
        throw new RangeError(`unknown fix ${String(fix)}; choose one of ${Object.keys(FIXES).join(", ")}`);
    if (spec.view !== c.view)
        throw new RangeError(`${fix} needs a ${spec.view} view`);
    const moves = {};
    for (const n of spec.moves)
        moves[n] = [0, 0];
    const notes = [], p = c.points, f = c.facing;
    const along = (n, size) => [n[0] * size, n[1] * size];
    if (fix === "lean") {
        const tilt = torsoTilt(c), turn = -Math.max(-LEAN_MAX_DEGREES, Math.min(LEAN_MAX_DEGREES, tilt));
        if (Math.abs(tilt) > LEAN_MAX_DEGREES)
            notes.push(`lean is limited to ${LEAN_MAX_DEGREES} degrees`);
        const centre = mid(p.right_hip, p.left_hip);
        for (const n of spec.moves) {
            const q = rotate(p[n], centre, turn);
            moves[n] = [q[0] - p[n][0], q[1] - p[n][1]];
        }
    }
    else if (fix === "uneven_shoulders") {
        if (!SHOULDER_MODES.includes(shoulder))
            throw new RangeError("shoulder must be higher, lower or both");
        const gap = p.left_shoulder[1] - p.right_shoulder[1], size = Math.abs(gap);
        const [higher, lower] = gap > 0 ? ["right_shoulder", "left_shoulder"] : ["left_shoulder", "right_shoulder"];
        if (shoulder === "higher")
            moves[higher] = [0, size];
        else if (shoulder === "lower")
            moves[lower] = [0, -size];
        else {
            moves[higher] = [0, size / 2];
            moves[lower] = [0, -size / 2];
        }
    }
    else if (fix === "rounded_shoulders") {
        const ahead = measure(fix, c);
        if (ahead > 0) {
            moves.shoulder = along(facingNormal(p.ear, p.hip, f), -ahead * HALFWAY_AT_NORMAL);
            moves.neck_base = [moves.shoulder[0] * NECK_FOLLOW, moves.shoulder[1] * NECK_FOLLOW];
        }
        else
            notes.push("shoulder is not ahead of the ear-hip line; nothing to move");
    }
    else if (fix === "forward_head") {
        const ahead = measure(fix, c);
        if (ahead > 0) {
            moves.ear = [-f * ahead, 0];
            moves.neck_base = [moves.ear[0] * NECK_FOLLOW, 0];
        }
        else
            notes.push("ear is not ahead of the shoulder; nothing to move");
    }
    else if (fix === "slouch") {
        const curve = measure(fix, c);
        if (curve > 0)
            moves.mid_back = along(facingNormal(p.neck_base, p.hip, f), curve * SLOUCH_CUT);
        else
            notes.push("upper back is not curved behind the neck-to-hip line; nothing to move");
    }
    else if (fix === "swayback") {
        if (!p.ankle)
            notes.push("no ankle point: the knee stands in for the ankle");
        const ahead = measure(fix, c);
        if (ahead > 0)
            moves.hip = along(facingNormal(swayBase(c), p.shoulder, f), -ahead * HALFWAY_AT_NORMAL);
        else
            notes.push("hip is not ahead of the reference line; nothing to move");
    }
    else {
        const ahead = measure(fix, c);
        if (ahead > 0)
            moves.hip = along(facingNormal(p.mid_back, p.knee, f), -ahead * PELVIC_CUT);
        else
            notes.push("hip is not ahead of the mid-back-to-knee line; nothing to move");
        notes.push("rough contour edit from one photo, not a measurement");
    }
    return { moves, notes };
}
export function plan(c, fix, strength = "normal", { shoulder = "higher", capShare = CAP_SHARE } = {}) {
    const s = strengthOf(strength);
    if (!(capShare > 0 && capShare <= 0.2))
        throw new RangeError("cap share must be in (0, 0.2]");
    const { moves, notes } = fullMoves(fix, c, shoulder);
    const cap = capShare * torsoHeight(c.view, c.points);
    const requested = Math.max(...Object.values(moves).map((m) => Math.hypot(s * m[0], s * m[1])));
    const scaleBy = requested <= cap || requested === 0 ? 1 : cap / requested;
    if (scaleBy < 1)
        notes.push(`capped at ${capShare * 100}% of torso height`);
    const changed = {};
    for (const [n, m] of Object.entries(moves))
        changed[n] = [c.points[n][0] + s * scaleBy * m[0], c.points[n][1] + s * scaleBy * m[1]];
    const after = withMoves(c, changed), mb = measure(fix, c), ma = measure(fix, after);
    return { fix, view: c.view, strength: s, before: c, after, moves: [...FIXES[fix].moves], pins: [...FIXES[fix].pins],
        requestedPx: requested, capPx: cap, capScale: scaleBy, measureBefore: mb, measureAfter: ma,
        reduction: Math.abs(mb) < 1e-9 ? 0 : 1 - Math.abs(ma) / Math.abs(mb), notes, label: LABEL };
}
export function j11Check(p, tolerance = 0.1) {
    if (p.fix !== "uneven_shoulders")
        throw new RangeError("the J11 check is for uneven_shoulders");
    return { check: "J11", passed: Math.abs(p.reduction - p.strength) <= tolerance * p.strength + 1e-9, reduction: p.reduction, strength: p.strength };
}
export function fixesFor(view) {
    return Object.keys(FIXES).filter((k) => FIXES[k].view === view);
}
export function bandPx(width, share = BAND_SHARE) {
    if (!(share > 0 && share <= 0.2))
        throw new RangeError("band share must be in (0, 0.2]");
    return Math.max(MIN_BAND_PX, Math.round(share * width));
}
export function bodyBand(person, share = BAND_SHARE) {
    requireMask(person);
    const radius = bandPx(person.width, share);
    let any = false;
    for (const v of person.data)
        if (v >= 0.5) {
            any = true;
            break;
        }
    if (!any)
        throw new RangeError("the person mask is empty");
    return { band: dilate(person, radius), radius };
}
export function stripFill(image, strip, person, method, seed = 1) {
    let any = false;
    for (const v of strip.data)
        if (v > 0) {
            any = true;
            break;
        }
    if (method === "none" || !any)
        return { ...image, data: new Uint8Array(image.data) };
    if (method === "patchmatch") {
        const grown = dilate(person, 5);
        const background = floatImage(person.width, person.height, 1);
        for (let i = 0; i < background.data.length; i++)
            background.data[i] = 1 - grown.data[i];
        return patchMatch(image, strip, { patchRadius: 3, iterations: 4, seed, sourceMask: background }).image;
    }
    return fill(image, strip, method, { radius: 4 }).image;
}
export function renderPosture(image, person, p, { bandShare = BAND_SHARE, fillMethod = "patchmatch", gridStep = 4, seed = 1 } = {}) {
    requireColour(image);
    if (!FILL_METHODS.includes(fillMethod))
        throw new RangeError(`fill must be one of ${FILL_METHODS.join(", ")}`);
    if (p.before.width !== image.width || p.before.height !== image.height)
        throw new RangeError("control points were placed on a photo of another size");
    requireMask(person, image.width, image.height);
    const { band, radius } = bodyBand(person, bandShare);
    const src = p.moves.map((n) => p.before.points[n]), dst = p.moves.map((n) => p.after.points[n]);
    const pins = p.pins.map((n) => p.before.points[n]);
    const largest = Math.max(...src.map((a, i) => Math.hypot(dst[i][0] - a[0], dst[i][1] - a[1])));
    if (!(largest > 1e-9)) {
        return { image: { ...image, data: new Uint8Array(image.data) }, band, strip: floatImage(image.width, image.height, 1),
            field: identity(image.width, image.height), strengthUsed: 1, label: LABEL,
            metrics: { strength_used: 1, reduced: false, band_px: radius, strip_pixels: 0, largest_move_px: 0, min_det: 1, version: VERSION } };
    }
    const full = tpsField(image.width, image.height, src, dst, { pins, step: gridStep });
    const weights = bandWeights(band, radius);
    const safe = safeStrength((s) => weighted(scale(full, s), weights), { requested: 1 });
    const warped = apply(image, safe.field);
    const alpha = floatImage(image.width, image.height, 1), strip = floatImage(image.width, image.height, 1);
    let stripPixels = 0;
    for (let y = 0; y < image.height; y++)
        for (let x = 0; x < image.width; x++) {
            const i = y * image.width + x;
            const a = Math.min(1, Math.max(0, samplePlane(person, safe.field.mapX.data[i], safe.field.mapY.data[i])));
            alpha.data[i] = a;
            const m = person.data[i];
            if (m > 0.02 && a < 0.5 && a < m - 0.05) {
                strip.data[i] = 1;
                stripPixels++;
            }
        }
    const background = stripFill(image, strip, person, fillMethod, seed);
    const stats = moveStats(safe.field);
    return { image: alphaBlend(background, warped, alpha), band, strip, field: safe.field, strengthUsed: safe.strength, label: LABEL,
        metrics: { strength_used: safe.strength, reduced: safe.reduced, band_px: radius, strip_pixels: stripPixels,
            largest_move_px: largest, max_field_move_px: stats.maxMove, min_det: safe.report.minDet, fill: fillMethod, version: VERSION } };
}
/** User-facing seven-fix catalogue. These are local 2D photo simulations, not diagnoses. */
export const SIMULATION_LABEL = "Simulation. Photo edit only, not medical advice.";
export const POSTURE_NAMES = {
    lean: "Straighten lean",
    uneven_shoulders: "Level shoulders",
    rounded_shoulders: "Open rounded shoulders",
    forward_head: "Head back over shoulders",
    slouch: "Lift slouch",
    swayback: "Ease swayback",
    pelvic_tilt: "Ease pelvic tilt",
};
const POSTURE_WARNINGS = {
    pelvic_tilt: "Illustrative lower-body contour only; pelvic angle cannot be inferred from this view.",
    swayback: "Side-view outline estimate; depth and spinal curvature are not measured.",
};
export function postureFixes() {
    return Object.keys(FIXES).map((fix) => ({
        id: FIXES[fix].id,
        fix,
        name: POSTURE_NAMES[fix],
        view: FIXES[fix].view,
        moves: [...FIXES[fix].moves],
        pins: [...FIXES[fix].pins],
        label: SIMULATION_LABEL,
        available: true,
        reason: POSTURE_WARNINGS[fix] ?? "",
    }));
}
export class PostureRefusal extends RangeError {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = "PostureRefusal";
    }
}
export function requirePostureView(c, fix) {
    const entry = postureFixes().find((candidate) => candidate.fix === fix);
    if (!entry || !entry.available) {
        throw new PostureRefusal("fix_unavailable", "This edit is not available with the current controls.");
    }
    if (entry.view !== c.view) {
        throw new PostureRefusal("view_required", `${entry.name} needs a ${entry.view} photo.`);
    }
    return entry;
}
/** Public strength levels use tenths, while existing plan() retains its 0..1 contract. */
export const POSTURE_ANCHORS = [
    [1, 0], [2, STOPS.subtle], [3.5, STOPS.normal], [5, STOPS.full],
];
export const DEFAULT_POSTURE_LEVEL = 3.5;
export const DEFAULT_POSTURE_LOCK = 5;
export const FACE_MOVING_FIXES = new Set(["lean", "rounded_shoulders", "forward_head"]);
export function checkedPostureLevel(level) {
    if (!(Number.isFinite(level) && level >= 1 && level <= 5)) {
        throw new RangeError("level must be from 1.0 to 5.0");
    }
    const tick = Math.round(level * 10);
    if (Math.abs(level * 10 - tick) > 1e-8)
        throw new RangeError("level must use 0.1 steps");
    return tick / 10;
}
export function postureLevelStrength(level) {
    const checked = checkedPostureLevel(level);
    for (let i = 0; i < POSTURE_ANCHORS.length - 1; i++) {
        const [lo, a] = POSTURE_ANCHORS[i];
        const [hi, b] = POSTURE_ANCHORS[i + 1];
        if (checked >= lo && checked <= hi)
            return a + (b - a) * (checked - lo) / (hi - lo);
    }
    throw new RangeError("level outside known anchors");
}
export function legacyStopLevel(stop) {
    const levels = { subtle: 2, normal: 3.5, full: 5 };
    if (!(stop in levels))
        throw new RangeError("unknown legacy stop");
    return levels[stop];
}
export function postureLevelPlan(c, fix, level = DEFAULT_POSTURE_LEVEL) {
    requirePostureView(c, fix);
    return { ...plan(c, fix, postureLevelStrength(level)), label: SIMULATION_LABEL };
}
export function nudgePostureLevel(level, direction) {
    const current = checkedPostureLevel(level);
    return checkedPostureLevel(Math.min(5, Math.max(1, Math.round(current * 10 + direction) / 10)));
}
export class PostureLevelMemory {
    levels = new Map();
    get(fix) {
        if (!(fix in FIXES))
            throw new RangeError("unknown posture fix");
        return this.levels.get(fix) ?? DEFAULT_POSTURE_LEVEL;
    }
    set(fix, level) {
        if (!(fix in FIXES))
            throw new RangeError("unknown posture fix");
        const validated = checkedPostureLevel(level);
        this.levels.set(fix, validated);
        return validated;
    }
    nudge(fix, direction) {
        return this.set(fix, nudgePostureLevel(this.get(fix), direction));
    }
}
//# sourceMappingURL=posture.js.map