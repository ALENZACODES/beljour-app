/** W49 filler-dose-style appearance consultation. Author: John Khan. */
import { measureLip, plausibilityCap } from "../anatomy.js";
import { renderLip } from "../engine.js";
import { photoOf } from "./shared.js";
export function previewW49(pixels, width, height, points, styleLabel = "0.5_ml_style", amount = .5) { const cap = plausibilityCap(measureLip(points), "natural_plump"); const applied = Math.min(amount, cap); const result = renderLip(photoOf(pixels, width, height), points, { feature: "W49", style: styleLabel, amount: applied }); return { pixels: result.data, styleLabel, appliedAmount: applied, actualMlClaim: false, passed: applied <= cap + 1e-9, warning: "Style label is visual shorthand only; it is not a real injection-volume outcome claim." }; }
export const passDefinitionW49 = "dose names are style labels only; no real mL-to-outcome claim";
//# sourceMappingURL=w49_filler.js.map