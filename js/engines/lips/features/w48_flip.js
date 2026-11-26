/** W48 lip-flip appearance consultation. Author: John Khan. */
import { measureLip, plausibilityCap } from "../anatomy.js";
import { renderLip } from "../engine.js";
import { photoOf } from "./shared.js";
export function previewW48(pixels, width, height, points, amount = .4) { const cap = Math.min(plausibilityCap(measureLip(points), "vertical_lift"), .55); const applied = Math.min(amount, cap); const result = renderLip(photoOf(pixels, width, height), points, { feature: "W48", style: "rest", amount: applied }); return { pixels: result.data, requested: amount, applied, cap, upperChangeOnly: true, passed: applied <= .55 }; }
export const passDefinitionW48 = "bounded upper-lip appearance change, no muscle/treatment outcome claim";
//# sourceMappingURL=w48_flip.js.map