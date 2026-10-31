/** Deterministic, mask-authorized local beauty-colour *screen simulation*.
 * Input arrays are never mutated; no network, storage, photos or names leave
 * this module. RGB bounded relative to input, alpha exactly preserved.
 * Author: John Khan.
 */
import { checkedImage, checkedMasks, localMean, placementField, supportMask } from './geometry.js';
import { layersFor } from './operations.js';
import { checkedRequest } from './requests.js';
function targetValue(kind, channel, current, blur, layer, x, y, originY) {
    switch (kind) {
        case 'tint': return layer.color[channel];
        case 'blur': return blur;
        case 'light': return current + layer.color[channel];
        case 'shadow': return current - layer.color[channel];
        case 'cream': return current * 0.86 + blur * 0.14 + [3, 2, 1][channel];
        case 'powder': return current * 0.70 + blur * 0.30 - 3.0;
        case 'matte': return current * 0.75 + blur * 0.25 - 3.0;
        case 'dewy': return current + [8, 7, 6][channel];
        case 'colour_shift': return current - layer.color[channel];
        case 'grain': return current + (x * 17 + (y + originY) * 29) % 7 - 3;
        case 'strands': {
            const stripe = (x * 13 + (y + originY) * 3) % 17 < 4 ? 1 : 0;
            return current * 0.87 + layer.color[channel] * 0.13 + (stripe * 2 - 0.6) * 5;
        }
        case 'fibres': {
            const seed = (x * 47 + (y + originY) * 89 + x * (y + originY) * 7) % 127;
            const fleck = seed < 29 ? 0.50 : 0.06;
            return current + (layer.color[channel] - current) * fleck;
        }
        case 'gloss': {
            const stripe = (x * 7 + (y + originY) * 5) % 19 < 7 ? 1 : 0;
            const luminance = current / 255;
            return current + layer.color[channel] + stripe * (2 + 6 * (1 - luminance));
        }
    }
}
export function applyPreview(image, width, height, regionMasks, request, tileContext) {
    const { spec, request: checked } = checkedRequest(request);
    const shape = checkedImage(image, width, height);
    const masks = checkedMasks(regionMasks, shape, spec);
    const support = supportMask(masks, shape, spec);
    const pixels = width * height, channels = shape.channels;
    const initial = new Float64Array(pixels * 3);
    for (let p = 0; p < pixels; p++)
        for (let c = 0; c < 3; c++) {
            initial[p * 3 + c] = image[p * channels + c];
        }
    const values = new Float64Array(initial);
    if (checked.strength !== 0) {
        const blur = localMean(image, shape);
        for (const layer of layersFor(checked)) {
            const mask = masks[layer.region];
            if (!mask)
                continue;
            for (let y = 0; y < height; y++)
                for (let x = 0; x < width; x++) {
                    const p = y * width + x;
                    if (mask[p] === 0)
                        continue;
                    let strength = mask[p] / 255.0;
                    strength = strength * (checked.strength / 100.0);
                    strength = strength * (layer.opacity / 100.0);
                    strength = strength * placementField(x, y, width, height, layer.placement, tileContext);
                    strength = strength * (layer.scale / 100.0);
                    if (strength === 0)
                        continue;
                    for (let c = 0; c < 3; c++) {
                        const index = p * 3 + c;
                        const current = values[index];
                        const desired = targetValue(layer.kind, c, current, blur[index], layer, x, y, tileContext?.offsetY ?? 0);
                        values[index] = current + (desired - current) * strength;
                    }
                }
        }
    }
    const result = new Uint8Array(image);
    let changedPixels = 0, outside = 0, maxDelta = 0, alphaChanged = 0, supportPixels = 0;
    for (let p = 0; p < pixels; p++) {
        let changed = false;
        if (support[p])
            supportPixels++;
        for (let c = 0; c < 3; c++) {
            const index = p * 3 + c;
            const original = initial[index];
            const bounded = Math.max(original - spec.maxChannelDelta, Math.min(original + spec.maxChannelDelta, values[index]));
            const pixel = Math.floor(Math.max(0, Math.min(255, bounded)) + 0.5);
            result[p * channels + c] = pixel;
            const delta = Math.abs(pixel - original);
            if (delta > 0)
                changed = true;
            if (delta > maxDelta)
                maxDelta = delta;
        }
        if (changed) {
            changedPixels++;
            if (support[p] === 0)
                outside++;
        }
        if (channels === 4 && image[p * channels + 3] !== result[p * channels + 3])
            alphaChanged++;
    }
    return { pixels: result, evidence: {
            feature_id: spec.id, mask_support_pixels: supportPixels, changed_pixels: changedPixels,
            outside_mask_changed: outside, changed_alpha_pixels: alphaChanged,
            largest_channel_delta: maxDelta, provider_calls: 0, simulated: true,
            valid_mask: true, source_preserved: true,
            disclosure: 'Screen-colour simulation only; not a product, treatment, or physical result prediction.',
        } };
}
