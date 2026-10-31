/** Checked neutral-card evidence for the W6 shade reader.
 * Mirrors api/plumb_api/engines/shade/neutral_calibration.py. A card corrects colour
 * only when the visitor has confirmed it is neutral material. Clipped pixels (any
 * channel at or below 4, or at or above 251) and transparent pixels (alpha at or below
 * 245) are left out; the upper and lower halves of the card must agree within the
 * committed W6 zone distance on the uncorrected colour, and each half needs
 * minimum_zone_pixels usable pixels. Mixed lighting refuses; no reliability or colour
 * limit is lowered. Not clinical testing or device calibration. Author: John Khan.
 */
import { ciede2000 } from "../core/colour.js";
import { decode, linearToXyz, xyzToLab } from "./colourspace.js";
import { whiteFromPixels } from "./finder.js";
import { SHADE_DATA } from "./generated/data.js";
export const CLIP_LOW = 4;
export const CLIP_HIGH = 251;
export const OPAQUE_ABOVE = 245;
const NOTES = {
    none: "Confirmed neutral card with even lighting; colour is corrected from it.",
    not_confirmed: "The card was not confirmed as neutral material, so it is not used.",
    card_too_small: "The marked card is too small to measure; it is not used.",
    card_clipped: "Too much of the card is clipped or transparent to measure; it is not used.",
    mixed_lighting: "The top and bottom of the card are lit differently; retake in even light.",
};
function refuse(reason, cardPixels, usablePixels = 0, upperLowerDistance = null) {
    return { usable: false, reason, cardPixels, usablePixels, upperLowerDistance, white: null, mask: null,
        note: NOTES[reason] };
}
function meanLab(pixels) {
    const sum = [0, 0, 0];
    for (const p of pixels)
        for (let c = 0; c < 3; c++)
            sum[c] += decode(p[c]);
    return xyzToLab(linearToXyz(sum.map((v) => v / pixels.length)));
}
/** Check a visitor-marked neutral card before it may correct a skin reading. */
export function inspectNeutralCard(image, cardMask, options) {
    const { width, height, channels, data } = image;
    if ((channels !== 3 && channels !== 4) || data.length !== width * height * channels) {
        throw new RangeError("neutral card needs an RGB or RGBA photo");
    }
    if (cardMask.length !== width * height)
        throw new RangeError("neutral card mask must match the photo size");
    if (typeof options.confirmed !== "boolean")
        throw new RangeError("confirmed must be a boolean");
    let cardPixels = 0, top = Infinity, bottom = -Infinity;
    for (let i = 0; i < cardMask.length; i++) {
        if (!(cardMask[i] >= 0.5))
            continue;
        cardPixels++;
        const row = Math.floor(i / width);
        top = Math.min(top, row);
        bottom = Math.max(bottom, row);
    }
    if (!options.confirmed)
        return refuse("not_confirmed", cardPixels);
    const minimum = SHADE_DATA.thresholds.minimum_zone_pixels;
    if (cardPixels < 2 * minimum)
        return refuse("card_too_small", cardPixels);
    const middle = (top + bottom + 1) / 2;
    const mask = new Uint8Array(width * height);
    const upper = [], lower = [];
    for (let i = 0; i < cardMask.length; i++) {
        if (!(cardMask[i] >= 0.5))
            continue;
        const o = i * channels;
        const rgb = [data[o], data[o + 1], data[o + 2]];
        if (!rgb.every((v) => v > CLIP_LOW && v < CLIP_HIGH))
            continue;
        if (channels === 4 && !(data[o + 3] > OPAQUE_ABOVE))
            continue;
        mask[i] = 1;
        (Math.floor(i / width) < middle ? upper : lower).push(rgb);
    }
    const usablePixels = upper.length + lower.length;
    if (Math.min(upper.length, lower.length) < minimum)
        return refuse("card_clipped", cardPixels, usablePixels);
    const distance = ciede2000(meanLab(upper), meanLab(lower));
    if (distance > SHADE_DATA.thresholds.confidence.zone_delta_e_ok) {
        return refuse("mixed_lighting", cardPixels, usablePixels, distance);
    }
    return { usable: true, reason: null, cardPixels, usablePixels, upperLowerDistance: distance,
        white: whiteFromPixels([...upper, ...lower], "neutral"), mask, note: NOTES.none };
}
/** Options for the W6 photo readers: the checked card, or nothing. */
export function neutralPhotoOptions(decision) {
    return decision.usable && decision.mask !== null ? { neutralMask: decision.mask } : {};
}
const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;
export function publicNeutral(decision) {
    return {
        usable: decision.usable, reason: decision.reason, card_pixels: decision.cardPixels,
        usable_pixels: decision.usablePixels,
        upper_lower_distance: decision.upperLowerDistance === null ? null : round(decision.upperLowerDistance, 4),
        white: decision.white === null ? null : { gains: decision.white.gains.map((g) => round(g, 6)),
            mode: decision.white.mode, clamped: decision.white.clamped },
        note: decision.note, clinical: false,
    };
}
