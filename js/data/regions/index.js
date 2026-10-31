/** E05: Face Mesh named masks. The index arrays are *generated*, not maintained
 * here; edits to canonical topology belong in regions.py.
 * Face-mapping credits (licences.json "concepts"): runtime data from MediaPipe Face
 * Landmarker (mesh contour indices, Bucket A); concept only, no code copied:
 * face-parsing.PyTorch (named facial region classes), from its README.
 * R13: self-intersecting contours fall back to their convex hull; a closed eye or
 * mouth is an explicit "not visible" state. Turned faces mirror regions.py and
 * eyes/turn_visibility.py: a narrow eye (width ratio, optional depth support) or a folded
 * eye (swapped corners with the nose tip moved toward it) is declared hidden_by_turn, and a
 * turn that folds the face oval over the face uses the oval's hull (hull_fallback).
 * Mirrors regions.py. Author: John Khan. */
import { floatImage } from "../../engines/core/buffer.js";
import { polygon, scanlineCrossings, subtract, union } from "../../engines/core/mask.js";
import { CONTOURS, IRISES, IRIS_SEGMENTS, REGIONS } from "./generated/topology.js";
export { CONTOURS, IRISES, IRIS_SEGMENTS, REGIONS };
/** Normalised MediaPipe coordinates or pixel positions. Neither is clamped:
 * polygons outside the frame must clip, exactly as the Python masks do. */
