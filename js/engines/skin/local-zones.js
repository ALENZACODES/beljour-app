/** Landmark zones and shared measurements for the local skin touch-up tools (#26, #27, #28).
 * Mirrors api/plumb_api/engines/skin/local_zones.py: the same zones (forehead, glabella,
 * crow's feet, under-eye crescents, nasolabial folds) built from the 478-point mesh in pixels,
 * clipped to the visible skin region, the same coded mesh refusals, normalised local means,
 * row-major 4-neighbour components, alpha-keeping Lab write-back and the identity check.
 * Zone proportions and the identity limit are ASSUMED, as in Python.
 * Local simulation; general cosmetic information, not medical advice.
 * Author: John Khan.
 */
import { floatImage, requireColour } from "../core/buffer.js";
import { boxMean } from "../core/filters.js";
import { blur, dilate as dilateMask, emptyMask, erode, polygon } from "../core/mask.js";
import { CONTOURS, regionMask } from "../../data/regions/index.js";
import { labToSrgb, toByte } from "../shade/colourspace.js";
export const VERSION = "skin-touch-up/1";
export const NOT_MEDICAL = "General cosmetic information, not medical advice.";
export const ZONES = ["forehead", "glabella", "crow_feet", "under_eye", "nasolabial"];
export const SIDES = ["right", "left"];
const LOWER_LID = {
    right: [33, 7, 163, 144, 145, 153, 154, 155, 133], left: [263, 249, 390, 373, 374, 380, 381, 382, 362]
};
const EYE_CORNERS = { right: [33, 133], left: [263, 362] };
const IRIS_CENTRES = { right: 468, left: 473 };
const FOREHEAD_OVAL = [54, 103, 67, 109, 10, 338, 297, 332, 284];
const BROW_TOP = [300, 293, 334, 296, 336, 107, 66, 105, 63, 70];
const INNER_BROWS = [55, 107, 285, 336];
const NOSE_WING = { right: 129, left: 358 };
const MOUTH_CORNER = { right: 61, left: 291 };
export const LID_GAP = 0.06, UNDER_EYE_DEPTH = 0.45, BROW_GAP = 0.15;
const CROW_OFFSET = 0.55, CROW_RX = 0.45, CROW_RY = 0.55;
const GLABELLA_RY = 0.45, GLABELLA_DROP = 0.10, GLABELLA_RX_SHARE = 0.35;
const FOLD_START = 0.20, FOLD_END = 0.15, FOLD_RADIUS = 0.16;
const FEATHER = 0.06, ELLIPSE_POINTS = 32, CAP_POINTS = 12;
export const GUARD_MEAN_DELTA_E = 1.5;
export const MIN_SKIN_PIXELS = 16;
// Mesh refusals (api/plumb_api/engines/core/refusal.py).
const MIN_IOD_PX = 6, MIN_FACE_WIDTH_PX = 16, MIN_OVAL_AREA_PX = 64, MIN_IN_FRAME_SHARE = 0.5, DUPLICATE_PX = 1e-6;
export const MESSAGES = {
    wrong_shape: "The face mesh does not have the expected 478 points.",
    not_finite: "The face mesh has missing or infinite coordinates.",
    duplicate_points: "Two landmarks sit on the same spot, so the face cannot be triangulated.",
    face_too_small: "The face is too small in this photo to edit safely.",
    eyes_coincide: "The two eye centres coincide, so the face has no scale.",
    no_face_width: "The face outline has no width.",
    no_face_length: "The top of the face and the chin coincide.",
    zero_area_face: "The face outline encloses almost no area.",
    outside_frame: "Most of the face lies outside the photo.",
    zone_too_small: "The area to edit is smaller than its soft edge.",
    edited: "Local touch-up made.",
    zero_strength: "Strength is zero, so the photo is unchanged.",
    nothing_to_heal: "No spot to heal was found or marked. Natural marks are kept.",
    no_lines_found: "No fine lines were found in the chosen zones.",
    no_dark_circle: "The under-eye skin already matches the cheek, so nothing was changed.",
    zone_not_visible: "The chosen zone is not visible enough in this photo.",
    no_skin_visible: "Not enough visible skin to edit.",
    identity_guard: "This change would alter the face too much, so it was not applied.",
};
export function checkPhoto(image, strength) {
    requireColour(image);
    if (Math.min(image.width, image.height) < 8)
        throw new RangeError("skin touch-up needs a photo at least 8 by 8");
    if (typeof strength !== "number" || !Number.isFinite(strength))
        throw new RangeError("strength must be a finite number");
    if (strength < 0 || strength > 100)
        throw new RangeError("strength must be 0..100");
}
export function meshPoints(landmarks) {
    if (!Array.isArray(landmarks) || landmarks.some((p) => !p || p.length < 2))
        throw new RangeError("landmarks must be 478 (x, y) pixel points");
    return landmarks.map((p) => [Number(p[0]), Number(p[1])]);
}
function shoelace(pts) {
    let a = 0, b = 0;
    for (let i = 0; i < pts.length; i++) {
        const j = (i + 1) % pts.length;
        a += pts[i][0] * pts[j][1];
        b += pts[i][1] * pts[j][0];
    }
    return Math.abs(a - b) / 2;
}
/** First refusal code of core/refusal.inspect_mesh, or null for a usable mesh. */
export function meshRefusal(pts, height, width) {
    if (pts.length !== 478)
        return "wrong_shape";
    if (!pts.every((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 1e6 && Math.abs(p[1]) <= 1e6))
        return "not_finite";
    const codes = [];
    let min = Infinity;
    for (let i = 0; i < pts.length; i++)
        for (let j = 0; j < pts.length; j++) {
            if (i === j)
                continue;
            const dx = pts[i][0] - pts[j][0], dy = pts[i][1] - pts[j][1];
            min = Math.min(min, dx * dx + dy * dy);
        }
    if (min <= DUPLICATE_PX * DUPLICATE_PX)
        codes.push("duplicate_points");
    const iod = Math.hypot(pts[473][0] - pts[468][0], pts[473][1] - pts[468][1]);
    if (iod <= 1e-9)
        codes.push("eyes_coincide");
    else if (iod < MIN_IOD_PX)
        codes.push("face_too_small");
    if (Math.hypot(pts[152][0] - pts[10][0], pts[152][1] - pts[10][1]) < 1)
        codes.push("no_face_length");
    const faceWidth = Math.hypot(pts[454][0] - pts[234][0], pts[454][1] - pts[234][1]);
    if (faceWidth <= 1e-9)
        codes.push("no_face_width");
    else if (faceWidth < MIN_FACE_WIDTH_PX && !codes.includes("face_too_small"))
        codes.push("face_too_small");
    if (shoelace(CONTOURS.face_oval.map((i) => pts[i])) < MIN_OVAL_AREA_PX)
        codes.push("zero_area_face");
    let inside = 0;
    for (const p of pts)
        if (p[0] >= 0 && p[0] < width && p[1] >= 0 && p[1] < height)
            inside++;
    if (inside / pts.length < MIN_IN_FRAME_SHARE)
        codes.push("outside_frame");
    return codes.length ? codes[0] : null;
}
export function copyImage(image) {
    return { width: image.width, height: image.height, channels: image.channels, data: Uint8ClampedArray.from(image.data) };
}
export function unchanged(image, status, code, label, report = {}) {
    return { image: copyImage(image), alpha: new Float64Array(image.width * image.height), status, reasonCode: code,
        message: MESSAGES[code], label, report: { ...report } };
}
/** Round half up, as Python's local_zones.half_up. */
export const halfUp = (x) => Math.floor(x + 0.5);
function unit(x, y) {
    const n = Math.hypot(x, y);
    return n > 0 ? [x / n, y / n] : [1, 0];
}
export function faceFrame(pts) {
    const r = pts[IRIS_CENTRES.right], l = pts[IRIS_CENTRES.left];
    const u = unit(l[0] - r[0], l[1] - r[1]);
    const eyeWidth = { right: 0, left: 0 };
    for (const side of SIDES) {
        const [a, b] = EYE_CORNERS[side];
        eyeWidth[side] = Math.hypot(pts[a][0] - pts[b][0], pts[a][1] - pts[b][1]);
    }
    return { iod: Math.hypot(l[0] - r[0], l[1] - r[1]), u, d: [-u[1], u[0]], eyeWidth };
}
function outward(frame, side) {
    return side === "right" ? [-frame.u[0], -frame.u[1]] : frame.u;
}
export function ellipse(cx, cy, rx, ry, axis, n = ELLIPSE_POINTS) {
    const [ax, ay] = axis, out = [];
    for (let k = 0; k < n; k++) {
        const t = 2 * Math.PI * k / n, c = Math.cos(t) * rx, s = Math.sin(t) * ry;
        out.push([cx + c * ax - s * ay, cy + c * ay + s * ax]);
    }
    return out;
}
export function capsule(a, b, radius, n = CAP_POINTS) {
    const [dx, dy] = unit(b[0] - a[0], b[1] - a[1]), base = Math.atan2(dy, dx), out = [];
    for (const [end, start] of [[b, base - Math.PI / 2], [a, base + Math.PI / 2]]) {
        for (let k = 0; k <= n; k++) {
            const t = start + Math.PI * k / n;
            out.push([end[0] + radius * Math.cos(t), end[1] + radius * Math.sin(t)]);
        }
    }
    return out;
}
export function underEyePolygon(pts, frame, side, depthShare = UNDER_EYE_DEPTH) {
    const ew = frame.eyeWidth[side], [dx, dy] = frame.d, lid = LOWER_LID[side].map((i) => pts[i]);
    const last = lid.length - 1, gap = LID_GAP * ew;
    const upper = lid.map((p) => [p[0] + dx * gap, p[1] + dy * gap]);
    const lower = lid.map((p, k) => {
        const drop = gap + depthShare * ew * (0.25 + 0.75 * Math.sin(Math.PI * k / last));
        return [p[0] + dx * drop, p[1] + dy * drop];
    });
    return [...upper, ...lower.reverse()];
}
export function cheekReferencePolygon(pts, frame, side, depthShare = UNDER_EYE_DEPTH) {
    const ew = frame.eyeWidth[side], centre = pts[LOWER_LID[side][4]], drop = (LID_GAP + depthShare + 0.3) * ew;
    return ellipse(centre[0] + frame.d[0] * drop, centre[1] + frame.d[1] * drop, 0.4 * ew, 0.18 * ew, frame.u);
}
export function zonePolygons(pts, frame, name) {
    const ew = (frame.eyeWidth.right + frame.eyeWidth.left) / 2, [dx, dy] = frame.d;
    if (name === "forehead") {
        const top = FOREHEAD_OVAL.map((i) => [pts[i][0], pts[i][1]]);
        const brows = BROW_TOP.map((i) => [pts[i][0] - dx * BROW_GAP * ew, pts[i][1] - dy * BROW_GAP * ew]);
        return [[...top, ...brows]];
    }
    if (name === "glabella") {
        let sx = 0, sy = 0;
        for (const i of INNER_BROWS) {
            sx += pts[i][0];
            sy += pts[i][1];
        }
        const cx = sx / 4 + dx * GLABELLA_DROP * ew, cy = sy / 4 + dy * GLABELLA_DROP * ew;
        const gap = Math.hypot(pts[55][0] - pts[285][0], pts[55][1] - pts[285][1]);
        return [ellipse(cx, cy, GLABELLA_RX_SHARE * gap, GLABELLA_RY * ew, frame.u)];
    }
    if (name === "crow_feet") {
        return SIDES.map((side) => {
            const w = frame.eyeWidth[side], [ox, oy] = outward(frame, side), corner = pts[EYE_CORNERS[side][0]];
            return ellipse(corner[0] + ox * CROW_OFFSET * w, corner[1] + oy * CROW_OFFSET * w, CROW_RX * w, CROW_RY * w, frame.u);
        });
    }
    if (name === "under_eye")
        return SIDES.map((side) => underEyePolygon(pts, frame, side));
    if (name === "nasolabial") {
        return SIDES.map((side) => {
            const [ox, oy] = outward(frame, side), wing = pts[NOSE_WING[side]], corner = pts[MOUTH_CORNER[side]];
            return capsule([wing[0] + ox * FOLD_START * ew, wing[1] + oy * FOLD_START * ew], [corner[0] + ox * FOLD_END * ew, corner[1] + oy * FOLD_END * ew], FOLD_RADIUS * ew);
        });
    }
    throw new RangeError(`unknown zone ${String(name)}; choose from ${ZONES.join(", ")}`);
}
export function skinRegion(pts, height, width) {
    const m = regionMask("skin", pts, width, height, { normalized: false }), out = new Uint8Array(width * height);
    for (let i = 0; i < out.length; i++)
        out[i] = m.data[i] >= 0.5 ? 1 : 0;
    return out;
}
export const featherRadius = (frame) => Math.max(1, halfUp(FEATHER * (frame.eyeWidth.right + frame.eyeWidth.left) / 2));
export function polygonsMask(polys, height, width, skin, radius) {
    const raw = emptyMask(width, height);
    for (const poly of polys) {
        const m = polygon(width, height, poly);
        for (let i = 0; i < raw.data.length; i++)
            if (m.data[i] > raw.data[i])
                raw.data[i] = m.data[i];
    }
    const soft = blur(raw, radius);
    for (let i = 0; i < soft.data.length; i++)
        if (!skin[i])
            soft.data[i] = 0;
    return soft;
}
export function checkZones(names) {
    if (!names.length || names.some((n) => !ZONES.includes(n)) || new Set(names).size !== names.length) {
        throw new RangeError(`zones must be distinct names from ${ZONES.join(", ")}`);
    }
    return names;
}
export function zoneMask(pts, height, width, names, skin, frame = faceFrame(pts)) {
    const polys = checkZones(names).flatMap((name) => zonePolygons(pts, frame, name));
    return polygonsMask(polys, height, width, skin, featherRadius(frame));
}
const linearOf = (v) => { const c = Math.min(1, Math.max(0, v / 255)); return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
/** linearOf for each whole byte, computed once with the same expression (R7 measurements). */
const LAB_LINEAR = Float64Array.from({ length: 256 }, (_, v) => linearOf(v));
/** CIELAB per pixel with the same arithmetic as engines/core/colour.srgb_to_lab_array. */
export function labOf(image) {
    const n = image.width * image.height, out = floatImage(image.width, image.height, 3, true);
    const lin = (v) => (v & 255) === v ? LAB_LINEAR[v] : linearOf(v);
    const f = (t) => t > (6 / 29) ** 3 ? Math.cbrt(t) : t / (3 * (6 / 29) * (6 / 29)) + 4 / 29;
    for (let i = 0; i < n; i++) {
        const p = i * image.channels, r = lin(image.data[p]), g = lin(image.data[p + 1]), b = lin(image.data[p + 2]);
        const x = 100 * (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 95.047;
        const y = 100 * (0.2126729 * r + 0.7151522 * g + 0.0721750 * b) / 100.0;
        const z = 100 * (0.0193339 * r + 0.1191920 * g + 0.9503041 * b) / 108.883;
        const fx = f(x), fy = f(y), fz = f(z);
        out.data[i * 3] = 116 * fy - 16;
        out.data[i * 3 + 1] = 500 * (fx - fy);
        out.data[i * 3 + 2] = 200 * (fy - fz);
    }
    return out;
}
/** Mean of `values` over the weighted pixels of each (2r+1)^2 window; `fallback` where none. */
export function localMean(values, weight, radius, fallback = values) {
    const { width: w, height: h, channels: ch } = values, n = w * h;
    const wt = floatImage(w, h, 1, true), weighted = floatImage(w, h, ch, true);
    for (let i = 0; i < n; i++) {
        wt.data[i] = weight[i] ? 1 : 0;
        for (let c = 0; c < ch; c++)
            weighted.data[i * ch + c] = values.data[i * ch + c] * wt.data[i];
    }
    const den = boxMean(wt, radius), num = boxMean(weighted, radius), out = floatImage(w, h, ch, true);
    for (let i = 0; i < n; i++) {
        const ok = den.data[i] > 1e-9, safe = ok ? den.data[i] : 1;
        for (let c = 0; c < ch; c++)
            out.data[i * ch + c] = ok ? num.data[i * ch + c] / safe : fallback.data[i * ch + c];
    }
    return out;
}
/** 4-neighbour components as sorted flat indices, in row-major order of their first pixel. */
export function components(mask, width, height) {
    const seen = new Uint8Array(width * height), out = [];
    for (let start = 0; start < mask.length; start++) {
        if (!mask[start] || seen[start])
            continue;
        seen[start] = 1;
        const queue = [start], members = [];
        for (let head = 0; head < queue.length; head++) {
            const i = queue[head], x = i % width, y = Math.floor(i / width);
            members.push(i);
            for (const [j, ok] of [[i - width, y > 0], [i - 1, x > 0], [i + 1, x < width - 1], [i + width, y < height - 1]]) {
                if (ok && mask[j] && !seen[j]) {
                    seen[j] = 1;
                    queue.push(j);
                }
            }
        }
        out.push(members.sort((a, b) => a - b));
    }
    return out;
}
function medianOf(values) {
    const s = values.sort((a, b) => a - b), n = s.length;
    return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}
export function medianLab(lab, mask) {
    const cols = [[], [], []];
    for (let i = 0; i < mask.length; i++)
        if (mask[i])
            for (let c = 0; c < 3; c++)
                cols[c].push(lab.data[i * 3 + c]);
    return [medianOf(cols[0]), medianOf(cols[1]), medianOf(cols[2])];
}
/** Encode the changed pixels' Lab to sRGB bytes; every other byte and all alpha stay. */
export function writeLab(image, lab, changed) {
    const out = copyImage(image);
    for (let i = 0; i < changed.length; i++) {
        if (!changed[i])
            continue;
        const rgb = labToSrgb([lab.data[i * 3], lab.data[i * 3 + 1], lab.data[i * 3 + 2]]);
        for (let c = 0; c < 3; c++)
            out.data[i * image.channels + c] = toByte(rgb[c]);
    }
    return out;
}
export function erodedSkin(skin, width, height, margin) {
    if (!(margin > 0))
        return Uint8Array.from(skin);
    const m = floatImage(width, height, 1);
    for (let i = 0; i < skin.length; i++)
        m.data[i] = skin[i];
    const e = erode(m, margin), out = new Uint8Array(skin.length);
    for (let i = 0; i < out.length; i++)
        out[i] = e.data[i] >= 0.5 ? 1 : 0;
    return out;
}
export function identityCheck(before, after, skin) {
    let count = 0;
    for (const v of skin)
        count += v;
    if (!count)
        return { skin_pixels: 0, mean_delta_e: 0, max_delta_e: 0, changed_share: 0, holds: true };
    const a = labOf(before), b = labOf(after);
    let total = 0, max = 0, touched = 0;
    for (let i = 0; i < skin.length; i++) {
        if (!skin[i])
            continue;
        const d0 = a.data[i * 3] - b.data[i * 3], d1 = a.data[i * 3 + 1] - b.data[i * 3 + 1], d2 = a.data[i * 3 + 2] - b.data[i * 3 + 2];
        const de = Math.sqrt(d0 * d0 + d1 * d1 + d2 * d2);
        total += de;
        max = Math.max(max, de);
        const p = i * before.channels;
        if (before.data[p] !== after.data[p] || before.data[p + 1] !== after.data[p + 1] || before.data[p + 2] !== after.data[p + 2])
            touched++;
    }
    const mean = total / count;
    return { skin_pixels: count, mean_delta_e: mean, max_delta_e: max, changed_share: touched / count, holds: mean <= GUARD_MEAN_DELTA_E };
}
/** Run the identity check; refuse (original kept) when it does not hold. */
export function finish(original, edited, alpha, skin, label, report) {
    const identity = identityCheck(original, edited, skin), full = { ...report, identity };
    if (!identity.holds)
        return unchanged(original, "refused", "identity_guard", label, full);
    return { image: edited, alpha, status: "edited", reasonCode: "edited", message: MESSAGES.edited, label, report: full };
}
/** Grow a 0/1 plane by `radius` px (core dilate at level 0.5). */
export function dilateBits(bits, width, height, radius) {
    const m = floatImage(width, height, 1);
    for (let i = 0; i < bits.length; i++)
        m.data[i] = bits[i];
    const grown = dilateMask(m, radius), out = new Uint8Array(bits.length);
    for (let i = 0; i < out.length; i++)
        out[i] = grown.data[i] >= 0.5 ? 1 : 0;
    return out;
}
//# sourceMappingURL=local-zones.js.map