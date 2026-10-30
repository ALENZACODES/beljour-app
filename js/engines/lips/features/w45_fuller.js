/** W45 fuller-lips shape consultation. Author: John Khan. */
import { measureLip, plausibilityCap, lipStyleWeights } from "../anatomy.js";
import { renderLip } from "../engine.js";
import { photoOf } from "./shared.js";
export function previewW45(pixels, width, height, points, amount = .4, style = "natural_plump", adultConfirmed = false) {
    if (!adultConfirmed)
        throw new Error("18+ confirmation required for W45");
    const anatomy = measureLip(points);
    const cap = plausibilityCap(anatomy, style);
    const applied = Math.min(amount, cap);
    const weights = lipStyleWeights(style);
    const result = renderLip(photoOf(pixels, width, height), points, { feature: "W45", style, amount: applied, adult_confirmed: true });
    return { pixels: result.data, upperRatio: weights.cupid, lowerRatio: weights.lowerCentre, appliedAmount: applied, cap, adultConfirmed: true, passed: applied <= cap + 1e-9, copy: "Consultation simulation only; no volume or medical outcome guarantee." };
}
export const passDefinitionW45 = "adult confirmation, bounded geometry, exact identity at zero, simulation label";
//# sourceMappingURL=w45_fuller.js.map