/** R12 bounded exposure and actual-output clipping guards. Mirrors repair/safety.py.
 * No new model or dependency. Bounds retain the existing real-face checks; these
 * functions report measured changes, never perceptual or real-face validation.
 * He Sun and Tang guided filter (detail-preserving pipeline context):
 * concept only, no code copied. Author: John Khan.
 */
import { byteImage, decode, encode, requireColour, roundHalfEven } from "../core/buffer.js";
import { quantile } from "../core/filters.js";
import { FaceToneMeter, MAX_SKIN_LIGHTNESS_RISE, faceToneReport, faceWeights, meteredLuminance } from "./face-tone.js";
export const MAX_EXPOSURE_GAIN = 1.65, MAX_MEAN_CHANGE = 25, MAX_CLIP_INCREASE = 0.02;
export const HIGHLIGHT_START = 0.60, HIGHLIGHT_CEILING = 0.97, GUARD_STEPS = 16, MAX_FADE_CONTRAST = 1.12;
function validate(image) {
    requireColour(image);
    if (!Number.isInteger(image.width) || !Number.isInteger(image.height)
        || image.width < 1 || image.height < 1)
        throw new RangeError("expected non-empty RGB or RGBA");
}
function unit(value, name) {
    if (!(Number.isFinite(value) && value >= 0 && value <= 1))
        throw new RangeError(`${name} must be 0..1`);
}
function rgbCopy(image) {
    const result = byteImage(image.width, image.height, 3);
    for (let i = 0; i < image.width * image.height; i++)
        for (let c = 0; c < 3; c++) {
            result.data[i * 3 + c] = image.data[i * image.channels + c];
        }
    return result;
}
export function boundedExposure(image, target = 0.18, weight = 0.5, faceMask) {
    validate(image);
    unit(weight, "weight");
    if (!(Number.isFinite(target) && target > 0 && target <= 1))
        throw new RangeError("target must be in (0,1]");
    const lin = decode(image), count = image.width * image.height;
    const weights = faceMask === undefined ? undefined : faceWeights(faceMask, image.width, image.height);
    const mean = meteredLuminance(lin, weights);
    const request = Math.max(1, target / Math.max(mean, 1e-6));
    const gain = 1 + weight * (Math.min(MAX_EXPOSURE_GAIN, request) - 1);
    let maximumGain = 1, rolled = 0;
    for (let i = 0; i < count; i++) {
        const p = i * 3, maximum = Math.max(lin.data[p], lin.data[p + 1], lin.data[p + 2]);
        const t = Math.min(1, Math.max(0, (maximum - HIGHLIGHT_START) / (HIGHLIGHT_CEILING - HIGHLIGHT_START)));
        const shoulder = 1 - t * t * (3 - 2 * t);
        let pixelGain = 1 + (gain - 1) * shoulder;
        pixelGain = maximum < HIGHLIGHT_CEILING ? Math.min(pixelGain, HIGHLIGHT_CEILING / Math.max(maximum, 1e-12)) : 1;
        pixelGain = Math.max(1, pixelGain);
        if (pixelGain < gain - 1e-10)
            rolled++;
        maximumGain = Math.max(maximumGain, pixelGain);
        for (let c = 0; c < 3; c++)
            lin.data[p + c] = Math.min(1, Math.max(0, lin.data[p + c] * pixelGain));
    }
    return { image: encode(lin), requested_gain: request, applied_gain: gain,
        max_pixel_gain: maximumGain, rolled_off_pixels: rolled };
}
export function restoreFadedContrast(image, strength) {
    validate(image);
    unit(strength, "strength");
    const count = image.width * image.height, luminance = new Float64Array(count);
    for (let i = 0; i < count; i++) {
        const p = i * image.channels;
        luminance[i] = 0.299 * image.data[p] + 0.587 * image.data[p + 1] + 0.114 * image.data[p + 2];
    }
    const centre = quantile(luminance, 0.5), result = byteImage(image.width, image.height, 3);
    for (let i = 0; i < count; i++) {
        const p = i * image.channels, r = image.data[p], g = image.data[p + 1], b = image.data[p + 2];
        const amount = (luminance[i] - centre) * (MAX_FADE_CONTRAST - 1) * strength;
        const delta = Math.min(255 - Math.max(r, g, b), Math.max(-Math.min(r, g, b), amount));
        for (let c = 0; c < 3; c++)
            result.data[i * 3 + c] = Math.min(255, Math.max(0, roundHalfEven(image.data[p + c] + delta)));
    }
    return result;
}
export function withinLimits(metrics) {
    return metrics.mean_abs_change <= MAX_MEAN_CHANGE && metrics.luma_clip_increase <= MAX_CLIP_INCREASE + 1e-12
        && metrics.channel_clip_increase <= MAX_CLIP_INCREASE + 1e-12 && metrics.dark_clip_increase <= MAX_CLIP_INCREASE + 1e-12;
}
export function measureSafety(original, proposed) {
    validate(original);
    validate(proposed);
    if (original.width !== proposed.width || original.height !== proposed.height)
        throw new RangeError("before and after images must have the same shape");
    const count = original.width * original.height;
    let change = 0, lumaBefore = 0, lumaAfter = 0, channelBefore = 0, channelAfter = 0, darkBefore = 0, darkAfter = 0;
    for (let i = 0; i < count; i++) {
        const a = i * original.channels, b = i * proposed.channels;
        const ay = 0.299 * original.data[a] + 0.587 * original.data[a + 1] + 0.114 * original.data[a + 2];
        const by = 0.299 * proposed.data[b] + 0.587 * proposed.data[b + 1] + 0.114 * proposed.data[b + 2];
        for (let c = 0; c < 3; c++)
            change += Math.abs(original.data[a + c] - proposed.data[b + c]);
        if (ay >= 253)
            lumaBefore++;
        if (by >= 253)
            lumaAfter++;
        if (ay <= 2)
            darkBefore++;
        if (by <= 2)
            darkAfter++;
        if (Math.max(original.data[a], original.data[a + 1], original.data[a + 2]) >= 253)
            channelBefore++;
        if (Math.max(proposed.data[b], proposed.data[b + 1], proposed.data[b + 2]) >= 253)
            channelAfter++;
    }
    return { mean_abs_change: change / (count * 3), luma_clip_increase: (lumaAfter - lumaBefore) / count,
        channel_clip_increase: (channelAfter - channelBefore) / count, dark_clip_increase: (darkAfter - darkBefore) / count };
}
export function guardOutput(original, proposed, faceMask) {
    const measured = measureSafety(original, proposed);
    const meter = faceMask === undefined ? undefined : new FaceToneMeter(original, faceMask);
    const face = meter?.measure(proposed);
    if (withinLimits(measured) && (!face || face.max_rise <= MAX_SKIN_LIGHTNESS_RISE)) {
        return { image: rgbCopy(proposed), metrics: measured, applied_mix: 1, reduced: false, proposals_checked: 1,
            ...(face ? { face_tone: face } : {}) };
    }
    let lo = 0, hi = 1, kept = rgbCopy(original), keptMetrics = measureSafety(original, original);
    let keptFace = meter?.measure(kept);
    const count = original.width * original.height;
    for (let step = 0; step < GUARD_STEPS; step++) {
        const mix = (lo + hi) / 2, candidate = byteImage(original.width, original.height, 3);
        for (let i = 0; i < count; i++)
            for (let c = 0; c < 3; c++) {
                const a = original.data[i * original.channels + c], b = proposed.data[i * proposed.channels + c];
                candidate.data[i * 3 + c] = Math.min(255, Math.max(0, roundHalfEven(a + (b - a) * mix)));
            }
        const current = measureSafety(original, candidate);
        const candidateFace = meter?.measure(candidate);
        if (withinLimits(current) && (!candidateFace || candidateFace.max_rise <= MAX_SKIN_LIGHTNESS_RISE)) {
            lo = mix;
            kept = candidate;
            keptMetrics = current;
            keptFace = candidateFace;
        }
        else
            hi = mix;
    }
    return { image: kept, metrics: keptMetrics, applied_mix: lo, reduced: true, proposals_checked: GUARD_STEPS + 1,
        ...(keptFace ? { face_tone: keptFace } : {}) };
}
const round8 = (value) => roundHalfEven(value * 1e8) / 1e8;
export function safetyReport(result) {
    return { metrics: {
            mean_abs_change: round8(result.metrics.mean_abs_change), luma_clip_increase: round8(result.metrics.luma_clip_increase),
            channel_clip_increase: round8(result.metrics.channel_clip_increase), dark_clip_increase: round8(result.metrics.dark_clip_increase),
        }, applied_mix: round8(result.applied_mix), reduced: result.reduced, proposals_checked: result.proposals_checked,
        limits: { mean_abs_change: MAX_MEAN_CHANGE, clip_increase: MAX_CLIP_INCREASE, exposure_gain: MAX_EXPOSURE_GAIN },
        ...(result.face_tone ? { face_tone: faceToneReport(result.face_tone) } : {}) };
}
