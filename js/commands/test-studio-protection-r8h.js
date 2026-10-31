/** Synthetic checks of final-byte Studio protection, masks, and cache parity.
 * Author: John Khan.
 */
import { PhotoRegions } from './regions.js';
import { CpuStudioQuality } from './studio-quality.js';
import { protectStudioPixel, studioPixelLightness } from './studio-protection.js';
import { ProRenderError, unchanged } from './runtime.js';
function assert(condition, message) {
    if (!condition)
        throw new Error(`Studio safety: ${message}`);
}
function swatches() {
    return [
        [20, 10, 8], [35, 22, 14], [52, 36, 29], [68, 49, 39],
        [88, 63, 50], [112, 80, 65], [145, 111, 91],
        [179, 144, 122], [215, 180, 158], [243, 212, 193],
    ];
}
function sample(width = 43, height = 47) {
    const channels = 4;
    const pixels = new Uint8Array(width * height * channels);
    const colours = swatches();
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const place = (y * width + x) * channels;
            const colour = colours[(x + y) % colours.length];
            pixels[place] = colour[0];
            pixels[place + 1] = colour[1];
            pixels[place + 2] = colour[2];
            pixels[place + 3] = (x + y * 13) % 256;
        }
    }
    return { width, height, channels, pixels };
}
function masks(frame) {
    const skin = new Uint8Array(frame.width * frame.height);
    const protectedPixels = new Uint8Array(frame.width * frame.height);
    for (let y = 3; y < frame.height - 3; y++) {
        for (let x = 4; x < frame.width - 4; x++) {
            skin[y * frame.width + x] = x === 4 ? 1 : 255;
        }
    }
    for (let y = 10; y < 16; y++) {
        for (let x = 13; x < 19; x++)
            protectedPixels[y * frame.width + x] = 255;
    }
    const regions = new PhotoRegions();
    regions.open(frame, () => ({ width: frame.width, height: frame.height,
        evidence: 'synthetic_test', skin, protected: protectedPixels }));
    return { regions, protectedPixels };
}
function reject(action, code) {
    try {
        action();
    }
    catch (error) {
        assert(error instanceof ProRenderError && error.code === code, `expected ${code}`);
        return;
    }
    throw new Error(`Missing refusal ${code}`);
}
export function testStudioProtectionR8H() {
    let count = 0;
    for (const colour of swatches()) {
        const brighter = protectStudioPixel(colour, [255, 255, 255], 1);
        assert(brighter.adjusted, 'brightening needs restraint');
        assert(brighter.liftL >= 0 && brighter.liftL <= 2.5 + 1e-8, 'actual byte output within L* cap');
        const difference = studioPixelLightness(brighter.rgb) - studioPixelLightness(colour);
        assert(difference <= 2.5 + 1e-8, 'lightness verified after rounding');
        count += 3;
    }
    for (const amount of [0.001, 0.015, 0.1, 0.5, 1]) {
        const original = [23, 23, 23];
        const bright = [255, 255, 255];
        const result = protectStudioPixel(original, bright, amount);
        assert(result.measured && result.adjusted && result.liftL <= 2.5, 'fractional mask edges protected');
        count++;
    }
    const unchangedPixel = protectStudioPixel([20, 20, 20], [255, 255, 255], 0);
    assert(!unchangedPixel.measured && unchangedPixel.rgb[0] === 255, 'missing skin mask is not fabricated');
    count++;
    const darker = protectStudioPixel([140, 140, 140], [70, 70, 70], 1);
    assert(darker.measured && !darker.adjusted && darker.liftL === 0, 'darkening never triggers normalization');
    count++;
    for (const invalid of [0, -0.2, 5.1, NaN, Infinity]) {
        reject(() => protectStudioPixel([20, 20, 20], [220, 220, 220], 1, invalid), 'invalid_studio');
        count++;
    }
    for (const invalid of [-1, 1.001, NaN, Infinity]) {
        reject(() => protectStudioPixel([20, 20, 20], [220, 220, 220], invalid), 'invalid_studio');
        count++;
    }
    const source = sample();
    const original = new Uint8Array(source.pixels);
    const values = masks(source);
    const engine = new CpuStudioQuality(values.regions);
    const noop = engine.render(source, 10, true);
    assert(unchanged(noop, source), '1.0 is an exact no-op');
    count++;
    for (const level of [11, 20, 30, 40, 50]) {
        const preview = engine.render(source, level, true);
        const output = engine.render(source, level, false);
        assert(unchanged(preview, output), 'preview/export parity');
        assert(engine.lastMetrics?.maximumSkinLiftL !== undefined &&
            (engine.lastMetrics?.maximumSkinLiftL ?? 99) <= 2.5 + 1e-8, 'measured output cap');
        for (let i = 0; i < original.length; i += 4) {
            const pixel = i / 4;
            assert(output.pixels[i + 3] === original[i + 3], 'alpha unchanged');
            if (values.protectedPixels[pixel] === 255) {
                assert(output.pixels[i] === original[i] &&
                    output.pixels[i + 1] === original[i + 1] &&
                    output.pixels[i + 2] === original[i + 2], 'protected pixels unchanged');
            }
        }
        count += 3;
    }
    assert(source.pixels.every((value, i) => value === original[i]), 'source bytes immutable');
    count++;
    return count;
}