export function pixelPoints(source, width, height, normalized = true) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
        throw new RangeError("region image needs positive whole dimensions");
    }
    if (!Array.isArray(source) || source.length < 3 || source.length > 478) {
        throw new RangeError("region landmarks must have 3..478 points");
    }
    return source.map((point) => {
        const x = Array.isArray(point) ? point[0] : point.x;
        const y = Array.isArray(point) ? point[1] : point.y;
        if (!Number.isFinite(x) || !Number.isFinite(y))
            throw new RangeError("landmarks must be finite (x, y) points");
        return [normalized ? x * width : x, normalized ? y * height : y];
    });
}
export function irisOutline(points, iris) {
    const [centerIndex, edgeIndices] = iris;
    if (centerIndex >= points.length || edgeIndices.some((index) => index >= points.length)) {
        throw new RangeError("iris regions need a 478-point mesh");
    }
    const [cx, cy] = points[centerIndex];
    const a = points[edgeIndices[0]], b = points[edgeIndices[1]];
    const c = points[edgeIndices[2]], d = points[edgeIndices[3]];
    const ux = (a[0] - c[0]) / 2, uy = (a[1] - c[1]) / 2;
    const vx = (b[0] - d[0]) / 2, vy = (b[1] - d[1]) / 2;
    return Array.from({ length: IRIS_SEGMENTS }, (_, i) => {
        const angle = i * 2 * Math.PI / IRIS_SEGMENTS;
        return [cx + Math.cos(angle) * ux + Math.sin(angle) * vx,
            cy + Math.cos(angle) * uy + Math.sin(angle) * vy];
    });
}
export const HULL_FALLBACK = ["face_oval", "right_eye", "left_eye", "right_brow", "left_brow", "lips_outer"];
export const EYE_CLOSED_RATIO = 0.08;
export const MOUTH_CLOSED_RATIO = 0.02;
export const EYE_LIDS = { right: [159, 145, 33, 133], left: [386, 374, 263, 362] };
export const MOUTH_LIPS = [13, 14, 61, 291];
export const REGIONS_VERSION = "visible-regions-r13/1";
/** eyes/turn_visibility.py limits (ASSUMED there) and regions.py FOLD_NOSE_SHIFT (ASSUMED, C16). */
export const WIDTH_RATIO_LIMIT = 0.40, DEPTH_RATIO_MIN = 0.55, MIN_REFERENCE_WIDTH = 4.0, FOLD_NOSE_SHIFT = 0.10;
const SIDES = ["right", "left"];
/** Mesh depth exactly as Python reads it: only from array points that all carry a finite z. */
function depths(source, count) {
    if (source.length !== count)
        return null;
    const out = [];
    for (const point of source) {
        if (!Array.isArray(point) || point.length < 3)
            return null;
        const z = Number(point[2]);
        if (!Number.isFinite(z))
            return null;
        out.push(z);
    }
    return out;
}
const mean = (points, ids) => {
    let x = 0, y = 0;
    for (const id of ids) {
        x += points[id][0];
        y += points[id][1];
    }
    return [x / ids.length, y / ids.length];
};
/** A narrow projected eye proposed as hidden by the turn, with optional depth support. */
export function turnEvidence(points, source, depthScale = 1) {
    const none = (ratio = 1) => ({ candidate: null, widthRatio: ratio, depthRatio: null, supportedByDepth: false });
    const required = SIDES.flatMap((side) => [...EYE_LIDS[side], ...CONTOURS[`${side}_eye`]]);
    if (points.length <= Math.max(...required) || !points.every((p) => Number.isFinite(p[0]) && Number.isFinite(p[1])))
        return none();
    const widths = {}, centres = {};
    for (const side of SIDES) {
        const [, , a, b] = EYE_LIDS[side];
        widths[side] = Math.hypot(points[a][0] - points[b][0], points[a][1] - points[b][1]);
        centres[side] = mean(points, CONTOURS[`${side}_eye`]);
    }
    const larger = Math.max(widths.right, widths.left), smaller = Math.min(widths.right, widths.left);
    const ratio = larger > 0 ? smaller / larger : 1;
    if (larger < MIN_REFERENCE_WIDTH || smaller <= 0 || ratio > WIDTH_RATIO_LIMIT)
        return none(ratio);
    const candidate = widths.left < widths.right ? "left" : "right";
    const depth = depths(source, points.length);
    if (!depth)
        return { candidate, widthRatio: ratio, depthRatio: null, supportedByDepth: false };
    const z = {};
    for (const side of SIDES) {
        const ids = CONTOURS[`${side}_eye`];
        let total = 0;
        for (const id of ids)
            total += depth[id];
        z[side] = total / ids.length * depthScale;
    }
    const dx = centres.right[0] - centres.left[0], dy = centres.right[1] - centres.left[1], dz = z.right - z.left;
    const span = Math.hypot(Math.hypot(dx, dy), dz);
    const depthRatio = span > 0 ? Math.abs(dz) / span : 0;
    const farther = candidate === "right" ? "left" : "right";
    return { candidate, widthRatio: ratio, depthRatio, supportedByDepth: depthRatio >= DEPTH_RATIO_MIN && z[candidate] > z[farther] };
}
const orientation = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const same = (a, b) => a[0] === b[0] && a[1] === b[1];
/** True when two non-adjacent edges of the closed loop properly cross. */
export function selfIntersects(points) {
    const n = points.length;
    for (let i = 0; i < n; i++) {
        const a = points[i], b = points[(i + 1) % n];
        if (same(a, b))
            continue;
        for (let j = i + 2; j < n; j++) {
            if (i === 0 && j === n - 1)
                continue;
            const c = points[j], d = points[(j + 1) % n];
            if (same(c, d))
                continue;
            const o1 = orientation(a, b, c), o2 = orientation(a, b, d);
            const o3 = orientation(c, d, a), o4 = orientation(c, d, b);
            if (o1 * o2 < 0 && o3 * o4 < 0)
                return true;
        }
    }
    return false;
}
/** Andrew's monotone chain, counter-clockwise, no repeated end point. */
export function convexHull(points) {
    const seen = new Map();
    for (const p of points)
        seen.set(`${p[0]},${p[1]}`, [p[0], p[1]]);
    const unique = [...seen.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (unique.length < 3)
        return unique;
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower = [], upper = [];
    for (const p of unique) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0)
            lower.pop();
        lower.push(p);
    }
    for (const p of [...unique].reverse()) {
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0)
            upper.pop();
        upper.push(p);
    }
    return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
