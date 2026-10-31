/** W88 checked scarf-colour orchestration. Author: John Khan. */
import { hijabColour } from "../accessory_fit.js";
export function previewW88(pixels, w, h, scarf, hair, colour = [74, 91, 122], amount = .55, culturalReviewComplete = false) { const r = hijabColour(pixels, w, h, scarf, hair, colour, amount), passed = r.metrics.hairChangedFraction === 0 && !r.metrics.hairReveal; return { pixels: r.pixels, hairChangedFraction: r.metrics.hairChangedFraction, hairReveal: false, culturalReviewRequired: true, releaseReady: passed && culturalReviewComplete, passed }; }
export const passDefinitionW88 = "hair-protected pixels unchanged; no reveal/removal; cultural co-design remains separate release gate";
