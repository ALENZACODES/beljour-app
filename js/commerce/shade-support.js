/** Local fibre-colour reading and planning against the in-house hair swatches.
 * Mirrors api/plumb_api/engines/concealer/shade_support.py. Reading: hair pixels in a
 * caller-supplied mask, corrected with the W6 lighting gains (neutral card first, else a
 * labelled grey-world background estimate), then the LS5 rule: keep L* between its 20th
 * and 80th percentile and take each channel's median. Planning: nearest hair swatches by
 * CIEDE2000, never above the measured hair level; a lighter swatch is only a separate
 * option that needs explicit approval. Coded refusals: uncorrected_lighting, too_far
 * (beyond the committed W6 6.0 limit, ASSUMED to carry over to fibre colour).
 * No image, mask or supplier name is kept. Author: John Khan.
 */
import { quantile } from "../engines/core/filters.js";
import { nearestShade, rankShades } from "../engines/shade/distance.js";
import { pixelsToLab, whiteBalance } from "../engines/shade/finder.js";
import { SHADE_DATA } from "../engines/shade/generated/data.js";
import { checkedLab } from "../engines/shade/loaders.js";
export const LABEL = "Fibre colour estimate from your photo. In-house swatches, not tested against real products.";
export const WHITE_MODES = ["neutral", "grey_world", "none"];
export const MAX_COUNT = 10;
const TRIM = [0.2, 0.8];
/** A checked, frozen reading; `white_mode` says how (or whether) lighting was corrected. */
export function fibreReading(lab, whiteMode, clamped = false, pixels = 0) {
    if (!WHITE_MODES.includes(whiteMode)) {
        throw new RangeError("white_mode must be neutral, grey_world or none");
    }
    if (typeof clamped !== "boolean" || !Number.isInteger(pixels) || pixels < 0) {
        throw new RangeError("clamped must be a boolean and pixels a non-negative integer");
    }
    return Object.freeze({ lab: Object.freeze(checkedLab(lab)), white_mode: whiteMode, clamped, pixels });
}
/** Corrected median hair Lab from one photo; throws RangeError on too few hair pixels. */
export function readFibreColour(image, hairMask, options = {}) {
    if ((image.channels !== 3 && image.channels !== 4) || image.data.length !== image.width * image.height * image.channels) {
        throw new RangeError("Fibre colour needs an RGB or RGBA photo of the stated size");
    }
    if (hairMask.length !== image.width * image.height)
        throw new RangeError("Hair mask must match the photo size");
    const pixels = [];
    for (let i = 0; i < hairMask.length; i++) {
        if (hairMask[i] >= 0.5) {
            const at = i * image.channels;
            pixels.push([image.data[at], image.data[at + 1], image.data[at + 2]]);
        }
    }
    if (pixels.length < SHADE_DATA.thresholds.minimum_zone_pixels)
        throw new RangeError("Too few hair pixels to read a colour");
    const white = whiteBalance(image, options);
    const lab = pixelsToLab(pixels, white);
    const light = lab.map((v) => v[0]);
    const lo = quantile(light, TRIM[0]), hi = quantile(light, TRIM[1]);
    const keep = lab.filter((v) => v[0] >= lo && v[0] <= hi);
    const median = [0, 1, 2].map((c) => quantile(keep.map((v) => v[c]), 0.5));
    return fibreReading(median, white.mode, white.clamped, pixels.length);
}
function plan(reading, code, matches, lighter, approved) {
    return Object.freeze({ reading, code, refused: code !== null, matches, lighter_option: lighter,
        approved_lighter: approved, label: LABEL });
}
/** Up to `count` swatches nearest first; a lighter one only with `approveLighter`. */
export function planFibreColour(reading, options = {}) {
    const { approveLighter = false, count = 3 } = options;
    const checked = fibreReading(reading.lab, reading.white_mode, reading.clamped, reading.pixels);
    if (typeof approveLighter !== "boolean")
        throw new RangeError("approveLighter must be a boolean");
    if (!Number.isInteger(count) || count < 1 || count > MAX_COUNT)
        throw new RangeError(`count must be 1..${MAX_COUNT}`);
    if (checked.white_mode === "none")
        return plan(checked, "uncorrected_lighting", [], null, approveLighter);
    const matches = rankShades(checked.lab, "hair", { allowLighter: approveLighter, limit: count });
    const limit = SHADE_DATA.thresholds.confidence.refuse_delta_e_above;
    if (matches.length === 0 || matches[0].delta_e > limit)
        return plan(checked, "too_far", [], null, approveLighter);
    const overall = nearestShade(checked.lab, "hair", { allowLighter: true });
    const lighter = !approveLighter && overall !== null && overall.measured_level !== null &&
        overall.record.level > overall.measured_level && overall.delta_e <= limit ? overall : null;
    return plan(checked, null, matches, lighter, approveLighter);
}
//# sourceMappingURL=shade-support.js.map