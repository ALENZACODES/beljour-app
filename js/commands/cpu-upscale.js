/** Tiled 2×/4× cubic CPU scaler; local pixel details only, no neural model.
 * Every tile uses absolute coordinates to avoid seams or reinitialized halos.
 * The alpha channel follows the existing pixel-center bilinear contract.
 * Author: John Khan.
 */
import { resizeNeutralTiled } from './neutral-resize.js';
import { checkedFrame, ProRenderError } from './runtime.js';
function clampByte(value) {
    return Math.max(0, Math.min(255, Math.floor(value + 0.5)));
}
function clampInt(value, maximum) {
    return Math.max(0, Math.min(maximum, value));
}
function keysCubic(value) {
    const absolute = Math.abs(value);
    if (absolute < 1)
        return 1.5 * absolute ** 3 - 2.5 * absolute ** 2 + 1;
    if (absolute < 2)
        return -0.5 * absolute ** 3 + 2.5 * absolute ** 2 - 4 * absolute + 2;
    return 0;
}
export function planUpscaleTiles(width, height, tileSize) {
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
        width < 1 || height < 1 || width * height > 24_000_000 ||
        !Number.isSafeInteger(tileSize) || tileSize < 16 || tileSize > 1024) {
        throw new ProRenderError('invalid_tiles', 'Upscale tile dimensions are invalid.');
    }
    const result = [];
    for (let y = 0; y < height; y += tileSize) {
        for (let x = 0; x < width; x += tileSize) {
            result.push({ x0: x, x1: Math.min(width, x + tileSize),
                y0: y, y1: Math.min(height, y + tileSize) });
        }
    }
    return result;
}
function axisSamples(outputLength, inputLength, scale) {
    const indices = new Int32Array(outputLength * 4);
    const weights = new Float32Array(outputLength * 4);
    for (let out = 0; out < outputLength; out++) {
        const center = (out + 0.5) / scale - 0.5;
        const base = Math.floor(center);
        let total = 0;
        for (let tap = 0; tap < 4; tap++) {
            const sample = base + tap - 1;
            const weight = keysCubic(center - sample);
            indices[out * 4 + tap] = clampInt(sample, inputLength - 1);
            weights[out * 4 + tap] = weight;
            total += weight;
        }
        for (let tap = 0; tap < 4; tap++) {
            weights[out * 4 + tap] = (weights[out * 4 + tap] ?? 0) / total;
        }
    }
    return { indices, weights };
}
function alphaSample(frame, outX, outY, scale) {
    if (frame.channels === 3)
        return 255;
    const fx = Math.max(0, Math.min(frame.width - 1, (outX + 0.5) / scale - 0.5));
    const fy = Math.max(0, Math.min(frame.height - 1, (outY + 0.5) / scale - 0.5));
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const x1 = Math.min(frame.width - 1, x0 + 1);
    const y1 = Math.min(frame.height - 1, y0 + 1);
    const wx = fx - x0;
    const wy = fy - y0;
    const a = frame.pixels[(y0 * frame.width + x0) * 4 + 3] ?? 0;
    const b = frame.pixels[(y0 * frame.width + x1) * 4 + 3] ?? 0;
    const c = frame.pixels[(y1 * frame.width + x0) * 4 + 3] ?? 0;
    const d = frame.pixels[(y1 * frame.width + x1) * 4 + 3] ?? 0;
    const upper = a * (1 - wx) + b * wx;
    const lower = c * (1 - wx) + d * wx;
    return upper * (1 - wy) + lower * wy;
}
function faceDetail(frame, regions, level) {
    const colours = new Float32Array(frame.width * frame.height * 3);
    const eyes = regions?.mask('eyes', frame.width, frame.height);
    const hair = regions?.mask('hair', frame.width, frame.height);
    const skin = regions?.mask('skin', frame.width, frame.height);
    const protectedMask = regions?.mask('protected', frame.width, frame.height);
    const enabled = eyes !== null && eyes !== undefined ||
        hair !== null && hair !== undefined || skin !== null && skin !== undefined;
    const sample = (x, y, channel) => {
        const location = (clampInt(y, frame.height - 1) * frame.width +
            clampInt(x, frame.width - 1)) * frame.channels + channel;
        return frame.pixels[location] ?? 0;
    };
    for (let y = 0; y < frame.height; y++) {
        for (let x = 0; x < frame.width; x++) {
            const index = y * frame.width + x;
            let strength = ((eyes?.[index] ?? 0) * 0.16 +
                (hair?.[index] ?? 0) * 0.12 + (skin?.[index] ?? 0) * 0.018);
            strength = Math.min(0.17, strength) * level / 50;
            strength *= 1 - (protectedMask?.[index] ?? 0);
            for (let channel = 0; channel < 3; channel++) {
                const original = sample(x, y, channel);
                const low = (sample(x, y - 1, channel) + sample(x, y + 1, channel) +
                    sample(x - 1, y, channel) + sample(x + 1, y, channel) + 4 * original) / 8;
                colours[index * 3 + channel] = Math.max(0, Math.min(255, original + (original - low) * strength));
            }
        }
    }
    return { colours, enabled };
}
export class CpuUpscale {
    regions;
    tileSize;
    lastMetrics = null;
    constructor(regions = null, tileSize = 96) {
        this.regions = regions;
        this.tileSize = tileSize;
        if (!Number.isInteger(tileSize) || tileSize < 16 || tileSize > 1024) {
            throw new ProRenderError('invalid_tiles', 'Upscale tile size must be within 16–1024.');
        }
    }
    render(frame, scale, level, preview, signal, neutralDetail = false) {
        const start = performance.now();
        checkedFrame(frame);
        if ((scale !== 2 && scale !== 4) || !Number.isInteger(level) || level < 10 || level > 50) {
            throw new ProRenderError('invalid_scale', 'Use 2x or 4x and an editor level of 1.0–5.0.');
        }
        const outputWidth = frame.width * scale;
        const outputHeight = frame.height * scale;
        if (outputWidth * outputHeight > 24_000_000) {
            throw new ProRenderError('invalid_dimensions', 'Upscale exceeds 24 MP.');
        }
        if (level === 10) {
            const neutral = resizeNeutralTiled(frame, scale, this.tileSize, signal);
            const elapsedMs = performance.now() - start;
            this.lastMetrics = {
                scale, tileCount: neutral.tiles,
                largestTileBytes: neutral.estimatedPeakTileBytes,
                preview, faceDetailEnabled: false, elapsedMs,
                targetMs: preview ? 100 : 2000,
                withinTarget: elapsedMs <= (preview ? 100 : 2000),
            };
            return neutral.image;
        }
        const { colours, enabled } = faceDetail(frame, neutralDetail ? null : this.regions, level);
        const xAxis = axisSamples(outputWidth, frame.width, scale);
        const yAxis = axisSamples(outputHeight, frame.height, scale);
        const target = new Uint8Array(outputWidth * outputHeight * frame.channels);
        const tiles = planUpscaleTiles(outputWidth, outputHeight, this.tileSize);
        for (const tile of tiles) {
            if (signal?.aborted) {
                throw new ProRenderError('stale_preview', 'The upscale preview was cancelled.');
            }
            for (let y = tile.y0; y < tile.y1; y++) {
                for (let x = tile.x0; x < tile.x1; x++) {
                    const targetIndex = (y * outputWidth + x) * frame.channels;
                    const alpha = alphaSample(frame, x, y, scale);
                    const safeAlpha = Math.max(alpha / 255, 0.00001);
                    for (let channel = 0; channel < 3; channel++) {
                        let linear = 0;
                        for (let ty = 0; ty < 4; ty++) {
                            const sourceY = yAxis.indices[y * 4 + ty] ?? 0;
                            const wy = yAxis.weights[y * 4 + ty] ?? 0;
                            for (let tx = 0; tx < 4; tx++) {
                                const sourceX = xAxis.indices[x * 4 + tx] ?? 0;
                                const wx = xAxis.weights[x * 4 + tx] ?? 0;
                                const sourceIndex = sourceY * frame.width + sourceX;
                                const sourceAlpha = frame.channels === 4 ?
                                    (frame.pixels[sourceIndex * 4 + 3] ?? 0) / 255 : 1;
                                linear += (colours[sourceIndex * 3 + channel] ?? 0) * sourceAlpha * wx * wy;
                            }
                        }
                        let value = frame.channels === 4 && alpha <= 0.0001 ? 0 : linear / safeAlpha;
                        if (alpha > 0.0001) {
                            const centerX = Math.max(0, Math.min(frame.width - 1, (x + 0.5) / scale - 0.5));
                            const centerY = Math.max(0, Math.min(frame.height - 1, (y + 0.5) / scale - 0.5));
                            const x0 = Math.floor(centerX);
                            const y0 = Math.floor(centerY);
                            const x1 = Math.min(frame.width - 1, x0 + 1);
                            const y1 = Math.min(frame.height - 1, y0 + 1);
                            const neighbours = [
                                colours[(y0 * frame.width + x0) * 3 + channel] ?? 0,
                                colours[(y0 * frame.width + x1) * 3 + channel] ?? 0,
                                colours[(y1 * frame.width + x0) * 3 + channel] ?? 0,
                                colours[(y1 * frame.width + x1) * 3 + channel] ?? 0,
                            ];
                            value = Math.max(Math.min(...neighbours) - 3, Math.min(Math.max(...neighbours) + 3, value));
                        }
                        target[targetIndex + channel] = clampByte(value);
                    }
                    if (frame.channels === 4)
                        target[targetIndex + 3] = clampByte(alpha);
                }
            }
        }
        const elapsedMs = performance.now() - start;
        this.lastMetrics = {
            scale, tileCount: tiles.length,
            largestTileBytes: Math.min(this.tileSize, outputWidth) *
                Math.min(this.tileSize, outputHeight) * frame.channels,
            preview, faceDetailEnabled: enabled, elapsedMs,
            targetMs: preview ? 100 : 2000, withinTarget: elapsedMs <= (preview ? 100 : 2000),
        };
        return { width: outputWidth, height: outputHeight, channels: frame.channels, pixels: target };
    }
}
