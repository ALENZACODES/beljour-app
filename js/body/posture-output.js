import { FIXES, SIMULATION_LABEL, checkedPostureLevel } from "../engines/local/posture.js";
import { Q3_MINIMUM } from "../engines/warp/fold.js";
import { canvasEncoder } from "../save/export.js";
import { exportPostureImage } from "./posture-export.js";
import { MASK_LEVEL, checkedHeadMask, checkedSource } from "./posture-safe.js";
const MOVEMENT_TOLERANCE = 1e-6;
export class PostureOutputRefused extends RangeError {
    reasons;
    constructor(reasons) {
        super(`Posture output refused: ${reasons.join(", ")}`);
        this.reasons = reasons;
        this.name = "PostureOutputRefused";
    }
}
function pixelDiffers(a, b, pixel, channels) {
    for (let c = 0, i = pixel * channels; c < channels; c++, i++)
        if (a[i] !== b[i])
            return true;
    return false;
}
function levelOk(value) {
    try {
        return checkedPostureLevel(value) === value;
    }
    catch {
        return false;
    }
}
/** Inspect the pixels that would be shown or exported against the untouched source. */
export function inspectPostureOutput(source, result, head) {
    const original = checkedSource(source);
    const covered = checkedHeadMask(head, original.width, original.height);
    const output = result.image;
    const pixels = original.width * original.height;
    let headPixels = 0;
    for (const bit of covered)
        headPixels += bit;
    if (!output || output.width !== original.width || output.height !== original.height ||
        output.channels !== original.channels || !(output.data instanceof Uint8Array || output.data instanceof Uint8ClampedArray) ||
        output.data.length !== original.data.length) {
        return { headPixels, headChanged: -1, outsideBandPixels: -1, outsideBandChanged: -1, movementPx: NaN,
            capPx: NaN, minJacobian: NaN, passed: false, reasons: ["output_shape_changed"] };
    }
    const band = result.guarded.outcome.band;
    const reasons = [];
    let headChanged = 0, outsidePixels = 0, outsideChanged = 0, alphaChanged = false;
    const channels = original.channels;
    for (let p = 0; p < pixels; p++) {
        const differs = pixelDiffers(original.data, output.data, p, channels);
        if (covered[p]) {
            if (differs)
                headChanged++;
        }
        else if (!(band.data[p] >= MASK_LEVEL)) {
            outsidePixels++;
            if (differs)
                outsideChanged++;
            if (channels === 4 && original.data[p * 4 + 3] !== output.data[p * 4 + 3])
                alphaChanged = true;
        }
    }
    if (headChanged)
        reasons.push("protected_head_changed");
    if (outsideChanged)
        reasons.push("outside_band_changed");
    if (alphaChanged)
        reasons.push("alpha_changed_outside_band");
    const movement = Math.max(0, ...result.plan.moves.map((name) => {
        const a = result.plan.before.points[name], b = result.plan.after.points[name];
        return Math.hypot(b[0] - a[0], b[1] - a[1]);
    }));
    const cap = result.plan.capPx;
    if (!(Number.isFinite(movement) && Number.isFinite(cap)) || movement > cap + MOVEMENT_TOLERANCE) {
        reasons.push("movement_over_cap");
    }
    const minDet = Number(result.guarded.outcome.metrics.min_det);
    if (!(Number.isFinite(minDet) && minDet >= Q3_MINIMUM))
        reasons.push("fold_guard_below_floor");
    if (!levelOk(result.level) || !levelOk(result.lockLevel) || result.lockLevel !== result.guarded.lockLevel) {
        reasons.push("invalid_strength_values");
    }
    if (result.label !== SIMULATION_LABEL || result.guarded.label !== SIMULATION_LABEL) {
        reasons.push("simulation_label_missing");
    }
    return { headPixels, headChanged, outsideBandPixels: outsidePixels, outsideBandChanged: outsideChanged,
        movementPx: movement, capPx: cap, minJacobian: minDet, passed: reasons.length === 0, reasons };
}
/** Fail closed: an output that does not pass inspection never reaches the caller. */
export function requireInspectedOutput(source, result, head) {
    const report = inspectPostureOutput(source, result, head);
    if (!report.passed)
        throw new PostureOutputRefused(report.reasons);
    return report;
}
/** Labelled, metadata-scrubbed local download of an inspected protected result. */
export async function exportProtectedPosture(result, inspection, settings = {}, encoder = canvasEncoder()) {
    if (!inspection.passed || inspection.headChanged !== 0 || inspection.outsideBandChanged !== 0) {
        throw new PostureOutputRefused(inspection.reasons.length ? inspection.reasons : ["uninspected_output"]);
    }
    return exportPostureImage({ ...result.guarded, image: result.image, label: result.label,
        lockLevel: result.lockLevel }, FIXES[result.fix].id, settings, encoder);
}
//# sourceMappingURL=posture-output.js.map