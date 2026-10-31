/** W81 user-marked deeper-pigmentation correction. Author: John Khan. */
import { applyCorrection, deeperPigmentationPlan } from "../complexion.js";
import { outsideChangeFraction } from "../masking.js";
export function previewW81(pixels, w, h, mask, style = "orange_corrector", amount = .5) { const plan = deeperPigmentationPlan(style, amount), out = applyCorrection(pixels, w, h, mask, plan), outside = outsideChangeFraction(pixels, out, mask); return { pixels: out, opacity: plan.opacity, outsideFraction: outside, diagnostic: plan.diagnostic, passed: outside <= .001 && !plan.diagnostic, copy: "Cosmetic preview on a user-marked region; this does not identify or diagnose pigmentation conditions." }; }
export const passDefinitionW81 = "checked region only, bounded cosmetic correction, and no diagnosis";
