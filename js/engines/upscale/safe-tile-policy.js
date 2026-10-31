/** Deterministic memory admission for the guarded browser upscale.
 * Mirrors api/plumb_api/engines/upscale/safe_tiles.py: the request is priced
 * from geometry alone (output buffer, source read, upscaled face mask, and the
 * scratch for one tile plus halo with two renders and their float planes). The
 * largest tile side that fits wins; otherwise the request is refused before any
 * pixel buffer is allocated. Estimates from shapes, not measured peaks.
 * Author: John Khan.
 */
import { planTiles } from "./pipeline.js";
export const TILE_SIDES = [1024, 768, 640, 512, 384, 256, 192, 128];
export const OVERLAP = 12;
/** ASSUMED, as in the Python mirror: 8 float64 planes per rendered pixel. */
export const FLOAT_PLANES = 8;
export const FLOAT_BYTES = 8;
export const MAX_SOURCE_PIXELS = 12_000_000;
/** The 12 MP identity edit limit, mirrored from the Python guarded path. */
export const MAX_OUTPUT_PIXELS = 12_000_000;
export const DEFAULT_BUDGET_BYTES = 512 * 1024 * 1024;
export const MIN_BUDGET_BYTES = 16 * 1024 * 1024;
export const MAX_BUDGET_BYTES = 64 * 1024 * 1024 * 1024;
export class AdmissionRefused extends RangeError {
}
export function tileScratchBytes(tileSide, overlap, scale, channels) {
    const read = tileSide + 2 * overlap;
    const rendered = read * scale * read * scale;
    return read * read * channels + 2 * rendered * channels +
        2 * rendered * FLOAT_PLANES * FLOAT_BYTES + tileSide * scale * tileSide * scale * channels;
}
function integerIn(value, low, high, message) {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < low || value > high) {
        throw new AdmissionRefused(message);
    }
    return value;
}
export function admit(width, height, request = {}) {
    const { channels = 4, scale = 2, budgetBytes = DEFAULT_BUDGET_BYTES } = request;
    integerIn(width, 8, 16_384, "source width outside local limits");
    integerIn(height, 8, 16_384, "source height outside local limits");
    if (channels !== 3 && channels !== 4)
        throw new AdmissionRefused("source must be RGB or RGBA");
    if (scale !== 2 && scale !== 4)
        throw new AdmissionRefused("scale must be 2 or 4");
    integerIn(budgetBytes, MIN_BUDGET_BYTES, MAX_BUDGET_BYTES, "invalid memory budget");
    if (width * height > MAX_SOURCE_PIXELS)
        throw new AdmissionRefused("source exceeds the local pixel limit");
    const outputPixels = width * height * scale * scale;
    if (outputPixels > MAX_OUTPUT_PIXELS)
        throw new AdmissionRefused("output exceeds the local pixel limit");
    const sourceBytes = width * height * channels;
    const outputBytes = outputPixels * channels;
    const maskBytes = outputPixels;
    const longest = Math.max(width, height);
    for (const tileSide of TILE_SIDES) {
        const scratch = tileScratchBytes(Math.min(tileSide, longest), OVERLAP, scale, channels);
        const peakBytes = sourceBytes + outputBytes + maskBytes + scratch;
        if (peakBytes <= budgetBytes) {
            return Object.freeze({
                width, height, channels, scale, tileSide, overlap: OVERLAP,
                tiles: planTiles(width, height, tileSide, OVERLAP).length,
                sourceBytes, outputBytes, maskBytes, tileScratchBytes: scratch, peakBytes, budgetBytes,
                basis: "SHAPE_ESTIMATE_NOT_MEASURED",
            });
        }
    }
    throw new AdmissionRefused("no tile size fits the memory budget");
}
export function allocationTiles(plan) {
    return planTiles(plan.width, plan.height, plan.tileSide, plan.overlap);
}
/** Admission against a device's peak-memory allowance in MiB (R18B DeviceBudget). */
export function admitForDevice(width, height, maximumPeakMb, request = {}) {
    if (typeof maximumPeakMb !== "number" || !Number.isFinite(maximumPeakMb) || maximumPeakMb < 16) {
        throw new AdmissionRefused("device memory allowance must be at least 16 MiB");
    }
    return admit(width, height, {
        ...request, budgetBytes: Math.min(MAX_BUDGET_BYTES, Math.floor(maximumPeakMb * 1024 * 1024)),
    });
}
