/** Halo-aware stripe renderer for image sizes unsuited to full Float64 frames.
 * Pixel-identical to applyPreview including 3x3 edge-replicated blur.
 * Works entirely within provided Uint8Array buffers and never uses storage,
 * workers, fetch, timers, telemetry or third-party assets. Author: John Khan.
 */
import { applyPreview } from './engine.js';
import { checkedImage, checkedMasks, supportMask } from './geometry.js';
import { checkedRequest } from './requests.js';
export function applyPreviewTiled(image, width, height, suppliedMasks, request, stripeRows = 64) {
    if (!Number.isSafeInteger(stripeRows) || stripeRows < 1 || stripeRows > 1024) {
        throw new Error('stripeRows must be an integer in 1..1024');
    }
    const { spec } = checkedRequest(request);
    const shape = checkedImage(image, width, height);
    const masks = checkedMasks(suppliedMasks, shape, spec);
    const support = supportMask(masks, shape, spec);
    const result = new Uint8Array(image);
    for (let first = 0; first < height; first += stripeRows) {
        const last = Math.min(height, first + stripeRows);
        const from = Math.max(0, first - 1);
        const through = Math.min(height, last + 1);
        let hasMask = false;
        for (const mask of Object.values(masks)) {
            if (!mask)
                continue;
            for (let y = first; y < last && !hasMask; y++) {
                for (let x = 0; x < width; x++) {
                    if (mask[y * width + x] > 0) {
                        hasMask = true;
                        break;
                    }
                }
            }
        }
        if (!hasMask)
            continue;
        const tileImage = image.subarray(from * width * shape.channels, through * width * shape.channels);
        const tileMasks = Object.fromEntries(Object.entries(masks).map(([name, mask]) => [name, mask?.subarray(from * width, through * width)]));
        const tileResult = applyPreview(tileImage, width, through - from, tileMasks, request, { offsetY: from, fullHeight: height });
        result.set(tileResult.pixels.subarray((first - from) * width * shape.channels, (last - from) * width * shape.channels), first * width * shape.channels);
    }
    let changed = 0, outside = 0, maxDelta = 0, alphaChanged = 0, maskSupport = 0;
    for (let p = 0; p < width * height; p++) {
        let rgbChanged = false;
        if (support[p])
            maskSupport++;
        for (let c = 0; c < 3; c++) {
            const index = p * shape.channels + c;
            const delta = Math.abs(result[index] - image[index]);
            if (delta > 0)
                rgbChanged = true;
            if (delta > maxDelta)
                maxDelta = delta;
        }
        if (rgbChanged) {
            changed++;
            if (!support[p])
                outside++;
        }
        if (shape.channels === 4 && result[p * shape.channels + 3] !== image[p * shape.channels + 3]) {
            alphaChanged++;
        }
    }
    const evidence = {
        feature_id: spec.id,
        mask_support_pixels: maskSupport,
        changed_pixels: changed,
        outside_mask_changed: outside,
        changed_alpha_pixels: alphaChanged,
        largest_channel_delta: maxDelta,
        provider_calls: 0,
        simulated: true,
        valid_mask: true,
        source_preserved: true,
        disclosure: 'Screen-colour simulation only; not a product, treatment, or physical result prediction.',
    };
    return { pixels: result, evidence };
}
//# sourceMappingURL=tiled.js.map