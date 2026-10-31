/** Neutral upscaler regression matrix, with independent scalar reference.
 * Every byte is generated in this test file. Author: John Khan.
 */
import { CpuUpscale } from './cpu-upscale.js';
import { referenceNeutralResize } from './neutral-reference.js';
import { resizeNeutralTiled } from './neutral-resize.js';
import { ProRenderError } from './runtime.js';
function ensure(condition, reason) {
    if (!condition)
        throw new Error(`Neutral upscale: ${reason}`);
}
function image(width, height, channels) {
    const bytes = new Uint8Array(width * height * channels);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const offset = (y * width + x) * channels;
            bytes[offset] = (x * 13 + y * 29 + 41) % 256;
            bytes[offset + 1] = (x * 41 + y * 11 + 17) % 256;
            bytes[offset + 2] = (x * 37 + y * 23 + 59) % 256;
            if (channels === 4)
                bytes[offset + 3] = (x * 7 + y * 31 + 83) % 256;
        }
    }
    if (channels === 4)
        bytes.set([255, 4, 250, 0], 0);
    return { width, height, channels, pixels: bytes };
}
function samePixels(a, b) {
    if (a.width !== b.width || a.height !== b.height || a.channels !== b.channels)
        return false;
    return a.pixels.every((byte, i) => byte === b.pixels[i]);
}
function refuses(callback, code) {
    try {
        callback();
    }
    catch (error) {
        ensure(error instanceof ProRenderError && error.code === code, code);
        return;
    }
    throw new Error(`Expected ${code}`);
}
export function testNeutralUpscaleR10H() {
    let checks = 0;
    for (const channels of [3, 4]) {
        for (const [width, height] of [[1, 1], [2, 5], [11, 9], [21, 19], [32, 28]]) {
            if (width === undefined || height === undefined)
                continue;
            const source = image(width, height, channels);
            const pristine = new Uint8Array(source.pixels);
            for (const scale of [2, 4]) {
                const reference = referenceNeutralResize(source, scale);
                for (const tileSize of [16, 17, 64, 192]) {
                    const neutral = resizeNeutralTiled(source, scale, tileSize);
                    const applied = new CpuUpscale(null, tileSize).render(source, scale, 10, false);
                    ensure(samePixels(neutral.image, reference), 'tiled result matches scalar reference');
                    ensure(samePixels(applied, reference), 'level 1.0 delegates to neutral reference');
                    ensure(neutral.tiles > 0 && neutral.estimatedPeakTileBytes <=
                        tileSize * tileSize * channels * 57, 'bounded neutral tile accounting');
                    checks += 3;
                }
            }
            ensure(source.pixels.every((byte, index) => byte === pristine[index]), 'source immutable');
            checks++;
        }
    }
    const source = image(22, 19, 4);
    const cubic = new CpuUpscale().render(source, 2, 40, false);
    ensure(!samePixels(cubic, referenceNeutralResize(source, 2)), 'higher-level cubic treatment remains distinct');
    checks++;
    const controller = new AbortController();
    controller.abort();
    refuses(() => resizeNeutralTiled(source, 2, 32, controller.signal), 'stale_preview');
    checks++;
    refuses(() => resizeNeutralTiled(source, 3, 32), 'invalid_scale');
    checks++;
    refuses(() => resizeNeutralTiled(source, 2, 0), 'invalid_scale');
    checks++;
    return checks;
}
