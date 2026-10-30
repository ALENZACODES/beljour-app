/** Verified per-person face turn at the shared 1.0-5.0 / 0.1 control scale.
 * Uses the existing guarded 2.5D engine, preserving all historical Q1/Q3/Q4.
 * The geometric identity lock is a displacement proxy, never biometric identity.
 * No hidden side of the head is reconstructed. Inspiration: 3DDFA_V2 and
 * MediaPipe Face Landmarker geometry; concept only, no code copied.
 * Author: John Khan.
 */
import { requireColour } from "../engines/core/buffer.js";
import { faceFrame } from "../engines/shape/geometry.js";
import { checkXYZ, project, renderTurn, YAW_LIMIT } from "../engines/local/turn.js";
import { composeFace } from "./face-picker.js";
export const LOCKED_MOVE_IOD = 0.02;
export const UNLOCKED_MOVE_IOD = 0.065;
function refusal(code, message) {
    return { refused: true, code, message: message.slice(0, 120) };
}
export function turnLevel(value) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 1 || value > 5 ||
        Math.abs(value * 10 - Math.round(value * 10)) > 1e-8) {
        throw new RangeError("turn level must be 1.0 to 5.0 in 0.1 steps");
    }
    return Math.round(value * 10) / 10;
}
export function requestedYaw(level, direction) {
    if (direction !== "left" && direction !== "right") {
        throw new RangeError("unknown turn direction");
    }
    return (direction === "left" ? -1 : 1) * YAW_LIMIT * (turnLevel(level) - 1) / 4;
}
export function safeYaw(mesh, requested, cap) {
    checkXYZ(mesh);
    if (!Number.isFinite(cap) || cap <= 0 || cap > 1) {
        throw new RangeError("invalid geometric identity cap");
    }
    if (requested === 0) {
        return 0;
    }
    const frame = faceFrame(mesh.map(([x, y]) => [x, y]));
    const distance = cap * frame.iod;
    let lo = 0;
    let hi = 1;
    for (let pass = 0; pass < 17; pass++) {
        const share = (lo + hi) / 2;
        const output = project(mesh, requested * share, 0, 0, "silhouette").points;
        let movement = 0;
        for (let i = 0; i < mesh.length; i++) {
            movement = Math.max(movement, Math.hypot(output[i][0] - mesh[i][0], output[i][1] - mesh[i][1]));
        }
        if (movement <= distance) {
            lo = share;
        }
        else {
            hi = share;
        }
    }
    return requested * lo;
}
function maskValid(mask, count) {
    return mask instanceof Float32Array && mask.length === count &&
        mask.every((value) => Number.isFinite(value) && value >= 0 && value <= 1);
}
function safeChecks(result) {
    const checks = result.checks;
    return checks !== undefined && checks.q1.passed && checks.q3.passed && checks.q4.passed &&
        checks.effect_pass && checks.triangle_guard_pass;
}
export function renderTurnLevel(image, mesh, level, selectedMask, options = {}) {
    try {
        const checkedLevel = turnLevel(level);
        const direction = options.direction ?? "right";
        const lock = options.identityLock ?? true;
        if (typeof lock !== "boolean") {
            throw new RangeError("identity lock must be boolean");
        }
        const rawYaw = requestedYaw(checkedLevel, direction);
        requireColour(image);
        checkXYZ(mesh);
        const count = image.width * image.height;
        const bystanders = options.bystanders ?? [];
        if (!maskValid(selectedMask, count) || !bystanders.every((item) => maskValid(item, count))) {
            return refusal("unverified_mask", "verified full-image masks are required");
        }
        const protectedMask = new Uint8Array(count);
        for (const mask of bystanders) {
            for (let i = 0; i < count; i++) {
                if (mask[i] > 0) {
                    protectedMask[i] = 1;
                }
            }
        }
        let selectedPixels = 0, editablePixels = 0, protectedPixels = 0;
        for (let i = 0; i < count; i++) {
            if (selectedMask[i] > 0) {
                selectedPixels++;
                if (!protectedMask[i])
                    editablePixels++;
            }
            if (protectedMask[i]) {
                protectedPixels++;
            }
        }
        if (selectedPixels === 0 || editablePixels === 0) {
            return refusal("unverified_mask", "no unprotected selected-person region");
        }
        if (checkedLevel === 1) {
            return { refused: false, image: new Uint8ClampedArray(image.data), level: checkedLevel,
                identityLock: lock, requestedYaw: rawYaw, effectiveYaw: 0, maxMoveIOD: 0,
                selectedPixels, protectedPixels };
        }
        const cap = lock ? LOCKED_MOVE_IOD : UNLOCKED_MOVE_IOD;
        const yaw = safeYaw(mesh, rawYaw, cap);
        if (Math.abs(yaw) < 0.00001) {
            return refusal("identity_lock_restricts_turn", "no measurable safe turn");
        }
        const turned = renderTurn(image, mesh, { yaw });
        if (!safeChecks(turned)) {
            return refusal("quality_guard", "turn failed its existing safety checks");
        }
        const iod = faceFrame(mesh.map(([x, y]) => [x, y])).iod;
        const moveIOD = turned.metrics.max_move_px / iod;
        if (!Number.isFinite(moveIOD) || moveIOD > cap + 1e-8) {
            return refusal("identity_lock_restricts_turn", "measured movement exceeds identity cap");
        }
        const out = composeFace(new Uint8ClampedArray(image.data), new Uint8ClampedArray(turned.image.data), selectedMask, bystanders, image.width, image.height, image.channels);
        return { refused: false, image: out, level: checkedLevel, identityLock: lock,
            requestedYaw: rawYaw, effectiveYaw: yaw, maxMoveIOD: moveIOD,
            selectedPixels, protectedPixels };
    }
    catch (error) {
        return refusal("invalid_turn_input", error instanceof Error ? error.message : "invalid turn input");
    }
}
//# sourceMappingURL=turn-level.js.map