/** Tan add and tan remove on the landmark skin region. Mirrors
 * api/plumb_api/engines/skin/tan.py. Adding is the existing never-lighter optical tan
 * (glow-tan.ts); removing lightens skin, so it runs only when she turns it on.
 * Author: John Khan.
 */
import { glowTan, SHIFTS } from "./glow-tan.js";
import { checkPhoto, checkStrength, copyOf, encode, labPlanes, NOTE, unchanged } from "./common.js";
export const DIRECTIONS = ["add", "remove"];
export const REMOVE_L = 3.0;
export const ADD_LABEL = "Tan simulation; not a UV exposure guide. " + NOTE;
export const REMOVE_LABEL = "Tan removal simulation, chosen by you: this lightens skin. " + NOTE;
export const LIGHTENING_CODE = "lightening_needs_opt_in";
/** Tan removal was asked for without the person turning lightening on. */
export class LighteningNotChosen extends RangeError {
    code = LIGHTENING_CODE;
    constructor() { super("Tan removal lightens skin, so it runs only when you turn it on."); }
}
function rgbOnly(image) {
    const n = image.width * image.height, data = new Uint8Array(n * 3);
    for (let i = 0; i < n; i++)
        for (let c = 0; c < 3; c++)
            data[i * 3 + c] = image.data[i * image.channels + c];
    return { width: image.width, height: image.height, channels: 3, data };
}
export function tan(image, skin, direction = "add", strength = 30, undertone = "neutral", allowLightening = false) {
    checkPhoto(image);
    const amount = checkStrength(strength);
    if (!DIRECTIONS.includes(direction))
        throw new RangeError("direction must be add or remove");
    if (!(undertone in SHIFTS))
        throw new RangeError("undertone must be olive, cool, warm or neutral");
    if (direction === "remove" && allowLightening !== true)
        throw new LighteningNotChosen();
    if (amount === 0)
        return unchanged(image, direction === "add" ? ADD_LABEL : REMOVE_LABEL, { direction });
    if (direction === "add") {
        const added = glowTan(rgbOnly(image), skin, undertone, strength, false);
        const out = copyOf(image), ch = image.channels;
        for (let i = 0; i < skin.length; i++)
            for (let c = 0; c < 3; c++)
                out[i * ch + c] = added.image[i * 3 + c];
        return { image: out, weight: Float64Array.from(added.alpha), label: ADD_LABEL, metrics: { direction: "add", undertone } };
    }
    const weight = new Float64Array(skin.length), lab = labPlanes(image), [sa, sb] = SHIFTS[undertone];
    for (let i = 0; i < skin.length; i++) {
        weight[i] = skin[i] * amount;
        lab.L[i] += REMOVE_L * weight[i];
        lab.a[i] -= sa * weight[i];
        lab.b[i] -= sb * weight[i];
    }
    return { image: encode(image, lab, weight), weight, label: REMOVE_LABEL, metrics: { direction: "remove", undertone, lightens: true } };
}
//# sourceMappingURL=tan.js.map