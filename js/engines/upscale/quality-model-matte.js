/** Optional MODNet hair-boundary matting diagnostic for the Quality Generator (r38e).
 * Diagnostic only: it compares the reviewed local matte model's alpha with a
 * hair mask the user drew and confirmed, inside a thin band around that mask's
 * edge, and reports the measured alpha error. It never changes a render or an
 * export and never reports a quality PASS. When there is no admitted matte
 * model, no confirmed hair mask or no hair edge to measure, the report says
 * NOT_RUN with the reason instead of a number. The model sees a temporary copy
 * of the photo; that copy and the returned alpha are wiped afterwards.
 * Author: John Khan.
 */
import { ModelGateError } from "../../vision/model-registry.js";
import { checkedRaster, copyRaster, throwIfAborted, wipe } from "./quality-raster.js";
/** ASSUMED: a pixel within this many pixels (square window) of the other class is on the hair edge. */
export const BOUNDARY_RADIUS = 2;
/** ASSUMED: mask coverage at or above this value counts as hair. */
export const HAIR_THRESHOLD = 128;
/** 1 where a pixel's (2r+1) x (2r+1) window holds both hair and non-hair pixels. */
export function hairBoundaryBand(mask, width, height, radius = BOUNDARY_RADIUS) {
    if (mask.length !== width * height)
        throw new RangeError("Hair mask size differs from the photo");
    if (!Number.isInteger(radius) || radius < 1)
        throw new RangeError("Boundary radius must be a positive integer");
    const rowAny = new Uint8Array(mask.length), rowAll = new Uint8Array(mask.length);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let any = 0, all = 1;
            for (let dx = -radius; dx <= radius; dx++) {
                const hair = mask[y * width + Math.min(width - 1, Math.max(0, x + dx))] >= HAIR_THRESHOLD ? 1 : 0;
                any |= hair;
                all &= hair;
            }
            rowAny[y * width + x] = any;
            rowAll[y * width + x] = all;
        }
    }
    const band = new Uint8Array(mask.length);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let any = 0, all = 1;
            for (let dy = -radius; dy <= radius; dy++) {
                const p = Math.min(height - 1, Math.max(0, y + dy)) * width + x;
                any |= rowAny[p];
                all &= rowAll[p];
            }
            band[y * width + x] = any && !all ? 1 : 0;
        }
    }
    return band;
}
function report(width, height, model, measured) {
    const done = "boundaryPixels" in measured;
    return Object.freeze({
        schema: "beljour-matte-diagnostic/1", status: done ? "MEASURED" : "NOT_RUN",
        reason: done ? null : measured.reason, model, width, height,
        boundaryPixels: done ? measured.boundaryPixels : 0,
        meanAbsError: done ? Number(measured.mean.toFixed(5)) : null,
        maxAbsError: done ? Number(measured.max.toFixed(5)) : null,
        evidence: "DIAGNOSTIC_ONLY", qualityGate: "NOT_RUN", changesExport: false,
    });
}
export async function hairMatteDiagnostic(source, hair, models, signal) {
    checkedRaster(source);
    const { width, height } = source;
    if (!hair || !(hair.mask instanceof Uint8Array) || hair.mask.length !== width * height) {
        throw new RangeError("Hair mask size differs from the photo");
    }
    const admitted = models?.verifiedModels?.find(model => model.role === "modnet_matte");
    const model = admitted
        ? Object.freeze({ role: admitted.role, modelId: admitted.modelId, weightsSha256: admitted.weightsSha256 })
        : null;
    if (!models || !models.matte || !model)
        return report(width, height, null, { reason: "no-matte-model" });
    if (models.disposed)
        return report(width, height, model, { reason: "model-session-closed" });
    if (hair.confirmed !== true)
        return report(width, height, model, { reason: "hair-mask-not-confirmed" });
    const band = hairBoundaryBand(hair.mask, width, height);
    const boundaryPixels = band.reduce((sum, value) => sum + value, 0);
    if (boundaryPixels === 0)
        return report(width, height, model, { reason: "no-hair-boundary" });
    throwIfAborted(signal);
    const copy = copyRaster(source);
    let alpha = null;
    try {
        alpha = await models.matte(copy, signal);
        throwIfAborted(signal);
        if (!(alpha instanceof Float32Array) || alpha.length !== width * height) {
            throw new ModelGateError("matte model returned an invalid result");
        }
        let sum = 0, max = 0;
        for (let p = 0; p < band.length; p++) {
            if (!band[p])
                continue;
            const error = Math.abs(alpha[p] - hair.mask[p] / 255);
            sum += error;
            max = Math.max(max, error);
        }
        return report(width, height, model, { boundaryPixels, mean: sum / boundaryPixels, max });
    }
    finally {
        wipe(copy);
        alpha?.fill(0);
        band.fill(0);
    }
}
