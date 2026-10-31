/**
 * E04 compositing helpers shared by local engines, mirroring api/plumb_api/engines/core/composite.py:
 * exposure in stops (linear light), a solid colour laid through a mask, and the mask of pixels
 * two images disagree on. RGBA inputs keep their alpha.
 *
 * Author: John Khan.
 */
import { byteImage, decode, encode, requireColour, requireMask, requireSameSize, withAlphaOf } from "./buffer.js";
import { alphaBlend } from "./blend.js";
import { emptyMask } from "./mask.js";
/** Brighten or darken by `stops` (powers of two in linear light), through an optional mask. */
export function exposure(img, stops, mask = null) {
    if (!Number.isFinite(stops) || Math.abs(stops) > 8)
        throw new RangeError("exposure must be finite and within +/-8 stops");
    requireColour(img);
    const lin = decode(img);
    const gain = 2 ** stops;
    for (let i = 0; i < lin.data.length; i++)
        lin.data[i] = lin.data[i] * gain;
    const target = withAlphaOf(encode(lin), img);
    return mask === null ? target : alphaBlend(img, target, mask);
}
/** Lay `colour` over the image through `mask`, scaled by `strength` in [0, 1]. */
export function solid(img, colour, mask, strength = 1) {
    if (!(strength >= 0 && strength <= 1) || colour.length !== 3 || !colour.every((c) => c >= 0 && c <= 255)) {
        throw new RangeError("invalid colour or strength");
    }
    requireColour(img);
    requireMask(mask, img.width, img.height);
    const overlay = byteImage(img.width, img.height, img.channels);
    overlay.data.set(img.data);
    for (let i = 0; i < img.width * img.height; i++)
        for (let c = 0; c < 3; c++)
            overlay.data[i * img.channels + c] = colour[c];
    const scaled = emptyMask(img.width, img.height);
    for (let i = 0; i < scaled.data.length; i++)
        scaled.data[i] = mask.data[i] * strength;
    return alphaBlend(img, overlay, scaled);
}
/** 1 where any channel differs by more than `tolerance` (0..255), else 0. */
export function differenceMask(before, after, tolerance = 0) {
    requireColour(before);
    requireColour(after);
    requireSameSize(before, after);
    if (before.channels !== after.channels || !(tolerance >= 0 && tolerance <= 255))
        throw new RangeError("incompatible images or invalid tolerance");
    const out = emptyMask(before.width, before.height), ch = before.channels;
    for (let i = 0; i < out.data.length; i++) {
        let m = 0;
        for (let c = 0; c < ch; c++)
            m = Math.max(m, Math.abs(before.data[i * ch + c] - after.data[i * ch + c]));
        out.data[i] = m > tolerance ? 1 : 0;
    }
    return out;
}
