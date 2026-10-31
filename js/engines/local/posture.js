/** LS4 posture spike (plan §8.5, J10-J16): control points, seven fixes and the band render.
 * Mirrors api/plumb_api/engines/posture/{points,fixes,render}.py; parity in parity/spikes-r7.json.
 * Inspiration: MediaPipe Pose Landmarker (33-point body landmarks used to prefill the
 * control points, runtime data) and Bookstein thin-plate splines (the smooth warp);
 * concept only, no code copied. The warp, fold guard and fill are the R5 engines.
 * Photo edit. Not a posture assessment and not medical advice.
 * Author: John Khan.
 */
import { floatImage, requireColour, requireMask } from "../core/buffer.js";
import { colourGuidedMatte, estimateForeground, ghostAudit, edgeRoughness, haloStep, harmonicSeam } from "./posture-layers.js";
import { renderClock } from "../skin/texture-law.js";
import { alphaBlend } from "../core/blend.js";
import { dilate } from "../core/mask.js";
import { fill } from "../fill/fill.js";
import { patchMatch } from "../fill/patchmatch.js";
import { bandWeights } from "../warp/falloff.js";
import { apply, identity, moveStats, samplePlane, scale, weighted } from "../warp/field.js";
import { safeStrength } from "../warp/fold.js";
import { tpsField } from "../warp/tps.js";
import { blur as pyrBlur } from "../core/pyramid.js";
export const VERSION = "posture-layers-r9/1";
/** Version of the single-warp path the guarded session still uses. */
export const VERSION_SINGLE = "posture-spike-r7/1";
export const LABEL = "Simulation. Photo edit only, not medical advice.";
export const VIEWS = ["front", "side"];
export const FRONT = ["right_shoulder", "left_shoulder", "right_hip", "left_hip", "mid_chest", "navel"];
export const SIDE = ["ear", "neck_base", "shoulder", "mid_back", "hip", "knee"];
export const SIDE_OPTIONAL = ["ankle", "elbow", "wrist", "hand"];
export const POSE_INDEX = { nose: 0, left_ear: 7, right_ear: 8, left_shoulder: 11, right_shoulder: 12, left_hip: 23,
    right_hip: 24, left_knee: 25, right_knee: 26, left_ankle: 27, right_ankle: 28, left_elbow: 13, right_elbow: 14,
    left_wrist: 15, right_wrist: 16, left_index: 19, right_index: 20 };
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
    rounded_shoulders: { view: "side", id: "J12", measure: "shoulder_ahead_of_hip_vertical_px",
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
    // Arm points (elbow, wrist, index-finger base as the hand), when seen: edits that move the pelvis keep the arm
    // hanging in front of it out of the move.
    for (const [name, part] of [["elbow", "elbow"], ["wrist", "wrist"], ["hand", "index"]]) {
        const m = mark(`${chosen}_${part}`);
        if (m.vis >= VISIBLE)
            points[name] = m.p;
    }
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
        // Against the vertical through the hip, not the ear-hip line: a forward head tilts that line forward and hid
        // rounded shoulders behind it.
        case "rounded_shoulders": return (p.shoulder[0] - p.hip[0]) * f;
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
            moves.shoulder = [-f * ahead * HALFWAY_AT_NORMAL, 0];
            moves.neck_base = [moves.shoulder[0] * NECK_FOLLOW, moves.shoulder[1] * NECK_FOLLOW];
        }
        else
            notes.push("shoulder is not ahead of the hip; nothing to move");
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
    if (!any || method === "none")
        return { ...image, data: new Uint8Array(image.data) };
    if (method === "patchmatch") {
        const grown = dilate(person, Math.max(8, Math.round(image.width * 0.012)));
        const background = floatImage(person.width, person.height, 1);
        let allowed = 0;
        for (let i = 0; i < background.data.length; i++) {
            const keep = grown.data[i] < 0.001 ? 1 : 0;
            background.data[i] = keep;
            allowed += keep;
        }
        if (allowed < 64)
            throw new RangeError("not enough clean background to move this silhouette");
        return patchMatch(image, strip, { patchRadius: 4, iterations: 6, seed, sourceMask: background }).image;
    }
    return fill(image, strip, method, { radius: 5 }).image;
}
/** Where the body moved: the output's own low band (binomial blur twice, sigma about 1.4 px) plus the
 * source's high band read at the field's nearest source pixel, so a sub-pixel warp keeps the weave, hair and skin detail. */
/** A soft person mask stretched between its background level (median of values below 0.5) and its body level
 * (median of values at or above 0.5), so the background reads 0 and the body 1. */
