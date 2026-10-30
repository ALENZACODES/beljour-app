import { ProRenderError } from './runtime.js';
export const MAX_PREPARED_POSE_PIXELS = 262144;
function bound(value, low, high) {
    return Math.max(low, Math.min(high, value));
}
export function preparePoseField(pose, limit = MAX_PREPARED_POSE_PIXELS) {
    if (!Number.isSafeInteger(limit) || limit < 1 ||
        limit > MAX_PREPARED_POSE_PIXELS ||
        !Number.isInteger(pose.width) || !Number.isInteger(pose.height) ||
        pose.width <= 0 || pose.height <= 0 ||
        pose.personMask.length !== pose.width * pose.height) {
        throw new ProRenderError('invalid_pose_field', 'Pose field budget or geometry is invalid.');
    }
    if (pose.width * pose.height > limit)
        return null;
    const length = pose.width * pose.height;
    const dx = new Float64Array(length);
    const dy = new Float64Array(length);
    for (let y = 0; y < pose.height; y++) {
        const fractionY = y / Math.max(pose.height - 1, 1);
        for (let x = 0; x < pose.width; x++) {
            const fractionX = x / Math.max(pose.width - 1, 1);
            let sum = 0.42;
            let directionX = 0;
            let directionY = 0;
            for (const handle of pose.handles) {
                const distance = (fractionX - handle.x) ** 2 +
                    (fractionY - handle.y) ** 2;
                const weight = Math.exp(-distance / (2 * 0.18 ** 2));
                sum += weight;
                directionX += weight * handle.dx * pose.width;
                directionY += weight * handle.dy * pose.height;
            }
            const position = y * pose.width + x;
            dx[position] = bound(directionX / sum, -0.045 * pose.width, 0.045 * pose.width);
            dy[position] = bound(directionY / sum, -0.045 * pose.height, 0.045 * pose.height);
        }
    }
    return { width: pose.width, height: pose.height, dx, dy,
        retainedBytes: dx.byteLength + dy.byteLength };
}
export function preparedPosePixel(field, x, y, dose) {
    if (!Number.isInteger(x) || !Number.isInteger(y) ||
        x < 0 || y < 0 || x >= field.width || y >= field.height ||
        !Number.isFinite(dose) || dose < 0 || dose > 1) {
        throw new ProRenderError('invalid_pose_field', 'Prepared pose pixel request is invalid.');
    }
    const index = y * field.width + x;
    return [(field.dx[index] ?? 0) * dose, (field.dy[index] ?? 0) * dose];
}
//# sourceMappingURL=pose-field.js.map