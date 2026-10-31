/** BELJOUR source-only Pro Commands regression checks on generated pixels.
 * Covers neutral reference, Studio light and fractional face-mask pose guards.
 * Author: John Khan.
 */
import { referenceNeutralResize } from './neutral-reference.js';
import { resizeNeutralTiled } from './neutral-resize.js';
import { CpuPoseOnly } from './pose-only.js';
import { PhotoRegions } from './regions.js';
import { ProRenderError } from './runtime.js';
import { CpuStudioQuality, STUDIO_LIGHT_REFERENCE } from './studio-quality.js';
import { protectStudioPixel } from './studio-protection.js';
function check(condition, description) {
    if (!condition)
        throw new Error(`Pro improvement: ${description}`);
}
function same(a, b) {
    return a.width === b.width && a.height === b.height && a.channels === b.channels &&
        a.pixels.every((value, index) => value === b.pixels[index]);
}
function generated(width, height, channels, uniform = false) {
    const pixels = new Uint8Array(width * height * channels);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * channels;
            pixels[i] = uniform ? 127 : (x * 13 + y * 19 + 23) % 256;
            pixels[i + 1] = uniform ? 149 : (x * 31 + y * 11 + 29) % 256;
            pixels[i + 2] = uniform ? 167 : (x * 7 + y * 37 + 41) % 256;
            if (channels === 4)
                pixels[i + 3] = uniform ? 71 : (x * 9 + y * 3 + 17) % 256;
        }
    }
    return { width, height, channels, pixels };
}
function annotatedPose(source) {
    const face = new Uint8Array(source.width * source.height);
    const body = new Uint8Array(face.length);
    for (let y = 5; y < 24; y++) {
        for (let x = 15; x < 49; x++)
            face[y * source.width + x] = y >= 19 ? 1 : 255;
    }
    for (let y = 18; y < source.height - 4; y++) {
        for (let x = 6; x < source.width - 6; x++)
            body[y * source.width + x] = 255;
    }
    const regions = new PhotoRegions();
    regions.open(source, () => ({ width: source.width, height: source.height,
        evidence: 'synthetic_test', protected: face, skin: face }));
    const pose = {
        width: source.width, height: source.height, personMask: body,
        evidence: 'synthetic_test', handles: [
            { label: 'left', x: 0.27, y: 0.39, dx: -0.03, dy: 0.005 },
            { label: 'right', x: 0.73, y: 0.39, dx: 0.03, dy: 0.005 },
            { label: 'waist', x: 0.51, y: 0.72, dx: 0, dy: -0.02 },
        ],
    };
    return { face, regions, pose };
}
function assertRefuses(action, code) {
    try {
        action();
    }
    catch (error) {
        check(error instanceof ProRenderError && error.code === code, `expected ${code}`);
        return;
    }
    throw new Error(`Expected refusal ${code}`);
}
export function testProImprovementH() {
    let checks = 0;
    for (const channels of [3, 4]) {
        for (const [width, height] of [[1, 1], [1, 37], [39, 1], [24, 19], [63, 61]]) {
            if (width === undefined || height === undefined)
                continue;
            for (const uniform of [false, true]) {
                const image = generated(width, height, channels, uniform);
                const input = new Uint8Array(image.pixels);
                for (const scale of [2, 4]) {
                    const expected = referenceNeutralResize(image, scale);
                    for (const tile of [16, 19, 32, 64]) {
                        const observed = resizeNeutralTiled(image, scale, tile);
                        check(same(observed.image, expected), 'byte-exact reference at all tile sizes');
                        check(observed.tiles > 0, 'tile accounting');
                        check(uniform ? observed.estimatedPeakTileBytes === 0 :
                            observed.estimatedPeakTileBytes >= 0, 'uniform fast path bounded');
                        checks += 3;
                    }
                }
                check(image.pixels.every((value, i) => value === input[i]), 'no source mutation');
                checks++;
            }
        }
    }
    const nearly = generated(45, 48, 4, true);
    nearly.pixels[1111] = (nearly.pixels[1111] ?? 0) ^ 31;
    for (const scale of [2, 4]) {
        const expected = referenceNeutralResize(nearly, scale);
        const actual = resizeNeutralTiled(nearly, scale, 17);
        check(actual.estimatedPeakTileBytes > 0, 'hidden differing pixel forbids fast path');
        check(same(actual.image, expected), 'nearly uniform still byte exact');
        checks += 2;
    }
    const aborted = new AbortController();
    aborted.abort();
    assertRefuses(() => resizeNeutralTiled(generated(10, 10, 4, true), 2, 16, aborted.signal), 'stale_preview');
    checks++;
    check(STUDIO_LIGHT_REFERENCE ===
        'STUDIO light: cover lighting; soft key; gentle sculpting; texture preserved; colour true.', 'editorial Studio light definition unchanged');
    checks++;
    const checked = annotatedPose(generated(63, 72, 4));
    const original = generated(63, 72, 4);
    const studio = new CpuStudioQuality(checked.regions);
    check(same(studio.render(original, 10, true), original), 'neutral Studio bytes unchanged');
    checks++;
    const studioResult = studio.render(original, 50, false);
    for (let pixel = 0; pixel < checked.face.length; pixel++) {
        if ((checked.face[pixel] ?? 0) === 0)
            continue;
        for (let channel = 0; channel < 4; channel++) {
            check(studioResult.pixels[pixel * 4 + channel] === original.pixels[pixel * 4 + channel], 'Studio preserves positive annotated mask including antialiased rim');
        }
    }
    checks++;
    const limit = protectStudioPixel([30, 31, 32], [200, 203, 208], 1);
    check(limit.liftL <= 2.5 + 1e-8, 'rounded Studio protection remains bounded');
    checks++;
    const pose = new CpuPoseOnly(checked.regions, 16);
    pose.openPhoto(original, checked.pose);
    for (const level of [10, 11, 20, 30, 40, 50]) {
        const preview = pose.render(original, level, true);
        const exported = pose.render(original, level, false);
        check(same(preview, exported), 'pose preview and export agree');
        check(pose.lastMetrics?.alphaUnchanged === true, 'pose alpha preserved');
        for (let pixel = 0; pixel < checked.face.length; pixel++) {
            if ((checked.face[pixel] ?? 0) === 0)
                continue;
            for (let c = 0; c < 4; c++) {
                check(exported.pixels[pixel * 4 + c] === original.pixels[pixel * 4 + c], 'every positive face pixel pinned');
            }
        }
        checks += 3;
    }
    const replacement = generated(64, 72, 4);
    assertRefuses(() => pose.render(replacement, 50, false), 'pose_image_changed');
    checks++;
    return checks;
}
