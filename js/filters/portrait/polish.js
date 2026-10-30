/**
 * Skin polish and feature definition for the portrait looks, the browser twin of
 * api/plumb_api/filters/portrait/polish.py (same steps, same order, same rounding).
 *
 * Polish is feature #25's texture-preserving smooth: inside the skin each pixel moves part of
 * the way toward a skin-only box mean (normalised by the mask), marks held out; then the Texture
 * Graft of api/plumb_api/arena/weapons.py, ported below, puts the original's finest band back
 * wherever it was lost and restores each mark's darkness. Pores, grain, freckles and moles stay.
 * Definition mixes the filter engine's spatial.structure op in by a feature mask (eyes with the
 * lash line, brows, lips), irises cut out. Nothing moves; no colour is added.
 * Author: John Khan.
 */
import { floatImage, roundHalfEven } from "../../engines/core/buffer.js";
import { boxMean } from "../../engines/core/filters.js";
import { highFrequency } from "../../engines/core/pyramid.js";
import { toBytes } from "../colour/lut.js";
import { structure } from "../spatial/structure.js";
import { wholeFrame } from "../runtime/engine.js";
export const BLUR_IOD = 1 / 6; // smoothing radius as a share of the IOD; ASSUMED
export const LASH_IOD = 0.06; // eye mask growth for the lash line; ASSUMED
export const DEFINITION = { amount: 1, radius: 0.012, threshold: 0.015 }; // structure op settings; ASSUMED
export const MARK_GROW = 1.6; // arena/marks.py mark_mask default
const clip01 = (v) => Math.min(1, Math.max(0, v));
const toByte = (v) => Math.min(255, Math.max(0, roundHalfEven(v)));
export function blurRadius(iod) {
    return Math.max(1, roundHalfEven(iod * BLUR_IOD));
}
function planeOf(width, height, values) {
    const out = floatImage(width, height, 1, true);
    for (let i = 0; i < out.data.length; i++)
        out.data[i] = values[i];
    return out;
}
function rgbFloat(rgb, width, height) {
    const out = floatImage(width, height, 3, true);
    for (let i = 0; i < out.data.length; i++)
        out.data[i] = rgb[i];
    return out;
}
function luma(values, width, height) {
    const out = floatImage(width, height, 1, true);
    for (let p = 0; p < width * height; p++) {
        out.data[p] = values[p * 3] * 0.2126 + values[p * 3 + 1] * 0.7152 + values[p * 3 + 2] * 0.0722;
    }
    return out;
}
/** Soft blobs over the marks (arena/marks.py mark_mask). */
export function markMask(marks, width, height, grow = MARK_GROW) {
    const out = new Float64Array(width * height);
    for (const m of marks) {
        const r = Math.max(1.5, m.radius * grow);
        const x0 = Math.max(0, Math.trunc(m.x - 2 * r)), x1 = Math.min(width, Math.trunc(m.x + 2 * r) + 1);
        const y0 = Math.max(0, Math.trunc(m.y - 2 * r)), y1 = Math.min(height, Math.trunc(m.y + 2 * r) + 1);
        for (let y = y0; y < y1; y++)
            for (let x = x0; x < x1; x++) {
                const blob = Math.exp(-((x - m.x) ** 2 + (y - m.y) ** 2) / (2 * r * r));
                const p = y * width + x;
                if (blob > out[p])
                    out[p] = blob;
            }
    }
    return out;
}
/** Texture Graft (arena/weapons.py texture_graft): lost finest detail back, marks restored. */
export function textureGraft(edited, aligned, width, height, skin, amount, protect) {
    if (!(amount >= 0 && amount <= 1))
        throw new RangeError("amount is 0..1");
    const hfE = highFrequency(rgbFloat(edited, width, height));
    const hfO = highFrequency(rgbFloat(aligned, width, height));
    const n = width * height;
    const out = new Float64Array(n * 3);
    for (let p = 0; p < n; p++) {
        let ee = 0, eo = 0;
        for (let c = 0; c < 3; c++) {
            ee += hfE.data[p * 3 + c] ** 2;
            eo += hfO.data[p * 3 + c] ** 2;
        }
        const lost = clip01(1 - Math.sqrt(ee) / Math.max(Math.sqrt(eo), 1e-6));
        const weight = amount * lost * clip01(skin[p]);
        for (let c = 0; c < 3; c++) {
            const i = p * 3 + c;
            out[i] = edited[i] + weight * (hfO.data[i] - hfE.data[i]);
        }
    }
    if (protect) {
        const clipped = out.map((v) => Math.min(255, Math.max(0, v)));
        const lumaO = luma(aligned, width, height), lumaE = luma(clipped, width, height);
        const meanO = boxMean(lumaO, 3), meanE = boxMean(lumaE, 3);
        for (let p = 0; p < n; p++) {
            const darkO = meanO.data[p] - lumaO.data[p], darkE = meanE.data[p] - lumaE.data[p];
            const missing = Math.max(darkO - darkE, 0) * (clip01(protect[p]) * clip01(skin[p]));
            for (let c = 0; c < 3; c++)
                out[p * 3 + c] -= missing;
        }
    }
    return Uint8Array.from(out, toByte);
}
/** Skin-only box mean: pixels with no skin around them keep their value. */
export function skinMean(rgb, skin, radius) {
    const n = rgb.width * rgb.height;
    const weighted = floatImage(rgb.width, rgb.height, 3, true);
    for (let p = 0; p < n; p++)
        for (let c = 0; c < 3; c++)
            weighted.data[p * 3 + c] = rgb.data[p * 3 + c] * skin.data[p];
    const den = boxMean(skin, radius), num = boxMean(weighted, radius);
    const out = new Float64Array(n * 3);
    for (let p = 0; p < n; p++) {
        const d = den.data[p];
        for (let c = 0; c < 3; c++)
            out[p * 3 + c] = d > 1e-6 ? num.data[p * 3 + c] / d : rgb.data[p * 3 + c];
    }
    return out;
}
/** Texture-preserving smooth of `amount` (0-1) inside the skin; `protect` holds marks. RGB bytes. */
export function polish(rgb, width, height, skin, protect, iod, amount) {
    if (!(amount >= 0 && amount <= 1))
        throw new RangeError("polish amount is 0..1");
    if (amount === 0)
        return Uint8Array.from(rgb);
    const s = planeOf(width, height, Array.from(skin.data, clip01));
    const x = rgbFloat(rgb, width, height);
    const target = skinMean(x, s, blurRadius(iod));
    const smooth = new Uint8Array(rgb.length);
    for (let p = 0; p < width * height; p++) {
        const weight = amount * s.data[p] * (1 - clip01(protect[p]));
        for (let c = 0; c < 3; c++) {
            const i = p * 3 + c;
            smooth[i] = roundHalfEven(Math.min(255, Math.max(0, x.data[i] + weight * (target[i] - x.data[i]))));
        }
    }
    return textureGraft(smooth, rgb, width, height, s.data, 1, Array.from(protect, clip01));
}
/** Where definition applies and how much: the strongest feature weight, irises cut out. */
export function featureMask(f, iod, eyes, brows, lips) {
    const lash = boxMean(f.eyes, Math.max(1, roundHalfEven(iod * LASH_IOD)));
    const out = new Float64Array(f.eyes.width * f.eyes.height);
    for (let p = 0; p < out.length; p++) {
        const m = Math.max(Math.max(eyes * Math.min(1, 2 * lash.data[p]), brows * f.brows.data[p]), lips * f.lips.data[p]);
        out[p] = clip01(m * (1 - clip01(f.irises.data[p])));
    }
    return out;
}
/** Mix the structure op into the photo by `mask * scale` (scale is the slider, 0-1). */
export function define(rgb, width, height, mask, scale) {
    if (scale === 0 || !mask.some((v) => v > 0))
        return Uint8Array.from(rgb);
    const unit = Float64Array.from(rgb, (v) => v / 255);
    const detailed = structure({ width, height, data: unit }, { ...DEFINITION }, wholeFrame(width, height)).data;
    const mixed = new Float64Array(unit.length);
    for (let p = 0; p < width * height; p++) {
        const w = mask[p] * scale;
        for (let c = 0; c < 3; c++) {
            const i = p * 3 + c;
            mixed[i] = unit[i] + w * (detailed[i] - unit[i]);
        }
    }
    return toBytes(mixed);
}
//# sourceMappingURL=polish.js.map