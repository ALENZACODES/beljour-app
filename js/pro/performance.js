/** Local and opt-in performance evidence, without telemetry or image uploads.
 * Only durations, dimensions, Blob length and measured backend are returned.
 * A mock encoder is not a real-device export. No automatic background sampling.
 */
import { browserSurface, exportPhotoPro, previewPhoto, EXPORT_BUDGET_MS, PREVIEW_BUDGET_MS } from "./render.js";
import { threePointCurve } from "./curves.js";
import { defaultRecipe, ProInputError, requireDimensions } from "./types.js";
export function median(values) {
    if (values.length === 0 || values.some((value) => !Number.isFinite(value) || value < 0)) {
        throw new ProInputError("Performance samples must be finite and nonnegative", "PRO_TIMING_INVALID");
    }
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    if (sorted.length % 2)
        return sorted[middle];
    return (sorted[middle - 1] + sorted[middle]) / 2;
}
/** Times include synchronous 2D/GPU rendering and await an actual browser encoder
 * unless a test fixture explicitly injects a surface. The measurements cannot
 * prove midrange-phone performance if run on another device.
 */
export async function measureProOnDevice(source, recipe, options = {}) {
    requireDimensions(source.width, source.height);
    const samples = options.samples ?? 3;
    if (!Number.isInteger(samples) || samples < 1 || samples > 5) {
        throw new ProInputError("Choose 1 to 5 local timing samples", "PRO_TIMING_INVALID");
    }
    const factory = options.factory ?? browserSurface;
    const previews = [];
    const exports = [];
    let bytes = 0;
    let previewPixels = 0;
    let labelled = true;
    for (let i = 0; i < samples; i++) {
        const preview = previewPhoto(source, recipe, factory, options.clock);
        previews.push(preview.elapsedMs);
        previewPixels = preview.width * preview.height;
        const result = await exportPhotoPro(source, recipe, `local-probe-${i}`, factory, options.clock);
        exports.push(result.elapsedMs);
        bytes = result.blob.size;
        labelled = labelled && result.label === "Simulation";
        // Do not retain Blob or output canvas references between measurements.
    }
    const previewMs = median(previews);
    const exportMs = median(exports);
    return {
        previewMs,
        exportMs,
        pixels: source.width * source.height,
        previewPixels,
        encoding: options.factory ? "injected" : "browser",
        previewTargetMet: previewMs < PREVIEW_BUDGET_MS,
        exportTargetMet: exportMs < EXPORT_BUDGET_MS,
        simulationLabel: labelled,
        bytes,
        samples,
        durationSamples: exports,
        previewSamples: previews,
    };
}
/** Explicitly allocate a browser-only synthetic RGBA source, not a photo of a
 * person. Creation is outside the measured edit/encode interval. Caller may use
 * widths 1024x1024 (preview) and 3000x4000 (12 MP export) for a device study.
 */
export function syntheticProSource(width, height) {
    requireDimensions(width, height);
    const canvas = typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(width, height) : document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context)
        throw new ProInputError("A 2D canvas is required for the device probe");
    const ctx = context;
    ctx.fillStyle = "#8994a9";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#b37862";
    ctx.fillRect(Math.floor(width / 4), Math.floor(height / 4), Math.floor(width / 2), Math.floor(height / 2));
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, Math.floor(height / 2), Math.max(1, width / 20), Math.max(1, height / 20));
    return { image: canvas, width, height };
}
/** Not called automatically; intended for a developer-owned browser session. */
export async function runSyntheticProProbe(width = 3000, height = 4000, options = {}) {
    const source = syntheticProSource(width, height);
    const original = defaultRecipe();
    const recipe = {
        ...original,
        curves: { ...original.curves, master: threePointCurve(0.6) },
        masks: [{ kind: "radial", mode: "add", opacity: 1,
                center: { x: 0.5, y: 0.5 }, radiusX: 0.45, radiusY: 0.45, feather: 0.35 }],
    };
    return measureProOnDevice(source, recipe, options);
}
