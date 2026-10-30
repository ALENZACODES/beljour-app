/** W85 procedural jewellery guide. Author: John Khan. */
import { applyCheckedColour, fitReport, jewelleryGeometry } from "../accessory_fit.js";
export function previewW85(pixels, w, h, style = "both", scale = 1, colour = [180, 145, 74], amount = .7) { const mask = jewelleryGeometry(w, h, style, scale), out = applyCheckedColour(pixels, w, h, mask, colour, amount), report = fitReport("W85", mask, w, h, .4); return { pixels: out, scaleRatio: report.scaleRatio, symmetry: report.symmetry, millimetreClaim: false, passed: report.outsideFraction <= .001, warning: report.warning }; }
export const passDefinitionW85 = "procedural asset only, image-relative scale unless calibrated, no product-weight or fit guarantee";
//# sourceMappingURL=w85_jewellery.js.map