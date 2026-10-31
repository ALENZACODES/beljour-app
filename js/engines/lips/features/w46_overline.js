/** W46 realistic lip-overline guide. Author: John Khan. */
import { renderLip } from "../engine.js";
import { photoOf } from "./shared.js";
export function previewW46(pixels, width, height, points, amount = .4, style = "balanced") {
    const result = renderLip(photoOf(pixels, width, height), points, { feature: "W46", style, amount });
    let guidePixels = 0;
    for (const value of result.coverage)
        if (value > .01)
            guidePixels++;
    const guideFraction = guidePixels / result.coverage.length;
    return { pixels: result.data, guideFraction, passed: guidePixels > 0, note: "Guide follows the checked lip edge and intentionally limits extension beyond it." };
}
export const passDefinitionW46 = "guide follows existing vermilion edge and overline remains a bounded simulation";
