import { regionMask } from "../../data/regions/index.js";
import { apply } from "../warp/field.js";
import { layout, meshWarp } from "../warp/mesh.js";
import { q4Seam } from "../../quality/metrics.js";
import { checkFace } from "./geometry.js";
import { SparseSeam } from "./gender-preview.js";
import { REGIONS, genderTargets, prepareGenderTargets, VERSION } from "../local/gender.js";
export const SILHOUETTE_REGIONS = ["jaw", "chin", "cheekbones", "forehead"];
export const SEAM_LIMIT = 1.5;
export const SEAM_MARGIN = 0.95;
export const TRIANGLE_RATIO_MIN = 0.35;
export const REGION_BISECTIONS = 4;
/** Signed-area ratio of every layout triangle after moving the mesh points. */
export function triangleRatios(lay, after) {
    const moved = lay.points.map((p, i) => (i < lay.meshCount ? after[i] : p));
    const out = new Float64Array(lay.triangles.length);
    lay.triangles.forEach(([a, b, c], k) => {
        const p = lay.points, q = moved;
        const before = (p[b][0] - p[a][0]) * (p[c][1] - p[a][1]) - (p[b][1] - p[a][1]) * (p[c][0] - p[a][0]);
        const after2 = (q[b][0] - q[a][0]) * (q[c][1] - q[a][1]) - (q[b][1] - q[a][1]) * (q[c][0] - q[a][0]);
        out[k] = Math.abs(before) > 1e-12 ? after2 / before : 1;
    });
    return out;
}
function retention(src, requested, applied) {
    let req = 0, app = 0;
    src.forEach((p, i) => {
        const rx = requested[i][0] - p[0], ry = requested[i][1] - p[1];
        const size = Math.hypot(rx, ry);
        req += size;
        app += ((applied[i][0] - p[0]) * rx + (applied[i][1] - p[1]) * ry) / Math.max(size, 1e-12);
    });
    return req <= 1e-12 ? 1 : Math.min(1, Math.max(0, app / req));
}
export function renderGenderTargets(photo, face, slider, options = {}, dependencies = {}) {
    return renderTargets(photo, face, slider, options, true, dependencies);
}
/** Original full-raster search, retained as both the guard fallback and an
 * independent oracle for sparse pixel, scale and target equivalence. */
