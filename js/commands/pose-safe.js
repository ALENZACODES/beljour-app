import { ProRenderError } from './runtime.js';
export const DEFAULT_POSE_SAFE_RULES = Object.freeze({
    determinantFloor: 0.25,
    determinantCeiling: 3,
    minimumRetention: 0.25,
    samples: 49,
    searchSteps: 12,
});
function bounded(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
}
export function checkedPoseRules(rules) {
    if (!Number.isFinite(rules.determinantFloor) ||
        rules.determinantFloor <= 0 || rules.determinantFloor >= 1 ||
        !Number.isFinite(rules.determinantCeiling) || rules.determinantCeiling <= 1 ||
        !Number.isFinite(rules.minimumRetention) ||
        rules.minimumRetention <= 0 || rules.minimumRetention > 1 ||
        !Number.isInteger(rules.samples) || rules.samples < 9 || rules.samples > 97 ||
        !Number.isInteger(rules.searchSteps) || rules.searchSteps < 4 ||
        rules.searchSteps > 24) {
        throw new ProRenderError('invalid_pose_guard', 'Pose fold-check rules are invalid.');
    }
    return rules;
}
function maskAttenuation(pose, x, y) {
    const px = bounded(Math.round(x), 0, pose.width - 1);
    const py = bounded(Math.round(y), 0, pose.height - 1);
    const mask = pose.personMask;
    const base = (mask[py * pose.width + px] ?? 0) / 255;
    let smallest = base;
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            const yy = bounded(py + dy, 0, pose.height - 1);
            const xx = bounded(px + dx, 0, pose.width - 1);
            smallest = Math.min(smallest, (mask[yy * pose.width + xx] ?? 0) / 255);
        }
    }
    return 0.3 * base + 0.7 * smallest;
}
export function sampledPoseGrid(pose, dose, samples) {
    if (!Number.isFinite(dose) || dose < 0 || dose > 1 ||
        !Number.isInteger(samples) || samples < 2 || samples > 97 ||
        pose.width < 2 || pose.height < 2 ||
        pose.personMask.byteLength !== pose.width * pose.height) {
        throw new ProRenderError('invalid_pose_guard', 'Checked pose and grid size required.');
    }
    const count = samples * samples;
    const sourceX = new Float64Array(count);
    const sourceY = new Float64Array(count);
    const stepX = (pose.width - 1) / (samples - 1);
    const stepY = (pose.height - 1) / (samples - 1);
    for (let row = 0; row < samples; row++) {
        const y = row * stepY;
        for (let column = 0; column < samples; column++) {
            const x = column * stepX;
            const i = row * samples + column;
            const u = x / (pose.width - 1);
            const v = y / (pose.height - 1);
            let total = 0.42;
            let dx = 0;
            let dy = 0;
            for (const handle of pose.handles) {
                const distance = (u - handle.x) ** 2 + (v - handle.y) ** 2;
                const weight = Math.exp(-distance / (2 * 0.18 ** 2));
                total += weight;
                dx += weight * handle.dx * pose.width;
                dy += weight * handle.dy * pose.height;
            }
            dx = bounded(dx * dose / total, -0.045 * pose.width * dose, 0.045 * pose.width * dose);
            dy = bounded(dy * dose / total, -0.045 * pose.height * dose, 0.045 * pose.height * dose);
            const mask = maskAttenuation(pose, x, y);
            sourceX[i] = x - dx * mask;
            sourceY[i] = y - dy * mask;
        }
    }
    return { width: samples, height: samples, stepX, stepY, sourceX, sourceY };
}
export function poseJacobianExtrema(grid) {
    if (!Number.isFinite(grid.stepX) || !Number.isFinite(grid.stepY) ||
        grid.stepX <= 0 || grid.stepY <= 0 || grid.width < 2 || grid.height < 2 ||
        grid.sourceX.length !== grid.width * grid.height ||
        grid.sourceY.length !== grid.width * grid.height) {
        throw new ProRenderError('invalid_pose_guard', 'Pose sampling field is malformed.');
    }
    let minimum = Infinity;
    let maximum = -Infinity;
    let cells = 0;
    for (let y = 0; y < grid.height - 1; y++) {
        for (let x = 0; x < grid.width - 1; x++) {
            const a = y * grid.width + x;
            const b = a + 1;
            const c = a + grid.width;
            const xByX = ((grid.sourceX[b] ?? NaN) - (grid.sourceX[a] ?? NaN)) / grid.stepX;
            const yByX = ((grid.sourceY[b] ?? NaN) - (grid.sourceY[a] ?? NaN)) / grid.stepX;
            const xByY = ((grid.sourceX[c] ?? NaN) - (grid.sourceX[a] ?? NaN)) / grid.stepY;
            const yByY = ((grid.sourceY[c] ?? NaN) - (grid.sourceY[a] ?? NaN)) / grid.stepY;
            const determinant = xByX * yByY - xByY * yByX;
            if (!Number.isFinite(determinant)) {
                throw new ProRenderError('invalid_pose_guard', 'Pose sampling field is not finite.');
            }
            minimum = Math.min(minimum, determinant);
            maximum = Math.max(maximum, determinant);
            cells++;
        }
    }
    return { minimum, maximum, cells };
}
export function chooseSafePoseDose(pose, requested, options = DEFAULT_POSE_SAFE_RULES) {
    const rules = checkedPoseRules(options);
    if (!Number.isFinite(requested) || requested < 0 || requested > 1) {
        throw new ProRenderError('invalid_pose_guard', 'Pose strength is not finite.');
    }
    if (requested === 0) {
        return { requestedDose: 0, usedDose: 0, minimumJacobian: 1,
            maximumJacobian: 1, sampleCount: 0, backoffCount: 0,
            retention: 1, realfaceVerified: false };
    }
    if (pose.width < 3 || pose.height < 3) {
        throw new ProRenderError('pose_fold_unmeasured', 'Pose source is too small to check.');
    }
    function inspect(dose) {
        return poseJacobianExtrema(sampledPoseGrid(pose, dose, rules.samples));
    }
    function acceptable(value) {
        return value.minimum >= rules.determinantFloor &&
            value.maximum <= rules.determinantCeiling;
    }
    let measurements = inspect(requested);
    let used = requested;
    let checked = 0;
    if (!acceptable(measurements)) {
        let low = 0;
        let high = requested;
        for (let i = 0; i < rules.searchSteps; i++) {
            const middle = (low + high) / 2;
            const result = inspect(middle);
            checked++;
            if (acceptable(result))
                low = middle;
            else
                high = middle;
        }
        used = low;
        if (used < requested * rules.minimumRetention) {
            throw new ProRenderError('pose_fold_risk', 'Unsafe pose geometry cannot be applied.');
        }
        measurements = inspect(used);
        if (!acceptable(measurements)) {
            throw new ProRenderError('pose_fold_risk', 'Final pose deformation is unsafe.');
        }
    }
    return { requestedDose: requested, usedDose: used,
        minimumJacobian: measurements.minimum, maximumJacobian: measurements.maximum,
        sampleCount: measurements.cells, backoffCount: checked,
        retention: used / requested, realfaceVerified: false };
}
