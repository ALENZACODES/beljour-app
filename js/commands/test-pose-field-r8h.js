/** Synthetic bounded-cache, geometry and preview regressions for pose fields.
 * Author: John Khan.
 */
import { CpuPoseOnly } from './pose-only.js';
import { MAX_PREPARED_POSE_PIXELS, preparePoseField, preparedPosePixel } from './pose-field.js';
import { ProRenderError, unchanged } from './runtime.js';
function assert(value, reason) {
    if (!value)
        throw new Error(`Pose field: ${reason}`);
}
function scene(width, height) {
    const pixels = new Uint8Array(width * height * 4);
    const mask = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const index = y * width + x;
            pixels[4 * index] = (x * 7 + y * 11 + 21) % 255;
            pixels[4 * index + 1] = (x * 3 + y * 5 + 32) % 255;
            pixels[4 * index + 2] = (x * 13 + y * 9 + 44) % 255;
            pixels[4 * index + 3] = (x + y) % 256;
            if (y >= Math.floor(height / 5) && y < height - 4 &&
                x >= 6 && x < width - 6)
                mask[index] = 255;
        }
    }
    return { image: { width, height, channels: 4, pixels },
        pose: { width, height, personMask: mask, evidence: 'synthetic_test', handles: [
                { label: 'left', x: 0.3, y: 0.35, dx: -0.028, dy: 0.003 },
                { label: 'right', x: 0.7, y: 0.35, dx: 0.028, dy: 0.003 },
                { label: 'waist', x: 0.5, y: 0.70, dx: 0, dy: -0.020 },
            ] } };
}
function rejects(action, expected) {
    try {
        action();
    }
    catch (error) {
        assert(error instanceof ProRenderError && error.code === expected, `expected ${expected}`);
        return;
    }
    throw new Error(`Expected ${expected}`);
}
export function testPoseFieldR8H() {
    let checks = 0;
    const sceneOne = scene(80, 85);
    const precomputed = preparePoseField(sceneOne.pose);
    assert(precomputed !== null, 'small checked photo gets cache');
    checks++;
    if (precomputed === null)
        return checks;
    assert(precomputed.retainedBytes === 80 * 85 * 16, 'two float64 displacement planes counted');
    checks++;
    for (const x of [0, 16, 36, 79]) {
        for (const y of [0, 20, 50, 84]) {
            const [dx, dy] = preparedPosePixel(precomputed, x, y, 0.5);
            const [fx, fy] = preparedPosePixel(precomputed, x, y, 1);
            assert(Math.abs(dx * 2 - fx) < 1e-12 &&
                Math.abs(dy * 2 - fy) < 1e-12, 'field strength linearity');
            checks++;
        }
    }
    for (const invalid of [-1, 0, MAX_PREPARED_POSE_PIXELS + 1, 4.5]) {
        rejects(() => preparePoseField(sceneOne.pose, invalid), 'invalid_pose_field');
        checks++;
    }
    rejects(() => preparedPosePixel(precomputed, 90, 0, 0.5), 'invalid_pose_field');
    checks++;
    rejects(() => preparedPosePixel(precomputed, 10, 10, NaN), 'invalid_pose_field');
    checks++;
    const large = scene(513, 512);
    assert(preparePoseField(large.pose) === null, 'large export avoids prepared buffers');
    checks++;
    const engine = new CpuPoseOnly(null, 32);
    engine.openPhoto(sceneOne.image, sceneOne.pose);
    let coldPreview = null;
    let warmPreview = null;
    const timings = [];
    for (const level of [20, 21, 26, 31, 41, 50]) {
        const before = performance.now();
        const result = engine.render(sceneOne.image, level, true);
        timings.push(performance.now() - before);
        if (level === 20) {
            coldPreview = result;
            assert(engine.lastMetrics?.fieldCacheHit === false, 'first render is cold');
        }
        else {
            warmPreview = result;
            assert(engine.lastMetrics?.fieldCacheHit === true, 'subsequent level reuses field');
        }
        checks++;
    }
    assert(coldPreview !== null && warmPreview !== null &&
        !unchanged(coldPreview, warmPreview), 'different requested poses are rendered');
    checks++;
    assert(timings.every((value) => Number.isFinite(value) && value >= 0), 'timings are measured, not fabricated');
    checks++;
    const exactPreview = engine.render(sceneOne.image, 43, true);
    const exactExport = engine.render(sceneOne.image, 43, false);
    assert(unchanged(exactPreview, exactExport), 'cached preview matches export');
    checks++;
    engine.closePhoto();
    rejects(() => engine.render(sceneOne.image, 50, false), 'pose_evidence_missing');
    checks++;
    const next = scene(90, 96);
    engine.openPhoto(next.image, next.pose);
    engine.render(next.image, 43, true);
    assert(engine.lastMetrics?.fieldCacheHit === false, 'new photograph invalidates prior cached pose');
    checks++;
    return checks;
}
//# sourceMappingURL=test-pose-field-r8h.js.map