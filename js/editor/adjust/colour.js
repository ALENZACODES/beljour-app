/** The per-pixel colour pass shared by Adjust (light and colour), the Colour mixer and Curves.
 *
 * This file is the CPU reference; gpu.ts runs the same arithmetic as one WebGL2 fragment
 * shader and must agree with it within one 8-bit level per channel. Keep the two in step:
 * every formula here has a line-for-line twin in COLOUR_SHADER.
 *
 * Values are display-encoded sRGB in [0, 1] unless a name says `lin` (linear light).
 * Order inside the pass (fixed, documented in stack.ts):
 *   Adjust : exposure, shadows, highlights and brilliance as one local gain in linear light
 *            (the local base is an edge-aware blur, so detail rides on top), with a highlight
 *            shoulder instead of a hard clip; white balance gains (brightness held); black and
 *            white point levels; contrast S-curve around mid grey; vibrance (skin protected)
 *            and saturation as one chroma scale around luma, limited so no channel leaves
 *            [0, 1].
 *   Mixer  : per-hue hue, saturation and luminance with smooth weights between the eight hue
 *            centres, gated off for greys; skin-hue protection (on by default) holds skin.
 *   Curves : the master curve, then the red, green and blue curves, from a 1024-entry table.
 * Each tool's layer opacity mixes its result with its input in linear light.
 * Skin weight is read from the pixel entering the pass, so protection follows the photo.
 * Author: John Khan.
 */
import { MIXER_HUES, mixerKey } from "./params.js";
export const LUMA = [0.2126, 0.7152, 0.0722];
/** Highlight shoulder knee (linear light): below it a gain is exact, above it values roll off. */
export const SHOULDER_KNEE = 0.75;
export const CURVE_SIZE = 1024;
export const clamp01 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;
export function smoothstep(e0, e1, x) {
    const t = clamp01((x - e0) / (e1 - e0));
    return t * t * (3 - 2 * t);
}
const linSlow = (c) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
const LIN_BYTES = Float64Array.from({ length: 256 }, (_, i) => linSlow(i / 255));
/** sRGB decode; whole 8-bit levels (the usual input) come from a table of the same formula. */
export const toLin = (c) => {
    const k = c * 255, r = Math.round(k);
    return k === r && r >= 0 && r <= 255 ? LIN_BYTES[r] : linSlow(c);
};
export const toEnc = (l) => l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055;
/** Shadow and highlight weights of a local base brightness (0..1), squared ramps. */
export function shadowWeight(base) { const t = clamp01(1 - base / 0.6); return t * t; }
export function highlightWeight(base) { const t = clamp01((base - 0.4) / 0.6); return t * t; }
/** Highlight roll-off: identity up to the knee, then an exponential approach to 1; `amount`
 * (0..1) mixes it in, so a zero gain is exactly the identity. */
export function shoulder(y, amount) {
    if (y <= SHOULDER_KNEE)
        return y;
    const k = SHOULDER_KNEE, rolled = k + (1 - k) * (1 - Math.exp(-(y - k) / (1 - k)));
    const hard = y < 1 ? y : 1;
    return hard + (rolled - hard) * amount;
}
/** HSV hue in degrees [0, 360), saturation and value of an encoded pixel, written into `out`. */
export function hsvInto(r, g, b, out) {
    const mx = Math.max(r, Math.max(g, b)), mn = Math.min(r, Math.min(g, b)), d = mx - mn;
    if (d <= 0) {
        out[0] = 0;
        out[1] = 0;
        out[2] = mx;
        return;
    }
    let h;
    if (mx === r)
        h = 60 * ((g - b) / d);
    else if (mx === g)
        h = 60 * ((b - r) / d + 2);
    else
        h = 60 * ((r - g) / d + 4);
    if (h < 0)
        h += 360;
    out[0] = h;
    out[1] = mx > 0 ? d / mx : 0;
    out[2] = mx;
}
export function hsv(r, g, b) {
    const out = [0, 0, 0];
    hsvInto(r, g, b, out);
    return out;
}
const HSV = new Float64Array(3), BEFORE = [0, 0, 0];
const fract = (x) => x - Math.floor(x);
/** HSV back to encoded RGB (the branch-free form the shader uses). */
export function fromHsv(h, s, v) {
    const k = h / 360;
    const ch = (offset) => clamp01(Math.abs(fract(k + offset) * 6 - 3) - 1);
    return [v * (1 + (ch(1) - 1) * s), v * (1 + (ch(2 / 3) - 1) * s), v * (1 + (ch(1 / 3) - 1) * s)];
}
/** Skin-tone weight (0..1) of an encoded pixel: an orange-red hue band, moderate saturation
 * (deep brown skin is quite saturated, so the upper edge is high) and not near black.
 * ASSUMED ranges, checked on drawn skin patches from very light to very deep in the tests. */