function insideLoop(loop, x, y) {
    let count = 0;
    for (const c of scanlineCrossings(loop, y))
        if (c < x)
            count++;
    return count % 2 === 1;
}
/** One face, one lazy polygon cache. RGB is intentionally absent: skin tone and
 * exposure cannot determine whether a pixel belongs to a landmark region. */
class RegionBuilder {
    width;
    height;
    points;
    raw = new Map();
    visible = new Map();
    supersample;
    hulls = [];
    turn;
    constructor(source, width, height, options) {
        this.width = width;
        this.height = height;
        const normalized = options.normalized ?? true;
        this.points = pixelPoints(source, width, height, normalized);
        this.supersample = options.supersample ?? 4;
        this.turn = turnEvidence(this.points, source, normalized ? width : 1);
    }
    verts(name) {
        const ids = CONTOURS[name];
        if (ids.some((id) => id >= this.points.length))
            throw new RangeError(`${name} needs a full face mesh`);
        return ids.map((id) => this.points[id]);
    }
    /** The face-oval loop with only the self-crossing hull fallback (no turn fallback). */
    headLoop() {
        const verts = this.verts("face_oval");
        if (selfIntersects(verts)) {
            const hull = convexHull(verts);
            if (hull.length >= 3)
                return hull;
        }
        return verts;
    }
    /** The eye whose corners swapped order along the eye line, with the nose tip moved toward it. */
    foldedSide() {
        const need = Math.max(...CONTOURS.right_eye, ...CONTOURS.left_eye);
        if (this.points.length <= need)
            return null;
        const right = mean(this.points, CONTOURS.right_eye), left = mean(this.points, CONTOURS.left_eye);
        const ax = left[0] - right[0], ay = left[1] - right[1], norm = Math.hypot(ax, ay);
        if (norm <= 1e-9)
            return null;
        const ux = ax / norm, uy = ay / norm, p = this.points;
        const signedRight = (p[133][0] - p[33][0]) * ux + (p[133][1] - p[33][1]) * uy;
        const signedLeft = (p[263][0] - p[362][0]) * ux + (p[263][1] - p[362][1]) * uy;
        const shift = ((p[1][0] - (right[0] + left[0]) / 2) * ux + (p[1][1] - (right[1] + left[1]) / 2) * uy) / norm;
        if (signedRight <= 0 && signedLeft > 0 && shift <= -FOLD_NOSE_SHIFT)
            return "right";
        if (signedLeft <= 0 && signedRight > 0 && shift >= FOLD_NOSE_SHIFT)
            return "left";
        return null;
    }
    turnSide() { return this.turn.candidate ?? this.foldedSide(); }
    /** A measured turn has folded the oval: an eye centre lies outside the raw loop. */
    ovalFolded() {
        if (this.turnSide() === null)
            return false;
        const oval = this.headLoop();
        return SIDES.some((side) => { const [x, y] = mean(this.points, CONTOURS[`${side}_eye`]); return !insideLoop(oval, x, y); });
    }
    hiddenByTurn(side) {
        if (this.turnSide() !== side)
            return false;
        if (this.turn.candidate === null)
            return true;
        return this.turn.supportedByDepth || !this.eyeOnFace(side);
    }
    loop(name) {
        const verts = this.verts(name);
        const folded = name === "face_oval" && this.ovalFolded();
        if (HULL_FALLBACK.includes(name) && (folded || selfIntersects(verts))) {
            const hull = convexHull(verts);
            if (hull.length >= 3) {
                if (!this.hulls.includes(name))
                    this.hulls.push(name);
                return hull;
            }
        }
        return verts;
    }
    contour(name) {
        const existing = this.raw.get(name);
        if (existing)
            return existing;
        const mask = polygon(this.width, this.height, this.loop(name), this.supersample);
        this.raw.set(name, mask);
        return mask;
    }
    ratio(ids) {
        if (Math.max(...ids) >= this.points.length)
            return 1;
        const [a, b, c, d] = ids.map((i) => this.points[i]);
        const width = Math.hypot(d[0] - c[0], d[1] - c[1]);
        return width > 1e-9 ? Math.hypot(b[0] - a[0], b[1] - a[1]) / width : 0;
    }
    eyeClosed(side) { return this.ratio(EYE_LIDS[side]) < EYE_CLOSED_RATIO; }
    mouthClosed() { return this.ratio(MOUTH_LIPS) < MOUTH_CLOSED_RATIO; }
    eyeOnFace(side) {
        const ids = CONTOURS[`${side}_eye`];
        let x = 0, y = 0;
        for (const id of ids) {
            x += this.points[id][0];
            y += this.points[id][1];
        }
        return insideLoop(this.headLoop(), x / ids.length, y / ids.length);
    }
    closedReason(name) {
        for (const side of SIDES) {
            if (name === `${side}_eye` || name === `${side}_iris` || name === `${side}_brow`) {
                if (this.hiddenByTurn(side))
                    return "hidden_by_turn";
                if (name !== `${side}_brow` && this.eyeClosed(side) && this.eyeOnFace(side))
                    return "closed";
            }
        }
        if (name === "eyes" || name === "irises" || name === "brows") {
            const kind = name === "brows" ? "brow" : "eye";
            const reasons = SIDES.map((side) => this.closedReason(`${side}_${kind}`));
            if (reasons.every(Boolean))
                return reasons.includes("hidden_by_turn") ? "hidden_by_turn" : "closed";
        }
        if (name === "mouth_opening" && this.mouthClosed())
            return "closed";
        return null;
    }
    state(name) {
        let total = 0;
        for (const v of this.get(name).data)
            total += v;
        if (total > 0)
            return "visible";
        const reason = this.closedReason(name);
        return reason ? `not_visible:${reason}` : "empty";
    }
    contained(name) {
        const existing = this.visible.get(name);
        if (existing)
            return existing;
        if (name === "right_eye" || name === "left_eye" || name === "right_brow" || name === "left_brow") {
            const side = name.split("_")[0];
            if (this.hiddenByTurn(side)) {
                const hidden = floatImage(this.width, this.height);
                this.visible.set(name, hidden);
                return hidden;
            }
        }
        const oval = this.contour("face_oval"), raw = this.contour(name);
        const out = floatImage(this.width, this.height);
        for (let i = 0; i < out.data.length; i++)
            out.data[i] = oval.data[i] >= 1 - 1e-6 ? raw.data[i] : 0;
        this.visible.set(name, out);
        return out;
    }
    iris(side) {
        const key = `${side}_iris`;
        const existing = this.visible.get(key);
        if (existing)
            return existing;
        if (this.hiddenByTurn(side)) {
            const hidden = floatImage(this.width, this.height);
            this.visible.set(key, hidden);
            return hidden;
        }
        const spec = IRISES[key];
        const raw = polygon(this.width, this.height, irisOutline(this.points, [spec[0], spec[1]]), this.supersample);
        const eye = this.contained(`${side}_eye`);
        const out = floatImage(this.width, this.height);
        for (let i = 0; i < out.data.length; i++)
            out.data[i] = Math.min(raw.data[i], eye.data[i]);
        this.visible.set(key, out);
        return out;
    }
    get(name) {
        if (!REGIONS.includes(name))
            throw new RangeError(`unknown region ${name}`);
        if (name === "face_oval")
            return this.contour(name);
        if (name in CONTOURS)
            return this.contained(name);
        switch (name) {
            case "lips": return subtract(this.contained("lips_outer"), this.contained("lips_inner"));
            case "mouth_opening": {
                const raw = this.contained("lips_inner"), parent = this.contained("lips_outer");
                const out = floatImage(this.width, this.height);
                for (let i = 0; i < out.data.length; i++)
                    out.data[i] = Math.min(raw.data[i], parent.data[i]);
                return out;
            }
            case "eyes": return union(this.contained("right_eye"), this.contained("left_eye"));
            case "brows": return union(this.contained("right_brow"), this.contained("left_brow"));
            case "right_iris": return this.iris("right");
            case "left_iris": return this.iris("left");
            case "irises": return union(this.iris("right"), this.iris("left"));
            case "skin": return subtract(this.contour("face_oval"), union(this.contained("right_eye"), this.contained("left_eye"), this.contained("right_brow"), this.contained("left_brow"), this.contained("lips_outer")));
        }
        throw new RangeError(`unknown region ${name}`);
    }
}
/** A visible-face region. Child features never paint beyond the full-support oval;
 * profiles retain measured iris foreshortening and eyelid coverage. */
