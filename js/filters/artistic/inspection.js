/** Independent output inspection; absent observations stay unproven. Author: John Khan. */
import { landmarks, luma, mask, photo } from "./types.js";
export const GEOMETRY_THRESHOLDS = {
    aligned_rms_iod: 0.035, worst_landmark_iod: 0.15, eye_width_relative_change: 0.08,
    mouth_width_relative_change: 0.08, face_height_relative_change: 0.08,
};
const distance = (p, a, b) => Math.hypot(p[a][0] - p[b][0], p[a][1] - p[b][1]);
function normalizedFrame(points) {
    const x = (points[468][0] + points[473][0]) * 0.5, y = (points[468][1] + points[473][1]) * 0.5;
    const ax = points[473][0] - points[468][0], ay = points[473][1] - points[468][1], iod = Math.hypot(ax, ay);
    if (iod < 1e-9)
        throw new RangeError("an independent mesh has degenerate iris centres");
    return { iod, points: points.map((p) => [((p[0] - x) * ax + (p[1] - y) * ay) / (iod * iod),
            (-(p[0] - x) * ay + (p[1] - y) * ax) / (iod * iod)]) };
}
export function geometryObservation(beforeMesh, afterMesh, width, height) {
    if (afterMesh === undefined || afterMesh === null)
        return { status: "unproven", reason: "no_independent_output_mesh", metrics: {} };
    let before, after;
    try {
        before = landmarks(beforeMesh, width, height);
        after = landmarks(afterMesh, width, height);
    }
    catch {
        return { status: "unproven", reason: "invalid_independent_mesh", metrics: {} };
    }
    const a = normalizedFrame(before), b = normalizedFrame(after);
    let squares = 0, worst = 0;
    for (let i = 0; i < a.points.length; i++) {
        const residual = Math.hypot(b.points[i][0] - a.points[i][0], b.points[i][1] - a.points[i][1]);
        squares += residual * residual;
        worst = Math.max(worst, residual);
    }
    const beforeEye = (distance(before, 33, 133) + distance(before, 263, 362)) / a.iod;
    const afterEye = (distance(after, 33, 133) + distance(after, 263, 362)) / b.iod;
    const beforeMouth = distance(before, 61, 291) / a.iod, afterMouth = distance(after, 61, 291) / b.iod;
    const beforeHeight = distance(before, 10, 152) / a.iod, afterHeight = distance(after, 10, 152) / b.iod;
    const metrics = {
        aligned_rms_iod: Math.sqrt(squares / a.points.length), worst_landmark_iod: worst,
        eye_width_relative_change: Math.abs(afterEye - beforeEye) / Math.max(1e-9, beforeEye),
        mouth_width_relative_change: Math.abs(afterMouth - beforeMouth) / Math.max(1e-9, beforeMouth),
        face_height_relative_change: Math.abs(afterHeight - beforeHeight) / Math.max(1e-9, beforeHeight),
        global_scale_ratio: b.iod / a.iod,
    };
    const failures = Object.keys(GEOMETRY_THRESHOLDS)
        .filter((key) => metrics[key] > GEOMETRY_THRESHOLDS[key]);
    return { status: failures.length ? "failed" : "passed", metrics, failures,
        scope: "independent detector proxy; human review still required" };
}
function sameShape(before, after) {
    photo(before);
    photo(after);
    if (before.width !== after.width || before.height !== after.height || before.channels !== after.channels) {
        throw new RangeError("before and after must have the same shape");
    }
}
export function protectedPixels(before, after, protection) {
    sameShape(before, after);
    const region = mask(protection, before.width * before.height, "protection");
    let n = 0, total = 0, maximum = 0;
    for (let i = 0; i < region.length; i++) {
        if (region[i] <= 0)
            continue;
        n++;
        for (let c = 0; c < 3; c++) {
            const delta = Math.abs(after.data[i * before.channels + c] - before.data[i * before.channels + c]);
            total += delta;
            maximum = Math.max(maximum, delta);
        }
    }
    return { observed_pixels: n, max_error: maximum, mean_error: n ? total / (n * 3) : 0,
        observed: n > 0, exact: n > 0 && maximum === 0 };
}
export function quantile(values, q) {
    if (!values.length)
        return 0;
    const sorted = values.slice().sort((a, b) => a - b), p = (sorted.length - 1) * q;
    const lo = Math.floor(p), hi = Math.ceil(p);
    return sorted[lo] * (1 - (p - lo)) + sorted[hi] * (p - lo);
}
export function textureObservation(before, after, detailMask) {
    sameShape(before, after);
    const { width: w, height: h, channels: c } = before;
    const region = mask(detailMask, w * h, "region"), changes = [], absolute = [];
    const old = new Float64Array(w * h), next = new Float64Array(w * h);
    for (let i = 0; i < old.length; i++) {
        old[i] = luma(before.data[i * c], before.data[i * c + 1], before.data[i * c + 2]);
        next[i] = luma(after.data[i * c], after.data[i * c + 1], after.data[i * c + 2]);
    }
    let energy0 = 0, energy1 = 0;
    for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
            const i = y * w + x;
            if (region[i] < 0.95)
                continue;
            const lap0 = old[i - w] + old[i + w] + old[i - 1] + old[i + 1] - 4 * old[i];
            const lap1 = next[i - w] + next[i + w] + next[i - 1] + next[i + 1] - 4 * next[i];
            energy0 += lap0 * lap0;
            energy1 += lap1 * lap1;
            changes.push(next[i] - old[i]);
            absolute.push(Math.abs(next[i] - old[i]));
        }
    }
    const n = changes.length;
    if (n < 16)
        return { status: "unproven", observed_pixels: n };
    energy0 /= n;
    energy1 /= n;
    return { status: "measured", observed_pixels: n, source_laplacian_energy: energy0,
        output_laplacian_energy: energy1, energy_ratio: energy1 / Math.max(1e-9, energy0),
        mean_luminance_change: changes.reduce((a, b) => a + b, 0) / n, p95_luminance_change: quantile(absolute, 0.95) };
}
export function alphaEdges(before, after) {
    sameShape(before, after);
    if (before.channels !== 4)
        return { status: "not_applicable", alpha_present: false };
    let alphaMaximum = 0, transparentMaximum = 0, fractional = 0;
    const fractionalChanges = [];
    for (let i = 0; i < before.width * before.height; i++) {
        const o = i * 4, alpha = before.data[o + 3];
        alphaMaximum = Math.max(alphaMaximum, Math.abs(alpha - after.data[o + 3]));
        if (alpha > 0 && alpha < 255)
            fractional++;
        for (let c = 0; c < 3; c++) {
            const delta = Math.abs(before.data[o + c] - after.data[o + c]);
            if (alpha === 0)
                transparentMaximum = Math.max(transparentMaximum, delta);
            if (alpha > 0 && alpha < 255)
                fractionalChanges.push(delta);
        }
    }
    return { status: "measured", alpha_present: true, alpha_max_error: alphaMaximum,
        transparent_rgb_max_error: transparentMaximum, fractional_alpha_pixels: fractional,
        fractional_rgb_p95_change: quantile(fractionalChanges, 0.95) };
}
export function inspectOutput(before, after, options = {}) {
    const missing = () => ({ status: "unproven", reason: "missing_observation" });
    return { alpha: alphaEdges(before, after),
        geometry: geometryObservation(options.beforeMesh, options.afterMesh, before.width, before.height),
        hair: options.hairMask === undefined ? missing() : protectedPixels(before, after, options.hairMask),
        eyes: options.eyeMask === undefined ? missing() : protectedPixels(before, after, options.eyeMask),
        detail: options.detailMask === undefined ? missing() : textureObservation(before, after, options.detailMask) };
}
//# sourceMappingURL=inspection.js.map