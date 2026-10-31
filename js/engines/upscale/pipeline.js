/** Bounded-memory browser upscale pipeline for R17B. Author: John Khan. */
import { upscale } from "./index.js";
function bounded(value, low, high, name) {
    if (!Number.isFinite(value) || value < low || value > high) {
        throw new RangeError(`${name} outside range`);
    }
    return value;
}
export function planTiles(width, height, tileSide = 512, overlap = 12) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
        throw new RangeError("image dimensions must be positive integers");
    }
    if (!Number.isInteger(tileSide) || tileSide < 64 || tileSide > 4096) {
        throw new RangeError("tileSide outside range");
    }
    if (!Number.isInteger(overlap) || overlap < 2 || overlap * 2 >= tileSide) {
        throw new RangeError("overlap outside range");
    }
    const tiles = [];
    for (let y0 = 0; y0 < height; y0 += tileSide) {
        const y1 = Math.min(height, y0 + tileSide);
        for (let x0 = 0; x0 < width; x0 += tileSide) {
            const x1 = Math.min(width, x0 + tileSide);
            tiles.push({
                x0,
                y0,
                x1,
                y1,
                readX0: Math.max(0, x0 - overlap),
                readY0: Math.max(0, y0 - overlap),
                readX1: Math.min(width, x1 + overlap),
                readY1: Math.min(height, y1 + overlap),
            });
        }
    }
    return tiles;
}
export function memoryBudget(tileSide, overlap, scale, channels = 4) {
    const side = tileSide + overlap * 2;
    const inputBytes = side * side * channels;
    const outputSide = side * scale;
    const outputBytes = outputSide * outputSide * channels;
    const workingBytesEstimate = outputSide * outputSide * 8 * 4;
    return {
        inputBytes,
        outputBytes,
        workingBytesEstimate,
        peakBytesEstimate: inputBytes + outputBytes + workingBytesEstimate,
    };
}
export function recommendedTileSide(width, height, scale, maxPeakMb = 96) {
    bounded(maxPeakMb, 16, 4096, "maxPeakMb");
    const limit = maxPeakMb * 1024 * 1024;
    const candidates = [1024, 768, 640, 512, 384, 256, 192, 128];
    for (const candidate of candidates) {
        if (candidate > Math.max(width, height) && candidate !== 128) {
            continue;
        }
        if (memoryBudget(candidate, 12, scale).peakBytesEstimate <= limit) {
            return candidate;
        }
    }
    return 128;
}
function crop(photo, x0, y0, x1, y1) {
    const width = x1 - x0;
    const height = y1 - y0;
    const data = new Uint8ClampedArray(width * height * photo.channels);
    for (let y = 0; y < height; y++) {
        const srcStart = ((y0 + y) * photo.width + x0) * photo.channels;
        const srcEnd = srcStart + width * photo.channels;
        data.set(photo.data.subarray(srcStart, srcEnd), y * width * photo.channels);
    }
    return { width, height, channels: photo.channels, data };
}
function pasteCore(destination, outputWidth, channels, rendered, tile, scale) {
    const top = (tile.y0 - tile.readY0) * scale;
    const left = (tile.x0 - tile.readX0) * scale;
    const coreWidth = (tile.x1 - tile.x0) * scale;
    const coreHeight = (tile.y1 - tile.y0) * scale;
    for (let y = 0; y < coreHeight; y++) {
        const sourceStart = ((top + y) * rendered.width + left) * channels;
        const sourceEnd = sourceStart + coreWidth * channels;
        const destinationStart = ((tile.y0 * scale + y) * outputWidth + tile.x0 * scale) * channels;
        destination.set(rendered.data.subarray(sourceStart, sourceEnd), destinationStart);
    }
}
export function upscaleTiled(photo, scale, detail = 0.55, tileSide = 512, overlap = 12) {
    bounded(detail, 0, 1, "detail");
    const width = photo.width * scale;
    const height = photo.height * scale;
    const data = new Uint8ClampedArray(width * height * photo.channels);
    for (const tile of planTiles(photo.width, photo.height, tileSide, overlap)) {
        const source = crop(photo, tile.readX0, tile.readY0, tile.readX1, tile.readY1);
        const rendered = upscale(source, scale, detail);
        pasteCore(data, width, photo.channels, rendered, tile, scale);
    }
    return { width, height, channels: photo.channels, data };
}
function isOpaque(photo) {
    if (photo.channels !== 4)
        return true;
    for (let i = 3; i < photo.data.length; i += 4) {
        if (photo.data[i] !== 255)
            return false;
    }
    return true;
}
function opaqueAlphaExact(photo) {
    if (photo.channels !== 4)
        return true;
    for (let i = 3; i < photo.data.length; i += 4) {
        if (photo.data[i] !== 255)
            return false;
    }
    return true;
}
export function runUpscale(photo, scale, detail = 0.55, tiledThresholdPixels = 1_200_000) {
    bounded(detail, 0, 1, "detail");
    const started = performance.now();
    const tiled = photo.width * photo.height > tiledThresholdPixels;
    const tileSide = tiled ? recommendedTileSide(photo.width, photo.height, scale) : null;
    const output = tiled
        ? upscaleTiled(photo, scale, detail, tileSide)
        : upscale(photo, scale, detail);
    const elapsedMs = Math.max(0, performance.now() - started);
    return {
        photo: output,
        report: {
            scale,
            detail,
            inputWidth: photo.width,
            inputHeight: photo.height,
            outputWidth: output.width,
            outputHeight: output.height,
            mode: tiled ? "tiled" : "full",
            tileSide,
            elapsedMs,
            opaqueAlphaExact: !isOpaque(photo) || opaqueAlphaExact(output),
            label: "classical edge-directed upscale; no neural weights",
        },
    };
}
