/** W51 checked veneer-design preview. Author: John Khan. */
import { toothCells, shapeScale, shadeDelta, shadeWarning } from "../index.js";
import { requireRegions, renderFeature } from "./shared.js";
export function previewW51(pixels, width, height, annotation, shapeStyle = "natural", shadeStyle = "natural", amount = .5) { requireRegions(annotation, "teeth"); const cells = toothCells(annotation.teeth, 8); const scale = shapeScale(shapeStyle); const delta = shadeDelta(shadeStyle); const out = renderFeature(pixels, width, height, "W51", annotation, amount); return { pixels: out, toothCells: cells.length, widthScale: scale.width, heightScale: scale.height, shadeDelta: delta, modelUsed: false, passed: cells.length >= 4 && cells.length <= 14, warning: shadeWarning(delta) }; }
export const passDefinitionW51 = "checked teeth only, no segmentation model, bounded shape/shade, no clinical material outcome claim";
//# sourceMappingURL=w51_veneers.js.map