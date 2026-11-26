/** Synthetic browser tests for cleanup and reuse of user-checked face masks.
 * Author: John Khan.
 */
import { CpuCleanup, validateSpots } from './cpu-cleanup.js';
import { PhotoRegions } from './regions.js';
import { ProRenderError } from './runtime.js';
function check(value, description) {
    if (!value)
        throw new Error(`Cleanup regression: ${description}`);
}
function synthetic(size = 24, channels = 4) {
    const pixels = new Uint8Array(size * size * channels);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const offset = (y * size + x) * channels;
            pixels[offset] = (80 + x + y * 3) % 256;
            pixels[offset + 1] = (100 + x * 2 + y) % 256;
            pixels[offset + 2] = (120 + x + y) % 256;
            if (channels === 4)
                pixels[offset + 3] = x % 2 ? 128 : 255;
        }
    }
    return { width: size, height: size, channels, pixels };
}
function expectFailure(code, action) {
    try {
        action();
    }
    catch (error) {
        check(error instanceof ProRenderError && error.code === code, `error ${code}`);
        return;
    }
    throw new Error(`Missing expected error ${code}`);
}
export function testCleanupR2H() {
    let tests = 0;
    const source = synthetic(24);
    const original = new Uint8Array(source.pixels);
    const processor = new CpuCleanup();
    for (let level = 10; level <= 50; level += 5) {
        const result = processor.render(source, level, true);
        check(result.width === 24 && result.height === 24, 'same image dimensions');
        check(result.channels === source.channels, 'same channel format');
        for (let index = 3; index < result.pixels.length; index += 4) {
            check(result.pixels[index] === original[index], 'alpha unchanged');
        }
        tests++;
    }
    check(source.pixels.every((value, index) => value === original[index]), 'immutable original');
    tests++;
    const regions = new PhotoRegions();
    const protectedMask = new Uint8Array(24 * 24);
    protectedMask.fill(255, 4 * 24 + 4, 6 * 24 + 12);
    const supplied = {
        width: 24, height: 24, evidence: 'user_checked',
        protected: protectedMask,
    };
    let reads = 0;
    regions.open(source, () => {
        reads++;
        return supplied;
    });
    const cleaned = new CpuCleanup(regions).render(source, 50, true);
    for (let index = 4 * 24 + 4; index < 6 * 24 + 12; index++) {
        const offset = index * 4;
        check(cleaned.pixels[offset] === original[offset], 'protected red');
        check(cleaned.pixels[offset + 1] === original[offset + 1], 'protected green');
        check(cleaned.pixels[offset + 2] === original[offset + 2], 'protected blue');
    }
    tests++;
    const firstMask = regions.mask('protected', 48, 48);
    check(firstMask !== null && firstMask.length === 48 * 48, 'mask upsampling');
    const secondMask = regions.mask('protected', 48, 48);
    check(regions.stats.hits > 0 && firstMask?.[8] === secondMask?.[8], 'cached mask reuse with defensive copies');
    tests++;
    regions.open(source, () => {
        reads++;
        return supplied;
    });
    check(reads === 1 && regions.stats.hits >= 1, 'same photo no recompute');
    tests++;
    const changed = synthetic(24);
    changed.pixels[0] = 2;
    regions.open(changed, () => {
        reads++;
        return supplied;
    });
    check(reads === 2, 'new image invalidates reading');
    regions.close();
    check(regions.stats.retainedBytes === 0, 'photo close discards masks');
    tests += 2;
    const dust = synthetic(24, 3);
    dust.pixels[(12 * 24 + 12) * 3] = 255;
    dust.pixels[(12 * 24 + 12) * 3 + 1] = 255;
    dust.pixels[(12 * 24 + 12) * 3 + 2] = 255;
    const fixed = processor.render(dust, 50, false);
    check((fixed.pixels[(12 * 24 + 12) * 3] ?? 255) < 255, 'dust softened');
    tests++;
    const flat = new Uint8Array(24 * 24 * 3).fill(98);
    const flatFrame = { width: 24, height: 24, channels: 3, pixels: flat };
    check(processor.render(flatFrame, 50, false).pixels.every((value) => value === 98), 'flat preserved');
    tests++;
    expectFailure('invalid_level', () => processor.render(source, 51, true));
    expectFailure('invalid_level', () => processor.render(source, 2.25, true));
    tests += 2;
    expectFailure('invalid_spots', () => validateSpots([{ x: 2, y: 0.3, radius: 0.05 }]));
    tests++;
    const spotted = new CpuCleanup(null, [{ x: 0.5, y: 0.5, radius: 0.05 }]);
    const repaired = spotted.render(dust, 40, true);
    check(repaired.width === dust.width, 'spot edit is local');
    tests++;
    const controller = new AbortController();
    controller.abort();
    expectFailure('stale_preview', () => processor.render(source, 30, true, controller.signal));
    tests++;
    check(processor.lastMetrics !== null && processor.lastMetrics.elapsedMs >= 0, 'measured CPU time');
    tests++;
    return tests;
}
//# sourceMappingURL=test-cleanup-r2h.js.map