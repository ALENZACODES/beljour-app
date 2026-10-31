/**
 * E04 colour: sRGB (D65), CIE XYZ, CIELAB, CIEDE2000 and OKLab.
 *
 * Same constants and formulas as api/plumb_api/engines/core/colour.py, including the
 * exact CIE breakpoints (6/29), so the two agree to floating-point rounding.
 * CIEDE2000 follows Sharma, Wu and Dalal (2005); OKLab follows Ottosson (2020).
 *
 * Author: John Khan.
 */
import { decodeChannel, encodeChannel } from "./buffer.js";
export const WHITE_D65 = [95.047, 100.0, 108.883];
const D = 6 / 29;
function triplet(values) {
    if (values.length !== 3)
        throw new RangeError("expected three colour coordinates");
    const out = [Number(values[0]), Number(values[1]), Number(values[2])];
    if (!out.every(Number.isFinite))
        throw new RangeError("expected three finite colour coordinates");
    return out;
}
export function hexToRgb(hex) {
    const value = hex.startsWith("#") ? hex.slice(1) : hex;
    if (!/^[0-9a-fA-F]{6}$/.test(value))
        throw new RangeError("expected six hexadecimal digits");
    return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16)];
}
export function rgbToHex(rgb) {
    return "#" + triplet(rgb).map((v) => Math.min(255, Math.max(0, Math.round(v))).toString(16).padStart(2, "0").toUpperCase()).join("");
}
export function srgbDecode(channel) {
    if (!Number.isFinite(channel) || channel < 0 || channel > 1)
        throw new RangeError("sRGB channel must lie in [0, 1]");
    return decodeChannel(channel);
}
export function srgbEncode(channel) {
    if (!Number.isFinite(channel))
        throw new RangeError("linear RGB channel must be finite");
    return encodeChannel(channel);
}
export function rgbToXyz(rgb) {
    const [r, g, b] = triplet(rgb).map((v) => srgbDecode(v / 255));
    return [
        100 * (0.4124564 * r + 0.3575761 * g + 0.1804375 * b),
        100 * (0.2126729 * r + 0.7151522 * g + 0.072175 * b),
        100 * (0.0193339 * r + 0.119192 * g + 0.9503041 * b),
    ];
}
export function xyzToRgb(xyz, clip = false) {
    const [x, y, z] = triplet(xyz).map((v) => v / 100);
    const lin = [
        3.2404542 * x - 1.5371385 * y - 0.4985314 * z,
        -0.969266 * x + 1.8760108 * y + 0.041556 * z,
        0.0556434 * x - 0.2040259 * y + 1.0572252 * z,
    ];
    const out = lin.map((v) => srgbEncode(v) * 255);
    return clip ? out.map((v) => Math.min(255, Math.max(0, v))) : out;
}
function labF(t) {
    return t > D ** 3 ? Math.cbrt(t) : t / (3 * D * D) + 4 / 29;
}
function labInv(t) {
    return t > D ? t ** 3 : 3 * D * D * (t - 4 / 29);
}
export function xyzToLab(xyz) {
    const v = triplet(xyz);
    const fx = labF(v[0] / WHITE_D65[0]), fy = labF(v[1] / WHITE_D65[1]), fz = labF(v[2] / WHITE_D65[2]);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
export function labToXyz(lab) {
    const [L, a, b] = triplet(lab);
    const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
    return [labInv(fx) * WHITE_D65[0], labInv(fy) * WHITE_D65[1], labInv(fz) * WHITE_D65[2]];
}
export const rgbToLab = (rgb) => xyzToLab(rgbToXyz(rgb));
export const labToRgb = (lab) => xyzToRgb(labToXyz(lab));
export const hexToLab = (hex) => rgbToLab(hexToRgb(hex));
const RAD = Math.PI / 180;
function degrees(x) {
    const d = (x * 180) / Math.PI;
    return ((d % 360) + 360) % 360;
}
/** Delta E 2000. kL, kC, kH are positive parametric factors (1 for graphic arts). */
export function ciede2000(lab1, lab2, kL = 1, kC = 1, kH = 1) {
    if (![kL, kC, kH].every((k) => Number.isFinite(k) && k > 0))
        throw new RangeError("parametric factors must be positive");
    const [L1, a1, b1] = triplet(lab1);
    const [L2, a2, b2] = triplet(lab2);
    const c1 = Math.hypot(a1, b1), c2 = Math.hypot(a2, b2);
    const meanC = (c1 + c2) / 2;
    const g = 0.5 * (1 - Math.sqrt(meanC ** 7 / (meanC ** 7 + 25 ** 7)));
    const ap1 = (1 + g) * a1, ap2 = (1 + g) * a2;
    const cp1 = Math.hypot(ap1, b1), cp2 = Math.hypot(ap2, b2);
    const h1 = degrees(Math.atan2(b1, ap1)), h2 = degrees(Math.atan2(b2, ap2));
    const dl = L2 - L1, dc = cp2 - cp1;
    let dh = h2 - h1;
    if (cp1 * cp2 === 0)
        dh = 0;
    else if (dh > 180)
        dh -= 360;
    else if (dh < -180)
        dh += 360;
    const dH = 2 * Math.sqrt(cp1 * cp2) * Math.sin((dh / 2) * RAD);
    const lmean = (L1 + L2) / 2, cmean = (cp1 + cp2) / 2;
    let hmean;
    if (cp1 * cp2 === 0)
        hmean = h1 + h2;
    else if (Math.abs(h1 - h2) <= 180)
        hmean = (h1 + h2) / 2;
    else if (h1 + h2 < 360)
        hmean = (h1 + h2 + 360) / 2;
    else
        hmean = (h1 + h2 - 360) / 2;
    const t = 1 - 0.17 * Math.cos((hmean - 30) * RAD) + 0.24 * Math.cos(2 * hmean * RAD)
        + 0.32 * Math.cos((3 * hmean + 6) * RAD) - 0.2 * Math.cos((4 * hmean - 63) * RAD);
    const theta = 30 * Math.exp(-(((hmean - 275) / 25) ** 2));
    const rc = 2 * Math.sqrt(cmean ** 7 / (cmean ** 7 + 25 ** 7));
    const sl = 1 + (0.015 * (lmean - 50) ** 2) / Math.sqrt(20 + (lmean - 50) ** 2);
    const sc = 1 + 0.045 * cmean;
    const sh = 1 + 0.015 * cmean * t;
    const rt = -Math.sin(2 * theta * RAD) * rc;
    const l = dl / (kL * sl), c = dc / (kC * sc), hh = dH / (kH * sh);
    return Math.sqrt(Math.max(0, l * l + c * c + hh * hh + rt * c * hh));
}
// OKLab ------------------------------------------------------------------------
export function linearToOklab(rgb) {
    const [r, g, b] = triplet(rgb);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [
        0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
        1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
        0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    ];
}
export function oklabToLinear(lab) {
    const [L, a, b] = triplet(lab);
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    return [
        4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ];
}
export function rgbToOklab(rgb) {
    return linearToOklab(triplet(rgb).map((v) => srgbDecode(v / 255)));
}
/** OKLab to 8-bit sRGB floats, not clipped. */
export function oklabToRgb(lab) {
    return oklabToLinear(lab).map((v) => srgbEncode(v) * 255);
}
/** The colour t of the way from rgb1 to rgb2, mixed in OKLab and clipped to 0..255. */
export function mixOklab(rgb1, rgb2, t) {
    if (!Number.isFinite(t) || t < 0 || t > 1)
        throw new RangeError("t must be in [0, 1]");
    const a = rgbToOklab(rgb1), b = rgbToOklab(rgb2);
    const mixed = a.map((x, i) => x + (b[i] - x) * t);
    return oklabToRgb(mixed).map((v) => Math.min(255, Math.max(0, v)));
}
/** CIELAB of one 8-bit pixel without validation, for whole-image loops (values clipped). */
export function pixelLab(r, g, b, out = [0, 0, 0]) {
    const lr = decodeChannel(Math.min(Math.max(r / 255, 0), 1));
    const lg = decodeChannel(Math.min(Math.max(g / 255, 0), 1));
    const lb = decodeChannel(Math.min(Math.max(b / 255, 0), 1));
    const x = (100 * (0.4124564 * lr + 0.3575761 * lg + 0.1804375 * lb)) / WHITE_D65[0];
    const y = (100 * (0.2126729 * lr + 0.7151522 * lg + 0.072175 * lb)) / WHITE_D65[1];
    const z = (100 * (0.0193339 * lr + 0.119192 * lg + 0.9503041 * lb)) / WHITE_D65[2];
    const fx = labF(x), fy = labF(y), fz = labF(z);
    out[0] = 116 * fy - 16;
    out[1] = 500 * (fx - fy);
    out[2] = 200 * (fy - fz);
    return out;
}
// Cylindrical forms -----------------------------------------------------------------
// LCh of CIELAB or OKLab: lightness, chroma, hue angle in degrees [0, 360).
export function labToLch(lab) {
    const [L, a, b] = triplet(lab);
    return [L, Math.hypot(a, b), a || b ? degrees(Math.atan2(b, a)) : 0];
}
export function lchToLab(lch) {
    const [L, c, h] = triplet(lch);
    if (c < 0)
        throw new RangeError("chroma must not be negative");
    return [L, c * Math.cos(h * RAD), c * Math.sin(h * RAD)];
}
/** Turn an 8-bit sRGB colour's OKLCh hue by `turn` degrees; out-of-gamut results are clipped. */
export function rotateHue(rgb, turn) {
    const [L, c, h] = labToLch(rgbToOklab(rgb));
    const hue = (((h + turn) % 360) + 360) % 360;
    return oklabToRgb(lchToLab([L, c, hue])).map((v) => Math.min(255, Math.max(0, v)));
}