export function regionMask(name, source, width, height, options = {}) {
    return new RegionBuilder(source, width, height, options).get(name);
}
/** Build a subset on demand and share rasterized contours across that subset. */
export function regionMasks(source, width, height, names = REGIONS, options = {}) {
    const builder = new RegionBuilder(source, width, height, options);
    const result = {};
    for (const name of names)
        result[name] = builder.get(name);
    return result;
}
/** Per region: "visible", "not_visible:closed", "not_visible:hidden_by_turn" or "empty" (an unexplained failure). */
export function regionStates(source, width, height, names = REGIONS, options = {}) {
    const builder = new RegionBuilder(source, width, height, options);
    const result = {};
    for (const name of names)
        result[name] = builder.state(name);
    return result;
}
const sum = (mask) => {
    let total = 0;
    for (const value of mask.data)
        total += value;
    return total;
};
/** Report raw geometry separately from clipped masks. Grossly displaced eyes stay
 * invalid; clipping cannot silently turn an unrelated face mesh into a PASS. */
export function regionDiagnostics(source, width, height, options = {}) {
    const builder = new RegionBuilder(source, width, height, options);
    const oval = builder.get("face_oval"), area = sum(oval);
    const features = {};
    let invalid = area <= 0;
    const names = ["right_eye", "left_eye", "right_brow", "left_brow", "lips_outer", "lips_inner"];
    for (const name of names) {
        const raw = builder.contour(name), visible = builder.contained(name);
        const rawArea = sum(raw), keptArea = sum(visible);
        let overlap = 0;
        for (let i = 0; i < raw.data.length; i++)
            overlap += raw.data[i] * oval.data[i];
        const support = rawArea ? overlap / rawArea : 0;
        features[name] = { raw_area_px: rawArea, visible_area_px: keptArea,
            raw_support_share: support, retained_share: rawArea ? keptArea / rawArea : 0 };
        if (["right_eye", "left_eye", "lips_outer"].includes(name)) {
            let bad = rawArea <= 0 || support < 0.25 || keptArea <= 0;
            if (bad && name !== "lips_outer" && builder.closedReason(name) !== null)
                bad = false;
            invalid ||= bad;
        }
    }
    const eyes = builder.get("eyes"), eyeArea = sum(eyes);
    let overlap = 0;
    for (let i = 0; i < eyes.data.length; i++)
        overlap += eyes.data[i] * oval.data[i];
    const notVisible = {};
    for (const name of REGIONS) {
        const state = builder.state(name);
        if (state.startsWith("not_visible:"))
            notVisible[name] = state.slice("not_visible:".length);
    }
    const eyesInside = eyeArea ? overlap / eyeArea : ("eyes" in notVisible ? 1 : 0);
    return { version: REGIONS_VERSION, colour_dependent: false, face_area_px: area,
        skin_share: area ? sum(builder.get("skin")) / area : 0, eyes_inside: eyesInside,
        invalid_geometry: invalid, features, not_visible: notVisible, hull_fallback: [...builder.hulls] };
}
/** Face-local mask at most one face, not a union of all faces. */
export function maskForSelectedFace(faces, id, region, width, height) {
    const face = faces.find((item) => item.id === id);
    if (!face)
        throw new RangeError(`face ${id} was not detected`);
    return regionMask(region, face.landmarks, width, height);
}
