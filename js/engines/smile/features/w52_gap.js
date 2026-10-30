/** W52 checked tooth-gap visual preference preview. Author: John Khan. */
import { gapPlan, expectedGapWidth, annotationBounds } from "../index.js";
import { requireRegions, renderFeature } from "./shared.js";
export function previewW52(pixels, width, height, annotation, mode = "keep", amount = .5, adultConfirmed = false) {
    if (!adultConfirmed)
        throw new Error("18+ confirmation required for W52");
    requireRegions(annotation, "teeth");
    const plan = gapPlan(mode, amount);
    const bounds = annotationBounds(annotation.teeth);
    const beforeWidth = (bounds.maxX - bounds.minX) * .08;
    const expectedWidth = expectedGapWidth(annotation.teeth, plan);
    const out = renderFeature(pixels, width, height, "W52", annotation, amount, true);
    return { pixels: out, mode, beforeWidth, expectedWidth, maximumShift: plan.maximumShift, orthodonticClaim: false, passed: expectedWidth <= beforeWidth + 1e-9 };
}
export const passDefinitionW52 = "keep option remains exact; visual closure is bounded; no orthodontic treatment claim";
//# sourceMappingURL=w52_gap.js.map