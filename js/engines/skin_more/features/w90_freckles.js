/** W90 preserve-or-faux freckles. Author: John Khan. */
import { applyFreckles, defaultFreckles, freckleRaster, preserveFreckles } from "../freckles.js";
export function previewW90(pixels, w, h, mask, style = "preserve", amount = .4, seed = 0) {
    if (style === "preserve") {
        const r = preserveFreckles(pixels);
        return { ...r, faux: false, deterministic: true, markCount: 0, passed: r.pixels.every((v, i) => v === pixels[i]) };
    }
    const spec = { ...defaultFreckles, density: amount, seed }, a = freckleRaster(mask, w, h, spec), b = freckleRaster(mask, w, h, spec), deterministic = a.every((v, i) => v === b[i]), r = applyFreckles(pixels, w, h, mask, spec);
    return { ...r, faux: true, deterministic, markCount: r.metrics.markCount, passed: deterministic };
}
export const passDefinitionW90 = "preserve mode exact identity; faux mode deterministic for same seed and labelled simulation";
//# sourceMappingURL=w90_freckles.js.map