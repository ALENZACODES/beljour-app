/** Hair colour reading from a photo, for choosing an in-house swatch by hand, in the browser.
 * Mirrors api/plumb_api/engines/hair_palette/reading.py: non-opaque hair pixels are left
 * out and counted (transparent_source / no_hair); an optional neutral reference must agree
 * between its upper and lower halves within 3.0 CIEDE2000 (inconsistent_neutral); the hair
 * Lab comes from readFibreColour and its left and right halves must agree within the
 * committed 10.0 zone bound (mixed_lighting); suggestions never go above the measured
 * level. An estimate, not a dye result. Author: John Khan.
 */
import { mixedLightLimit } from "../../commerce/colour-stability.js";
import { readFibreColour } from "../../commerce/shade-support.js";
import { delta_e } from "../shade/distance.js";
import { SHADE_DATA } from "../shade/generated/data.js";
import { hairSupport } from "./evidence.js";
import { measuredLevel, suggest } from "./palette.js";
export const LABEL = "Hair colour estimate from your photo. Not a dye or product result.";
const refuse = (code, excluded, separation = null) => Object.freeze({ refused: true, code, excluded_transparent: excluded, separation });
const count = (mask) => mask.reduce((s, v) => s + v, 0);
function halves(mask, width, rows) {
    const index = [];
    mask.forEach((on, i) => { if (on)
        index.push(rows ? Math.floor(i / width) : i % width); });
    const sorted = [...index].sort((a, b) => a - b), n = sorted.length, mid = n >> 1;
    const cut = n % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    const first = new Uint8Array(mask.length), second = new Uint8Array(mask.length);
    mask.forEach((on, i) => {
        if (!on)
            return;
        ((rows ? Math.floor(i / width) : i % width) < cut ? first : second)[i] = 1;
    });
    return [first, second];
}
export function readHairColour(image, hairMask, options = {}) {
    const { width, height, channels } = image;
    if ((channels !== 3 && channels !== 4) || image.data.length !== width * height * channels) {
        throw new RangeError("Hair colour reading needs an RGB or RGBA photo of the stated size");
    }
    const minimum = SHADE_DATA.thresholds.minimum_zone_pixels;
    const support = hairSupport(hairMask, width, height, options.primaryBox);
    const opaque = (i) => channels === 3 || image.data[i * 4 + 3] === 255;
    const hair = support.map((on, i) => (on && opaque(i) ? 1 : 0));
    const excluded = count(support) - count(hair);
    if (count(hair) < minimum)
        return refuse(excluded ? "transparent_source" : "no_hair", excluded);
    let neutral;
    if (options.neutralMask !== undefined) {
        neutral = hairSupport(options.neutralMask, width, height).map((on, i) => (on && opaque(i) ? 1 : 0));
        if (count(neutral) < 2 * minimum)
            return refuse("inconsistent_neutral", excluded);
        const [top, bottom] = halves(neutral, width, true);
        if (Math.min(count(top), count(bottom)) < minimum)
            return refuse("inconsistent_neutral", excluded);
        const gap = delta_e(readFibreColour(image, top, { neutralMask: neutral }).lab, readFibreColour(image, bottom, { neutralMask: neutral }).lab);
        if (gap > SHADE_DATA.thresholds.confidence.zone_delta_e_ok)
            return refuse("inconsistent_neutral", excluded, gap);
    }
    const found = readFibreColour(image, hair, { neutralMask: neutral });
    const [left, right] = halves(hair, width, false);
    const split = Math.min(count(left), count(right)) < minimum ? 0
        : delta_e(readFibreColour(image, left, { neutralMask: neutral }).lab, readFibreColour(image, right, { neutralMask: neutral }).lab);
    if (split > mixedLightLimit())
        return refuse("mixed_lighting", excluded, split);
    return Object.freeze({ refused: false, reading: found, level: measuredLevel(found.lab), corrected: found.white_mode !== "none",
        suggestions: suggest(found.lab, { count: 3 }), halves_delta_e: split, excluded_transparent: excluded });
}
