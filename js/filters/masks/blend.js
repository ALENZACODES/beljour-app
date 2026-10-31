import { regionMask } from "../../data/regions/index.js";
import { fullSkinMask } from "../../engines/beauty/face-regions.js";
import { decode1, encode1, unitToByte } from "../colour/space.js";
export const NO_MASKS = { skin: null, person: null, source: "none", note: "" };
export const LANDMARK_NOTE = "Background only keeps the face as you see it; hair and body take the look (no person outline yet).";
/** Validate external segmentation before any synchronous render, including
 * strength zero. Without this check a malformed skin outline could silently
 * suppress hue protection or read outside its own buffer. */
export function validateFilterMasks(masks, width, height) {
    const check = (mask) => {
        if (!mask)
            return;
        if (mask.width !== width || mask.height !== height || mask.channels !== 1 ||
            mask.data.length !== width * height) {
            throw new RangeError("filter mask dimensions must match the source photo");
        }
        for (const alpha of mask.data) {
            if (!(alpha >= 0 && alpha <= 1)) {
                throw new RangeError("filter mask alpha must be finite between 0 and 1");
            }
        }
    };
    check(masks.skin);
    check(masks.person);
}
/** Skin from the mesh's skin region; the face oval stands in for the person (face only). */
export function fromLandmarks(points, width, height, image) {
    // With the photo: her skin up to the hairline (engines/beauty/face-regions.ts), so the guard
    // has no edge across the forehead where the mesh's skin region stops. Without it: the mesh region.
    let skin = regionMask("skin", points, width, height, { normalized: false, supersample: 2 });
    if (image && image.width === width && image.height === height) {
        try {
            skin = { width, height, channels: 1, data: fullSkinMask(image, points) };
        }
        catch (error) {
            if (!(error instanceof RangeError))
                throw error;
        }
    }
    const oval = regionMask("face_oval", points, width, height, { normalized: false, supersample: 2 });
    return { skin, person: oval, source: "landmarks", note: LANDMARK_NOTE };
}
/** A segmenter's person mask alone: no skin class yet, so the guard can't run (fallback). */
export function fromPerson(person) {
    return { skin: null, person, source: "segmenter", note: "" };
}
/** Twice the mask alpha, capped at 1 (as the guard): a pixel at least half inside is kept whole. */
export function keepMask(masks, protectSkin, backgroundOnly, pixels) {
    let keep = null;
    const doubled = (m) => Float64Array.from(m.data, (a) => Math.min(1, 2 * a));
    if (protectSkin && masks.skin)
        keep = doubled(masks.skin);
    if (backgroundOnly && masks.person) {
        const person = doubled(masks.person);
        if (!keep)
            keep = person;
        else
            for (let p = 0; p < pixels; p++)
                keep[p] = Math.max(keep[p], person[p]);
    }
    return keep;
}
/** The look where keep = 0, the original where keep = 1, mixed in linear light between. */
export function keepOriginal(original, look, keep) {
    const out = Uint8Array.from(look);
    if (!keep)
        return out;
    for (let p = 0; p < keep.length; p++) {
        const k = keep[p];
        if (!(k > 0)) {
            continue;
        }
        const i = p * 3;
        if (k === 1) {
            out[i] = original[i];
            out[i + 1] = original[i + 1];
            out[i + 2] = original[i + 2];
            continue;
        }
        for (let c = 0; c < 3; c++) {
            const lo = decode1(original[i + c] / 255), ll = decode1(look[i + c] / 255);
            out[i + c] = unitToByte(encode1(ll + (lo - ll) * k));
        }
    }
    return out;
}
/** Mean of the face-oval mask (pixel centres): the point the face-aware centre light follows. */
export function maskCentre(mask) {
    let w = 0, sx = 0, sy = 0;
    for (let y = 0; y < mask.height; y++)
        for (let x = 0; x < mask.width; x++) {
            const a = mask.data[y * mask.width + x];
            if (a > 0) {
                w += a;
                sx += a * x;
                sy += a * y;
            }
        }
    return w > 0 ? [sx / w + 0.5, sy / w + 0.5] : null;
}