export function skinWeight(r, g, b) {
    hsvInto(r, g, b, HSV);
    const h = HSV[0], s = HSV[1], v = HSV[2];
    let d = Math.abs(h - 22);
    if (d > 180)
        d = 360 - d;
    const wh = 1 - smoothstep(16, 28, d);
    const ws = smoothstep(0.08, 0.16, s) * (1 - smoothstep(0.78, 0.92, s));
    return wh * ws * smoothstep(0.08, 0.18, v);
}
/** White balance gains in linear light, normalised so mid grey keeps its luminance. */
export function whiteBalance(temperature, tint) {
    const gr = Math.pow(2, 0.35 * temperature + 0.1 * tint), gg = Math.pow(2, -0.25 * tint), gb = Math.pow(2, -0.35 * temperature + 0.1 * tint);
    const norm = LUMA[0] * gr + LUMA[1] * gg + LUMA[2] * gb;
    return [gr / norm, gg / norm, gb / norm];
}
/** Contrast exponent for a -1..1 amount: 1 is neutral. */
export function contrastGamma(amount) { return amount >= 0 ? 1 + amount : 1 / (1 - 0.6 * amount); }
export function sCurve(v, gamma) {
    if (gamma === 1)
        return v;
    return v < 0.5 ? 0.5 * Math.pow(2 * v, gamma) : 1 - 0.5 * Math.pow(2 * (1 - v), gamma);
}
/** Largest chroma scale that keeps every channel in [0, 1] (luma fixed). */
export function gamutLimit(r, g, b, y) {
    let k = 1e6;
    for (const c of [r, g, b]) {
        const d = c - y;
        if (d > 1e-9)
            k = Math.min(k, (1 - y) / d);
        else if (d < -1e-9)
            k = Math.min(k, y / -d);
    }
    return k;
}
/** Scale chroma around luma by k, never past the gamut edge. */
export function scaleChroma(px, k) {
    const y = LUMA[0] * px[0] + LUMA[1] * px[1] + LUMA[2] * px[2];
    const limit = gamutLimit(px[0], px[1], px[2], y);
    const use = k > limit ? limit : k;
    for (let c = 0; c < 3; c++)
        px[c] = clamp01(y + (px[c] - y) * use);
}
/** Mix `after` into `before` by `amount` in linear light (in place on `after`). */
export function mixLinear(before, after, amount) {
    if (amount >= 1)
        return;
    for (let c = 0; c < 3; c++)
        after[c] = toEnc(toLin(before[c]) + (toLin(after[c]) - toLin(before[c])) * amount);
}
/** Mixer weights of the eight hue centres at hue h: two neighbours share it with a smooth step. */
export const HUE_CENTRES = MIXER_HUES.map((h) => h.centre);
export function hueWeights(h, out) {
    out.fill(0);
    const n = HUE_CENTRES.length;
    for (let i = 0; i < n; i++) {
        const a = HUE_CENTRES[i], b = i + 1 < n ? HUE_CENTRES[i + 1] : HUE_CENTRES[0] + 360;
        const hh = h < a ? h + 360 : h;
        if (hh >= a && hh < b) {
            const t = (hh - a) / (b - a), st = t * t * (3 - 2 * t);
            out[i] = 1 - st;
            out[(i + 1) % n] = st;
            return out;
        }
    }
    out[0] = 1;
    return out;
}
/** One pixel through the pass. `px` is changed in place; `scratch` is 8 floats. */
export function colourPixel(px, base, u, scratch) {
    const r0 = px[0], g0 = px[1], b0 = px[2];
    // Skin weight is only needed by vibrance and the protected mixer.
    const skin = (u.adjust && u.adjust.vibrance !== 0) || (u.mixer && u.mixer.skinProtect) ? skinWeight(r0, g0, b0) : 0;
    const before = BEFORE;
    if (u.adjust) {
        const a = u.adjust;
        before[0] = px[0];
        before[1] = px[1];
        before[2] = px[2];
        const sw = shadowWeight(base), hw = highlightWeight(base);
        const stops = a.exposure + 1.2 * a.shadows * sw + a.highlights * hw + a.brilliance * (0.8 * sw - 0.6 * hw);
        const gain = Math.pow(2, stops), roll = clamp01(stops);
        for (let c = 0; c < 3; c++)
            px[c] = toEnc(clamp01(shoulder(toLin(px[c]) * gain, roll) * a.wb[c]));
        const inB = 0.12 * Math.max(0, a.black), outB = 0.12 * Math.max(0, -a.black);
        const inW = 1 - 0.12 * Math.max(0, a.white), outW = 1 - 0.12 * Math.max(0, -a.white);
        const gamma = contrastGamma(a.contrast);
        for (let c = 0; c < 3; c++) {
            const level = outB + (outW - outB) * clamp01((px[c] - inB) / (inW - inB));
            px[c] = sCurve(level, gamma);
        }
        const mx = Math.max(px[0], Math.max(px[1], px[2])), mn = Math.min(px[0], Math.min(px[1], px[2]));
        const sat = mx > 1e-6 ? (mx - mn) / mx : 0;
        const k = (1 + a.vibrance * (1 - sat) * (1 - 0.85 * skin)) * (1 + a.saturation);
        if (k !== 1)
            scaleChroma(px, k);
        mixLinear(before, px, a.opacity);
    }
    if (u.mixer) {
        const m = u.mixer;
        before[0] = px[0];
        before[1] = px[1];
        before[2] = px[2];
        hsvInto(px[0], px[1], px[2], HSV);
        const h = HSV[0], s = HSV[1], v = HSV[2];
        const gate = smoothstep(0.03, 0.15, s) * smoothstep(0.03, 0.12, v) * (m.skinProtect ? 1 - 0.95 * skin : 1);
        const w = hueWeights(h, scratch);
        let dh = 0, ds = 0, dl = 0;
        for (let i = 0; i < 8; i++) {
            dh += w[i] * m.hue[i];
            ds += w[i] * m.sat[i];
            dl += w[i] * m.lum[i];
        }
        dh *= gate * 30;
        ds *= gate;
        dl *= gate * 0.9;
        if (dh !== 0 || ds !== 0 || dl !== 0) {
            let hh = h + dh;
            if (hh < 0)
                hh += 360;
            else if (hh >= 360)
                hh -= 360;
            const rgb = fromHsv(hh, clamp01(s * (1 + ds)), v);
            const gain = Math.pow(2, dl), roll = clamp01(dl);
            for (let c = 0; c < 3; c++)
                px[c] = toEnc(clamp01(shoulder(toLin(rgb[c]) * gain, roll)));
            mixLinear(before, px, m.opacity);
        }
    }
    if (u.curves) {
        const t = u.curves.table;
        before[0] = px[0];
        before[1] = px[1];
        before[2] = px[2];
        for (let c = 0; c < 3; c++) {
            const x = clamp01(px[c]) * (CURVE_SIZE - 1), i0 = Math.floor(x), i1 = i0 + 1 < CURVE_SIZE ? i0 + 1 : i0, f = x - i0;
            px[c] = t[i0 * 3 + c] + (t[i1 * 3 + c] - t[i0 * 3 + c]) * f;
        }
        mixLinear(before, px, u.curves.opacity);
    }
}
/** Mixer uniforms from layer values (-100..100 each). */
export function mixerUniforms(values, opacity, skinProtect) {
    const pick = (ch) => Float64Array.from(MIXER_HUES, (h) => (values[mixerKey(h.id, ch)] ?? 0) / 100);
    return { opacity, skinProtect, hue: pick("h"), sat: pick("s"), lum: pick("l") };
}
export function mixerIsNeutral(values) {
    return Object.values(values).every((v) => v === 0);
}
/** Run the colour pass on an interleaved encoded RGB float image (in place). `base` is the
 * local brightness sampler (only needed when shadows, highlights or brilliance are set). */
export function colourPass(data, width, height, u, base) {
    if (!u.adjust && !u.mixer && !u.curves)
        return;
    const px = [0, 0, 0], scratch = new Float64Array(8);
    const needBase = u.adjust !== null && (u.adjust.shadows !== 0 || u.adjust.highlights !== 0 || u.adjust.brilliance !== 0);
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 3;
            px[0] = data[i];
            px[1] = data[i + 1];
            px[2] = data[i + 2];
            colourPixel(px, needBase && base ? base(x, y) : 0.5, u, scratch);
            data[i] = px[0];
            data[i + 1] = px[1];
            data[i + 2] = px[2];
        }
}
//# sourceMappingURL=colour.js.map