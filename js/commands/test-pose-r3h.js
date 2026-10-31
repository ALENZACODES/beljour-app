/** Browser checked pose and tile-boundary regressions on drawn byte arrays.
 * Author: John Khan.
 */
import { CpuPoseOnly } from './pose-only.js';
import { PhotoRegions } from './regions.js';
import { ProRenderError, unchanged } from './runtime.js';
function assert(condition, message) {
    if (!condition)
        throw new Error(`Pose check: ${message}`);
}
function picture(width = 63, height = 65, rgba = true) {
    const channels = rgba ? 4 : 3;
    const pixels = new Uint8Array(width * height * channels);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * channels;
            pixels[i] = (x * 13 + y * 3 + 24) % 190;
            pixels[i + 1] = (x * 2 + y * 11 + 34) % 200;
            pixels[i + 2] = (x * 3 + y * 5 + 52) % 215;
            if (rgba)
                pixels[i + 3] = (x + y) % 256;
        }
    }
    return { width, height, channels, pixels };
}
function evidence(frame) {
    const personMask = new Uint8Array(frame.width * frame.height);
    for (let y = 12; y < frame.height - 5; y++) {
        for (let x = 9; x < frame.width - 9; x++)
            personMask[y * frame.width + x] = 255;
    }
    const handles = [
        { label: 'left', x: 0.26, y: 0.35, dx: -0.034, dy: 0.002 },
        { label: 'right', x: 0.74, y: 0.35, dx: 0.034, dy: 0.002 },
        { label: 'waist', x: 0.50, y: 0.74, dx: 0, dy: -0.024 },
    ];
    return { width: frame.width, height: frame.height, personMask,
        handles, evidence: 'synthetic_test' };
}
function protectedMask(frame) {
    const result = new PhotoRegions();
    const mask = new Uint8Array(frame.width * frame.height);
    for (let y = 19; y < 31; y++) {
        for (let x = 20; x < 39; x++)
            mask[y * frame.width + x] = 255;
    }
    result.open(frame, () => ({ width: frame.width, height: frame.height,
        evidence: 'synthetic_test', protected: mask }));
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
export function testPoseR3H() {
    let count = 0;
    const source = picture();
    const initial = new Uint8Array(source.pixels);
    const evidenceValue = evidence(source);
    const masks = protectedMask(source);
    const engine = new CpuPoseOnly(masks);
    const missing = new CpuPoseOnly();
    expectError(() => missing.render(source, 50, false), 'pose_evidence_missing');
    count++;
    const unchanged1 = missing.render(source, 10, false);
    assert(unchanged(unchanged1, source), '1.0 no-op with no controls');
    count++;
    engine.openPhoto(source, evidenceValue);
    const rendered = engine.render(source, 50, false);
    assert(!unchanged(rendered, source), 'pose must change body');
    count++;
    assert(source.pixels.every((value, i) => value === initial[i]), 'original source immutable');
    count++;
    for (let y = 0; y < 12; y++) {
        for (let x = 0; x < source.width; x++) {
            const i = (y * source.width + x) * 4;
            for (let channel = 0; channel < 4; channel++) {
                assert(rendered.pixels[i + channel] === source.pixels[i + channel], 'outside person unchanged');
            }
        }
    }
    count++;
    for (let y = 19; y < 31; y++) {
        for (let x = 20; x < 39; x++) {
            const i = (y * source.width + x) * 4;
            for (let channel = 0; channel < 4; channel++) {
                assert(rendered.pixels[i + channel] === source.pixels[i + channel], 'protected unchanged');
            }
        }
    }
    count++;
    const other = new CpuPoseOnly(masks, 16);
    other.openPhoto(source, evidenceValue);
    const alternate = other.render(source, 50, false);
    assert(unchanged(alternate, rendered), 'tile-size independence');
    count++;
    let largest = -1;
    for (let level = 10; level <= 50; level++) {
        const output = engine.render(source, level, true);
        const distance = engine.lastMetrics?.largestDisplacementPx ?? -1;
        assert(distance + 1e-8 >= largest, 'monotonic displacement');
        assert(output.channels === 4 && output.width === source.width, 'pose dimensions');
        largest = distance;
        count++;
    }
    assert(largest > 0 && largest < 0.06 * source.width, 'bounded amount');
    count++;
    const preview = engine.render(source, 32, true);
    const exportResult = engine.render(source, 32, false);
    assert(unchanged(preview, exportResult), 'preview matches export');
    count++;
    expectError(() => engine.render(picture(20, 20), 50, true), 'pose_image_changed');
    count++;
    engine.closePhoto();
    expectError(() => engine.render(source, 50, true), 'pose_evidence_missing');
    count++;
    expectError(() => new CpuPoseOnly(null, 1), 'invalid_tiles');
    count++;
    const invalid = { ...evidenceValue, handles: [
            { label: 'bad', x: 0.3, y: 0.4, dx: 0.1, dy: 0 },
            { label: 'ok', x: 0.4, y: 0.5, dx: 0, dy: 0 },
        ] };
    expectError(() => engine.openPhoto(source, invalid), 'invalid_pose');
    count++;
    const aborted = new AbortController();
    aborted.abort();
    engine.openPhoto(source, evidenceValue);
    expectError(() => engine.render(source, 50, true, aborted.signal), 'stale_preview');
    count++;
    return count;
}