export function stretchMask(mask) {
    const lo = [], hi = [];
    for (let i = 0; i < mask.length; i++)
        (mask[i] < 0.5 ? lo : hi).push(mask[i]);
    const median = (v, d) => { if (!v.length)
        return d; v.sort((a, b) => a - b); return v[v.length >> 1]; };
    const floor = Math.min(0.3, Math.max(0, median(lo, 0))), top = Math.max(0.7, Math.min(1, median(hi, 1)));
    return Float32Array.from(mask, (v) => Math.min(1, Math.max(0, (v - floor) / (top - floor))));
}
/** Detail of the background just outside the body (mean absolute 4-neighbour Laplacian of luma, 0-255 scale)
 * in a ring from 1 to 3 body bands out. A plain studio wall reads about 1-2; a room or street reads far higher. */
export function backgroundDetail(image, person, share = BAND_SHARE) {
    const r = bandPx(image.width, share), near = dilate(person, r), far = dilate(person, 3 * r);
    const { width: w, height: h, channels: ch } = image;
    const luma = (i) => 0.299 * image.data[i * ch] + 0.587 * image.data[i * ch + 1] + 0.114 * image.data[i * ch + 2];
    let sum = 0, count = 0;
    for (let y = 1; y < h - 1; y++)
        for (let x = 1; x < w - 1; x++) {
            const i = y * w + x;
            if (!(far.data[i] >= 0.5 && near.data[i] < 0.5))
                continue;
            sum += Math.abs(4 * luma(i) - luma(i - 1) - luma(i + 1) - luma(i - w) - luma(i + w));
            count++;
        }
    return count ? sum / count : 0;
}
/** Plain backgrounds (detail below this) are rebuilt with the smooth biharmonic fill: patch copies left light
 * smears and seams beside the head and legs there. Textured backgrounds keep PatchMatch. */
export const PLAIN_BACKGROUND_DETAIL = 3;
/** Own-background grain for a smooth fill: each 8x8 block of the filled area takes the fine detail (sigma 1.5 high
 * band) of a block of the clean wall around the figure (1-4 blocks out from the filled area), so the rebuilt
 * wall has her photo's own grain and noise instead of a smooth smear. */
export function ownGrain(filled, original, region, seed = 1) {
    const { width: W, height: H, channels: ch } = original, n = W * H, B = 8;
    const near = dilate(region, B), far = dilate(region, 4 * B);
    const plane = (img) => { const f = floatImage(W, H, 3); for (let i = 0; i < n; i++)
        for (let c = 0; c < 3; c++)
            f.data[i * 3 + c] = img.data[i * ch + c]; return f; };
    const low = pyrBlur(pyrBlur(plane(original))).data;
    const donors = [];
    for (let y = 0; y + B <= H; y += B)
        for (let x = 0; x + B <= W; x += B) {
            let ok = true;
            for (let dy = 0; dy < B && ok; dy++)
                for (let dx = 0; dx < B; dx++) {
                    const i = (y + dy) * W + x + dx;
                    if (near.data[i] >= 0.5 || far.data[i] < 0.5) {
                        ok = false;
                        break;
                    }
                }
            if (ok)
                donors.push(y * W + x);
        }
    const out = { ...filled, data: Uint8Array.from(filled.data) };
    if (!donors.length)
        return out;
    let state = (seed * 2654435761) >>> 0;
    const next = () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; };
    for (let by = 0; by < H; by += B)
        for (let bx = 0; bx < W; bx += B) {
            const d = donors[Math.floor(next() * donors.length)], dx0 = d % W, dy0 = (d - dx0) / W;
            for (let dy = 0; dy < B && by + dy < H; dy++)
                for (let dx = 0; dx < B && bx + dx < W; dx++) {
                    const i = (by + dy) * W + bx + dx;
                    if (!(region.data[i] > 0))
                        continue;
                    const j = (dy0 + dy) * W + dx0 + dx;
                    for (let c = 0; c < 3; c++)
                        out.data[i * ch + c] = Math.max(0, Math.min(255, Math.round(out.data[i * ch + c] + original.data[j * ch + c] - low[j * 3 + c])));
                }
        }
    return out;
}
/** Head disk (centre and inner/outer radius, px). Front view: centred about half a shoulder span above the
 * shoulder midpoint; side view: on the ear. Inside the inner radius the head moves as one piece. */
