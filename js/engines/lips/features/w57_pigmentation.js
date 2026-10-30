/** W57 pigmentation-aware lip colour. Author: John Khan. */
import { analysePigmentation, linerPairing, pigmentationDisclosure } from "../pigmentation.js";
import { renderLip } from "../engine.js";
import { photoOf } from "./shared.js";
export function previewW57(pixels, width, height, points, colour = [148, 55, 76], amount = .6) { const photo = photoOf(pixels, width, height); const base = renderLip(photo, points, { feature: "W57", style: "medium", amount, colour }); const stats = analysePigmentation(photo, base.coverage); const paired = linerPairing(colour, stats); return { pixels: base.data, sideDelta: stats.sideDelta, verticalDelta: stats.verticalDelta, twoToneScore: stats.twoToneScore, pairedLiner: paired, passed: stats.twoToneScore >= 0 && stats.twoToneScore <= 1, disclosure: pigmentationDisclosure(stats) }; }
export const passDefinitionW57 = "observed pigmentation is preserved and never treated as a defect; adaptation stays inside lips";
//# sourceMappingURL=w57_pigmentation.js.map