/** Validated mask-only pixel operations for original local looks. Author: John Khan. */
import { labToSrgb, srgbToLab, toByte } from "../shade/colourspace.js";
export function validate(image, mask, strength) {
    if (!Number.isInteger(image.width) || !Number.isInteger(image.height) || Math.min(image.width, image.height) < 8 || image.channels !== 3 || image.data.length !== image.width * image.height * 3) {
        throw new RangeError("local effect requires RGB input at least 8 by 8");
    }
    if (mask.length !== image.width * image.height)
        throw new RangeError("mask dimensions differ from input");
    if (!Number.isFinite(strength) || strength < 0 || strength > 100)
        throw new RangeError("strength outside 0..100");
    for (let i = 0; i < mask.length; i++) {
        if (!Number.isFinite(mask[i]) || mask[i] < 0 || mask[i] > 1)
            throw new RangeError("mask outside 0..1");
    }
}
export function blank(image, reason) {
    return { image: Uint8ClampedArray.from(image.data), alpha: new Float64Array(image.width * image.height), reason, changed: 0 };
}
export function median(values) {
    if (!values.length)
        throw new RangeError("no median for empty list");
    const sorted = [...values].sort((a, b) => a - b), n = sorted.length;
    return n % 2 ? sorted[Math.floor(n / 2)] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
}
export function readLab(image, i) {
    const off = i * 3;
    return srgbToLab([image.data[off], image.data[off + 1], image.data[off + 2]]);
}
export function writeLab(out, i, lab) {
    const [r, g, b] = labToSrgb(lab);
    out[i * 3] = toByte(r);
    out[i * 3 + 1] = toByte(g);
    out[i * 3 + 2] = toByte(b);
}
export function finitePhotograph(image) {
    for (let i = 0; i < image.data.length; i++) {
        if (!Number.isFinite(image.data[i]) || image.data[i] < 0 || image.data[i] > 255 || !Number.isInteger(image.data[i])) {
            throw new RangeError("RGB photograph contains non-byte values");
        }
    }
}
//# sourceMappingURL=effect-core.js.map