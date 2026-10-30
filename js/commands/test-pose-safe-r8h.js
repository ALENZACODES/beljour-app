/** Generated-input checks for fold guard and deterministic pose rendering.
 * Author: John Khan.
 */
import { CpuPoseOnly } from './pose-only.js';
import { chooseSafePoseDose, poseJacobianExtrema, sampledPoseGrid, checkedPoseRules } from './pose-safe.js';
import { ProRenderError, unchanged } from './runtime.js';
function assert(condition, message) {
    if (!condition)
        throw new Error(`Pose safety regression: ${message}`);
}
function generated(width = 79, height = 91) {
    const channels = 4;
    const pixels = new Uint8Array(width * height * channels);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * channels;
            pixels[i] = (x * 5 + y * 9 + 33) % 255;
            pixels[i + 1] = (x * 7 + y * 3 + 21) % 255;
            pixels[i + 2] = (x * 11 + y * 2 + 51) % 255;
            pixels[i + 3] = (x + y * 4 + 5) % 256;
        }
    }
    return { width, height, channels, pixels };
}
function pose(image) {
    const personMask = new Uint8Array(image.width * image.height);
    for (let y = Math.floor(image.height / 4); y < image.height - 4; y++) {
        for (let x = 9; x < image.width - 9; x++)
            personMask[y * image.width + x] = 255;
    }
    return { width: image.width, height: image.height, personMask,
        evidence: 'synthetic_test', handles: [
            { label: 'left', x: 0.25, y: 0.4, dx: -0.032, dy: 0.002 },
            { label: 'right', x: 0.75, y: 0.4, dx: 0.032, dy: 0.002 },
            { label: 'waist', x: 0.52, y: 0.72, dx: 0, dy: -0.022 },
        ] };
}
function expectError(action, code) {
    try {
        action();
    }
    catch (error) {
        assert(error instanceof ProRenderError && error.code === code, `expected ${code}`);
        return;
    }
    throw new Error(`Missing ${code}`);
}
function grid(width, height, invert = false) {
    const sourceX = new Float64Array(width * height);
    const sourceY = new Float64Array(width * height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const index = y * width + x;
            sourceX[index] = invert ? width - 1 - x : x;
            sourceY[index] = y;
        }
    }
    return { width, height, stepX: 1, stepY: 1, sourceX, sourceY };
}
export function testPoseSafeR8H() {
    let checks = 0;
    const identity = poseJacobianExtrema(grid(7, 9));
    assert(identity.minimum === 1 && identity.maximum === 1 && identity.cells === 48, 'unit Jacobian');
    checks++;
    const inverted = poseJacobianExtrema(grid(7, 9, true));
    assert(inverted.minimum === -1 && inverted.maximum === -1, 'inversion is negative');
    checks++;
    const source = generated();
    const measuredPose = pose(source);
    const unit = chooseSafePoseDose(measuredPose, 0);
    assert(unit.usedDose === 0 && unit.minimumJacobian === 1, 'neutral pose');
    checks++;
    for (const dose of [0.025, 0.1, 0.25, 0.5, 0.75, 1]) {
        const decision = chooseSafePoseDose(measuredPose, dose);
        assert(decision.usedDose > 0 && decision.usedDose <= dose &&
            decision.minimumJacobian >= 0.25 && decision.maximumJacobian <= 3, `safe dose ${dose}`);
        assert(decision.sampleCount === 2304 && decision.retention >= 0.25, 'recorded sample completeness');
        checks += 2;
    }
    for (const invalid of [-1, 1.01, NaN, Infinity]) {
        expectError(() => chooseSafePoseDose(measuredPose, invalid), 'invalid_pose_guard');
        checks++;
    }
    for (const invalid of [0, -0.01, 1.1, NaN, Infinity]) {
        expectError(() => checkedPoseRules({ determinantFloor: invalid,
            determinantCeiling: 3, minimumRetention: 0.25, samples: 49,
            searchSteps: 12 }), 'invalid_pose_guard');
        checks++;
    }
    expectError(() => chooseSafePoseDose(measuredPose, 1, {
        determinantFloor: 0.999, determinantCeiling: 3,
        minimumRetention: 0.95, samples: 49, searchSteps: 12,
    }), 'pose_fold_risk');
    checks++;
    const field = sampledPoseGrid(measuredPose, 0.5, 23);
    assert(field.sourceX.length === 529 && field.stepX > 0 &&
        field.stepY > 0, 'fully sampled field');
    checks++;
    const output = [];
    for (const tile of [16, 32, 64, 96]) {
        const engine = new CpuPoseOnly(null, tile);
        engine.openPhoto(source, measuredPose);
        const preview = engine.render(source, 45, true);
        const exported = engine.render(source, 45, false);
        assert(unchanged(preview, exported), `preview/export tile ${tile}`);
        assert(engine.lastMetrics?.foldMinimum !== undefined &&
            (engine.lastMetrics?.foldRetention ?? 0) >= 0.25, 'reported safe fold');
        assert(preview.width === source.width && preview.height === source.height, 'image geometry unchanged');
        for (let index = 3; index < source.pixels.length; index += 4) {
            assert(preview.pixels[index] === source.pixels[index], 'alpha preserved');
        }
        output.push(preview);
        checks += 4;
    }
    assert(output.every((item) => unchanged(item, output[0])), 'tile-size independence with guard');
    checks++;
    return checks;
}
//# sourceMappingURL=test-pose-safe-r8h.js.map