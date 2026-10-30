/** Final rounded-byte Studio protection for explicitly checked skin pixels.
 * No pixel-based skin classification and no reference image are used.
 * Author: John Khan.
 */
import { ProRenderError } from './runtime.js';
export const MAX_STUDIO_SKIN_LIFT = 2.5;
function channelLinear(byte) {
    const source = byte / 255;
    return source <= 0.04045 ? source / 12.92 :
        ((source + 0.055) / 1.055) ** 2.4;
}
export function studioPixelLightness(rgb) {
    if (!rgb.every((value) => Number.isInteger(value) && value >= 0 && value <= 255)) {
        throw new ProRenderError('invalid_studio', 'Studio pixel must be checked uint8 RGB.');
    }
    const y = 0.2126729 * channelLinear(rgb[0]) +
        0.7151522 * channelLinear(rgb[1]) +
        0.0721750 * channelLinear(rgb[2]);
    return y > 216 / 24389 ? 116 * Math.cbrt(y) - 16 : (24389 / 27) * y;
}
function interpolateRgb(original, candidate, weight) {
    function value(index) {
        return Math.max(0, Math.min(255, Math.floor(original[index] + (candidate[index] - original[index]) * weight + 0.5)));
    }
    return [value(0), value(1), value(2)];
}
export function protectStudioPixel(original, candidate, checkedSkin, limit = MAX_STUDIO_SKIN_LIFT) {
    if (!Number.isFinite(checkedSkin) || checkedSkin < 0 || checkedSkin > 1 ||
        !Number.isFinite(limit) || limit <= 0 || limit > 5) {
        throw new ProRenderError('invalid_studio', 'Studio skin mask and cap are invalid.');
    }
    if (checkedSkin === 0) {
        return { rgb: candidate, adjusted: false, liftL: 0, measured: false };
    }
    const originalL = studioPixelLightness(original);
    const candidateL = studioPixelLightness(candidate);
    const gain = candidateL - originalL;
    if (gain <= limit) {
        return { rgb: candidate, adjusted: false,
            liftL: Math.max(0, gain), measured: true };
    }
    let low = 0;
    let high = 1;
    for (let iteration = 0; iteration < 10; iteration++) {
        const middle = (low + high) / 2;
        const trial = interpolateRgb(original, candidate, middle);
        const value = studioPixelLightness(trial) - originalL;
        if (value <= limit)
            low = middle;
        else
            high = middle;
    }
    let result = interpolateRgb(original, candidate, low);
    let finalLift = studioPixelLightness(result) - originalL;
    if (finalLift > limit + 1e-8) {
        result = original;
        finalLift = 0;
    }
    return { rgb: result, adjusted: true, liftL: Math.max(0, finalLift),
        measured: true };
}
//# sourceMappingURL=studio-protection.js.map