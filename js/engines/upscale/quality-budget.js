/** Device budget reporting for the Quality Generator, from local timings only.
 * The unmodified budgets are a 100 ms slider preview and a 2000 ms export of a
 * 12 MP photo. A timing that was not taken reads NOT_MEASURED; an export of a
 * source under 12 MP reads NOT_12MP because it cannot show the 12 MP budget is
 * met. The overall quality status is always UNVERIFIED: timings say nothing
 * about how a photo looks. No timing leaves the device. Author: John Khan.
 */
export const PREVIEW_BUDGET_MS = 100;
export const EXPORT_BUDGET_MS = 2000;
export const EXPORT_BUDGET_PIXELS = 12_000_000;
function timing(value) {
    if (value === undefined)
        return null;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
        throw new RangeError("Invalid timing");
    return Math.round(value * 100) / 100;
}
export function budgetReport(timings) {
    const pixels = timings?.sourcePixels;
    if (!Number.isSafeInteger(pixels) || pixels < 1)
        throw new RangeError("Invalid source size");
    const previewMs = timing(timings.previewMs);
    const render = timing(timings.renderMs), encode = timing(timings.encodeMs);
    const exportMs = render === null || encode === null ? null : Math.round((render + encode) * 100) / 100;
    const preview = previewMs === null ? "NOT_MEASURED"
        : previewMs <= PREVIEW_BUDGET_MS ? "WITHIN_BUDGET" : "OVER_BUDGET";
    let exportVerdict;
    if (exportMs === null)
        exportVerdict = "NOT_MEASURED";
    else if (pixels < EXPORT_BUDGET_PIXELS)
        exportVerdict = "NOT_12MP";
    else
        exportVerdict = exportMs <= EXPORT_BUDGET_MS ? "WITHIN_BUDGET" : "OVER_BUDGET";
    return {
        schema: "beljour-quality-budget/1", sourcePixels: pixels, previewMs, exportMs,
        preview, export: exportVerdict, quality: "UNVERIFIED", basis: "LOCAL_TIMING_THIS_DEVICE",
    };
}
/** Time an async step with the platform clock. */
export async function timed(step, clock = () => performance.now()) {
    const started = clock();
    const value = await step();
    return { value, ms: Math.max(0, clock() - started) };
}