export function headDisk(c) {
    const p = c.points;
    if (c.view === "front") {
        const span = Math.hypot(p.left_shoulder[0] - p.right_shoulder[0], p.left_shoulder[1] - p.right_shoulder[1]);
        const m = mid(p.right_shoulder, p.left_shoulder);
        return { centre: [m[0], m[1] - HEAD_RISE * span], inner: HEAD_INNER * span, outer: HEAD_OUTER * span };
    }
    const t = torsoHeight(c.view, p);
    // Side view: the skull and face sit ahead of and a little below the ear, so the disk centre moves that way.
    return { centre: [p.ear[0] + c.facing * SIDE_HEAD_AHEAD * t, p.ear[1] + SIDE_HEAD_DOWN * t], inner: SIDE_HEAD_INNER * t, outer: SIDE_HEAD_OUTER * t };
}
export const KEEP_LEVELS = [3, 10], KEEP_REACH = 3;
/** Largest value within r px (square window), two separable passes. */
export function maxFilter(v, w, h, r) {
    const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            let m = 0;
            for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++)
                m = Math.max(m, v[y * w + k]);
            tmp[y * w + x] = m;
        }
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            let m = 0;
            for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++)
                m = Math.max(m, tmp[k * w + x]);
            out[y * w + x] = m;
        }
    return out;
}
export const FRINGE_ALPHA = 0.05, STILL_PX = [0.05, 0.5];
export const HEAD_RISE = 0.55, HEAD_INNER = 0.42, HEAD_OUTER = 0.8, SIDE_HEAD_INNER = 0.27, SIDE_HEAD_OUTER = 0.45, SIDE_HEAD_AHEAD = 0.08, SIDE_HEAD_DOWN = 0.05;
/** The face must not change: the field over the head disk becomes one translation (the field's mean move over
 * the inner disk), easing back to the body field by the outer radius. A smooth spline otherwise sheared the face
 * at max (SFace 0.886). */
export function rigidHead(field, head) {
    const { width: w, height: h } = field, [cx, cy] = head.centre;
    let sx = 0, sy = 0, k = 0;
    for (let y = Math.max(0, Math.floor(cy - head.inner)); y <= Math.min(h - 1, Math.ceil(cy + head.inner)); y++)
        for (let x = Math.max(0, Math.floor(cx - head.inner)); x <= Math.min(w - 1, Math.ceil(cx + head.inner)); x++) {
            if (Math.hypot(x - cx, y - cy) > head.inner)
                continue;
            const i = y * w + x;
            sx += field.mapX.data[i] - x;
            sy += field.mapY.data[i] - y;
            k++;
        }
    if (!k)
        return field;
    const dx = sx / k, dy = sy / k, out = scale(field, 1);
    for (let y = 0, i = 0; y < h; y++)
        for (let x = 0; x < w; x++, i++) {
            const r = Math.hypot(x - cx, y - cy);
            if (r >= head.outer)
                continue;
            const t = r <= head.inner ? 1 : 1 - (r - head.inner) / (head.outer - head.inner), u = t * t * (3 - 2 * t);
            out.mapX.data[i] += u * (x + dx - out.mapX.data[i]);
            out.mapY.data[i] += u * (y + dy - out.mapY.data[i]);
        }
    return out;
}
/** Where the legs stand still: below the hips (front view) or the knee (side view) the field eases to none over
 * a share of the torso, so a corrected upper body does not drag the legs and feet sideways (the spline otherwise
 * carried the lean's rotation down to the shoes). */
export function footing(c) {
    const p = c.points, t = torsoHeight(c.view, p);
    const y = c.view === "front" ? Math.max(p.right_hip[1], p.left_hip[1]) : p.knee[1];
    return { top: y, bottom: y + (c.view === "front" ? FRONT_PLANT : SIDE_PLANT) * t };
}
export const FRONT_PLANT = 0.45, SIDE_PLANT = 0.25;
export function plantFeet(field, f) {
    const { width: w, height: h } = field, out = scale(field, 1);
    for (let y = Math.max(0, Math.floor(f.top)), i = Math.max(0, Math.floor(f.top)) * w; y < h; y++)
        for (let x = 0; x < w; x++, i++) {
            const t = Math.min(1, Math.max(0, (y - f.top) / Math.max(1, f.bottom - f.top))), u = t * t * (3 - 2 * t);
            out.mapX.data[i] -= u * (out.mapX.data[i] - x);
            out.mapY.data[i] -= u * (out.mapY.data[i] - y);
        }
    return out;
}
/** Studio (layered) fields for the side-view fixes whose point move alone read wrong:
 * - rounded_shoulders: the spline also lifts and opens the front of the chest (a point just inside the chest
 *   outline a fifth of the torso below the shoulder goes up and forward) and flattens the upper back (a point
 *   just inside the back outline at shoulder-blade height comes forward, as the blades draw back and in);
 * - pelvic_tilt: the pelvis-to-thigh block rotates about the hip joint (buttocks under, front of the pelvis up),
 *   blended out over the waist and lower back above and towards the knee below;
 * - swayback: the trunk above the waist comes forward over the pelvis (the lumbar curve moves), so the hip and
 *   seat stay where they are instead of bulging backwards.
 * Each carries the plan's own move size. Other fixes use the plain spline. */
