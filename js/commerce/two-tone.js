/** Two-swatch digital pigment plan for the local fibre preview.
 * Mirrors api/plumb_api/engines/concealer/two_tone.py and parity/colour-sim-r31f.json:
 * two different visitor-chosen in-house swatches are mixed in sRGB at 5 percent steps
 * of the second (each channel rounded half up to a byte), each mix is compared with the
 * corrected reading by CIEDE2000, ties go to the smaller share, and a mix above the
 * reading's measured hair level is left out unless the visitor opts in to lighter.
 * Coded refusals: uncorrected_lighting, same_swatch, too_light, too_far (beyond the
 * committed W6 6.0 limit). A screen-space estimate, not a physical mixture. Author: John Khan.
 */
import { measuredLevel, requireShade } from "../engines/hair_palette/index.js";
import { srgbToLab } from "../engines/shade/colourspace.js";
import { delta_e } from "../engines/shade/distance.js";
import { SHADE_DATA } from "../engines/shade/generated/data.js";
import { fibreReading } from "./shade-support.js";
export const STEP_PERCENT = 5;
export const STEPS = Array.from({ length: 21 }, (_, k) => k * STEP_PERCENT);
export const LABEL = "Two-swatch screen colour estimate; not a physical fibre or dye mixture.";
/** Per-channel byte mix with `percent` of the second colour, rounded half up. */
export function mixRgb(first, second, percent) {
    if (!Number.isInteger(percent) || percent < 0 || percent > 100)
        throw new RangeError("mix percent must be an integer 0..100");
    const mix = (a, c) => Math.floor((a * (100 - percent) + c * percent + 50) / 100);
    return [mix(first[0], second[0]), mix(first[1], second[1]), mix(first[2], second[2])];
}
export function mixOption(first, second, percent, reading) {
    const rgb = mixRgb(first.rgb, second.rgb, percent);
    const lab = srgbToLab(rgb);
    return Object.freeze({ percent, rgb, lab, level: measuredLevel(lab), delta_e: delta_e(lab, reading) });
}
/** The closest allowed 5 percent mix of two chosen swatches, or a coded refusal. */
export function planTwoTone(reading, firstId, secondId, options = {}) {
    const approveLighter = options.approveLighter ?? false;
    if (typeof approveLighter !== "boolean")
        throw new RangeError("approveLighter must be a boolean");
    const checked = fibreReading(reading.lab, reading.white_mode, reading.clamped, reading.pixels);
    const first = requireShade(firstId), second = requireShade(secondId);
    const level = measuredLevel(checked.lab);
    const plan = (code, best, considered) => Object.freeze({
        reading: checked, first_id: first.id, second_id: second.id, code, refused: code !== null, best,
        reading_level: level, approved_lighter: approveLighter, options_considered: considered, label: LABEL
    });
    if (checked.white_mode === "none")
        return plan("uncorrected_lighting", null, 0);
    if (first.id === second.id)
        return plan("same_swatch", null, 0);
    const all = STEPS.map((percent) => mixOption(first, second, percent, checked.lab));
    const allowed = all.filter((o) => approveLighter || o.level <= level);
    if (!allowed.length)
        return plan("too_light", null, all.length);
    const best = allowed.reduce((a, b) => b.delta_e < a.delta_e || (b.delta_e === a.delta_e && b.percent < a.percent) ? b : a);
    if (best.delta_e > SHADE_DATA.thresholds.confidence.refuse_delta_e_above)
        return plan("too_far", null, all.length);
    return plan(null, best, all.length);
}
/** Draw the chosen mix with the existing guarded, mask-limited fibre renderer. */
export function renderTwoTone(session, image, hairRegion, scalpShow, plan, options) {
    if (plan.best === null)
        throw new RangeError("A refused two-tone plan cannot be rendered");
    return session.render(image, hairRegion, scalpShow, { ...options, paletteRgb: plan.best.rgb });
}
//# sourceMappingURL=two-tone.js.map