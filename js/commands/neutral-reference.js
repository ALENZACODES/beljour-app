/** Independent scalar reference for checking neutral upscale evidence.
 * Deliberately does not call the tiled production sampler. The two paths
 * must agree on straight-channel bilinear pixels and rounded alpha.
 * Author: John Khan.
 */
import { checkedFrame, ProRenderError } from './runtime.js';
function byte(value) {
    return Math.max(0, Math.min(255, Math.floor(value + 0.5)));
}
export function referenceNeutralResize(original, scale) {
    checkedFrame(original);
    if ((scale !== 2 && scale !== 4) ||
        original.width * scale * original.height * scale > 24_000_000) {
        throw new ProRenderError('invalid_dimensions', 'Reference resize cannot exceed 24 MP.');
    }
    const width = original.width * scale;
    const height = original.height * scale;
    const pixels = new Uint8Array(width * height * original.channels);
    for (let y = 0; y < height; y++) {
        const fy = Math.max(0, Math.min(original.height - 1, (y + 0.5) * original.height / height - 0.5));
        const y0 = Math.floor(fy);
        const y1 = Math.min(original.height - 1, y0 + 1);
        const wy = fy - y0;
        for (let x = 0; x < width; x++) {
            const fx = Math.max(0, Math.min(original.width - 1, (x + 0.5) * original.width / width - 0.5));
            const x0 = Math.floor(fx);
            const x1 = Math.min(original.width - 1, x0 + 1);
            const wx = fx - x0;
            const a = (y0 * original.width + x0) * original.channels;
            const b = (y0 * original.width + x1) * original.channels;
            const c = (y1 * original.width + x0) * original.channels;
            const d = (y1 * original.width + x1) * original.channels;
            const target = (y * width + x) * original.channels;
            for (let channel = 0; channel < original.channels; channel++) {
                const top = (1 - wx) * (original.pixels[a + channel] ?? 0) +
                    wx * (original.pixels[b + channel] ?? 0);
                const bottom = (1 - wx) * (original.pixels[c + channel] ?? 0) +
                    wx * (original.pixels[d + channel] ?? 0);
                pixels[target + channel] = byte((1 - wy) * top + wy * bottom);
            }
        }
    }
    return { width, height, channels: original.channels, pixels };
}
//# sourceMappingURL=neutral-reference.js.map