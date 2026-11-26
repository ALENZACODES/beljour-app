/** Final-pixel colour evidence for a rendered fibre preview.
 * Mirrors api/plumb_api/engines/concealer/colour_evidence.py: a change outside the
 * allowed region refuses (protected_region_changed), an alpha change refuses
 * (alpha_changed), no change inside is "unchanged", otherwise the CIEDE2000 distance
 * from the region's mean colour (linear light, then CIELAB) to the chosen swatch is
 * measured before and after; closer is "rendered_closer", equal or further is recorded
 * as "adverse_shift". Counts and distances only. On-screen colour, not physical dye.
 * Author: John Khan.
 */
import { decode, linearToXyz, xyzToLab } from "../engines/shade/colourspace.js";
import { delta_e } from "../engines/shade/distance.js";
import { checkedLab } from "../engines/shade/loaders.js";
export const LABEL = "On-screen colour check of a simulation; not a physical dye or fibre match.";
function evidence(status, code, region, changed, outside, before = null, after = null) {
    return Object.freeze({ format: "beljour-final-colour/1", status, code, region_pixels: region, changed_pixels: changed,
        outside_changed: outside, before_delta_e: before, after_delta_e: after,
        shift_delta_e: before === null || after === null ? null : after - before, label: LABEL,
        tested_against_real_products: false });
}
/** Mean of the region's sRGB pixels in linear light, as CIELAB. */
export function meanLab(image, inside) {
    const sum = [0, 0, 0];
    let count = 0;
    for (let i = 0; i < inside.length; i++) {
        if (!(inside[i] >= 0.5))
            continue;
        count++;
        for (let c = 0; c < 3; c++)
            sum[c] += decode(image.data[i * image.channels + c]);
    }
    return xyzToLab(linearToXyz(sum.map((v) => v / count)));
}
function checkImage(image, name) {
    if ((image.channels !== 3 && image.channels !== 4) || image.data.length !== image.width * image.height * image.channels) {
        throw new RangeError(`${name} must be an RGB or RGBA image`);
    }
}
/** Check the shown output against the chosen swatch inside the allowed region only. */
export function auditFinalColour(before, after, allowed, targetLab) {
    checkImage(before, "before");
    checkImage(after, "after");
    if (before.width !== after.width || before.height !== after.height || before.channels !== after.channels) {
        throw new RangeError("before and after must have the same size");
    }
    if (allowed.length !== before.width * before.height)
        throw new RangeError("allowed region must match the image size");
    const target = checkedLab(targetLab);
    const ch = before.channels;
    let region = 0, changed = 0, outside = 0, alpha = false;
    for (let i = 0; i < allowed.length; i++) {
        const inside = allowed[i] >= 0.5;
        if (inside)
            region++;
        const moved = [0, 1, 2].some((c) => before.data[i * ch + c] !== after.data[i * ch + c]);
        if (moved && inside)
            changed++;
        else if (moved)
            outside++;
        if (ch === 4 && before.data[i * 4 + 3] !== after.data[i * 4 + 3])
            alpha = true;
    }
    if (outside)
        return evidence("refused", "protected_region_changed", region, changed, outside);
    if (alpha)
        return evidence("refused", "alpha_changed", region, changed, 0);
    if (region === 0)
        return evidence("refused", "empty_region", 0, 0, 0);
    if (changed === 0)
        return evidence("unchanged", null, region, 0, 0);
    const first = delta_e(meanLab(before, allowed), target), second = delta_e(meanLab(after, allowed), target);
    return evidence(second < first ? "rendered_closer" : "adverse_shift", null, region, changed, 0, first, second);
}
const round4 = (v) => v === null ? null : Math.round(v * 1e4) / 1e4;
export function publicFinalColour(found) {
    return Object.freeze({ ...found, before_delta_e: round4(found.before_delta_e),
        after_delta_e: round4(found.after_delta_e), shift_delta_e: round4(found.shift_delta_e) });
}
//# sourceMappingURL=colour-evidence.js.map