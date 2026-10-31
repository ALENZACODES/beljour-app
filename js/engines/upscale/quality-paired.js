/** Paired synthetic diagnostics for the HD/4K pipeline.
 * An abstract drawn chart (no people) is downscaled by exact 2 x 2 area
 * averaging, then recovered to its original size twice: by the production
 * stages and by a basic resize. RGB PSNR and 8 x 8 luminance SSIM against the
 * chart are reported for both. Proxy sizes: 512 x 288 for the HD family and
 * 768 x 432 for the 4K family. These numbers are diagnostics on drawn pixels;
 * they are never a human-quality, skin-tone, identity, device or release PASS.
 * Author: John Khan.
 */
import { planCustomQuality } from "./quality-aspect.js";
import { cpuResizer } from "./quality-generator.js";
import { psnrRgb, ssimLuma } from "./quality-metrics.js";
import { runQualityPipeline } from "./quality-pipeline.js";
import { checkedRaster, wipe } from "./quality-raster.js";
export const PROXY_SIZES = {
    hd1080: { width: 512, height: 288 },
    uhd4k: { width: 768, height: 432 },
};
/** Deterministic abstract chart: gradients, stripes, rings and flat patches. */
export function drawnChart(width, height) {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const u = x / width, v = y / height;
            const stripes = Math.sin(x * 0.45 + y * 0.12) * 28;
            const ring = Math.abs(Math.hypot(u - 0.65, v - 0.45) * 9 % 1 - 0.5) < 0.12 ? 40 : 0;
            const patch = u < 0.25 && v > 0.6 ? 0 : 1;
            const i = (y * width + x) * 4;
            data[i] = Math.round(patch * (60 + 140 * u + stripes) + (1 - patch) * 180 + ring);
            data[i + 1] = Math.round(patch * (70 + 110 * v - stripes / 2) + (1 - patch) * 120);
            data[i + 2] = Math.round(patch * (90 + 80 * (1 - u) + ring / 2) + (1 - patch) * 90);
            data[i + 3] = 255;
        }
    }
    return { width, height, data };
}
/** Exact 2 x 2 area average; both sides must be even. */
export function downscaleHalf(raster) {
    checkedRaster(raster);
    if (raster.width % 2 || raster.height % 2)
        throw new RangeError("Area downscale needs even dimensions");
    const width = raster.width / 2, height = raster.height / 2;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            for (let c = 0; c < 4; c++) {
                const at = (row, column) => raster.data[(row * raster.width + column) * 4 + c];
                const sum = at(2 * y, 2 * x) + at(2 * y, 2 * x + 1) + at(2 * y + 1, 2 * x) + at(2 * y + 1, 2 * x + 1);
                data[(y * width + x) * 4 + c] = Math.floor((sum + 2) / 4);
            }
        }
    }
    return { width, height, data };
}
export async function pairedDiagnostic(family = "hd1080", resizer = cpuResizer, levels = { detailLevel: 3, denoiseLevel: 2, lockLevel: 5 }) {
    const size = PROXY_SIZES[family];
    if (!size)
        throw new RangeError("Unknown diagnostic family");
    const chart = drawnChart(size.width, size.height);
    const low = downscaleHalf(chart);
    const plan = planCustomQuality(low.width, low.height, size.width, size.height);
    const recovered = await runQualityPipeline(low, {
        mask: new Uint8Array(low.width * low.height), confirmed: true, noFace: true,
    }, plan, levels, { resizer, phase: "diagnostic" });
    const baseline = { width: size.width, height: size.height, data: await resizer(low, size.width, size.height) };
    const report = {
        schema: "beljour-quality-paired/1", family, width: size.width, height: size.height,
        pipelinePsnr: round(psnrRgb(chart, recovered.image), 4),
        baselinePsnr: round(psnrRgb(chart, baseline), 4),
        pipelineSsim: round(ssimLuma(chart, recovered.image), 5),
        baselineSsim: round(ssimLuma(chart, baseline), 5),
        psnrDelta: 0, ssimDelta: 0,
        evidence: "SYNTHETIC_DRAWN_CHART", humanQuality: "NOT_RUN", releaseGate: "NOT_RUN",
    };
    wipe(chart, low, recovered.image, baseline);
    return {
        ...report,
        psnrDelta: round(report.pipelinePsnr - report.baselinePsnr, 4),
        ssimDelta: round(report.pipelineSsim - report.baselineSsim, 5),
    };
}
function round(value, places) {
    return Number(value.toFixed(places));
}
