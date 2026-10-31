/**
 * E04 blending: W3C Compositing Level 1 blend modes, alpha blending in linear light,
 * and multiband (Laplacian pyramid) blending. Mirrors api/plumb_api/engines/core/
 * {blending,composite}.py.
 *
 * `color` keeps the base's luminance and takes hue and chroma from the top layer,
 * which is the mode recolouring tools use. Multiband blending always works in linear light.
 * Author: John Khan.
 */
import { byteImage, decode, encode, floatImage, requireColour, requireMask, requireSameSize, roundHalfEven, toByte, toUnit, withAlphaOf, } from "./buffer.js";
import { collapse, gaussian, laplacian, maxLevels } from "./pyramid.js";
export const SEPARABLE = ["normal", "multiply", "screen", "overlay", "darken", "lighten", "color-dodge",
    "color-burn", "hard-light", "soft-light", "difference", "exclusion"];
export const NON_SEPARABLE = ["hue", "saturation", "color", "luminosity"];
export const MODES = [...SEPARABLE, ...NON_SEPARABLE];
function hardLight(cb, cs) {
    return cs <= 0.5 ? cb * (2 * cs) : cb + (2 * cs - 1) - cb * (2 * cs - 1);
}
function softLight(cb, cs) {
    const d = cb <= 0.25 ? ((16 * cb - 12) * cb + 4) * cb : Math.sqrt(cb);
    return cs <= 0.5 ? cb - (1 - 2 * cs) * cb * (1 - cb) : cb + (2 * cs - 1) * (d - cb);
}
function separable(mode, cb, cs) {
    switch (mode) {
        case "normal": return cs;
        case "multiply": return cb * cs;
        case "screen": return cb + cs - cb * cs;
        case "overlay": return hardLight(cs, cb);
        case "darken": return Math.min(cb, cs);
        case "lighten": return Math.max(cb, cs);
        case "color-dodge": return cb === 0 ? 0 : cs === 1 ? 1 : Math.min(1, cb / (1 - cs));
        case "color-burn": return cb === 1 ? 1 : cs === 0 ? 0 : 1 - Math.min(1, (1 - cb) / cs);
        case "hard-light": return hardLight(cb, cs);
        case "soft-light": return softLight(cb, cs);
        case "difference": return Math.abs(cb - cs);
        case "exclusion": return cb + cs - 2 * cb * cs;
        default: throw new RangeError(`not a separable mode: ${mode}`);
    }
}
export const lum = (c) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
export function clipColour(c) {
    const l = lum(c), n = Math.min(...c), x = Math.max(...c);
    let out = c;
    if (n < 0)
        out = out.map((v) => l + ((v - l) * l) / (l - n));
    if (x > 1)
        out = out.map((v) => l + ((v - l) * (1 - l)) / (x - l));
    return out;
}
export function setLum(c, l) {
    const d = l - lum(c);
    return clipColour([c[0] + d, c[1] + d, c[2] + d]);
}
export const sat = (c) => Math.max(...c) - Math.min(...c);
export function setSat(c, s) {
    const low = Math.min(...c), span = Math.max(...c) - low;
    return span > 0 ? c.map((v) => ((v - low) * s) / span) : [0, 0, 0];
}
/** B(cb, cs) for one pixel in [0, 1]. */
export function modePixel(mode, cb, cs) {
    switch (mode) {
        case "hue": return setLum(setSat(cs, sat(cb)), lum(cb));
        case "saturation": return setLum(setSat(cb, sat(cs)), lum(cb));
        case "color": return setLum(cs, lum(cb));
        case "luminosity": return setLum(cb, lum(cs));
        default:
            if (!MODES.includes(mode))
                throw new RangeError(`unknown blend mode ${mode}`);
            return [separable(mode, cb[0], cs[0]), separable(mode, cb[1], cs[1]), separable(mode, cb[2], cs[2])];
    }
}
/** Per-pixel B(cb, cs) over two 3-channel float images. */
export function modeFloat(cb, cs, mode) {
    if (cb.channels !== 3 || cs.channels !== 3)
        throw new RangeError("blend modes work on RGB");
    requireSameSize(cb, cs);
    const out = floatImage(cb.width, cb.height, 3, true);
    for (let p = 0; p < out.data.length; p += 3) {
        const r = modePixel(mode, [cb.data[p], cb.data[p + 1], cb.data[p + 2]], [cs.data[p], cs.data[p + 1], cs.data[p + 2]]);
        out.data[p] = r[0];
        out.data[p + 1] = r[1];
        out.data[p + 2] = r[2];
    }
    return out;
}
/** (1 - alpha) * cb + alpha * B(cb, cs), with alpha per pixel. */
export function compositeFloat(cb, cs, mode, alpha) {
    const blended = modeFloat(cb, cs, mode);
    const out = floatImage(cb.width, cb.height, 3, true);
    for (let i = 0; i < cb.width * cb.height; i++) {
        const a = alpha(i);
        for (let c = 0; c < 3; c++)
            out.data[i * 3 + c] = cb.data[i * 3 + c] * (1 - a) + blended.data[i * 3 + c] * a;
    }
    return out;
}
/** Blend two same-size byte images; the top's alpha and the mask scale the opacity. */
export function applyMode(base, top, mode, options = {}) {
    requireColour(base);
    requireColour(top);
    requireSameSize(base, top);
    const opacity = options.opacity ?? 1, space = options.space ?? "srgb", mask = options.mask ?? null;
    if (!(opacity >= 0 && opacity <= 1))
        throw new RangeError("opacity must be in [0, 1]");
    if (space !== "srgb" && space !== "linear")
        throw new RangeError("space must be srgb or linear");
    if (mask)
        requireMask(mask, base.width, base.height);
    const weight = (i) => (mask ? mask.data[i] * opacity : opacity) * (top.channels === 4 ? top.data[i * 4 + 3] / 255 : 1);
    let rgb;
    if (space === "linear") {
        const mixed = compositeFloat(decode(base), decode(top), mode, weight);
        for (let i = 0; i < mixed.data.length; i++)
            mixed.data[i] = Math.min(1, Math.max(0, mixed.data[i]));
        rgb = encode(mixed);
    }
    else {
        const mixed = compositeFloat(toUnit(base), toUnit(top), mode, weight);
        rgb = byteImage(base.width, base.height, 3);
        for (let i = 0; i < mixed.data.length; i++)
            rgb.data[i] = toByte(mixed.data[i]);
    }
    return withAlphaOf(rgb, base);
}
/** Weighted blend of overlay onto base (in linear light by default); alpha channels mix plainly. */
export function alphaBlend(base, overlay, mask, linearLight = true) {
    requireColour(base);
    requireColour(overlay);
    if (base.channels !== overlay.channels)
        throw new RangeError("base and overlay dimensions must match");
    requireSameSize(base, overlay);
    requireMask(mask, base.width, base.height);
    const n = base.width * base.height;
    let rgb;
    if (linearLight) {
        const a = decode(base), b = decode(overlay);
        const mixed = floatImage(base.width, base.height, 3, true);
        for (let i = 0; i < n; i++) {
            const t = mask.data[i];
            for (let c = 0; c < 3; c++)
                mixed.data[i * 3 + c] = a.data[i * 3 + c] * (1 - t) + b.data[i * 3 + c] * t;
        }
        rgb = encode(mixed);
    }
    else {
        rgb = byteImage(base.width, base.height, 3);
        for (let i = 0; i < n; i++) {
            const t = mask.data[i];
            for (let c = 0; c < 3; c++) {
                rgb.data[i * 3 + c] = roundHalfEven(base.data[i * base.channels + c] * (1 - t) + overlay.data[i * base.channels + c] * t);
            }
        }
    }
    return withAlphaOf(rgb, base, (i) => roundHalfEven(base.data[i * 4 + 3] * (1 - mask.data[i]) + overlay.data[i * 4 + 3] * mask.data[i]));
}
/** Band-by-band blend of float images: `a` where mask = 0, `b` where mask = 1. */
export function multibandFloat(a, b, mask, levels) {
    requireSameSize(a, b);
    if (a.channels !== b.channels)
        throw new RangeError("images must have the same channels");
    requireMask(mask, a.width, a.height);
    const weights = gaussian(mask, levels), bandsA = laplacian(a, levels), bandsB = laplacian(b, levels);
    const mixed = bandsA.map((la, k) => {
        const lb = bandsB[k], w = weights[k];
        const out = floatImage(la.width, la.height, la.channels, true);
        for (let i = 0; i < la.width * la.height; i++) {
            const t = w.data[i];
            for (let c = 0; c < la.channels; c++) {
                const j = i * la.channels + c;
                out.data[j] = la.data[j] * (1 - t) + lb.data[j] * t;
            }
        }
        return out;
    });
    return collapse(mixed);
}
/** Multiband blend of two byte images in linear light; levels default to the image's maximum. */
export function multibandBlend(base, overlay, mask, levels) {
    requireColour(base);
    requireColour(overlay);
    requireSameSize(base, overlay);
    if (base.channels !== overlay.channels)
        throw new RangeError("base and overlay dimensions must match");
    const n = levels ?? maxLevels(base.width, base.height);
    const mixed = multibandFloat(decode(base), decode(overlay), mask, n);
    for (let i = 0; i < mixed.data.length; i++)
        mixed.data[i] = Math.min(1, Math.max(0, mixed.data[i]));
    return withAlphaOf(encode(mixed), base, (i) => roundHalfEven(base.data[i * 4 + 3] * (1 - mask.data[i]) + overlay.data[i * 4 + 3] * mask.data[i]));
}
