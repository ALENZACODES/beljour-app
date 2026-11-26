/** Caller-owned masks, edge-replicated 3x3 mean and deterministic placement.
 * No auto-segmentation or unmasked fallback. Author: John Khan.
 */
import { REGIONS } from './specs.js';
export function checkedImage(image, width, height) {
    if (!(image instanceof Uint8Array) || !Number.isSafeInteger(width) || !Number.isSafeInteger(height)) {
        throw new Error('Image requires uint8 pixels and exact integer shape');
    }
    if (width < 1 || height < 1 || width > 8192 || height > 8192 || width * height > 16_000_000) {
        throw new Error('Image dimensions outside supported range');
    }
    if (image.length !== width * height * 3 && image.length !== width * height * 4) {
        throw new Error('Image must have RGB or RGBA channels');
    }
    return { width, height, channels: image.length === width * height * 4 ? 4 : 3 };
}
export function checkedMasks(masks, shape, spec) {
    if (!masks || typeof masks !== 'object')
        throw new Error('Explicit region masks required');
    let hasPixels = false;
    const approved = {};
    for (const [key, value] of Object.entries(masks)) {
        if (!REGIONS.includes(key))
            throw new Error(`Unknown mask ${key}`);
        if (!(value instanceof Uint8Array) || value.length !== shape.width * shape.height) {
            throw new Error(`Invalid uint8 mask ${key} or shape mismatch`);
        }
        if (spec.regions.includes(key)) {
            approved[key] = value;
            if (!hasPixels && value.some(v => v > 0))
                hasPixels = true;
        }
    }
    if (!hasPixels)
        throw new Error('No approved nonempty mask; unmasked editing refused');
    return approved;
}
export function supportMask(masks, shape, spec) {
    const support = new Uint8Array(shape.width * shape.height);
    for (const region of spec.regions) {
        const mask = masks[region];
        if (mask)
            for (let i = 0; i < support.length; i++) {
                if (mask[i] > 0)
                    support[i] = 1;
            }
    }
    return support;
}
export function localMean(image, shape) {
    const { width, height, channels } = shape;
    const result = new Float64Array(width * height * 3);
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
            const at = (y * width + x) * 3;
            for (let c = 0; c < 3; c++) {
                let sum = 0;
                for (let dy = -1; dy <= 1; dy++) {
                    const sy = Math.min(height - 1, Math.max(0, y + dy));
                    for (let dx = -1; dx <= 1; dx++) {
                        const sx = Math.min(width - 1, Math.max(0, x + dx));
                        sum += image[(sy * width + sx) * channels + c];
                    }
                }
                result[at + c] = sum / 9.0;
            }
        }
    return result;
}
export function placementField(x, y, width, height, place, context) {
    if (context && (!Number.isSafeInteger(context.offsetY) || !Number.isSafeInteger(context.fullHeight) ||
        context.offsetY < 0 || context.fullHeight < height || context.offsetY + height > context.fullHeight)) {
        throw new Error('Invalid tile coordinate metadata');
    }
    const xx = x / Math.max(1, width - 1);
    const yy = (y + (context?.offsetY ?? 0)) / Math.max(1, (context?.fullHeight ?? height) - 1);
    switch (place) {
        case 'uniform': return 1.0;
        case 'upper': return 0.65 + 0.35 * (1.0 - yy);
        case 'lower': return 0.65 + 0.35 * yy;
        case 'side': return 0.6 + 0.4 * Math.abs(xx * 2.0 - 1.0);
        case 'middle': return 0.6 + 0.4 * (1.0 - Math.abs(xx * 2.0 - 1.0));
        case 'diagonal': return 0.6 + 0.4 * (0.5 * xx + 0.5 * (1.0 - yy));
        case 'rounded': return 0.6 + 0.4 * (1.0 - Math.abs(xx * 2.0 - 1.0)) * (1.0 - Math.abs(yy * 2.0 - 1.0));
        case 'soft': return 0.77;
        default: throw new Error(`Unknown position field ${place}`);
    }
}
//# sourceMappingURL=geometry.js.map