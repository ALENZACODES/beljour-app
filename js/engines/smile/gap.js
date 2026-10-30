import { annotationBounds } from "./annotations.js";
export function gapPlan(mode, amount) {
    if (amount < 0 || amount > 1)
        throw new Error("amount must be in [0,1]");
    const fraction = mode === "keep" ? 0 : mode === "partial" ? .25 * amount : .45 * amount;
    return { mode, fraction, maximumShift: .025 * fraction, warning: "Visual spacing simulation only; no orthodontic or dental-treatment claim." };
}
export function centralBand(teeth, fraction = .08) {
    if (fraction <= 0 || fraction > .3)
        throw new Error("fraction must be in (0,.3]");
    const b = annotationBounds(teeth), cx = (b.minX + b.maxX) / 2, half = (b.maxX - b.minX) * fraction / 2;
    return { left: cx - half, right: cx + half, top: b.minY, bottom: b.maxY };
}
export function expectedGapWidth(teeth, plan) { const b = annotationBounds(teeth); return (b.maxX - b.minX) * .08 * (1 - plan.fraction); }
export function acceptance(beforeWidth, afterWidth, plan) { const expected = beforeWidth * (1 - plan.fraction), error = Math.abs(afterWidth - expected); return { expected, observed: afterWidth, error, tolerance: Math.max(.002, beforeWidth * .08), pass: error <= Math.max(.002, beforeWidth * .08) }; }
//# sourceMappingURL=gap.js.map