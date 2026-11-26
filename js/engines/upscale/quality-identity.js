/** Face-pixel identity lock for the HD/4K quality pipeline.
 * The identity reference is an independent resize of the original source (not
 * the denoised copy), so the lock never trusts the stages it protects. Inside
 * the confirmed face selection the staged pixels are blended toward that
 * reference with the shared integer weights; at the default 5.0 lock with full
 * coverage the output equals the reference exactly, which `verifyIdentityLock`
 * re-checks pixel by pixel. A pixel guard, not biometric verification.
 * Author: John Khan.
 */
import { blendValue } from "./safe.js";
import { validateLevel } from "../../pro/strength.js";
function checkedLayers(staged, identity, coverage) {
    if (staged.length !== identity.length || coverage.length * 4 !== identity.length) {
        throw new RangeError("Identity lock layers differ in size");
    }
}
export function lockToIdentity(staged, identity, coverage, lockLevel) {
    checkedLayers(staged, identity, coverage);
    const tenths = Math.round(validateLevel(lockLevel) * 10);
    const output = new Uint8ClampedArray(staged);
    for (let p = 0; p < coverage.length; p++) {
        const weight = coverage[p];
        if (weight === 0)
            continue;
        for (let c = 0; c < 3; c++) {
            output[p * 4 + c] = blendValue(staged[p * 4 + c], identity[p * 4 + c], weight, tenths);
        }
        output[p * 4 + 3] = identity[p * 4 + 3];
    }
    return output;
}
/** Count protected pixels and any full-lock pixel that differs from the reference. */
export function verifyIdentityLock(output, identity, coverage, lockLevel) {
    checkedLayers(output, identity, coverage);
    const full = Math.round(validateLevel(lockLevel) * 10) === 50;
    let protectedPixels = 0, fullyLocked = 0, mismatches = 0;
    for (let p = 0; p < coverage.length; p++) {
        if (coverage[p] === 0)
            continue;
        protectedPixels += 1;
        if (!full || coverage[p] !== 255)
            continue;
        fullyLocked += 1;
        for (let c = 0; c < 3; c++) {
            if (output[p * 4 + c] !== identity[p * 4 + c]) {
                mismatches += 1;
                break;
            }
        }
    }
    return { protectedPixels, fullyLockedPixels: fullyLocked, mismatches };
}
//# sourceMappingURL=quality-identity.js.map