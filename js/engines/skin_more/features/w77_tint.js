/** W77 sheer skin tint orchestration. Author: John Khan. */
import { applyTint, tintPlan } from "../complexion.js";
import { robustRegionColour } from "../colorimetry.js";
import { textureGate } from "../texture.js";
export function previewW77(pixels, w, h, face, target, style = "sheer", amount = .5) { const base = robustRegionColour(pixels, w, h, face), source = base.rgb.map(Math.round), plan = tintPlan(source, target, style, amount), out = applyTint(pixels, w, h, face, plan), gate = textureGate(pixels, out, w, h, face, .72); return { pixels: out, targetRgb: plan.targetRgb, opacity: plan.opacity, textureScore: gate.score, passed: gate.pass, notes: [plan.warning, "No skin-tone ranking or lightening objective."] }; }
export const passDefinitionW77 = "texture score >=0.72, bounded sheer opacity, alpha unchanged, zero-strength identity";
//# sourceMappingURL=w77_tint.js.map