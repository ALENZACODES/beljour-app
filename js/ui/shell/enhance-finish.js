/** Enhance in the Studio: Portrait and Vivid are their own looks, not other names for Natural.
 * The rescue engine (engines/local/enhance.ts, kept byte-for-byte in step with its Python twin)
 * leaves a well-exposed photo untouched in every mode, so on its own the five Enhance names gave
 * three renders. Here, after the rescue, Portrait adds a soft-focus finish with slightly calmer
 * colour and Vivid adds richer colour at the same luminance plus clarity. Natural, Low light and
 * Backlit are unchanged. The result passes the same output guard as the rescue (no clipping
 * jump, no lifted face tone). The Enhance colour switch turns the finish off. Author: John Khan.
 */
import { byteImage, decode, encode, roundHalfEven } from "../../engines/core/buffer.js";
import { blur, unsharp } from "../../engines/local/enhance.js";
import { guardOutput } from "../../engines/local/enhance-safety.js";
import { faceWeights } from "../../engines/local/face-tone.js";
export const FINISHES = {
    portrait: { soften: 0.4, soften_sigma: 1.6, saturation: 0.93 },
    vivid: { saturation: 1.22, clarity: 0.5, clarity_sigma: 2.0 },
};
export const isFinishMode = (mode) => Object.hasOwn(FINISHES, mode);
function saturate(img, amount) {
    if (amount === 1)
        return img;
    const lin = decode(img), n = img.width * img.height;
    for (let i = 0; i < n; i++) {
        const l = 0.2126 * lin.data[i * 3] + 0.7152 * lin.data[i * 3 + 1] + 0.0722 * lin.data[i * 3 + 2];
        for (let c = 0; c < 3; c++)
            lin.data[i * 3 + c] = Math.min(1, Math.max(0, l + amount * (lin.data[i * 3 + c] - l)));
    }
    return encode(lin);
}
/** The mode's own finish at this strength (0..1) on RGB bytes; the identity for other modes. */
export function modeFinish(img, mode, strength) {
    if (!isFinishMode(mode) || !(strength > 0))
        return img;
    if (mode === "vivid") {
        const f = FINISHES.vivid;
        return unsharp(saturate(img, 1 + (f.saturation - 1) * strength), f.clarity_sigma, f.clarity * strength);
    }
    const f = FINISHES.portrait, soft = blur(img, f.soften_sigma), k = f.soften * strength;
    const out = byteImage(img.width, img.height, 3);
    for (let i = 0; i < img.width * img.height; i++)
        for (let c = 0; c < 3; c++) {
            out.data[i * 3 + c] = Math.min(255, Math.max(0, roundHalfEven(img.data[i * img.channels + c] * (1 - k) + soft.data[i * 3 + c] * k)));
        }
    return saturate(out, 1 + (f.saturation - 1) * strength);
}
/** Rescue output → the mode's finish → the shared output guard against the original photo. */
export function finishEnhance(original, rescued, mode, strength, faceMask) {
    if (!isFinishMode(mode) || !(strength > 0))
        return { image: rescued, applied: false, mix: 0 };
    const weights = faceMask === undefined ? undefined : faceWeights(faceMask, original.width, original.height);
    const safe = guardOutput(original, modeFinish(rescued, mode, strength), weights);
    return { image: safe.image, applied: true, mix: safe.applied_mix };
}
//# sourceMappingURL=enhance-finish.js.map