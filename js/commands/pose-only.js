import { chooseSafePoseDose } from './pose-safe.js';
import { preparePoseField, preparedPosePixel } from './pose-field.js';
import { checkedFrame, ProRenderError } from './runtime.js';
export function validatePose(input, frame) {
    checkedFrame(frame);
    if (input.width !== frame.width || input.height !== frame.height ||
        !(input.personMask instanceof Uint8Array) ||
        input.personMask.byteLength !== frame.width * frame.height ||
        input.handles.length < 2 || input.handles.length > 12 ||
        !['user_checked', 'cleared_local', 'synthetic_test'].includes(input.evidence)) {
        throw new ProRenderError('invalid_pose', 'Pose measurements must belong to the selected photo.');
    }
    const labels = new Set();
    for (const handle of input.handles) {
        if (typeof handle.label !== 'string' || handle.label.length < 1 || handle.label.length > 40 ||
            labels.has(handle.label) || [handle.x, handle.y, handle.dx, handle.dy].some((value) => !Number.isFinite(value)) ||
            handle.x < 0 || handle.x > 1 || handle.y < 0 || handle.y > 1 ||
            Math.abs(handle.dx) > 0.045 || Math.abs(handle.dy) > 0.045 ||
            Math.hypot(handle.dx, handle.dy) > 0.06) {
            throw new ProRenderError('invalid_pose', 'Pose handles are not uniquely checked and bounded.');
        }
        labels.add(handle.label);
    }
    if (!input.personMask.some((byte) => byte >= 32)) {
        throw new ProRenderError('invalid_pose', 'Checked person mask is empty.');
    }
    return { ...input, personMask: new Uint8Array(input.personMask),
        handles: input.handles.map((handle) => Object.freeze({ ...handle })) };
}
function amountFor(level) {
    if (!Number.isInteger(level) || level < 10 || level > 50) {
        throw new ProRenderError('invalid_level', 'Pose level must be 1.0 to 5.0 in 0.1 increments.');
    }
    return (level - 10) / 40;
}
function clamped(frame, x, y, channel) {
    const index = (Math.max(0, Math.min(frame.height - 1, y)) * frame.width +
        Math.max(0, Math.min(frame.width - 1, x))) * frame.channels + channel;
    return frame.pixels[index] ?? 0;
}
function resample(frame, x, y, channel) {
    const sx = Math.max(0, Math.min(frame.width - 1, x));
    const sy = Math.max(0, Math.min(frame.height - 1, y));
    const x0 = Math.floor(sx);
    const y0 = Math.floor(sy);
    const x1 = Math.min(frame.width - 1, x0 + 1);
    const y1 = Math.min(frame.height - 1, y0 + 1);
    const fx = sx - x0;
    const fy = sy - y0;
    const upper = (1 - fx) * clamped(frame, x0, y0, channel) +
        fx * clamped(frame, x1, y0, channel);
    const lower = (1 - fx) * clamped(frame, x0, y1, channel) +
        fx * clamped(frame, x1, y1, channel);
    return upper * (1 - fy) + lower * fy;
}
export class CpuPoseOnly {
    regions;
    tileSize;
    pose = null;
    foldCache = new Map();
    preparedField = null;
    rendersSinceOpen = 0;
    lastMetrics = null;
    constructor(regions = null, tileSize = 96) {
        this.regions = regions;
        this.tileSize = tileSize;
        if (!Number.isInteger(tileSize) || tileSize < 16 || tileSize > 384) {
            throw new ProRenderError('invalid_tiles', 'Pose tile size must be 16 to 384.');
        }
    }
    openPhoto(frame, pose) {
        checkedFrame(frame);
        this.pose = pose === null ? null : validatePose(pose, frame);
        this.foldCache.clear();
        this.preparedField = this.pose === null ? null : preparePoseField(this.pose);
        this.rendersSinceOpen = 0;
        this.lastMetrics = null;
    }
    closePhoto() {
        this.pose = null;
        this.foldCache.clear();
        this.preparedField = null;
        this.rendersSinceOpen = 0;
        this.lastMetrics = null;
    }
    render(frame, level, preview, signal) {
        const started = performance.now();
        checkedFrame(frame);
        const dose = amountFor(level);
        if (dose === 0) {
            this.lastMetrics = { level: (level / 10).toFixed(1),
                elapsedMs: performance.now() - started, preview, tileCount: 0,
                peakWorkingBytes: 0, changedPixels: 0, largestDisplacementPx: 0,
                protectedUnchanged: true, alphaUnchanged: true };
            return frame;
        }
        const pose = this.pose;
        if (pose === null) {
            throw new ProRenderError('pose_evidence_missing', 'Pose controls must be supplied.');
        }
        if (frame.width !== pose.width || frame.height !== pose.height) {
            throw new ProRenderError('pose_image_changed', 'Pose controls no longer fit the edited photo.');
        }
        let safe = this.foldCache.get(level);
        if (safe === undefined) {
            safe = chooseSafePoseDose(pose, dose);
            this.foldCache.set(level, safe);
        }
        const usedDose = safe.usedDose;
        const fieldCacheHit = this.preparedField !== null && this.rendersSinceOpen > 0;
        const result = new Uint8Array(frame.pixels);
        const body = pose.personMask;
        const eye = this.regions?.mask('eyes', frame.width, frame.height) ?? null;
        const skin = this.regions?.mask('skin', frame.width, frame.height) ?? null;
        const protectedMask = this.regions?.mask('protected', frame.width, frame.height) ?? null;
        let count = 0;
        let changed = 0;
        let largest = 0;
        let protectedSafe = true;
        for (let y0 = 0; y0 < frame.height; y0 += this.tileSize) {
            if (signal?.aborted)
                throw new ProRenderError('stale_preview', 'Pose edit was cancelled.');
            const y1 = Math.min(frame.height, y0 + this.tileSize);
            for (let x0 = 0; x0 < frame.width; x0 += this.tileSize) {
                const x1 = Math.min(frame.width, x0 + this.tileSize);
                for (let y = y0; y < y1; y++) {
                    for (let x = x0; x < x1; x++) {
                        const pixel = y * frame.width + x;
                        let mask = (body[pixel] ?? 0) / 255;
                        if (mask === 0)
                            continue;
                        let localMin = mask;
                        for (let oy = -1; oy <= 1; oy++) {
                            for (let ox = -1; ox <= 1; ox++) {
                                const ny = Math.max(0, Math.min(frame.height - 1, y + oy));
                                const nx = Math.max(0, Math.min(frame.width - 1, x + ox));
                                localMin = Math.min(localMin, (body[ny * frame.width + nx] ?? 0) / 255);
                            }
                        }
                        // Any positive checked face coverage, even at an antialiased rim,
                        // pins the original pixel instead of allowing a nearly full warp.
                        if ((eye?.[pixel] ?? 0) > 0 || (skin?.[pixel] ?? 0) > 0 ||
                            (protectedMask?.[pixel] ?? 0) > 0)
                            continue;
                        mask = 0.3 * mask + 0.7 * localMin;
                        if (mask <= 0)
                            continue;
                        let dx = 0;
                        let dy = 0;
                        if (this.preparedField !== null) {
                            [dx, dy] = preparedPosePixel(this.preparedField, x, y, usedDose);
                        }
                        else {
                            const fx = x / Math.max(frame.width - 1, 1);
                            const fy = y / Math.max(frame.height - 1, 1);
                            let total = 0.42;
                            for (const handle of pose.handles) {
                                const distance = (fx - handle.x) ** 2 + (fy - handle.y) ** 2;
                                const weight = Math.exp(-distance / (2 * 0.18 ** 2));
                                total += weight;
                                dx += weight * handle.dx * frame.width;
                                dy += weight * handle.dy * frame.height;
                            }
                            dx = Math.max(-0.045 * frame.width * usedDose, Math.min(0.045 * frame.width * usedDose, dx * usedDose / total));
                            dy = Math.max(-0.045 * frame.height * usedDose, Math.min(0.045 * frame.height * usedDose, dy * usedDose / total));
                        }
                        largest = Math.max(largest, Math.hypot(dx * mask, dy * mask));
                        const dest = pixel * frame.channels;
                        let modified = false;
                        for (let channel = 0; channel < 3; channel++) {
                            const source = frame.pixels[dest + channel] ?? 0;
                            const moved = resample(frame, x - dx, y - dy, channel);
                            const value = Math.floor(Math.max(0, Math.min(255, source + (moved - source) * mask)) + 0.5);
                            if (value !== source)
                                modified = true;
                            result[dest + channel] = value;
                            if ((protectedMask?.[pixel] ?? 0) > 0 && value !== source)
                                protectedSafe = false;
                        }
                        if (modified)
                            changed++;
                    }
                }
                count++;
            }
        }
        let alphaSafe = true;
        if (frame.channels === 4) {
            for (let i = 3; i < result.length; i += 4) {
                if (frame.pixels[i] !== result[i])
                    alphaSafe = false;
            }
        }
        this.rendersSinceOpen++;
        this.lastMetrics = { level: (level / 10).toFixed(1),
            elapsedMs: performance.now() - started, preview, tileCount: count,
            peakWorkingBytes: this.tileSize * this.tileSize * 48,
            changedPixels: changed, largestDisplacementPx: largest,
            protectedUnchanged: protectedSafe, alphaUnchanged: alphaSafe,
            foldMinimum: safe.minimumJacobian, foldRetention: safe.retention,
            fieldCacheHit };
        return { ...frame, pixels: result };
    }
}
//# sourceMappingURL=pose-only.js.map