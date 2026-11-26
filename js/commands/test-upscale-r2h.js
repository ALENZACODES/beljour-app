/** Synthetic browser tests for full-scale output, tiles and transparency.
 * Author: John Khan.
 */
import { CpuUpscale, planUpscaleTiles } from './cpu-upscale.js';
import { PhotoRegions } from './regions.js';
import { ProRenderError } from './runtime.js';
function assert(value, context) {
    if (!value)
        throw new Error(`Upscale regression: ${context}`);
}
function image(size = 23, channels = 4) {
    const pixels = new Uint8Array(size * size * channels);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const pos = (y * size + x) * channels;
            pixels[pos] = (40 + x * 9 + y * 3) % 255;
            pixels[pos + 1] = (50 + x * 5 + y * 7) % 255;
            pixels[pos + 2] = (80 + y * 9 + x) % 255;
            if (channels === 4)
                pixels[pos + 3] = (x * 11 + y * 17) % 255;
        }
    }
    return { width: size, height: size, channels, pixels };
}
function mustFail(code, effect) {
    try {
        effect();
    }
    catch (error) {
        assert(error instanceof ProRenderError && error.code === code, code);
        return;
    }
    throw new Error(`Expected ${code}`);
}
function alphaAt(original, outputX, outputY, scale) {
    const x = Math.max(0, Math.min(original.width - 1, (outputX + 0.5) / scale - 0.5));
    const y = Math.max(0, Math.min(original.height - 1, (outputY + 0.5) / scale - 0.5));
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = Math.min(original.width - 1, x0 + 1);
    const y1 = Math.min(original.height - 1, y0 + 1);
    const wx = x - x0;
    const wy = y - y0;
    const sample = (a, b) => original.pixels[(b * original.width + a) * 4 + 3] ?? 0;
    const upper = sample(x0, y0) * (1 - wx) + sample(x1, y0) * wx;
    const lower = sample(x0, y1) * (1 - wx) + sample(x1, y1) * wx;
    return Math.floor(upper * (1 - wy) + lower * wy + 0.5);
}
export function testUpscaleR2H() {
    let count = 0;
    for (const scale of [2, 4]) {
        const source = image();
        const pixels = new Uint8Array(source.pixels);
        const ordinary = new CpuUpscale(null, 64).render(source, scale, 30, false);
        const divided = new CpuUpscale(null, 16).render(source, scale, 30, false);
        assert(ordinary.width === source.width * scale && ordinary.height === source.height * scale, 'true scale');
        assert(ordinary.pixels.every((value, position) => value === divided.pixels[position]), 'seam-free tiles');
        assert(source.pixels.every((value, position) => value === pixels[position]), 'input immutable');
        count += 3;
        for (let y = 0; y < ordinary.height; y++) {
            for (let x = 0; x < ordinary.width; x++) {
                const actual = ordinary.pixels[(y * ordinary.width + x) * 4 + 3];
                assert(actual === alphaAt(source, x, y, scale), 'alpha matches reference alignment');
            }
        }
        count++;
        const reports = new CpuUpscale(null, 16);
        reports.render(source, scale, 30, true);
        assert(reports.lastMetrics !== null && reports.lastMetrics.tileCount > 1, 'tile report');
        assert(reports.lastMetrics !== null && reports.lastMetrics.elapsedMs >= 0, 'timing report');
        count += 2;
    }
    const constant = {
        width: 13, height: 13, channels: 4,
        pixels: new Uint8Array(13 * 13 * 4),
    };
    for (let i = 0; i < 13 * 13; i++) {
        constant.pixels.set([80, 90, 120, 255], i * 4);
    }
    const flat = new CpuUpscale().render(constant, 4, 30, false);
    for (let i = 0; i < flat.pixels.length; i += 4) {
        assert(Math.abs((flat.pixels[i] ?? 0) - 80) <= 1, 'constant red');
        assert(Math.abs((flat.pixels[i + 1] ?? 0) - 90) <= 1, 'constant green');
        assert(Math.abs((flat.pixels[i + 2] ?? 0) - 120) <= 1, 'constant blue');
        assert(flat.pixels[i + 3] === 255, 'opaque alpha');
    }
    count++;
    const regions = new PhotoRegions();
    const selected = image(24, 3);
    const eye = new Uint8Array(24 * 24);
    eye.fill(255, 10 * 24 + 8, 15 * 24 + 18);
    const evidence = { width: 24, height: 24,
        evidence: 'user_checked', eyes: eye };
    regions.open(selected, () => evidence);
    const detail = new CpuUpscale(regions).render(selected, 2, 50, false);
    const baseline = new CpuUpscale().render(selected, 2, 50, false);
    assert(detail.pixels.some((value, index) => value !== baseline.pixels[index]), 'eye detail from checked mask');
    count++;
    const fullMask = new Uint8Array(24 * 24).fill(255);
    regions.open(image(24, 3), () => ({ ...evidence, protected: fullMask }));
    const masked = new CpuUpscale(regions).render(selected, 2, 50, false);
    assert(masked.width === detail.width, 'protected output valid');
    count++;
    const transparent = { width: 16, height: 16, channels: 4,
        pixels: new Uint8Array(16 * 16 * 4) };
    transparent.pixels.set([255, 0, 0, 0], 0);
    const transparentOutput = new CpuUpscale().render(transparent, 2, 30, false);
    assert(transparentOutput.pixels[0] === 0 && transparentOutput.pixels[3] === 0, 'transparent RGB cannot bleed');
    count++;
    mustFail('invalid_scale', () => new CpuUpscale().render(image(), 3, 30, true));
    mustFail('invalid_scale', () => new CpuUpscale().render(image(), 2, 51, true));
    mustFail('invalid_tiles', () => planUpscaleTiles(16, 16, 0));
    count += 3;
    const abort = new AbortController();
    abort.abort();
    mustFail('stale_preview', () => new CpuUpscale().render(image(), 2, 30, true, abort.signal));
    count++;
    const planned = planUpscaleTiles(85, 53, 24);
    assert(planned.reduce((total, tile) => total + (tile.x1 - tile.x0) * (tile.y1 - tile.y0), 0) === 85 * 53, 'full coverage without overlap');
    count++;
    return count;
}
//# sourceMappingURL=test-upscale-r2h.js.map