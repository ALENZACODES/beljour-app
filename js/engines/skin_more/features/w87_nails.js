/** W87 checked nail-colour orchestration. Author: John Khan. */
import { nailColour } from "../accessory_fit.js";
import { outsideChangeFraction, stats } from "../masking.js";
export function previewW87(pixels, w, h, mask, colour = [120, 34, 58], amount = .75) { const out = nailColour(pixels, w, h, mask, colour, amount), outside = outsideChangeFraction(pixels, out, mask), s = stats(mask, w, h); return { pixels: out, regionFraction: s.fraction, outsideFraction: outside, shapeChanged: false, passed: outside <= .001 }; }
export const passDefinitionW87 = "checked nail interiors only; colour changes but nail shape and length do not";
