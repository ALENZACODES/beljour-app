/** W92 texture-first mature beauty orchestration. Author: John Khan. */
import { boundedMicrocontrast, textureGate } from "../texture.js";
export function previewW92(pixels, w, h, mask, amount = .4) { const out = boundedMicrocontrast(pixels, w, h, mask, amount), gate = textureGate(pixels, out, w, h, mask, .80); return { pixels: out, textureScore: gate.score, edgeRetention: gate.edgeRetention, antiAgeClaim: false, passed: gate.pass, copy: "Texture-first preview: lines, pores and changing lip/brow detail remain part of the result." }; }
export const passDefinitionW92 = "texture score >=0.80, no line erasure objective, no anti-ageing claim";
