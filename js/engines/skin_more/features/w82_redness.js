/** W82 user-marked redness-appearance correction. Author: John Khan. */
import { applyCorrection, rednessPlan } from "../complexion.js";
import { outsideChangeFraction } from "../masking.js";
export function previewW82(pixels, w, h, mask, style = "green_corrector", amount = .5) { const plan = rednessPlan(style, amount), out = applyCorrection(pixels, w, h, mask, plan), outside = outsideChangeFraction(pixels, out, mask); return { pixels: out, opacity: plan.opacity, outsideFraction: outside, diagnostic: plan.diagnostic, passed: outside <= .001 && !plan.diagnostic, copy: "Corrects the appearance of a checked red area only; persistent redness belongs with a clinician." }; }
export const passDefinitionW82 = "checked region only, bounded correction, no rosacea/disease inference or treatment claim";
