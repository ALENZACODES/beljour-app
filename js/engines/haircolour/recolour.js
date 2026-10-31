/** W39 curl-pattern-respecting recolour in the browser (local fallback renderer).
 * Mirrors api/plumb_api/engines/haircolour/recolour.py (parity/haircolour-w39-w28.json):
 * inside the hair mask the new lightness is an increasing affine map of the old one, so every
 * strand edge and coil highlight keeps its place and order; chroma follows the target hue,
 * shaded by the new lightness; pixels outside the mask are copied byte for byte.
 * Author: John Khan.
 */
import { labToSrgb, srgbToLab, toByte } from "../shade/colourspace.js";
export const LABEL = "Hair colour simulation. Your curl pattern comes from your photo; nothing is straightened.";
export const VERSION = "recolour-w39/1";
export const GAIN_LIMITS = [0.6, 1.6];
export const MIN_HAIR_PIXELS = 16;
export const HIGH_PASS_RADIUS = 3;
function check(image, mask) {
    if (image.channels !== 3 && image.channels !== 4)
        throw new RangeError("hair recolour needs an RGB or RGBA photo");
    if (Math.min(image.width, image.height) < 2)
        throw new RangeError("hair recolour needs at least 2 by 2 pixels");
    if (image.data.length !== image.width * image.height * image.channels)
        throw new RangeError("photo data does not match its size");
    if (mask.length !== image.width * image.height)
        throw new RangeError("hair mask must match the photo");
    for (let i = 0; i < mask.length; i++) {
        if (!(mask[i] >= 0 && mask[i] <= 1))
            throw new RangeError("hair mask must hold values in 0..1");
    }
}
export function textureGain(sourceLightness, targetLightness) {
    const g = Math.sqrt((targetLightness + 5) / (sourceLightness + 5));
    return Math.min(GAIN_LIMITS[1], Math.max(GAIN_LIMITS[0], g));
}
/** Separable mean filter with edge padding; same arithmetic order as the Python cumsum version. */
export function boxBlur(values, width, height, radius) {
    const out = Float64Array.from(values);
    if (radius <= 0)
        return out;
    const k = 2 * radius + 1;
    const rows = new Float64Array(width * height);
    const line = new Float64Array(Math.max(width, height) + 2 * radius + 1);
    for (let y = 0; y < height; y++) {
        line[0] = 0;
        for (let i = 0; i < width + 2 * radius; i++) {
            const x = Math.min(width - 1, Math.max(0, i - radius));
            line[i + 1] = line[i] + values[y * width + x];
        }
        for (let x = 0; x < width; x++)
            rows[y * width + x] = (line[x + k] - line[x]) / k;
    }
    for (let x = 0; x < width; x++) {
        line[0] = 0;
        for (let i = 0; i < height + 2 * radius; i++) {
            const y = Math.min(height - 1, Math.max(0, i - radius));
            line[i + 1] = line[i] + rows[y * width + x];
        }
        for (let y = 0; y < height; y++)
            out[y * width + x] = (line[y + k] - line[y]) / k;
    }
    return out;
}
function lightnessOf(image) {
    const out = new Float64Array(image.width * image.height);
    for (let i = 0; i < out.length; i++) {
        const o = i * image.channels;
        out[i] = srgbToLab([image.data[o], image.data[o + 1], image.data[o + 2]])[0];
    }
    return out;
}
function highPass(l, width, height) {
    const blur = boxBlur(l, width, height, HIGH_PASS_RADIUS);
    return l.map((v, i) => v - blur[i]);
}
/** Curl silhouette, outside pixels and strand structure, measured on the result. */
export function geometryChecks(before, after, mask) {
    const { width, height } = before;
    const n = width * height;
    const region = new Float64Array(n);
    for (let i = 0; i < n; i++)
        region[i] = mask[i] >= 0.5 ? 1 : 0;
    const cover = boxBlur(region, width, height, HIGH_PASS_RADIUS + 1);
    const interior = new Uint8Array(n);
    for (let i = 0; i < n; i++)
        interior[i] = region[i] === 1 && cover[i] >= 1 - 1e-9 ? 1 : 0;
    let outsideSame = true;
    for (let i = 0; i < n && outsideSame; i++) {
        if (mask[i] !== 0)
            continue;
        for (let c = 0; c < before.channels; c++) {
            if (before.data[i * before.channels + c] !== after.data[i * after.channels + c]) {
                outsideSame = false;
                break;
            }
        }
    }
    const hp0 = highPass(lightnessOf(before), width, height), hp1 = highPass(lightnessOf(after), width, height);
    let strong = 0, agree = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
    for (let i = 0; i < n; i++) {
        if (!interior[i] || Math.abs(hp0[i]) <= 1.5)
            continue;
        strong++;
        if (Math.sign(hp0[i]) === Math.sign(hp1[i]))
            agree++;
        sx += hp0[i];
        sy += hp1[i];
        sxx += hp0[i] * hp0[i];
        syy += hp1[i] * hp1[i];
        sxy += hp0[i] * hp1[i];
    }
    const agreement = strong ? agree / strong : 1;
    let corr = 1;
    if (strong > 2) {
        const cov = sxy - sx * sy / strong, vx = sxx - sx * sx / strong, vy = syy - sy * sy / strong;
        corr = cov / Math.sqrt(vx * vy);
    }
    let inter = 0, union = 0;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = y * width + x;
            if (!interior[i])
                continue;
            let step = false, e0 = false, e1 = false;
            if (x + 1 < width) {
                step ||= Math.abs(hp0[i] - hp0[i + 1]) > 3;
                e0 ||= Math.sign(hp0[i]) !== Math.sign(hp0[i + 1]);
                e1 ||= Math.sign(hp1[i]) !== Math.sign(hp1[i + 1]);
            }
            if (y + 1 < height) {
                step ||= Math.abs(hp0[i] - hp0[i + width]) > 3;
                e0 ||= Math.sign(hp0[i]) !== Math.sign(hp0[i + width]);
                e1 ||= Math.sign(hp1[i]) !== Math.sign(hp1[i + width]);
            }
            if (!step)
                continue;
            if (e0 || e1)
                union++;
            if (e0 && e1)
                inter++;
        }
    }
    const iou = union ? inter / union : 1;
    const r6 = (v) => Math.round(v * 1e6) / 1e6;
    return { silhouette_unchanged: true, outside_unchanged: outsideSame, structure_sign_agreement: r6(agreement),
        edge_map_iou: r6(iou), structure_correlation: r6(corr),
        geometry_lock: outsideSame && agreement >= 0.99 && iou >= 0.9 };
}
/** Recolour hair toward `targetLab` inside `mask`; `alpha` optionally limits where (a lift map). */
export function recolourHair(image, mask, targetLab, options = {}) {
    check(image, mask);
    if (targetLab.length !== 3 || !targetLab.every(Number.isFinite) || targetLab[0] < 0 || targetLab[0] > 100) {
        throw new RangeError("target colour must be one finite Lab triple with L* in 0..100");
    }
    const strength = options.strength ?? 1;
    if (!Number.isFinite(strength) || strength < 0 || strength > 1)
        throw new RangeError("strength must be in 0..1");
    const n = image.width * image.height;
    // Alpha below the observed 0.5 support threshold is outside the edit.
    const weight = Float64Array.from(mask, (v) => v >= 0.5 ? v : 0);
    if (options.alpha) {
        if (options.alpha.length !== n)
            throw new RangeError("colour alpha must match the photo");
        for (let i = 0; i < n; i++) {
            const a = options.alpha[i];
            if (!(a >= 0 && a <= 1))
                throw new RangeError("colour alpha must hold values in 0..1");
            weight[i] *= a;
        }
    }
    for (let i = 0; i < n; i++)
        weight[i] *= strength;
    const lab = new Array(n);
    let count = 0, meanL = 0;
    const src = [0, 0, 0];
    for (let i = 0; i < n; i++) {
        const o = i * image.channels;
        lab[i] = srgbToLab([image.data[o], image.data[o + 1], image.data[o + 2]]);
        if (mask[i] >= 0.5) {
            count++;
            for (let c = 0; c < 3; c++)
                src[c] += lab[i][c];
        }
    }
    if (count < MIN_HAIR_PIXELS)
        throw new RangeError("not enough hair in the mask to recolour");
    meanL = src[0] / count;
    const gain = textureGain(meanL, targetLab[0]);
    const out = Uint8ClampedArray.from(image.data);
    for (let i = 0; i < n; i++) {
        const w = weight[i];
        if (!(w > 0))
            continue;
        const L = Math.min(100, Math.max(0, targetLab[0] + gain * (lab[i][0] - meanL)));
        const shade = Math.min(1.25, Math.max(0.35, L / Math.max(targetLab[0], 1)));
        const next = [L, targetLab[1] * shade, targetLab[2] * shade];
        const blended = [0, 1, 2].map((c) => lab[i][c] + (next[c] - lab[i][c]) * w);
        const rgb = labToSrgb(blended);
        for (let c = 0; c < 3; c++)
            out[i * image.channels + c] = toByte(rgb[c]);
    }
    const result = { width: image.width, height: image.height, channels: image.channels, data: out };
    return { image: out, alpha: weight, gain, source_lab: src.map((v) => v / count), target_lab: [...targetLab],
        checks: geometryChecks(image, result, mask), label: LABEL };
}
