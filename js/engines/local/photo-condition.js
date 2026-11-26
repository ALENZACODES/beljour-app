/** R12 scene evidence before Enhance. Mirrors repair/condition.py.
 * No skin-colour threshold or demographic inference. Low illumination needs the
 * scene median, bright tail, and spatial tiles to agree; one dark face is not enough.
 * Old is a faded-scan appearance proxy, never photo dating or subject age.
 * Donoho and Johnstone wavelet noise estimation and existing re-blur evidence:
 * concept only, no code copied.
 * No trained classifier or claimed probability. Author: John Khan.
 */
import { decode, requireColour } from "../core/buffer.js";
import { gradient, quantile } from "../core/filters.js";
export const CONDITION_VERSION = "photo-condition-r12/1";
export const CLASSES = ["normal", "low_light", "blurry", "noisy", "old"];
export const LOW_MEDIAN = 0.075, LOW_BRIGHT_TAIL = 0.18, LOW_TILE_MEDIAN = 0.12, LOW_TILE_SHARE = 0.75;
export const CONDITION_NOISE_SIGMA = 3, CONDITION_BLUR_SIGMA = 0.8, MIN_EDGE_ENERGY = 0.2;
export const FADED_BLACK_FLOOR = 0.14, FADED_RANGE = 0.29, FADED_SATURATION = 0.22, FADED_MIN_RANGE = 0.035;
export const CONDITION_GRID = 4;
function validatePhoto(image) {
    requireColour(image);
    if (!Number.isInteger(image.width) || !Number.isInteger(image.height)
        || Math.min(image.width, image.height) < 4)
        throw new RangeError("the photo is too small to classify");
}
function tileSummary(luminance, width, height) {
    let dark = 0, bright = 0, count = 0;
    for (let row = 0; row < CONDITION_GRID; row++) {
        const top = Math.floor(row * height / CONDITION_GRID), bottom = Math.floor((row + 1) * height / CONDITION_GRID);
        for (let column = 0; column < CONDITION_GRID; column++) {
            const left = Math.floor(column * width / CONDITION_GRID), right = Math.floor((column + 1) * width / CONDITION_GRID);
            const tile = [];
            for (let y = top; y < bottom; y++)
                for (let x = left; x < right; x++)
                    tile.push(luminance[y * width + x]);
            if (tile.length) {
                const level = quantile(tile, 0.5);
                if (level <= LOW_TILE_MEDIAN)
                    dark++;
                if (level >= LOW_BRIGHT_TAIL)
                    bright++;
                count++;
            }
        }
    }
    return [dark / count, bright, count];
}
export function measureCondition(image, analysis) {
    validatePhoto(image);
    const lin = decode(image), count = image.width * image.height;
    const luminance = new Float64Array(count), saturation = new Float64Array(count), y = new Float64Array(count);
    for (let i = 0; i < count; i++) {
        const p = i * image.channels, r = image.data[p], g = image.data[p + 1], b = image.data[p + 2];
        const maximum = Math.max(r, g, b), minimum = Math.min(r, g, b);
        saturation[i] = (maximum - minimum) / Math.max(maximum, 1);
        y[i] = 0.299 * r + 0.587 * g + 0.114 * b;
        luminance[i] = 0.2126 * lin.data[i * 3] + 0.7152 * lin.data[i * 3 + 1] + 0.0722 * lin.data[i * 3 + 2];
    }
    const low = quantile(luminance, 0.05), median = quantile(luminance, 0.5), high = quantile(luminance, 0.95);
    const [dark, bright, tiles] = tileSummary(luminance, image.width, image.height);
    const plane = { width: image.width, height: image.height, channels: 1, data: y };
    const [gx, gy] = gradient(plane);
    let energy = 0;
    for (let i = 0; i < count; i++)
        energy += gx.data[i] ** 2 + gy.data[i] ** 2;
    return {
        median_linear: median, p05_linear: low, p95_linear: high, linear_range: high - low,
        median_saturation: quantile(saturation, 0.5), dark_tile_share: dark,
        bright_tile_count: bright, tile_count: tiles, noise_sigma_255: analysis.noise_sigma,
        blur_sigma_px: analysis.blur_sigma, edge_energy_255: energy / count,
        clipped_bright_share: analysis.clipped_bright,
    };
}
export function classifyFromAnalysis(image, analysis) {
    const e = measureCondition(image, analysis);
    const low = e.median_linear <= LOW_MEDIAN && e.p95_linear <= LOW_BRIGHT_TAIL
        && e.dark_tile_share >= LOW_TILE_SHARE && e.bright_tile_count === 0;
    const noisy = e.noise_sigma_255 >= CONDITION_NOISE_SIGMA;
    const blurry = e.blur_sigma_px >= CONDITION_BLUR_SIGMA && e.edge_energy_255 >= MIN_EDGE_ENERGY;
    const old = !low && e.p05_linear >= FADED_BLACK_FLOOR && e.linear_range >= FADED_MIN_RANGE
        && e.linear_range <= FADED_RANGE && e.median_saturation <= FADED_SATURATION;
    const reasons = [];
    if (low)
        reasons.push("Scene median, bright tail and spatial tiles agree on low illumination.");
    if (noisy)
        reasons.push("Wavelet noise exceeds the declared luminance-noise threshold.");
    if (blurry)
        reasons.push("Re-blur estimate exceeds the threshold and measurable edges exist.");
    if (old)
        reasons.push("Raised blacks, compressed range and low saturation suggest a faded scan.");
    if (!reasons.length)
        reasons.push("No measured rescue condition; preserve the original pixels.");
    const primary = low ? "low_light" : old ? "old" : noisy ? "noisy" : blurry ? "blurry" : "normal";
    return {
        primary, low_light: low, blurry, noisy, old, evidence: e, reasons, version: CONDITION_VERSION,
        method: "deterministic image-quality heuristic; not calibrated probability",
        old_note: "Old is a faded-scan appearance proxy, not photo dating or subject age.",
    };
}
export function planRescue(condition, mode, strength, steps = {}) {
    if (!(Number.isFinite(strength) && strength >= 0 && strength <= 1))
        throw new RangeError("strength must be 0..1");
    const allowed = ["white_balance", "exposure", "denoise", "deblur", "sharpen", "colour"];
    const unknown = Object.keys(steps).filter((name) => !allowed.includes(name));
    if (unknown.length)
        throw new RangeError(`unknown steps ${unknown.join(", ")}`);
    if (Object.values(steps).some((value) => typeof value !== "boolean"))
        throw new RangeError("step switches must be booleans");
    const enabled = strength > 0;
    const exposure = enabled && condition.low_light && steps.exposure !== false;
    const denoise = enabled && condition.noisy && steps.denoise !== false;
    const deblur = enabled && condition.blurry && steps.deblur !== false;
    const fade = enabled && condition.old && steps.colour !== false;
    const skipped = [];
    if (!exposure)
        skipped.push("exposure: no low-light evidence or switched off");
    if (!denoise)
        skipped.push("denoise: no measured noise or switched off");
    if (!deblur)
        skipped.push("deblur: no measured blur or switched off");
    if (!fade)
        skipped.push("fade: no faded-scan evidence or switched off");
    skipped.push("white_balance: no trusted neutral reference");
    skipped.push("sharpen: no unconditional detail boost");
    const needsRescue = condition.low_light || condition.blurry || condition.noisy || condition.old;
    let effective = needsRescue ? mode : "preserve";
    if (mode === "low_light" && !condition.low_light && needsRescue)
        effective = "natural";
    return { condition: condition.primary, exposure, denoise, deblur, fade,
        requested_mode: mode, effective_mode: effective, skipped };
}
//# sourceMappingURL=photo-condition.js.map