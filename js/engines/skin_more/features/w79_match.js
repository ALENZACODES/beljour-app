/** W79 face/body continuity orchestration. Author: John Khan. */
import { faceBodyMatch } from "../complexion.js";
import { compareRegions } from "../colorimetry.js";
import { outsideChangeFraction } from "../masking.js";
export function previewW79(pixels, w, h, face, body, amount = .5) { const before = compareRegions(pixels, w, h, face, body), result = faceBodyMatch(pixels, w, h, face, body, amount), after = compareRegions(result.pixels, w, h, face, body), outside = outsideChangeFraction(pixels, result.pixels, body); return { pixels: result.pixels, beforeDeltaE: before.deltaE76, afterDeltaE: after.deltaE76, outsideFraction: outside, passed: after.deltaE76 <= before.deltaE76 + 1e-6 && outside <= .001, lightingNote: "One-photo comparison only; lighting may create apparent differences." }; }
export const passDefinitionW79 = "checked target region only and perceptual colour gap must not increase";
//# sourceMappingURL=w79_match.js.map