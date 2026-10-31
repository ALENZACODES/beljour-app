/** Geometric cheek patch audit for W6; mirrors shade/reading.py.
 * No skin-pixel colour threshold. Mixed lighting refuses before any cosmetic
 * recommendation; these are estimates, not skin diagnoses. Author: John Khan.
 */
import { ciede2000 } from "../core/colour.js";
import { decode, linearToXyz, xyzToLab } from "./colourspace.js";
export function centralPatchMask(mask, width, height, minimum) {
    if (mask.length !== width * height || width < 1 || height < 1)
        throw RangeError("Patch geometry differs from photo.");
    const inside = new Uint8Array(mask.length);
    let kept = 0;
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
            const i = y * width + x;
            if (mask[i] < 0.5 || (x > 0 && mask[i - 1] < 0.5) ||
                (x + 1 < width && mask[i + 1] < 0.5) || (y > 0 && mask[i - width] < 0.5) ||
                (y + 1 < height && mask[i + width] < 0.5))
                continue;
            inside[i] = 1;
            kept++;
        }
    if (kept >= minimum)
        return inside;
    for (let i = 0; i < mask.length; i++)
        inside[i] = mask[i] >= 0.5 ? 1 : 0;
    return inside;
}
export function patchPixels(image, mask, minimum) {
    const inner = centralPatchMask(mask, image.width, image.height, minimum);
    const all = [];
    const notClipped = [];
    for (let i = 0; i < inner.length; i++) {
        if (!inner[i])
            continue;
        const rgb = [image.data[i * image.channels], image.data[i * image.channels + 1],
            image.data[i * image.channels + 2]];
        all.push(rgb);
        if (Math.min(...rgb) > 4 && Math.max(...rgb) < 251)
            notClipped.push(rgb);
    }
    return notClipped.length >= minimum ? notClipped : all;
}
function median(values) {
    const sorted = values.slice().sort((a, b) => a - b);
    const i = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[i] : (sorted[i - 1] + sorted[i]) / 2;
}
function labMedian(pixels, gains) {
    const labs = pixels.map((rgb) => xyzToLab(linearToXyz([
        Math.min(1, decode(rgb[0]) * gains[0]),
        Math.min(1, decode(rgb[1]) * gains[1]),
        Math.min(1, decode(rgb[2]) * gains[2]),
    ])));
    return [median(labs.map((l) => l[0])), median(labs.map((l) => l[1])), median(labs.map((l) => l[2]))];
}
export function auditPatches(image, masks, gains, whiteMode, minimum, cheekLimit) {
    if (![3, 4].includes(image.channels) || image.data.length !== image.width * image.height * image.channels) {
        throw RangeError("Patch image must be RGB or RGBA.");
    }
    if (!Number.isInteger(minimum) || minimum < 1 || minimum > 100000 ||
        !(cheekLimit > 0 && cheekLimit <= 100))
        throw RangeError("Invalid patch audit limits.");
    const samples = {};
    for (const name of ["cheek_right", "cheek_left", "forehead"]) {
        samples[name] = patchPixels(image, masks[name], minimum);
    }
    const sizes = Object.fromEntries(Object.entries(samples).map(([name, pixels]) => [name, pixels.length]));
    let reason = null;
    let distance = null;
    if (Math.min(samples.cheek_right.length, samples.cheek_left.length) < minimum) {
        reason = "insufficient_cheek_patches";
    }
    else {
        distance = ciede2000(labMedian(samples.cheek_right, gains), labMedian(samples.cheek_left, gains));
        if (distance > cheekLimit)
            reason = "mixed_lighting";
    }
    const note = reason === "insufficient_cheek_patches"
        ? "Not enough visible cheek pixels; no shade is suggested."
        : reason === "mixed_lighting" ? "The cheeks have incompatible lighting; retake in even daylight."
            : whiteMode === "neutral" ? "Neutral reference correction applied."
                : whiteMode === "grey_world" ? "Background correction is an estimate, not a neutral reference."
                    : "No neutral reference was available; colour is uncorrected.";
    return { samples, audit: { usable: reason === null, reason, cheek_distance: distance,
            zone_sizes: sizes, white_mode: whiteMode, note } };
}
