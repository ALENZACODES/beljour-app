/** W55 lipstick-finish orchestration. Author: John Khan. */
import { finishDefinition, lineEnergy, textureCorrelation } from "../finish.js";
import { renderLip } from "../engine.js";
import { photoOf } from "./shared.js";
export function previewW55(pixels, width, height, points, style = "matte", amount = .6) { const photo = photoOf(pixels, width, height); const config = finishDefinition(style); const result = renderLip(photo, points, { feature: "W55", style, amount }); const afterPhoto = photoOf(result.data, width, height); const beforeEnergy = lineEnergy(photo, result.coverage); const afterEnergy = lineEnergy(afterPhoto, result.coverage); const ratio = afterEnergy / Math.max(beforeEnergy, 1e-6); const retention = textureCorrelation(photo, afterPhoto, result.coverage); return { pixels: result.data, finish: config.name, lineEnergyRatio: ratio, textureRetention: retention, passed: ratio >= .35 && ratio <= 2.2 && retention >= .45 }; }
export const passDefinitionW55 = "finish changes reflectance/colour while retaining measured lip texture";
//# sourceMappingURL=w55_finish.js.map