export function bodyField(p, person) {
    if (p.view !== "side")
        return null;
    const b = p.before.points, a = p.after.points, f = p.before.facing, W = person.width, H = person.height;
    const T = torsoHeight("side", b);
    if (p.fix === "rounded_shoulders") {
        const m = Math.hypot(a.shoulder[0] - b.shoulder[0], a.shoulder[1] - b.shoulder[1]);
        if (!(m > 1e-9))
            return null;
        const y = Math.round(b.shoulder[1] + CHEST_DROP * T);
        const edge = (row, dir) => {
            let x = Math.round(b.shoulder[0]);
            while (x + dir >= 0 && x + dir < W && person.data[row * W + x + dir] >= 0.5)
                x += dir;
            return x;
        };
        const yb = Math.round(b.shoulder[1] + UPPER_BACK_DROP * T);
        const chest = [edge(y, f) - f * CHEST_INSET * T, y], blade = [edge(yb, -f) + f * CHEST_INSET * T, yb];
        const src = [...p.moves.map((n) => b[n]), chest, blade];
        const dst = [...p.moves.map((n) => a[n]), [chest[0] + f * CHEST_OUT * m, y - CHEST_UP * m], [blade[0] + f * BLADE_IN * m, yb]];
        return tpsField(W, H, src, dst, { pins: p.pins.map((n) => b[n]), step: 4 });
    }
    if (p.fix !== "pelvic_tilt" && p.fix !== "swayback")
        return null;
    const m = Math.hypot(a.hip[0] - b.hip[0], a.hip[1] - b.hip[1]);
    if (!(m > 1e-9))
        return null;
    const out = identity(W, H);
    const ramp = (v, v0, v1) => { const t = Math.min(1, Math.max(0, (v - v0) / (v1 - v0))); return t * t * (3 - 2 * t); };
    const [hx, hy] = b.hip;
    if (p.fix === "pelvic_tilt") {
        const theta = -f * Math.min(PELVIS_MAX_DEGREES * Math.PI / 180, m / (PELVIS_RADIUS * T));
        const c = Math.cos(theta), sn = Math.sin(theta), top = hy - PELVIS_BLOCK * T, bottom = hy + PELVIS_BLOCK * T;
        for (let y = 0, i = 0; y < H; y++) {
            const w = y < hy ? ramp(y, b.mid_back[1], top) : 1 - ramp(y, bottom, b.knee[1]);
            for (let x = 0; x < W; x++, i++) {
                if (!(w > 0))
                    continue;
                const dx = x - hx, dy = y - hy;
                // Backward map: the output pixel reads from the inverse rotation of its own offset.
                out.mapX.data[i] = x + w * ((c * dx + sn * dy) - dx);
                out.mapY.data[i] = y + w * ((-sn * dx + c * dy) - dy);
            }
        }
        return out;
    }
    // swayback: shift the trunk above the waist forward by the move that takes the hip off the ankle-shoulder line
    // as far as the plan's hip move did.
    const base = b.ankle ?? b.knee, share = Math.max(0.3, (base[1] - hy) / Math.max(1, base[1] - b.shoulder[1]));
    const shift = Math.min(SWAY_MAX_SHIFT * m, m / share);
    for (let y = 0, i = 0; y < H; y++) {
        const w = 1 - ramp(y, b.mid_back[1], hy - SWAY_WAIST * T);
        for (let x = 0; x < W; x++, i++)
            if (w > 0)
                out.mapX.data[i] = x - f * w * shift;
    }
    return out;
}
export const CHEST_DROP = 0.2, CHEST_INSET = 0.03, CHEST_OUT = 0.6, CHEST_UP = 0.8, UPPER_BACK_DROP = 0.12, BLADE_IN = 0.5;
export const PELVIS_RADIUS = 0.3, PELVIS_BLOCK = 0.15, PELVIS_MAX_DEGREES = 10, SWAY_MAX_SHIFT = 1.6, SWAY_WAIST = 0.05;
export function relayDetail(input, output, field, moved) {
    const { width: w, height: h, channels: ch } = input, n = w * h;
    const plane = (img) => { const f = floatImage(w, h, 3); for (let i = 0; i < n; i++)
        for (let c = 0; c < 3; c++)
            f.data[i * 3 + c] = img.data[i * ch + c]; return f; };
    const lowIn = pyrBlur(pyrBlur(plane(input))).data, lowOut = pyrBlur(pyrBlur(plane(output))).data;
    const mx = field.mapX.data, my = field.mapY.data;
    for (let i = 0; i < n; i++) {
        if (!(moved[i] > 0))
            continue;
        const sx = Math.min(w - 1, Math.max(0, Math.round(mx[i]))), sy = Math.min(h - 1, Math.max(0, Math.round(my[i])));
        const j = sy * w + sx;
        // Where the field turns or stretches (the pelvis block rotates ~5 degrees), nearest pixels jump a whole row
        // every few pixels, which broke a white hem's lines into steps (pelvic tilt, sample B, 400%). There the detail
        // is read with a Catmull-Rom kernel (keeps most of the grain, no steps), easing in from 2% to 6% local
        // shear or stretch; elsewhere it stays the nearest own pixel.
        const x = i % w, y = (i - x) / w;
        const sxy = x + 1 < w ? Math.abs(mx[i + 1] - mx[i] - 1) + Math.abs(my[i + 1] - my[i]) : 0;
        const syy = y + 1 < h ? Math.abs(my[i + w] - my[i] - 1) + Math.abs(mx[i + w] - mx[i]) : 0;
        const t = Math.max(0, Math.min(1, (Math.max(sxy, syy) - 0.02) / 0.04));
        let wx = [], wy = [], x0 = 0, y0 = 0;
        if (t > 0) {
            const fx = Math.min(w - 2.001, Math.max(1, mx[i])), fy = Math.min(h - 2.001, Math.max(1, my[i]));
            x0 = Math.floor(fx);
            y0 = Math.floor(fy);
            const cr = (u) => [((-u + 2) * u - 1) * u / 2, ((3 * u - 5) * u * u + 2) / 2, ((-3 * u + 4) * u + 1) * u / 2, (u - 1) * u * u / 2];
            wx = cr(fx - x0);
            wy = cr(fy - y0);
        }
        for (let c = 0; c < 3; c++) {
            let hi = input.data[j * ch + c] - lowIn[j * 3 + c];
            if (t > 0) {
                let cub = 0;
                for (let b = 0; b < 4; b++)
                    for (let a = 0; a < 4; a++) {
                        const q = (y0 - 1 + b) * w + (x0 - 1 + a);
                        cub += wy[b] * wx[a] * (input.data[q * ch + c] - lowIn[q * 3 + c]);
                    }
                hi += t * (CR_GAIN * cub - hi);
                // no overshoot: a cubic read (and its gain) rings at a silhouette edge, which showed as a 1 px light rim
                // along the trouser back (sample A, 800%); the result stays within its four nearest source pixels
                let lo4 = Infinity, hi4 = -Infinity;
                for (const q of [y0 * w + x0, y0 * w + x0 + 1, (y0 + 1) * w + x0, (y0 + 1) * w + x0 + 1]) {
                    const v = input.data[q * ch + c] - lowIn[q * 3 + c];
                    lo4 = Math.min(lo4, v);
                    hi4 = Math.max(hi4, v);
                }
                hi = Math.max(lo4, Math.min(hi4, hi));
            }
            output.data[i * ch + c] = Math.max(0, Math.min(255, Math.round(lowOut[i * 3 + c] + hi)));
        }
    }
}
/** A Catmull-Rom read at fractional offsets damps the fine grain (texture 0.89 on sample A); its relayed detail is
 * lifted back by this gain (texture ~1.0 measured on A and B, workstream 02). */
