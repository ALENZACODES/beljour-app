/** Synthetic browser studio checks, no face images or model inference.
 * Author: John Khan.
 */
import { CpuStudioQuality, STUDIO_LIGHT_REFERENCE } from './studio-quality.js';
import { PhotoRegions } from './regions.js';
import { ProRenderError, unchanged } from './runtime.js';
function assert(condition, message) {
    if (!condition)
        throw new Error(`Studio check: ${message}`);
}
function frame(width = 39, height = 41, rgba = false) {
    const channels = rgba ? 4 : 3;
    const pixels = new Uint8Array(width * height * channels);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const offset = (y * width + x) * channels;
            pixels[offset] = (25 + x * 5 + y * 2) % 200;
            pixels[offset + 1] = (38 + x * 3 + y * 4) % 220;
            pixels[offset + 2] = (60 + x + y * 3) % 200;
            if (rgba)
                pixels[offset + 3] = (x * 11 + y * 9) % 255;
        }
    }
    return { width, height, channels, pixels };
}
function checked(frame) {
    const result = new PhotoRegions();
    const protectedPixels = new Uint8Array(frame.width * frame.height);
    const skin = new Uint8Array(protectedPixels);
    const eyes = new Uint8Array(protectedPixels);
    for (let y = 4; y < 18; y++) {
        for (let x = 7; x < 22; x++)
            protectedPixels[y * frame.width + x] = 255;
    }
    for (let y = 18; y < 33; y++) {
        for (let x = 4; x < 27; x++)
            skin[y * frame.width + x] = 255;
    }
    for (let y = 22; y < 24; y++) {
        for (let x = 12; x < 18; x++)
            eyes[y * frame.width + x] = 255;
    }
    result.open(frame, () => ({ width: frame.width, height: frame.height,
        evidence: 'synthetic_test', skin, protected: protectedPixels, eyes }));
    return result;
}
function expectError(action, code) {
    try {
        action();
    }
    catch (error) {
        assert(error instanceof ProRenderError && error.code === code, `expected ${code}`);
        return;
    }
    throw new Error(`Expected ${code}`);
}
export function testStudioR3H() {
    let count = 0;
    assert(STUDIO_LIGHT_REFERENCE ===
        'STUDIO light: cover lighting; soft key; gentle sculpting; texture preserved; colour true.', 'cover-lighting reference');
    count++;
    const image = frame(39, 41, true);
    const original = new Uint8Array(image.pixels);
    const regions = checked(image);
    const engine = new CpuStudioQuality(regions);
    const zero = engine.render(image, 10, true);
    assert(unchanged(zero, image), 'neutral 1.0');
    count++;
    const result = engine.render(image, 50, false);
    assert(result.width === image.width && result.height === image.height, 'shape');
    count++;
    assert(!unchanged(result, image), 'real correction');
    count++;
    assert(image.pixels.every((value, offset) => value === original[offset]), 'original unchanged');
    count++;
    for (let y = 4; y < 18; y++) {
        for (let x = 7; x < 22; x++) {
            const offset = (y * image.width + x) * 4;
            for (let channel = 0; channel < 4; channel++) {
                assert(result.pixels[offset + channel] === image.pixels[offset + channel], 'protected pixel');
            }
        }
    }
    count++;
    for (let index = 3; index < image.pixels.length; index += 4) {
        assert(result.pixels[index] === original[index], 'alpha byte');
    }
    count++;
    const previous = engine.render(image, 35, true);
    const later = engine.render(image, 35, false);
    assert(unchanged(previous, later), 'preview/export parity');
    count++;
    const tile16 = new CpuStudioQuality(regions, undefined, 16).render(image, 40, false);
    const tile96 = new CpuStudioQuality(regions, undefined, 96).render(image, 40, false);
    assert(unchanged(tile16, tile96), 'tile size parity');
    count++;
    for (let level = 10; level <= 50; level++) {
        const changed = engine.render(image, level, true);
        assert(changed.width === image.width && changed.channels === image.channels, `decimal level ${level}`);
        count++;
    }
    expectError(() => engine.render(image, 9, true), 'invalid_level');
    expectError(() => engine.render(image, 51, true), 'invalid_level');
    expectError(() => engine.render(image, 12.5, true), 'invalid_level');
    count += 3;
    const wrong = { exposureEv: 1.8, contrast: 0, warmth: 0,
        clarity: 0, highlightRecovery: 0 };
    expectError(() => new CpuStudioQuality(null, wrong), 'invalid_studio');
    count++;
    expectError(() => new CpuStudioQuality(null, undefined, 0), 'invalid_tiles');
    count++;
    const rgb = frame(48, 48);
    rgb.pixels.fill(28);
    const dark = new CpuStudioQuality();
    let previousMean = 0;
    for (let level = 10; level <= 50; level += 5) {
        const lit = dark.render(rgb, level, true);
        const mean = lit.pixels.reduce((sum, value) => sum + value, 0) / lit.pixels.length;
        assert(mean + 0.5 >= previousMean, 'monotonic dark enhancement');
        previousMean = mean;
        count++;
    }
    assert(engine.lastMetrics?.alphaUnchanged === true, 'last alpha stable');
    assert(regions.stats.reads === 1, 'mask read once');
    count += 2;
    const controller = new AbortController();
    controller.abort();
    expectError(() => engine.render(image, 40, true, controller.signal), 'stale_preview');
    count++;
    return count;
}
//# sourceMappingURL=test-studio-r3h.js.map