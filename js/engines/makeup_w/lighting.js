/** Local makeup lighting robustness mirror. Author: John Khan. */
import { labToLch, rgbToLab } from "./colour.js";
export const LIGHTING_CONDITIONS = { daylight: { name: "daylight", whiteRgb: [255, 250, 240], exposureEv: 0, label: "neutral daylight simulation" }, warm_indoor: { name: "warm_indoor", whiteRgb: [255, 220, 175], exposureEv: -.15, label: "warm indoor light simulation" }, cool_indoor: { name: "cool_indoor", whiteRgb: [210, 230, 255], exposureEv: -.10, label: "cool indoor light simulation" }, flash: { name: "flash", whiteRgb: [245, 248, 255], exposureEv: .35, label: "generic flash simulation" }, dim_evening: { name: "dim_evening", whiteRgb: [235, 205, 180], exposureEv: -.65, label: "dim evening simulation" } };
function activeMean(photo, mask) { if (mask.length !== photo.width * photo.height)
    throw new RangeError("mask shape mismatch"); let r = 0, g = 0, b = 0, n = 0; for (let i = 0; i < mask.length; i++) {
    if (mask[i] <= .25)
        continue;
    const o = i * photo.channels;
    r += photo.data[o];
    g += photo.data[o + 1];
    b += photo.data[o + 2];
    n++;
} if (!n)
    throw new RangeError("mask is empty"); return [r / n, g / n, b / n]; }
function lch(rgb) { const fixed = [Math.round(Math.max(0, Math.min(255, rgb[0]))), Math.round(Math.max(0, Math.min(255, rgb[1]))), Math.round(Math.max(0, Math.min(255, rgb[2])))]; return labToLch(rgbToLab(fixed)); }
export function applyLighting(photo, condition) { const data = new Uint8ClampedArray(photo.data), white = condition.whiteRgb.map(v => v / 255), gain = 2 ** condition.exposureEv; for (let i = 0; i < photo.width * photo.height; i++) {
    const o = i * photo.channels;
    for (let c = 0; c < 3; c++)
        data[o + c] = Math.round(photo.data[o + c] * white[c] * gain);
    if (photo.channels === 4)
        data[o + 3] = photo.data[o + 3];
} return { ...photo, data }; }
export function compareLighting(photo, mask, condition) { const before = activeMean(photo, mask), afterPhoto = applyLighting(photo, condition), after = activeMean(afterPhoto, mask), [bl, bc, bh] = lch(before), [al, ac, ah] = lch(after), raw = Math.abs(ah - bh) % 360; return { condition: condition.name, meanRgb: after, lightness: al, chroma: ac, hue: ah, deltaLightness: al - bl, deltaChroma: ac - bc, hueShift: Math.min(raw, 360 - raw) }; }
export function lightingSweep(photo, mask) { return Object.values(LIGHTING_CONDITIONS).map(condition => compareLighting(photo, mask, condition)); }
export function lightingRobustness(rows, maxHueShift = 35) { if (!rows.length)
    throw new RangeError("at least one lighting result required"); const maxHue = Math.max(...rows.map(row => row.hueShift)); return { conditions: rows.length, max_hue_shift: maxHue, max_lightness_delta: Math.max(...rows.map(row => Math.abs(row.deltaLightness))), max_chroma_delta: Math.max(...rows.map(row => Math.abs(row.deltaChroma))), passed: maxHue <= maxHueShift, label: "generic local lighting robustness simulation; not calibrated product photography" }; }
//# sourceMappingURL=lighting.js.map