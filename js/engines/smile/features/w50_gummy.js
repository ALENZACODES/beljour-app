/** W50 checked gummy-smile appearance consultation. Author: John Khan. */
import { gumMetrics, gummyAcceptance, gummyCopy } from "../index.js";
import { requireRegions, renderFeature } from "./shared.js";
export function previewW50(pixels, width, height, annotation, amount = .4) { requireRegions(annotation, "gum", "teeth"); const before = gumMetrics(annotation.gum, annotation.teeth); const afterRatio = before.gumToTeethRatio * (1 - Math.min(.35, amount * .35)); const after = { ...before, gumArea: before.gumArea * (afterRatio / Math.max(before.gumToTeethRatio, 1e-9)), gumToTeethRatio: afterRatio }; const gate = gummyAcceptance(before, after); const out = renderFeature(pixels, width, height, "W50", annotation, amount); return { pixels: out, beforeRatio: before.gumToTeethRatio, afterRatio, diagnostic: false, passed: gate.pass, copy: gummyCopy() }; }
export const passDefinitionW50 = "checked gum/teeth only; bounded appearance reduction; no diagnosis/treatment recommendation";
