/** Typed, fail-closed identity hook for local face edits.
 * ASSUMED contract until Workstream H publishes its public command exports.
 * The guard must read actual before/after data; this module does not estimate identity.
 */
import { DEFAULT_LOCK_LEVEL, validateLevel } from "./strength.js";
export const DEFAULT_SIMILARITY = 0.92; // ASSUMED until real-face acceptance.
function pixelCount(width, height) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 ||
        width > 16_384 || height > 16_384 || width * height > 12_000_000) {
        throw new RangeError("Image exceeds local edit limits");
    }
    return width * height;
}
/** Refuse rather than pass through a face edit when the provider is unavailable. */
export async function guardFacePixels(before, after, width, height, faceRegion, guard, lockLevel = DEFAULT_LOCK_LEVEL, similarityFloor = DEFAULT_SIMILARITY) {
    const level = validateLevel(lockLevel);
    const pixels = pixelCount(width, height);
    if (before.length !== pixels * 4 || after.length !== pixels * 4) {
        throw new RangeError("Face edit expects full RGBA pixel buffers");
    }
    if (faceRegion === null) {
        return { pixels: after.slice(), similarity: null, guarded: false, blendedBack: false, lockLevel: level };
    }
    if (faceRegion.length !== pixels)
        throw new RangeError("Face mask must match image pixels");
    if (!guard)
        throw new Error("Identity lock is required for a face-region edit");
    if (!Number.isFinite(similarityFloor) || similarityFloor <= 0 || similarityFloor > 1) {
        throw new RangeError("Invalid identity similarity threshold");
    }
    // Clone the buffers so an injected guard cannot mutate the original or edit.
    const decision = await guard.guard(before.slice(), after.slice(), level);
    if (!decision || !(decision.pixels instanceof Uint8ClampedArray) ||
        decision.pixels.length !== pixels * 4 || !Number.isFinite(decision.similarity) ||
        decision.similarity < 0 || decision.similarity > 1) {
        throw new Error("Identity provider returned an invalid decision");
    }
    const lowScore = decision.similarity < similarityFloor;
    // ASSUMED conservative fallback, not a mathematical biometric guarantee.
    // At level 5.0 retain at least 85% of the source in the face region.
    const keepEdit = lowScore ? Math.min(1, 0.15 + 0.85 * (5 - level) / 4) : 1;
    const output = after.slice();
    for (let i = 0; i < pixels; i++) {
        const coverage = faceRegion[i] / 255;
        if (coverage === 0)
            continue;
        const origin = i * 4;
        const weight = coverage * keepEdit;
        for (let c = 0; c < 3; c++) {
            output[origin + c] = lowScore
                ? Math.round(before[origin + c] * (1 - weight) + decision.pixels[origin + c] * weight)
                : Math.round(after[origin + c] * (1 - coverage) + decision.pixels[origin + c] * coverage);
        }
        output[origin + 3] = before[origin + 3];
    }
    return { pixels: output, similarity: decision.similarity, guarded: true,
        blendedBack: lowScore, lockLevel: level };
}