export const CR_GAIN = 1.2;
/** Side-view pelvic tilt on the layered (Studio) path keeps the arm and hand still (workstream 02). The arm hangs over
 * the turning block, and a cut-out arm layer over a rebuilt body left a torn forearm, a smudged cuff and a rim
 * beside the hand on sample A (the r6 audit's own texture gate failed too). Instead the move fades to nothing
 * over the arm: the arm and hand sample themselves (pixel-identical, the still-pixel step copies the photo), the
 * clothing beside the arm eases from still to the full turn, and the seat and back turn fully. Nothing is
 * rebuilt behind the hand, so no texture or outline is invented there. Other fixes are unchanged. */
export const ARM_STILL_CORE = 0.02, ARM_STILL_EASE = 0.12;
export function renderPosture(image, person, p, options = {}) {
    const pts = p.before.points;
    const hasArm = ["shoulder", "elbow", "wrist", "hand"].every((k) => pts[k] !== undefined);
    const still = options.layers && options.armLayer !== false && p.fix === "pelvic_tilt" && p.view === "side" && hasArm
        ? armStillWeights(image.width, image.height, p) : null;
    return renderPostureBody(image, person, p, options, still);
}
/** 0 over the arm (its capsules grown by a small core), easing to 1 over ARM_STILL_EASE of the torso. */
export function armStillWeights(w, h, p) {
    const pts = p.before.points, torso = torsoHeight("side", pts);
    const chain = [["shoulder", "elbow", 0.085], ["elbow", "wrist", 0.065], ["wrist", "hand", 0.075]];
    const core = ARM_STILL_CORE * torso, ease = Math.max(2, ARM_STILL_EASE * torso);
    const out = new Float32Array(w * h).fill(1);
    for (const [a, b, r] of chain) {
        const A = pts[a], B = pts[b], rad = r * torso + core;
        const x0 = Math.max(0, Math.floor(Math.min(A[0], B[0]) - rad - ease)), x1 = Math.min(w - 1, Math.ceil(Math.max(A[0], B[0]) + rad + ease));
        const y0 = Math.max(0, Math.floor(Math.min(A[1], B[1]) - rad - ease)), y1 = Math.min(h - 1, Math.ceil(Math.max(A[1], B[1]) + rad + ease));
        const dx = B[0] - A[0], dy = B[1] - A[1], L2 = dx * dx + dy * dy || 1;
        for (let y = y0; y <= y1; y++)
            for (let x = x0; x <= x1; x++) {
                const t = Math.max(0, Math.min(1, ((x - A[0]) * dx + (y - A[1]) * dy) / L2));
                // the hand end runs on past the hand point by one capsule radius (fingers)
                const d = Math.hypot(x - A[0] - t * dx, y - A[1] - t * dy) - rad;
                const u = Math.max(0, Math.min(1, d / ease)), v = u * u * (3 - 2 * u);
                const i = y * w + x;
                if (v < out[i])
                    out[i] = v;
            }
    }
    // fingers: a disc past the hand point along the wrist-to-hand direction
    const W2 = pts.wrist, Hd = pts.hand, len = Math.hypot(Hd[0] - W2[0], Hd[1] - W2[1]) || 1;
    const tip = [Hd[0] + (Hd[0] - W2[0]) / len * 0.06 * torso, Hd[1] + (Hd[1] - W2[1]) / len * 0.06 * torso];
    const rad = 0.075 * torso + core;
    for (let y = Math.max(0, Math.floor(tip[1] - rad - ease)); y <= Math.min(h - 1, Math.ceil(tip[1] + rad + ease)); y++)
        for (let x = Math.max(0, Math.floor(tip[0] - rad - ease)); x <= Math.min(w - 1, Math.ceil(tip[0] + rad + ease)); x++) {
            const d = Math.hypot(x - tip[0], y - tip[1]) - rad, u = Math.max(0, Math.min(1, d / ease)), v = u * u * (3 - 2 * u), i = y * w + x;
            if (v < out[i])
                out[i] = v;
        }
    return out;
}
function renderPostureBody(image, person, p, { bandShare = BAND_SHARE, fillMethod = "patchmatch", gridStep = 4, seed = 1, layers = false, amount = 1 } = {}, armStill = null) {
    const started = renderClock();
    // Layered compositing (matte -> un-mixed foreground -> clean plate) is the Studio path. Uncovered pixels cannot
    // keep the old body there, so "none" is refused. The guarded session keeps the earlier single-warp path.
    if (layers && fillMethod === "none")
        throw new RangeError("a silhouette-moving posture edit needs the background rebuilt");
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
            metrics: { strength_used: 1, reduced: false, band_px: radius, strip_pixels: 0, largest_move_px: 0, min_det: 1, version: layers ? VERSION : VERSION_SINGLE, render_ms: renderClock() - started, seam_audit_pass: true } };
    }
    const full = (layers && bodyField(p, person)) || tpsField(image.width, image.height, src, dst, { pins, step: gridStep });
    const weights = bandWeights(band, radius);
    if (armStill)
        for (let i = 0; i < weights.data.length; i++)
            weights.data[i] *= armStill[i];
    const head = layers ? headDisk(p.before) : null;
    const feet = layers ? footing(p.before) : null;
    const build = (s) => { let f = weighted(scale(full, s), weights); if (feet)
        f = plantFeet(f, feet); return head ? rigidHead(f, head) : f; };
    // amount (0..1) is a share of the largest move the fold guard allows, so the strength slider runs from
    // none to that limit instead of reaching it at the default and staying there.
    if (!(amount >= 0 && amount <= 1))
        throw new RangeError("amount must be 0..1");
    let safe = safeStrength(build, { requested: 1 });
    if (amount < 1)
        safe = safeStrength(build, { requested: safe.strength * amount });
    if (!layers) {
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
                largest_move_px: largest, max_field_move_px: stats.maxMove, min_det: safe.report.minDet, fill: fillMethod, version: VERSION_SINGLE,
                render_ms: renderClock() - started } };
    }
    // Layers: colour matte -> un-mixed foreground colour -> clean plate -> warp F and alpha only -> composite.
    const W = image.width, H = image.height, ch = image.channels, n = W * H;
    // The segmenter's person mask runs from about 0.08 on the background to about 0.98 inside the body, so the matte
    // never reached 0 or 1: the whole figure took the smooth un-mixed colour plus a few percent of the plate, and the
    // whole background was treated as fringe (a light rim). Stretch the mask between its two levels first.
    const solid = stretchMask(person.data);
    const matte = colourGuidedMatte(image, solid, Math.max(3, Math.min(9, Math.round(Math.max(W, H) * 0.006))));
    const { F } = estimateForeground(image, matte, Math.max(8, Math.round(Math.max(W, H) * 0.03)));
    const fg = { width: W, height: H, channels: ch, data: Uint8Array.from(image.data) };
    for (let i = 0; i < n; i++)
        if (matte[i] > 0.001 && matte[i] < 0.999)
            for (let c = 0; c < 3; c++)
                fg.data[i * ch + c] = Math.round(F[i * 3 + c]);
    const warpedF = apply(fg, safe.field);
    const matteMask = floatImage(W, H, 1);
    for (let i = 0; i < n; i++)
        matteMask.data[i] = matte[i];
    const alpha = floatImage(W, H, 1);
    for (let i = 0; i < n; i++)
        alpha.data[i] = Math.max(0, Math.min(1, samplePlane(matteMask, safe.field.mapX.data[i], safe.field.mapY.data[i])));
    // Bilinear resampling at sub-pixel moves softened the whole figure (texture 0.84): inside the moved body
    // (solid on both sides of the field, so the outline is left to the matte), keep the warped low band and carry
    // the person's own fine detail through the field, as Gender does.
    const moved = new Float32Array(W * H);
    for (let y = 0, i = 0; y < H; y++)
        for (let x = 0; x < W; x++, i++) {
            const mx = safe.field.mapX.data[i], my = safe.field.mapY.data[i];
            if (!(Math.abs(mx - x) + Math.abs(my - y) > 0.02 && alpha.data[i] >= 0.98))
                continue;
            const j = Math.min(H - 1, Math.max(0, Math.round(my))) * W + Math.min(W - 1, Math.max(0, Math.round(mx)));
            if (matte[j] >= 0.98)
                moved[i] = 1;
        }
    relayDetail(fg, warpedF, safe.field, moved);
    // Plate: the whole old figure (matte above 0.01, grown 2 px) is rebuilt from the clean background around it, so
    // the fill takes no colour from the body or its fringe (the un-mixed fringe and body-side boundary were the
    // dark smear beside the head). Only what the new alpha leaves visible shows.
    const plate = { width: W, height: H, channels: ch, data: Uint8Array.from(image.data) };
    const deepSeed = floatImage(W, H, 1);
    for (let i = 0; i < n; i++)
        if (matte[i] > 0.01)
            deepSeed.data[i] = 1;
    const strip = dilate(deepSeed, 2);
    let stripPixels = 0;
    for (let i = 0; i < n; i++)
        if (strip.data[i] > 0)
            stripPixels++;
    const filled = stripFill(plate, strip, person, fillMethod, seed);
    const background = fillMethod === "biharmonic" ? ownGrain(filled, image, strip, seed) : filled;
    const seamFix = harmonicSeam(background.data, plate.data, strip.data, W, H, ch, Math.max(3, Math.round(0.01 * Math.max(W, H))));
    const stats = moveStats(safe.field);
    const finished = alphaBlend(background, warpedF, alpha);
    // Outline: the un-mixed fringe colour is smooth, so hair ends and the shirt edge went soft. Carry the photo's own
    // fine detail through the field wherever the new alpha and the old matte both show the figure (alpha and the
    // matte agree there, so the edge itself is not counted twice). Where the field does not move (under 0.05 px,
    // easing in by 0.5 px) the photo is kept as it was, so a still outline has no seam at all.
    const fringe = new Float32Array(n);
    for (let y = 0, i = 0; y < H; y++)
        for (let x = 0; x < W; x++, i++) {
            if (!(alpha.data[i] >= FRINGE_ALPHA))
                continue;
            const j = Math.min(H - 1, Math.max(0, Math.round(safe.field.mapY.data[i]))) * W + Math.min(W - 1, Math.max(0, Math.round(safe.field.mapX.data[i])));
            if (matte[j] >= FRINGE_ALPHA)
                fringe[i] = 1;
        }
    relayDetail(image, finished, safe.field, fringe);
    for (let y = 0, i = 0; y < H; y++)
        for (let x = 0; x < W; x++, i++) {
            const d = Math.hypot(safe.field.mapX.data[i] - x, safe.field.mapY.data[i] - y);
            if (d >= STILL_PX[1])
                continue;
            const u = d <= STILL_PX[0] ? 1 : 1 - (d - STILL_PX[0]) / (STILL_PX[1] - STILL_PX[0]);
            for (let c = 0; c < ch; c++)
                finished.data[i * ch + c] = Math.round(u * image.data[i * ch + c] + (1 - u) * finished.data[i * ch + c]);
        }
    // Keep the photo's own grain where the edit is only a slight shift (largest channel change under 3 levels,
    // easing in by 10): the rebuilt and relayed pixels there are the same colour with different noise, which read
    // as a faint seam and halo along the outline.
    // The decision uses the largest change within KEEP_REACH px, not the pixel's own: per pixel, a turned stripe kept
    // the photo where flat and took the render at its edges, so a white hem's lines broke into steps (pelvic tilt,
    // sample B, 400%). Neighbours now share one decision; a flat area away from any real change still keeps its grain.
    const change = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        let d = 0;
        for (let c = 0; c < 3; c++)
            d = Math.max(d, Math.abs(finished.data[i * ch + c] - image.data[i * ch + c]));
        change[i] = d;
    }
    const near = maxFilter(change, W, H, KEEP_REACH);
    for (let i = 0; i < n; i++) {
        const d = near[i];
        if (d >= KEEP_LEVELS[1])
            continue;
        const t = d <= KEEP_LEVELS[0] ? 0 : (d - KEEP_LEVELS[0]) / (KEEP_LEVELS[1] - KEEP_LEVELS[0]), u = 1 - t * t * (3 - 2 * t);
        for (let c = 0; c < ch; c++)
            finished.data[i * ch + c] = Math.round(u * image.data[i * ch + c] + (1 - u) * finished.data[i * ch + c]);
    }
    // Audits measure the picture: ghost across the OLD outline, stair steps on the NEW one, halo outside it.
    const ghost = ghostAudit(finished, matte, alpha.data);
    const roughness = edgeRoughness(alpha.data, W, H), halo = haloStep(finished, alpha.data);
    const seamAudit = ghost.pass && roughness <= 0.3 && Math.abs(halo) <= 2.5;
    return { image: finished, band, strip, field: safe.field, strengthUsed: safe.strength, label: LABEL,
        metrics: { strength_used: safe.strength, reduced: safe.reduced, band_px: radius, strip_pixels: stripPixels,
            largest_move_px: largest, max_field_move_px: stats.maxMove, min_det: safe.report.minDet, fill: fillMethod, version: VERSION,
            ghost_score: Math.round(ghost.score * 1000) / 1000, ghost_p90_score: Math.round(ghost.p90Score * 1000) / 1000, ghost_samples: ghost.samples,
            edge_roughness_px: Math.round(roughness * 1000) / 1000, halo_step_l: Math.round(halo * 100) / 100, plate_seam_correction: Math.round(seamFix * 10) / 10,
            seam_audit_pass: seamAudit, arm_still: armStill !== null, arm_still_max_diff: armStillDiff(), render_ms: renderClock() - started } };
    function armStillDiff() {
        if (!armStill)
            return -1;
        let d = 0;
        for (let i = 0; i < n; i++)
            if (armStill[i] === 0)
                for (let c = 0; c < 3; c++)
                    d = Math.max(d, Math.abs(finished.data[i * ch + c] - image.data[i * ch + c]));
        return d;
    }
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
