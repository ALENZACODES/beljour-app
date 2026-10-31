/** Weighted face exposure and measured 2.5 CIE L* rise protection.
 * The caller supplies a geometry/review mask; no skin colour is inferred and a
 * face is never treated as a neutral white-balance reference. Mirrors
 * repair/face_tone.py. CIE 1976 lightness: concept only, no code copied.
 * Original implementation. Author: John Khan.
 */
import { decodeChannel, requireColour, requireMask, roundHalfEven } from "../core/buffer.js";
export const MAX_SKIN_LIGHTNESS_RISE = 2.5;
export function faceWeights(mask, width, height) {
    if (!mask || !(mask.data instanceof Float32Array || mask.data instanceof Float64Array)
        || mask.data.length !== width * height)
        throw new RangeError("face mask must match the photo");
    requireMask(mask, width, height);
    if (!mask.data.some(value => value > 0))
        throw new RangeError("face mask must contain covered pixels");
    return { width, height, channels: 1, data: Float64Array.from(mask.data) };
}
/** Preserve the historical arithmetic for the no-mask path. */
export function meteredLuminance(linear, weights) {
    let sum = 0, mass = 0;
    const count = linear.width * linear.height;
    for (let i = 0; i < count; i++) {
        const p = i * 3, luminance = 0.2126 * linear.data[p] + 0.7152 * linear.data[p + 1] + 0.0722 * linear.data[p + 2];
        if (weights) {
            sum += luminance * weights.data[i];
            mass += weights.data[i];
        }
        else
            sum += luminance;
    }
    return sum / (weights ? mass : count);
}
function lightness(image, index) {
    const p = index * image.channels;
    const y = 0.2126729 * decodeChannel(image.data[p] / 255)
        + 0.7151522 * decodeChannel(image.data[p + 1] / 255)
        + 0.0721750 * decodeChannel(image.data[p + 2] / 255);
    const delta = 6 / 29;
    return 116 * (y > delta ** 3 ? y ** (1 / 3) : y / (3 * delta * delta) + 4 / 29) - 16;
}
const round8 = (value) => roundHalfEven(value * 1e8) / 1e8;
export function faceToneReport(measured) {
    return { evidence: "supplied_face_mask", pixels: measured.pixels, weight: round8(measured.weight),
        before_lstar: round8(measured.before_lstar), after_lstar: round8(measured.after_lstar),
        mean_rise: round8(measured.after_lstar - measured.before_lstar), max_rise: round8(measured.max_rise),
        limit: MAX_SKIN_LIGHTNESS_RISE };
}
/** Samples belong to one invocation and cannot retain a later photo's pixels. */
export class FaceToneMeter {
    indices = [];
    weights = [];
    before = [];
    width;
    height;
    mass;
    meanBefore;
    constructor(original, mask) {
        requireColour(original);
        const weights = faceWeights(mask, original.width, original.height);
        this.width = original.width;
        this.height = original.height;
        let mass = 0, mean = 0;
        for (let i = 0; i < weights.data.length; i++)
            if (weights.data[i] > 0) {
                const value = lightness(original, i), weight = weights.data[i];
                this.indices.push(i);
                this.weights.push(weight);
                this.before.push(value);
                mass += weight;
                mean += value * weight;
            }
        this.mass = mass;
        this.meanBefore = mean / mass;
    }
    measure(image) {
        requireColour(image);
        if (image.width !== this.width || image.height !== this.height)
            throw new RangeError("face measurement must use the original photo dimensions");
        let mean = 0, maxRise = 0;
        for (let k = 0; k < this.indices.length; k++) {
            const value = lightness(image, this.indices[k]);
            mean += value * this.weights[k];
            maxRise = Math.max(maxRise, value - this.before[k]);
        }
        return { pixels: this.indices.length, weight: this.mass, before_lstar: this.meanBefore,
            after_lstar: mean / this.mass, max_rise: maxRise };
    }
}
