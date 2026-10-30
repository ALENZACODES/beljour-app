/** Ordered local stages for the HD/4K Quality Generator.
 * 1. Denoise: conservative flat-noise smoothing. Only pixels whose 3 x 3
 *    luminance range is small move toward their neighbourhood mean; edges and
 *    texture are left alone. It works on a temporary copy.
 * 2. Resize: the existing high-quality local resizer (Canvas, or CPU reference).
 * 3. Texture transport: the source's own spatial residual (luminance minus its
 *    blur) is resampled to the output and added, bounded, to luminance only.
 *    Texture comes from the photo; nothing is synthesised.
 * The identity check runs after these, in `quality-identity.ts`.
 * All amounts use the shared 1.0..5.0 scale. Author: John Khan.
 */
import { boxBlur } from "./quality-generator.js";
import { checkedRaster, lumaPlane } from "./quality-raster.js";
import { legacyAmount, validateLevel } from "../../pro/strength.js";
/** ASSUMED: a 3 x 3 luminance range at or below this many levels counts as flat. */
export const FLAT_RANGE = 6;
export const DENOISE_STRENGTH = 0.5;
/** ASSUMED texture bounds: gain at 5.0 and the largest change in levels. */
export const TEXTURE_GAIN = 0.9;
export const MAX_TEXTURE_DELTA = 20;
export function denoiseFlat(source, level) {
    checkedRaster(source);
    const strength = DENOISE_STRENGTH * legacyAmount(validateLevel(level));
    const { width, height, data } = source;
    const output = new Uint8ClampedArray(data);
    if (strength === 0)
        return { width, height, data: output };
    const luma = lumaPlane(source);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let low = Infinity, high = -Infinity;
            const sums = [0, 0, 0];
            let count = 0;
            for (let dy = -1; dy <= 1; dy++) {
                const row = Math.min(height - 1, Math.max(0, y + dy));
                for (let dx = -1; dx <= 1; dx++) {
                    const p = row * width + Math.min(width - 1, Math.max(0, x + dx));
                    low = Math.min(low, luma[p]);
                    high = Math.max(high, luma[p]);
                    for (let c = 0; c < 3; c++)
                        sums[c] += data[p * 4 + c];
                    count += 1;
                }
            }
            if (high - low > FLAT_RANGE)
                continue;
            const at = (y * width + x) * 4;
            for (let c = 0; c < 3; c++) {
                output[at + c] = Math.round(data[at + c] + (sums[c] / count - data[at + c]) * strength);
            }
        }
    }
    luma.fill(0);
    return { width, height, data: output };
}
export async function resizeStage(source, width, height, resizer) {
    const pixels = await resizer(source, width, height);
    if (!(pixels instanceof Uint8ClampedArray) || pixels.length !== width * height * 4) {
        throw new RangeError("The resizer returned an image of the wrong size");
    }
    return pixels;
}
/** Luminance minus its 3 x 3 blur, at source size. */
export function sourceResidual(source) {
    const luma = lumaPlane(source);
    const blurred = boxBlur(luma, source.width, source.height);
    for (let p = 0; p < luma.length; p++)
        luma[p] = luma[p] - blurred[p];
    blurred.fill(0);
    return luma;
}
/** Bilinear resample of a float plane, pixel-centre aligned. */
export function resamplePlane(plane, width, height, targetWidth, targetHeight) {
    const output = new Float32Array(targetWidth * targetHeight);
    for (let y = 0; y < targetHeight; y++) {
        const sy = Math.min(height - 1, Math.max(0, (y + 0.5) * height / targetHeight - 0.5));
        const y0 = Math.floor(sy), y1 = Math.min(height - 1, y0 + 1), fy = sy - y0;
        for (let x = 0; x < targetWidth; x++) {
            const sx = Math.min(width - 1, Math.max(0, (x + 0.5) * width / targetWidth - 0.5));
            const x0 = Math.floor(sx), x1 = Math.min(width - 1, x0 + 1), fx = sx - x0;
            const top = plane[y0 * width + x0] * (1 - fx) + plane[y0 * width + x1] * fx;
            const bottom = plane[y1 * width + x0] * (1 - fx) + plane[y1 * width + x1] * fx;
            output[y * targetWidth + x] = top * (1 - fy) + bottom * fy;
        }
    }
    return output;
}
export function transportTexture(resized, width, height, residual, level) {
    if (resized.length !== width * height * 4 || residual.length !== width * height) {
        throw new RangeError("Texture layers differ in size");
    }
    const gain = TEXTURE_GAIN * legacyAmount(validateLevel(level));
    const pixels = new Uint8ClampedArray(resized);
    let maxDelta = 0, chromaShift = 0;
    for (let p = 0; p < width * height; p++) {
        const delta = Math.round(Math.max(-MAX_TEXTURE_DELTA, Math.min(MAX_TEXTURE_DELTA, residual[p] * gain)));
        if (delta === 0)
            continue;
        let clipped = false;
        for (let c = 0; c < 3; c++) {
            const value = resized[p * 4 + c] + delta;
            if (value < 0 || value > 255)
                clipped = true;
            pixels[p * 4 + c] = value;
        }
        maxDelta = Math.max(maxDelta, Math.abs(delta));
        if (!clipped) {
            const before = [resized[p * 4] - resized[p * 4 + 1], resized[p * 4 + 2] - resized[p * 4 + 1]];
            const after = [pixels[p * 4] - pixels[p * 4 + 1], pixels[p * 4 + 2] - pixels[p * 4 + 1]];
            chromaShift = Math.max(chromaShift, Math.abs(after[0] - before[0]), Math.abs(after[1] - before[1]));
        }
    }
    return { pixels, maxDelta, chromaShift };
}
//# sourceMappingURL=quality-stages.js.map