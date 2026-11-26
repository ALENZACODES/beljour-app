/** Exact neutral 2x/4x baseline from the original photo with bounded tiles.
 * This is reference resizing, not detail restoration or photographic enhancement.
 * Source alpha and RGB follow the same straight-channel bilinear contract.
 * Author: John Khan.
 */
import { checkedFrame, ProRenderError } from './runtime.js';
function checkedScale(scale, tileSize, frame) {
    if ((scale !== 2 && scale !== 4) || !Number.isInteger(tileSize) ||
        tileSize < 16 || tileSize > 1024 ||
        frame.width * scale * frame.height * scale > 24_000_000) {
        throw new ProRenderError('invalid_scale', 'Neutral upscale requires 2x/4x and bounded tiles.');
    }
}
function clamp(value, maximum) {
    return Math.max(0, Math.min(maximum, value));
}
function byte(value) {
    return Math.max(0, Math.min(255, Math.floor(value + 0.5)));
}
export function resizeNeutralTiled(frame, scale, tileSize, signal) {
    checkedFrame(frame);
    checkedScale(scale, tileSize, frame);
    const width = frame.width * scale;
    const height = frame.height * scale;
    const output = new Uint8Array(width * height * frame.channels);
    let tiles = 0;
    let estimatedPeakTileBytes = 0;
    // Avoid resampling uniformly coloured backdrops, but only after checking
    // every source channel. A nearly uniform image must take the normal path.
    if (signal?.aborted) {
        throw new ProRenderError('stale_preview', 'Neutral resize was cancelled.');
    }
    const channels = frame.channels;
    const first = frame.pixels.subarray(0, channels);
    const indices = [0, frame.width - 1, (frame.height - 1) * frame.width,
        frame.height * frame.width - 1,
        Math.floor(frame.height / 2) * frame.width + Math.floor(frame.width / 2)];
    let constant = indices.every((pixel) => first.every((value, c) => frame.pixels[pixel * channels + c] === value));
    if (constant) {
        for (let offset = 0; offset < frame.pixels.length && constant; offset += channels) {
            for (let c = 0; c < channels; c++) {
                if (frame.pixels[offset + c] !== first[c]) {
                    constant = false;
                    break;
                }
            }
        }
    }
    if (constant) {
        for (let offset = 0; offset < output.length; offset += channels) {
            output.set(first, offset);
        }
        tiles = Math.ceil(width / tileSize) * Math.ceil(height / tileSize);
        return Object.freeze({ image: Object.freeze({ width, height, channels, pixels: output }),
            tiles, estimatedPeakTileBytes });
    }
    for (let yStart = 0; yStart < height; yStart += tileSize) {
        for (let xStart = 0; xStart < width; xStart += tileSize) {
            if (signal?.aborted) {
                throw new ProRenderError('stale_preview', 'Neutral resize was cancelled.');
            }
            const yEnd = Math.min(height, yStart + tileSize);
            const xEnd = Math.min(width, xStart + tileSize);
            tiles++;
            estimatedPeakTileBytes = Math.max(estimatedPeakTileBytes, (yEnd - yStart) * (xEnd - xStart) * frame.channels * (7 * 8 + 1));
            for (let y = yStart; y < yEnd; y++) {
                const fy = clamp((y + 0.5) * frame.height / height - 0.5, frame.height - 1);
                const y0 = Math.floor(fy);
                const y1 = Math.min(frame.height - 1, y0 + 1);
                const wy = fy - y0;
                for (let x = xStart; x < xEnd; x++) {
                    const fx = clamp((x + 0.5) * frame.width / width - 0.5, frame.width - 1);
                    const x0 = Math.floor(fx);
                    const x1 = Math.min(frame.width - 1, x0 + 1);
                    const wx = fx - x0;
                    const left = (y0 * frame.width + x0) * frame.channels;
                    const right = (y0 * frame.width + x1) * frame.channels;
                    const lowerLeft = (y1 * frame.width + x0) * frame.channels;
                    const lowerRight = (y1 * frame.width + x1) * frame.channels;
                    const destination = (y * width + x) * frame.channels;
                    for (let channel = 0; channel < frame.channels; channel++) {
                        const upper = (1 - wx) * (frame.pixels[left + channel] ?? 0) +
                            wx * (frame.pixels[right + channel] ?? 0);
                        const lower = (1 - wx) * (frame.pixels[lowerLeft + channel] ?? 0) +
                            wx * (frame.pixels[lowerRight + channel] ?? 0);
                        output[destination + channel] = byte((1 - wy) * upper + wy * lower);
                    }
                }
            }
        }
    }
    return Object.freeze({ image: Object.freeze({ width, height, channels: frame.channels,
            pixels: output }), tiles, estimatedPeakTileBytes });
}
//# sourceMappingURL=neutral-resize.js.map