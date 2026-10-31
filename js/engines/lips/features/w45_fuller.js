/** W45 fuller-lips shape consultation. Author: John Khan. */
import { measureLip, plausibilityCap, lipStyleWeights } from "../anatomy.js";
import { renderLip } from "../engine.js";
import { photoOf } from "./shared.js";
export function previewW45(pixels, width, height, points, amount = .4, style = "natural_plump") { const anatomy = measureLip(points); const cap = plausibilityCap(anatomy, style); const applied = Math.min(amount, cap); const weights = lipStyleWeights(style); const result = renderLip(photoOf(pixels, width, height), points, { feature: "W45", style, amount: applied }); return { pixels: result.data, upperRatio: weights.cupid, lowerRatio: weights.lowerCentre, appliedAmount: applied, cap, passed: applied <= cap + 1e-9, copy: "Consultation simulation only; no volume or medical outcome guarantee." }; }
export const passDefinitionW45 = "bounded geometry, exact identity at zero, simulation label";
