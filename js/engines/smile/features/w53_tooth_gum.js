/** W53 checked tooth/gum character design. Author: John Khan. */
import { gumLineGuide, toothCharacter } from "../index.js";
import { requireRegions, renderFeature } from "./shared.js";
export function previewW53(pixels, width, height, annotation, style = "natural_variation", amount = .5) { requireRegions(annotation, "teeth", "gum"); const guide = gumLineGuide(annotation.gum, annotation.teeth); const character = toothCharacter(style); const out = renderFeature(pixels, width, height, "W53", annotation, amount); return { pixels: out, gumHeight: guide.height, symmetry: guide.symmetry, uniformity: character.uniformity, treatmentRecommendation: false, passed: guide.symmetry >= 0 && guide.symmetry <= 1, note: guide.note }; }
export const passDefinitionW53 = "checked gum+teeth only; character remains editable; no tissue-removal/treatment recommendation";
