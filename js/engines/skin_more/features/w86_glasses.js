/** W86 procedural glasses guide. Author: John Khan. */
import { applyCheckedColour, fitReport, glassesGeometry } from "../accessory_fit.js";
export function previewW86(pixels, w, h, style = "soft_round", scale = 1, colour = [48, 44, 42], amount = .9) { const mask = glassesGeometry(w, h, style, scale), out = applyCheckedColour(pixels, w, h, mask, colour, amount), report = fitReport("W86", mask, w, h, .42); return { pixels: out, style, symmetry: report.symmetry, scaleRatio: report.scaleRatio, flawScore: null, passed: report.outsideFraction <= .001 }; }
export const passDefinitionW86 = "procedural frame stays local to guide geometry; no face-shape flaw/ranking language";
