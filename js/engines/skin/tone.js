/** Even tone and redness: pulls blotchy smooth colour toward the skin's own median
 * colour, on a* and b* only, so marks and texture keep their contrast and L* never rises.
 * Mirrors api/plumb_api/engines/skin/tone.py. Cosmetic only; names no skin condition.
 * Author: John Khan.
 */
import { checkPhoto, checkStrength, encode, labPlanes, maskedLowpass, median, NOTE, noLighten, radius, unchanged } from "./common.js";
const TONE_RADIUS = 1 / 6, EVEN_SHARE = 0.6, REDNESS_SHARE = 0.4, MAX_SHIFT = 8.0;
export const LABEL = "Even-tone simulation: colour evened, never lightened, marks kept. " + NOTE;
export function evenTone(image, skin, face, strength = 30, redness = 50) {
    checkPhoto(image);
    const amount = checkStrength(strength);
    if (!Number.isFinite(redness) || redness < 0 || redness > 100)
        throw new RangeError("redness must be 0..100");
    if (amount === 0)
        return unchanged(image, LABEL);
    const { width: w, height: h } = image, lab = labPlanes(image), n = w * h, r = radius(face.iod, TONE_RADIUS, 2);
    const weight = new Float64Array(n);
    for (let i = 0; i < n; i++)
        weight[i] = skin[i] > 0 ? skin[i] : 0;
    const references = [];
    for (const [index, plane] of [lab.a, lab.b].entries()) {
        const smooth = maskedLowpass(plane, skin, w, h, r);
        const inside = [];
        for (let i = 0; i < n; i++)
            if (skin[i] >= 0.5)
                inside.push(smooth[i]);
        const reference = median(inside);
        for (let i = 0; i < n; i++) {
            const deviation = smooth[i] - reference;
            let pull = EVEN_SHARE * deviation;
            if (index === 0)
                pull = pull + REDNESS_SHARE * (redness / 100) * Math.max(deviation, 0);
            plane[i] -= Math.min(Math.max(amount * pull, -MAX_SHIFT), MAX_SHIFT) * weight[i];
        }
        references.push(reference);
    }
    const out = encode(image, lab, weight);
    const guarded = noLighten(image, out, weight);
    return { image: out, weight, label: LABEL, metrics: { reference_a: Math.round(references[0] * 1e3) / 1e3,
            reference_b: Math.round(references[1] * 1e3) / 1e3, redness, guarded_pixels: guarded } };
}
