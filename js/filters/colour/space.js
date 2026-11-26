/**
 * Colour spaces for the filter kernels: sRGB, linear light, OKLab/OKLCh and CIELAB, per pixel.
 *
 * Mirrors api/plumb_api/filters/colour/space.py formula for formula and in the same order, so
 * the LUTs agree to rounding (parity/filters-fx1.json). Encoded sRGB values are in [0, 1] and
 * decode clamps first. Greys (r = g = b) map to OKLab a = b = 0 exactly and back, so a look
 * that doesn't tint keeps black and white exactly neutral. Converters write into an `out`
 * triple to avoid allocating in whole-image loops.
 *
 * OKLab: Ottosson (2020), "A perceptual color space for image processing"; concept only, no code copied.
 * Author: John Khan.
 */
import { roundHalfEven } from "../../engines/core/buffer.js";
import { WHITE_D65 } from "../../engines/core/colour.js";
export const LUMA = [0.2126, 0.7152, 0.0722];
/** sRGB 119/255 sits at CIELAB L* 50.0: the guard's mid-grey. */
export const MID_GREY_BYTE = 119;
export const RAD = Math.PI / 180;
export const DEG = 180 / Math.PI;
const D = 6 / 29;
export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export function smoothstep(edge0, edge1, x) {
    if (edge1 === edge0)
        throw new RangeError("smoothstep edges must differ");
    const t = clamp01((x - edge0) / (edge1 - edge0));
    return t * t * (3 - 2 * t);
}
// Speed: V8's ** is a general pow (about 60 ns); exp(log) is about twice as fast and within
// 2e-16 of it, and cubes are plain products. Python uses NumPy's pow; the parity tolerance
// (1e-5 on LUTs) is far above the difference.
export function decode1(v) {
    const c = clamp01(v);
    return c <= 0.04045 ? c / 12.92 : Math.exp(2.4 * Math.log((c + 0.055) / 1.055));
}
export function encode1(v) {
    const c = clamp01(v);
    return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.exp(Math.log(c) / 2.4) - 0.055;
}
const cube = (x) => x * x * x;
export const luminance = (r, g, b) => LUMA[0] * r + LUMA[1] * g + LUMA[2] * b;
/** NumPy's float mod for a positive divisor: the result has the divisor's sign. */
export function mod360(x) {
    const m = x % 360;
    return m !== 0 && m < 0 ? m + 360 : m === 0 ? 0 : m;
}
/** Signed angle difference folded into (-180, 180]. */
export function wrapDegrees(delta) {
    const d = mod360(delta + 180) - 180;
    return d === -180 ? 180 : d;
}
export function linearToOklab(r, g, b, out) {
    if (r === g && g === b) {
        out[0] = Math.cbrt(r);
        out[1] = 0;
        out[2] = 0;
        return out;
    }
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    out[0] = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
    out[1] = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
    out[2] = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
    return out;
}
export function oklabToLinear(L, a, b, out) {
    if (a === 0 && b === 0) {
        const g = cube(L);
        out[0] = g;
        out[1] = g;
        out[2] = g;
        return out;
    }
    const l = cube(L + 0.3963377774 * a + 0.2158037573 * b);
    const m = cube(L - 0.1055613458 * a - 0.0638541728 * b);
    const s = cube(L - 0.0894841775 * a - 1.291485548 * b);
    out[0] = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
    out[1] = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
    out[2] = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
    return out;
}
export function srgbToOklab(r, g, b, out) {
    return linearToOklab(decode1(r), decode1(g), decode1(b), out);
}
/** OKLab to encoded sRGB; out-of-gamut colours clip in linear light. */
export function oklabToSrgb(L, a, b, out) {
    oklabToLinear(L, a, b, out);
    out[0] = encode1(out[0]);
    out[1] = encode1(out[1]);
    out[2] = encode1(out[2]);
    return out;
}
export const chromaOf = (a, b) => Math.hypot(a, b);
export const hueOf = (a, b) => mod360(Math.atan2(b, a) * DEG);
// CIELAB (D65) ------------------------------------------------------------------------
const D3 = D ** 3;
const f = (t) => (t > D3 ? Math.cbrt(t) : t / (3 * D * D) + 4 / 29);
const fInv = (t) => (t > D ? cube(t) : 3 * D * D * (t - 4 / 29));
export function srgbToLab(r, g, b, out) {
    const lr = decode1(r), lg = decode1(g), lb = decode1(b);
    const x = (100 * (0.4124564 * lr + 0.3575761 * lg + 0.1804375 * lb)) / WHITE_D65[0];
    const y = (100 * (0.2126729 * lr + 0.7151522 * lg + 0.072175 * lb)) / WHITE_D65[1];
    const z = (100 * (0.0193339 * lr + 0.119192 * lg + 0.9503041 * lb)) / WHITE_D65[2];
    const fx = f(x), fy = f(y), fz = f(z);
    out[0] = 116 * fy - 16;
    out[1] = 500 * (fx - fy);
    out[2] = 200 * (fy - fz);
    return out;
}
/** CIELAB to encoded sRGB, clipped in linear light. */
export function labToSrgb(L, a, b, out) {
    const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
    const x = (fInv(fx) * WHITE_D65[0]) / 100, y = (fInv(fy) * WHITE_D65[1]) / 100, z = (fInv(fz) * WHITE_D65[2]) / 100;
    out[0] = encode1(3.2404542 * x - 1.5371385 * y - 0.4985314 * z);
    out[1] = encode1(-0.969266 * x + 1.8760108 * y + 0.041556 * z);
    out[2] = encode1(0.0556434 * x - 0.2040259 * y + 1.0572252 * z);
    return out;
}
/** Round half to even, the rule every byte output in this repo uses. */
export const unitToByte = (v) => roundHalfEven(clamp01(v) * 255);
/** CIELAB L* of one byte pixel. */
export function byteLightness(r, g, b, scratch = [0, 0, 0]) {
    return srgbToLab(r / 255, g / 255, b / 255, scratch)[0];
}
//# sourceMappingURL=space.js.map