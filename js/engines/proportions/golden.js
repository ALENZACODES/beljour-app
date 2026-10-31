/** Optional golden-reference geometry shaping. Neutral defaults and identity lock.
 * References describe geometry, not beauty, identity or health. Original maths.
 * MediaPipe Face Landmarker indices (data); Farkas anthropometry
 * (concept only, no code copied).
 * Author: John Khan.
 */
import { LANDMARKS, PHI } from "../../data/face/generated/anatomy.js";
import { measureValues } from "./ratios.js";
import { checkMesh, fitMidline, interocular } from "./symmetry.js";
export const MIN_LEVEL = 1;
export const MAX_LEVEL = 5;
export const LOCKED_MAX_MOVE_IOD = 0.02;
export const UNLOCKED_MAX_MOVE_IOD = 0.065;
export const GOLDEN_KEYS = ["face_length_width", "mouth_nose_width", "lips_chin"];
export const IDENTITY_NOTE = "Geometric motion proxy, not an independent face-identity measurement.";
function refusal(code, message) {
    return { module: "proportions_control", refused: true, code, message: message.slice(0, 120) };
}
export function validateLevel(value) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 1 || value > 5 ||
        Math.abs(Math.round(value * 10) - value * 10) > 1e-8) {
        throw new RangeError("levels must be decimal 1.0 through 5.0 in increments of 0.1");
    }
    return Math.round(value * 10) / 10;
}
export function validateRevision(revision) {
    if (typeof revision !== "string" || revision.length < 1 || revision.length > 128 ||
        !/^[a-zA-Z0-9_:-]+$/.test(revision))
        throw new RangeError("invalid photo revision");
    return revision;
}
function length(points, a, b) {
    return Math.hypot(points[b][0] - points[a][0], points[b][1] - points[a][1]);
}
function distance(points) {
    const { values } = measureValues(points);
    const target = {};
    let total = 0;
    for (const key of GOLDEN_KEYS) {
        const observed = values[key];
        if (typeof observed !== "number" || !(observed > 0) || !Number.isFinite(observed)) {
            throw new RangeError("invalid ratio geometry");
        }
        target[key] = observed;
        const reference = key === "lips_chin" ? 1 / PHI : PHI;
        total += Math.abs(observed - reference) / reference;
    }
    return { value: total / GOLDEN_KEYS.length, values: target };
}
function anchor(points, index, x, y, radius) {
    const centre = points[index];
    const r2 = 2 * radius * radius;
    return points.map(([px, py]) => {
        const weight = Math.exp(-((px - centre[0]) ** 2 + (py - centre[1]) ** 2) / r2);
        return [weight * x, weight * y];
    });
}
function targetsProposal(points, iod) {
    const line = fitMidline(points);
    const mx = line.dy, my = -line.dx, forward = [line.dx, line.dy];
    const info = distance(points).values;
    const mouths = length(points, LANDMARKS.right_mouth, LANDMARKS.left_mouth);
    const mouthHalf = Math.max(-iod * .12, Math.min(iod * .12, (PHI / info.mouth_nose_width - 1) * mouths / 2));
    const width = length(points, 454, 234);
    const chinDelta = Math.max(-iod * .11, Math.min(iod * .11, (PHI - info.face_length_width) * width * .16));
    const base = (points[2][0] - line.cx) * forward[0] + (points[2][1] - line.cy) * forward[1];
    const chin = (points[152][0] - line.cx) * forward[0] + (points[152][1] - line.cy) * forward[1];
    const stomion = [(points[13][0] + points[14][0]) / 2, (points[13][1] + points[14][1]) / 2];
    const s = (stomion[0] - line.cx) * forward[0] + (stomion[1] - line.cy) * forward[1];
    const desired = (chin / PHI + base) / (1 + 1 / PHI);
    const lipDelta = Math.max(-iod * .11, Math.min(iod * .11, (desired - s) * .18));
    const shifts = [
        anchor(points, 61, -mx * mouthHalf, -my * mouthHalf, iod * .16),
        anchor(points, 291, mx * mouthHalf, my * mouthHalf, iod * .16),
        anchor(points, 152, forward[0] * chinDelta, forward[1] * chinDelta, iod * .19),
        anchor(points, 13, forward[0] * lipDelta / 2, forward[1] * lipDelta / 2, iod * .18),
        anchor(points, 14, forward[0] * lipDelta / 2, forward[1] * lipDelta / 2, iod * .18),
    ];
    return points.map(([x, y], i) => [
        x + shifts.reduce((sum, item) => sum + item[i][0], 0),
        y + shifts.reduce((sum, item) => sum + item[i][1], 0),
    ]);
}
export function prepare(points, revision) {
    validateRevision(revision);
    try {
        checkMesh(points, 478);
        if (points.length !== 478)
            throw new RangeError("478 face points required");
        const iod = interocular(points);
        if (iod < 6)
            throw new RangeError("the face is too small to shape safely");
        const before = points.map(([x, y]) => [x, y]);
        const measured = distance(before);
        const fullTarget = targetsProposal(before, iod);
        if (!fullTarget.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))) {
            throw new RangeError("non-finite target geometry");
        }
        return { revision, before, fullTarget, iod, beforeDistance: measured.value, beforeValues: measured.values };
    }
    catch (error) {
        return refusal("invalid_geometry", error instanceof Error ? error.message : "invalid geometry");
    }
}
export function targets(plan, requested, identityLock = true) {
    if ("refused" in plan)
        return plan;
    const level = validateLevel(requested);
    if (typeof identityLock !== "boolean")
        throw new RangeError("identity lock must be boolean");
    if (level === 1)
        return { points: plan.before.map((p) => [...p]), level,
            targetDistance: plan.beforeDistance, beforeDistance: plan.beforeDistance,
            distanceReduction: 0, maxMoveIOD: 0, identityProxy: 1, identityLock, refused: false };
    const delta = plan.before.map(([x, y], i) => [plan.fullTarget[i][0] - x, plan.fullTarget[i][1] - y]);
    const maximum = Math.max(...delta.map(([x, y]) => Math.hypot(x, y)));
    const cap = plan.iod * (identityLock ? LOCKED_MAX_MOVE_IOD : UNLOCKED_MAX_MOVE_IOD);
    const scale = (maximum > cap ? cap / maximum : 1) * (level - 1) / 4;
    let points = plan.before.map(([x, y], i) => [x + delta[i][0] * scale, y + delta[i][1] * scale]);
    let post;
    try {
        post = distance(points).value;
        let factor = 1;
        for (let n = 0; n < 12 && post > plan.beforeDistance + 1e-10; n++) {
            factor *= .5;
            points = plan.before.map(([x, y], i) => [x + delta[i][0] * scale * factor, y + delta[i][1] * scale * factor]);
            post = distance(points).value;
        }
        if (post > plan.beforeDistance + 1e-10) {
            points = plan.before.map((p) => [...p]);
            post = plan.beforeDistance;
        }
    }
    catch (error) {
        return refusal("invalid_geometry", error instanceof Error ? error.message : "invalid geometry");
    }
    const movement = Math.max(...points.map(([x, y], i) => Math.hypot(x - plan.before[i][0], y - plan.before[i][1]))) / plan.iod;
    return { points, level, targetDistance: post, beforeDistance: plan.beforeDistance,
        distanceReduction: Math.max(0, plan.beforeDistance - post), maxMoveIOD: movement,
        identityProxy: 1 - movement, identityLock, refused: false };
}
export class GoldenCache {
    entries = new Map();
    preparations = 0;
    get(points, revision) {
        validateRevision(revision);
        const current = this.entries.get(revision);
        if (current) {
            if (points.length !== current.before.length || points.some(([x, y], i) => current.before[i][0] !== x || current.before[i][1] !== y)) {
                return refusal("stale_source", "photo revision reused with different geometry");
            }
            return current;
        }
        const plan = prepare(points, revision);
        if (!("refused" in plan)) {
            if (this.entries.size >= 2)
                this.entries.delete(this.entries.keys().next().value ?? "");
            this.entries.set(revision, plan);
            this.preparations++;
        }
        return plan;
    }
    clear() { this.entries.clear(); }
}
function validMask(mask, length) {
    return mask.length === length && mask.every((x) => Number.isFinite(x) && x >= 0 && x <= 1);
}
function sample(source, width, height, channels, x, y, colour) {
    const px = Math.max(0, Math.min(width - 1, x));
    const py = Math.max(0, Math.min(height - 1, y));
    const x0 = Math.floor(px), y0 = Math.floor(py);
    const x1 = Math.min(width - 1, x0 + 1), y1 = Math.min(height - 1, y0 + 1);
    const fx = px - x0, fy = py - y0;
    const a = source[(y0 * width + x0) * channels + colour] * (1 - fx)
        + source[(y0 * width + x1) * channels + colour] * fx;
    const b = source[(y1 * width + x0) * channels + colour] * (1 - fx)
        + source[(y1 * width + x1) * channels + colour] * fx;
    return a * (1 - fy) + b * fy;
}
export function renderPreview(source, width, height, channels, plan, level, selected, bystanders = [], identityLock = true) {
    const data = targets(plan, level, identityLock);
    if (data.refused)
        return data;
    if ("refused" in plan)
        return plan;
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2 ||
        source.length !== width * height * channels)
        return refusal("invalid_image", "invalid preview buffer");
    if (!validMask(selected, width * height) || !bystanders.every((m) => validMask(m, width * height))) {
        return refusal("unverified_mask", "a full-image verified mask is required");
    }
    if (!selected.some((weight) => weight > 0))
        return refusal("unverified_mask", "empty selected-person mask");
    const output = new Uint8ClampedArray(source);
    const protectedPixels = bystanders.reduce((sum, m) => sum + m.filter((x) => x > 0).length, 0);
    const selectedMaskPixels = selected.filter((x) => x > 0).length;
    if (level === 1 || data.maxMoveIOD < 1e-10) {
        return { image: output, data, selectedMaskPixels, protectedPixels };
    }
    const handles = [61, 291, 152, 13, 14];
    const radius2 = 2 * Math.max(2, plan.iod * .19) ** 2;
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
            const index = y * width + x;
            const alpha = bystanders.some((mask) => mask[index] > 0) ? 0 : selected[index];
            if (!alpha)
                continue;
            let influence = 0, dx = 0, dy = 0;
            for (const i of handles) {
                const p = plan.before[i], q = data.points[i];
                const weight = Math.exp(-((x - p[0]) ** 2 + (y - p[1]) ** 2) / radius2);
                influence += weight;
                dx += weight * (q[0] - p[0]);
                dy += weight * (q[1] - p[1]);
            }
            if (influence <= 1e-8)
                continue;
            const fx = x - dx / influence, fy = y - dy / influence;
            for (let c = 0; c < 3; c++) {
                const old = source[index * channels + c];
                output[index * channels + c] = Math.round(old * (1 - alpha) + sample(source, width, height, channels, fx, fy, c) * alpha);
            }
        }
    return { image: output, data, selectedMaskPixels, protectedPixels };
}
