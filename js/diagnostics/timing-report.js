/** Privacy-safe local timing format; no face, image, user-agent or identifier. */
import { compareBudget, distribution, FULL_WORKLOAD, PREVIEW_WORKLOAD, } from "./timing-statistics.js";
export const TIMING_SCHEMA = "beljour-device-timing/1";
export const TIMING_BUDGETS = Object.freeze({ previewMs: 100, exportMs: 2000 });
export function buildTimingReport(previewSamples, fullSamples, environment = "browser", cpuThrottleFactor = null) {
    if (environment === "headless-cpu-throttled" &&
        (!Number.isFinite(cpuThrottleFactor) || cpuThrottleFactor === null || cpuThrottleFactor < 1)) {
        throw new RangeError("CPU throttle factor required for headless report");
    }
    if (environment === "browser" && cpuThrottleFactor !== null) {
        throw new RangeError("An unthrottled browser report must not claim a throttle factor");
    }
    const preview = distribution(previewSamples);
    const full = distribution(fullSamples);
    return {
        schema: TIMING_SCHEMA,
        source: "synthetic-canvas",
        environment,
        cpuThrottleFactor,
        preview,
        full,
        previewWorkload: PREVIEW_WORKLOAD,
        fullWorkload: FULL_WORKLOAD,
        previewBudget: compareBudget(preview, TIMING_BUDGETS.previewMs),
        fullBudget: compareBudget(full, TIMING_BUDGETS.exportMs),
        limitations: [
            "Drawn pixels only: not a real face, not a YouCam call or a vision-model benchmark.",
            "Canvas raster timing is not a complete edit pipeline or encoded-image export timing.",
            "A CPU-throttled headless browser is not an actual three-year-old phone.",
            "First page load, memory, 4G network and identity preservation are not measured.",
        ],
    };
}
export function validateTimingReport(input) {
    if (!input || typeof input !== "object")
        return false;
    const item = input;
    if (item.schema !== TIMING_SCHEMA || item.source !== "synthetic-canvas")
        return false;
    if (item.environment !== "browser" && item.environment !== "headless-cpu-throttled")
        return false;
    if (!item.preview || !item.full || !item.previewBudget || !item.fullBudget)
        return false;
    if (item.preview.count < 3 || item.full.count < 3)
        return false;
    return [item.preview.medianMs, item.preview.p95Ms, item.full.medianMs, item.full.p95Ms]
        .every((v) => typeof v === "number" && Number.isFinite(v) && v >= 0);
}
export function timingReportText(report) {
    if (!validateTimingReport(report))
        throw new RangeError("Invalid timing report");
    const details = [
        `Preview median ${report.preview.medianMs.toFixed(2)} ms, p95 ${report.preview.p95Ms.toFixed(2)} ms`,
        `12 MP median ${report.full.medianMs.toFixed(2)} ms, p95 ${report.full.p95Ms.toFixed(2)} ms`,
        `Preview planning target ${report.previewBudget.targetMs} ms`,
        `Full-raster planning target ${report.fullBudget.targetMs} ms`,
    ];
    return details.join(". ");
}
export function safeTimingJson(report) {
    if (!validateTimingReport(report))
        throw new RangeError("Invalid timing report");
    return JSON.stringify(report, null, 2);
}
