/** W54 optical tooth-contrast from lip colour. Author: John Khan. */
import { renderLip } from "../engine.js";
import { photoOf } from "./shared.js";
export function previewW54(pixels, width, height, points, toothMask, style = "blue_based", amount = .6) {
    const result = renderLip(photoOf(pixels, width, height), points, { feature: "W54", style, amount });
    let toothPixelsChanged = 0;
    if (toothMask) {
        if (toothMask.length !== width * height)
            throw new Error("tooth mask length mismatch");
        for (let i = 0; i < toothMask.length; i++) {
            if (toothMask[i] <= .5)
                continue;
            if (pixels[i * 4] !== result.data[i * 4] || pixels[i * 4 + 1] !== result.data[i * 4 + 1] || pixels[i * 4 + 2] !== result.data[i * 4 + 2])
                toothPixelsChanged++;
        }
    }
    return { pixels: result.data, toothPixelsChanged, opticalOnly: true, passed: toothPixelsChanged === 0, note: "Teeth are unchanged; only adjacent lip colour can alter perceived contrast." };
}
export const passDefinitionW54 = "teeth pixels unchanged; effect is explicitly optical contrast from lip colour";
//# sourceMappingURL=w54_optical.js.map