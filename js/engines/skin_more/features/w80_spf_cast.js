/** W80 sunscreen-cast appearance orchestration. Author: John Khan. */
import { spfCastPreview } from "../complexion.js";
import { outsideChangeFraction } from "../masking.js";
export function previewW80(pixels, w, h, mask, style = "mineral_cast", amount = .5) { const r = spfCastPreview(pixels, w, h, mask, style, amount), outside = outsideChangeFraction(pixels, r.pixels, mask); return { pixels: r.pixels, visualCastBefore: r.metrics.visualCastBefore, visualCastAfter: r.metrics.visualCastAfter, outsideFraction: outside, efficacyClaim: r.metrics.efficacyClaim, passed: outside <= .001 && r.metrics.efficacyClaim === "none" }; }
export const passDefinitionW80 = "visual cast only inside checked region; explicit zero SPF/UV efficacy claim";
//# sourceMappingURL=w80_spf_cast.js.map