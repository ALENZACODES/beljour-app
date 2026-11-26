/** W78 cosmetic self-tan orchestration. Author: John Khan. */
import { applyTan, tanPlan } from "../complexion.js";
import { outsideChangeFraction } from "../masking.js";
export function previewW78(pixels, w, h, body, dry, style = "medium", amount = .5) { const plan = tanPlan(style, amount), out = applyTan(pixels, w, h, body, dry, plan), outside = outsideChangeFraction(pixels, out, body); return { pixels: out, style, opacity: plan.opacity, dryMultiplier: plan.dryZoneMultiplier, outsideFraction: outside, passed: outside <= .001 && plan.opacity <= .2, warning: plan.warning }; }
export const passDefinitionW78 = "no unmasked change, dry zones receive no more colour than surrounding skin, no UV/health claim";
//# sourceMappingURL=w78_tan.js.map