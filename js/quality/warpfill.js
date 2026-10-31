/**
 * Q3, Q4 and Q12 (plus Q1) for E06 warp and E07 fill on synthetic grid scenes: the
 * TypeScript twin of api/plumb_api/quality/warpfill.py (same scenes, scenarios and
 * reports; the test compares them with parity/warpfill-report-python.json).
 *
 * Author: John Khan.
 */
import { byteImage, floatImage, roundHalfEven } from "../engines/core/buffer.js";
import { dilate, ellipse } from "../engines/core/mask.js";
import { VERSION as FILL_VERSION, fill } from "../engines/fill/fill.js";
import { VERSION as WARP_VERSION, buildField } from "../engines/warp/engine.js";
import { bandWeights } from "../engines/warp/falloff.js";
import { apply, moveStats, scale, weighted } from "../engines/warp/field.js";
import { safeStrength } from "../engines/warp/fold.js";
import { hashNoise } from "./harness.js";
import { gridLines, q1OutsideMask, q3FoldFree, q4Seam, q12StraightLines } from "./metrics.js";
import { buildReport } from "./report.js";
export const HEIGHT = 56, WIDTH = 64;
export const GRID = { spacing: 8, offset: 4, thickness: 1 };
export const BAND_PX = 6, RAMP_PX = 5;
export const REPORT_DATE = "2026-10-22";
export const WARP_FROM = [[19, 30], [45, 30], [32, 13], [32, 47]];
export const WARP_TO = [[22, 30], [42, 30], [32, 13], [32, 47]];
export const WARP_METHODS = ["tps", "mls-affine", "mls-similarity", "mls-rigid", "piecewise"];
const clip = (v) => Math.min(255, Math.max(0, roundHalfEven(v)));
export function gridScene(height = HEIGHT, width = WIDTH, spacing = 8, offset = 4, thickness = 1) {
    const onRow = new Uint8Array(height), onCol = new Uint8Array(width);
    for (const s of gridLines(height, spacing, offset, thickness))
        for (let k = 0; k < thickness; k++)
            onRow[s + k] = 1;
    for (const s of gridLines(width, spacing, offset, thickness))
        for (let k = 0; k < thickness; k++)
            onCol[s + k] = 1;
    const img = byteImage(width, height, 3);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const ink = onRow[y] || onCol[x];
            const rgb = ink ? [44, 46, 60] : [226 + (10 * x) / width, 228 + (8 * y) / height, 232 - (6 * x) / width];
            for (let c = 0; c < 3; c++)
                img.data[(y * width + x) * 3 + c] = clip(rgb[c]);
        }
    }
    return img;
}
export function bodyScene(seed = 1) {
    const grid = gridScene();
    const body = ellipse(WIDTH, HEIGHT, 32, 30, 13, 17, 0.1);
    const noise = hashNoise(seed, WIDTH, HEIGHT);
    const tone = [188, 142, 120];
    const image = byteImage(WIDTH, HEIGHT, 3);
    const on = floatImage(WIDTH, HEIGHT, 1);
    for (let i = 0; i < WIDTH * HEIGHT; i++) {
        const f = body.data[i], keep = Math.fround(1 - f);
        for (let c = 0; c < 3; c++)
            image.data[i * 3 + c] = clip(grid.data[i * 3 + c] * keep + (tone[c] + 10 * noise[i]) * f);
        on.data[i] = f > 0 ? 1 : 0;
    }
    return { image, body, band: dilate(on, BAND_PX) };
}
export function smoothScene(height = HEIGHT, width = WIDTH) {
    const img = byteImage(width, height, 3);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const p = (y * width + x) * 3;
            img.data[p] = clip(90 + (80 * x) / width + 20 * Math.sin(y / 9));
            img.data[p + 1] = clip(70 + (60 * y) / height);
            img.data[p + 2] = clip(120 + 40 * Math.cos((x + y) / 14));
        }
    }
    return img;
}
export function disc(cx, cy, radius, height = HEIGHT, width = WIDTH) {
    const m = floatImage(width, height, 1);
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++)
            m.data[y * width + x] = (x - cx) ** 2 + (y - cy) ** 2 <= radius * radius ? 1 : 0;
    return m;
}
export function warpScenario(method, seed = 1) {
    const { image, band } = bodyScene(seed);
    const full = buildField(WIDTH, HEIGHT, method, WARP_FROM, WARP_TO);
    const weights = bandWeights(band, RAMP_PX);
    const safe = safeStrength((s) => weighted(scale(full, s), weights));
    const after = apply(image, safe.field);
    const checks = [
        q3FoldFree(safe.field.mapX, safe.field.mapY),
        q4Seam(image, after, band),
        q12StraightLines(after, band, GRID),
        q1OutsideMask(image, after, band),
    ];
    return { id: `body-${method}`, method, checks, extra: { strength_used: safe.strength, max_move: moveStats(safe.field).maxMove } };
}
export const FILL_CASES = {
    "smooth-biharmonic": { method: "biharmonic", scene: () => smoothScene(), hole: [32, 28, 6], straight: false },
    "smooth-fast-marching": { method: "fast-marching", scene: () => smoothScene(), hole: [32, 28, 6], straight: false },
    "grid-patchmatch": { method: "patchmatch", scene: () => gridScene(), hole: [36, 28, 5], straight: true },
};
export function fillScenario(id) {
    const spec = FILL_CASES[id];
    if (!spec)
        throw new RangeError(`unknown fill scenario ${id}`);
    const truth = spec.scene();
    const hole = disc(...spec.hole);
    const damaged = { ...truth, data: new Uint8Array(truth.data) };
    for (let i = 0; i < hole.data.length; i++)
        if (hole.data[i] > 0)
            damaged.data.set([250, 10, 250], i * 3);
    const out = fill(damaged, hole, spec.method, { seed: 1 });
    const checks = [q1OutsideMask(damaged, out.image, hole), q4Seam(truth, out.image, hole)];
    if (spec.straight)
        checks.push(q12StraightLines(out.image, null, GRID));
    let err = 0, n = 0;
    for (let i = 0; i < hole.data.length; i++) {
        if (hole.data[i] > 0)
            for (let c = 0; c < 3; c++) {
                err += Math.abs(out.image.data[i * 3 + c] - truth.data[i * 3 + c]);
                n++;
            }
    }
    return { id, method: spec.method, checks, extra: { hole_pixels: out.holePixels, mean_abs_error: err / n } };
}
export const runWarp = () => WARP_METHODS.map((m) => warpScenario(m));
export const runFill = () => Object.keys(FILL_CASES).map((id) => fillScenario(id));
export function toReport(tool, version, scenarios, created = REPORT_DATE) {
    const entries = scenarios.map((s) => ({ photo: s.id, synthetic: true, stop: s.method, checks: s.checks }));
    return buildReport(tool, version, entries, created);
}
export function reports(created = REPORT_DATE) {
    return { warp: toReport("warp", WARP_VERSION.split("-")[1], runWarp(), created),
        fill: toReport("fill", FILL_VERSION.split("-")[1], runFill(), created) };
}
