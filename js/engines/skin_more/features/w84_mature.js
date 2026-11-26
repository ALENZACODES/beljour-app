/** W84 mature-skin texture-first orchestration. Author: John Khan. */
import { boundedMicrocontrast, proAgeProfile, textureGate } from "../texture.js";
export function previewW84(pixels, w, h, mask, style = "texture_first", amount = .5) {
    const profile = proAgeProfile(style), out = boundedMicrocontrast(pixels, w, h, mask, amount * profile.microcontrast * 10), gate = textureGate(pixels, out, w, h, mask, .78);
    return { pixels: out, style, textureScore: gate.score, lineBlur: profile.lineBlur, antiAgeClaim: false, passed: gate.pass && profile.lineBlur === 0 };
}
export const passDefinitionW84 = "texture score >=0.78, zero line blur, no younger/anti-age claim";
//# sourceMappingURL=w84_mature.js.map