export function renderGenderTargetsReference(photo, face, slider, options = {}, dependencies = {}) {
    return renderTargets(photo, face, slider, options, false, dependencies);
}
function renderTargets(photo, face, slider, options, sparse, dependencies) {
    checkFace(face);
    if (photo.channels !== 3 && photo.channels !== 4)
        throw new RangeError("gender photo must be RGB or RGBA");
    if (Math.min(photo.width, photo.height) < 2)
        throw new RangeError("gender photo must be at least 2 by 2");
    const base = Object.fromEntries(REGIONS.map((r) => [r, 1]));
    for (const [k, v] of Object.entries(options.regionStrengths ?? {})) {
        if (!REGIONS.includes(k) || typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1.5) {
            throw new RangeError("unknown gender region or factor outside 0..1.5");
        }
        base[k] = v;
    }
    const lay = layout(face, photo.width, photo.height);
    const oval = regionMask("face_oval", face, photo.width, photo.height, { normalized: false, supersample: 2 });
    const seam = sparse && Math.max(photo.width, photo.height) > 192 ? new SparseSeam(photo, oval) : null;
    // Small product previews still use the complete raster search, but share its
    // source graph. The explicit reference and fallback remain fully uncached.
    const targetsFor = sparse ? prepareGenderTargets(face, slider) : (values) => genderTargets(face, slider, values);
    const warper = dependencies.warp ?? meshWarp;
    let fullRasterEvaluations = 0;
    const cache = new Map();
    const fullEvaluation = (outcome) => {
        fullRasterEvaluations++;
        const warp = warper(photo.width, photo.height, face, outcome.points, { lay });
        const image = apply(photo, warp.result.field);
        const seamRatio = seam ? seam.fullRatio(image) : Number(q4Seam(photo, image, oval).measured.ratio);
        const ratios = triangleRatios(lay, outcome.points);
        let lo = Infinity, hi = -Infinity;
        for (const r of ratios) {
            lo = Math.min(lo, r);
            hi = Math.max(hi, r);
        }
        const failed = [];
        if (lo < TRIANGLE_RATIO_MIN || hi > 1 / TRIANGLE_RATIO_MIN)
            failed.push("triangle_ratio");
        if (warp.strengthUsed < 1)
            failed.push("guard_backoff");
        if (seamRatio > SEAM_MARGIN * SEAM_LIMIT)
            failed.push("seam");
        return { outcome, image, failed, seamRatio, triangleMin: lo, triangleMax: hi, guardStrength: warp.strengthUsed };
    };
    const evaluate = (scales) => {
        const key = REGIONS.map((r) => scales[r].toFixed(12)).join(",");
        const hit = cache.get(key);
        if (hit)
            return hit;
        const factors = Object.fromEntries(REGIONS.map((r) => [r, base[r] * scales[r]]));
        const outcome = targetsFor({ ...options, regionStrengths: factors });
        let result;
        if (seam) {
            const seamRatio = seam.ratio(lay, outcome.points), ratios = triangleRatios(lay, outcome.points);
            let lo = Infinity, hi = -Infinity;
            for (const ratio of ratios) {
                lo = Math.min(lo, ratio);
                hi = Math.max(hi, ratio);
            }
            const failed = [];
            if (lo < TRIANGLE_RATIO_MIN || hi > 1 / TRIANGLE_RATIO_MIN)
                failed.push("triangle_ratio");
            if (seamRatio > SEAM_MARGIN * SEAM_LIMIT)
                failed.push("seam");
            // A search candidate has no displayable pixels. Its full warp and raster
            // Jacobian are evaluated only if it becomes the chosen target below.
            result = { outcome, image: null, failed, seamRatio, triangleMin: lo, triangleMax: hi, guardStrength: 1 };
        }
        else
            result = fullEvaluation(outcome);
        cache.set(key, result);
        return result;
    };
    const bisect = (scales, group, low = 0) => {
        const trial = { ...scales };
        let lo = low, hi = 1;
        for (let k = 0; k < REGION_BISECTIONS; k++) {
            const mid = (lo + hi) / 2;
            for (const r of group)
                trial[r] = mid;
            if (evaluate(trial).failed.length)
                hi = mid;
            else
                lo = mid;
        }
        return lo;
    };
    const scales = Object.fromEntries(REGIONS.map((r) => [r, 1]));
    let current = evaluate(scales);
    const tried = [];
    if (current.failed.length && slider !== 0) {
        const outline = SILHOUETTE_REGIONS.filter((r) => base[r] > 0);
        const inner = REGIONS.filter((r) => !SILHOUETTE_REGIONS.includes(r) && base[r] > 0);
        for (const group of [outline, inner]) {
            if (!current.failed.length || !group.length)
                continue;
            tried.push(...group);
            const common = bisect(scales, group);
            for (const r of group)
                scales[r] = common;
            current = evaluate(scales);
        }
        if (!current.failed.length) {
            for (const region of tried) {
                scales[region] = bisect(scales, [region], scales[region]);
                current = evaluate(scales);
            }
        }
    }
    const full = evaluate(Object.fromEntries(REGIONS.map((r) => [r, 1])));
    if (seam) {
        current = fullEvaluation(current.outcome);
        if (current.failed.length) {
            const fallback = renderTargets(photo, face, slider, options, false, dependencies);
            return { ...fallback, sparseFallback: true, fullRasterEvaluations: fallback.fullRasterEvaluations + fullRasterEvaluations };
        }
    }
    if (!current.image)
        throw new Error("A gender preview requires its complete raster confirmation.");
    return { points: current.outcome.points, image: current.image, regionScales: { ...scales }, failed: [...current.failed],
        seamRatio: current.seamRatio, triangleMin: current.triangleMin, triangleMax: current.triangleMax,
        effectRetention: retention(face, full.outcome.points, current.outcome.points), regionsTried: tried,
        version: VERSION, report: current.outcome.report,
        searchMethod: seam ? "sparse-seam-full-confirm" : "full-raster", fullRasterEvaluations,
        seamSamples: seam?.sampleCount ?? photo.width * photo.height, fullResolutionChecked: true, sparseFallback: false };
}
//# sourceMappingURL=gender-render.js.map