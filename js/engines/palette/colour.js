/** W1 digital colour mixing and W2 transparent depth checks. These functions
 * manipulate swatches only: they cannot alter a face or create a product formula.
 * Original implementation using the existing D65/CIELAB helpers. Author: John Khan.
 */
import { hexToRgb, rgbToHex, ciede2000 } from "../core/colour.js";
import { decode, encode, labToXyz, srgbToLab, xyzToLinear } from "../shade/colourspace.js";
export const MIX_LABEL = "Digital colour mix. Not a pigment recipe or a tested product match.";
export const SUITABILITY_LABEL = "Assumed photo-colour checks, not a product test. Your face is never lightened to match a reference.";
export function validLab(value) {
    // Matrix rounding puts sRGB white a few millionths above 100. The tolerance
    // only covers that conversion error; a requested swatch never gains lightness.
    if (!Array.isArray(value) || value.length !== 3 || !value.every(Number.isFinite) || value[0] < -1e-5 || value[0] > 100 + 1e-5 ||
        Math.abs(value[1]) > 256 || Math.abs(value[2]) > 256)
        throw new RangeError("Use a finite Lab colour with lightness from 0 to 100.");
    return [Math.min(100, Math.max(0, value[0])), value[1], value[2]];
}
const inGamut = (rgb) => rgb.every(value => value >= -1e-7 && value <= 1 + 1e-7);
export function fromHex(hex) { return srgbToLab(hexToRgb(hex)); }
/** Reduce chroma along a constant-L*, constant-hue line only when sRGB cannot
 * display the requested colour. This keeps depth rather than whitening a swatch. */
export function gamutColour(value) {
    const lab = validLab(value);
    let scale = 1, linear = xyzToLinear(labToXyz(lab));
    if (!inGamut(linear)) {
        let low = 0, high = 1;
        for (let i = 0; i < 24; i++) {
            const middle = (low + high) / 2;
            if (inGamut(xyzToLinear(labToXyz([lab[0], lab[1] * middle, lab[2] * middle]))))
                low = middle;
            else
                high = middle;
        }
        scale = low;
        linear = xyzToLinear(labToXyz([lab[0], lab[1] * scale, lab[2] * scale]));
    }
    const hex = rgbToHex(linear.map(encode));
    return { hex, lab: fromHex(hex), requestedLab: lab, chromaScale: scale, gamutReduced: scale < 1 - 1e-6 };
}
/** Light mixes linearly; the screen mix is deliberately not described as physical
 * pigment mixing. Exact endpoint hex values are retained. */
export function mixColours(first, second, secondShare) {
    if (!Number.isFinite(secondShare) || secondShare < 0 || secondShare > 1)
        throw new RangeError("Mix share must be 0 to 100 percent.");
    const a = hexToRgb(first), b = hexToRgb(second);
    const hex = secondShare === 0 ? rgbToHex(a) : secondShare === 1 ? rgbToHex(b)
        : rgbToHex(a.map((value, i) => encode(decode(value) * (1 - secondShare) + decode(b[i]) * secondShare)));
    const lab = fromHex(hex);
    return { hex, lab, requestedLab: [...lab], chromaScale: 1, gamutReduced: false, label: MIX_LABEL };
}
export function moreChroma(hex, factor = 1.2) {
    if (!Number.isFinite(factor) || factor < 1 || factor > 2)
        throw new RangeError("Chroma increase must be between 1 and 2 times.");
    const [lightness, a, b] = fromHex(hex);
    return gamutColour([lightness, a * factor, b * factor]);
}
/** Declared engineering heuristics, not learned skin-type or seasonal categories.
 * Ashy: a low-chroma shade at least 15 L* above a measured depth <=45.
 * Orange: hue 35..75°, chroma >=30 and b* at least 15 above measured skin.
 * These are warnings for human comparison, never eligibility or product claims. */
export const DEPTH_CHECKS = Object.freeze({ deepMaxL: 45, ashyLightnessGap: 15, ashyMaxChroma: 18,
    orangeHueMin: 35, orangeHueMax: 75, orangeMinChroma: 30, orangeBGap: 15 });
export function assessShade(hex, measuredSkin) {
    const shade = fromHex(hex), flags = [], notes = [];
    if (!measuredSkin)
        return { measured: false, deltaE: null, flags, notes: ["Skin colour has not been measured. No depth-based suitability claim is made."], label: SUITABILITY_LABEL };
    const skin = validLab(measuredSkin), chroma = Math.hypot(shade[1], shade[2]);
    const hue = (Math.atan2(shade[2], shade[1]) * 180 / Math.PI + 360) % 360, t = DEPTH_CHECKS;
    if (skin[0] <= t.deepMaxL && shade[0] - skin[0] >= t.ashyLightnessGap && chroma < t.ashyMaxChroma) {
        flags.push("may_read_ashy");
        notes.push("This light, muted shade may read ashy at your measured depth. Try more chroma at the same swatch lightness, or choose another shade.");
    }
    if (hue >= t.orangeHueMin && hue <= t.orangeHueMax && chroma >= t.orangeMinChroma && shade[2] - skin[2] >= t.orangeBGap) {
        flags.push("may_read_orange");
        notes.push("This shade is much warmer than the measured skin colour and may read orange. Check a physical swatch before choosing a product.");
    }
    if (!flags.length)
        notes.push("No ashy/orange warning under these limited colour rules. This is not a guarantee of wearability.");
    return { measured: true, deltaE: ciede2000(shade, skin), flags, notes, label: SUITABILITY_LABEL };
}
//# sourceMappingURL=colour.js.map