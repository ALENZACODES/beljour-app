/** #19 Grey add: grey added only inside the hair the person marks, never guessed. It runs the
 * hair layer of the local age engine (age.ts, mirrored by api/plumb_api/engines/shape/age.py)
 * with every other layer off, so lines, texture, spots and face shape are untouched. Amount 0
 * returns an exact copy; pixels outside the marked hair never change. Opt-in on its screen.
 * No age is asked or inferred, and greying is not predicted. Author: John Khan.
 */
import { requireColour, requireMask } from "../core/buffer.js";
import { renderAge } from "../local/age.js";
export const LABEL = "Grey added inside the hair you marked. Colour simulation, not a prediction of greying.";
const HAIR_ONLY = { lines: 0, texture: 0, spots: 0, jowl: 0, brows_lids: 0, lips: 0, colour: 0, hair: 1 };
export function addGrey(image, mesh, hair, amount) {
    requireColour(image);
    requireMask(hair, image.width, image.height);
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0 || amount > 100)
        throw new RangeError("amount must be 0 to 100");
    if (amount === 0)
        return { image: { ...image, data: new Uint8Array(image.data) }, label: LABEL, greyPixels: 0 };
    // Stop 5 is the age engine's full older step; the amount scales it, and only the hair layer is on.
    const out = renderAge(image, mesh, { stop: 5, strength: amount / 100, layers: HAIR_ONLY, hairMask: hair, greyMode: "wash" });
    return { image: out.image, label: LABEL, greyPixels: out.metrics.grey_pixels };
}
