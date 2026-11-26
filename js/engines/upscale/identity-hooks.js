/** Optional adoption seam for the existing upscale renderer, not a new engine.
 * Face-detail work may only proceed when the identity provider is available.
 */
import { guardFacePixels } from "../../pro/identity.js";
import { legacyAmount, validateLevel } from "../../pro/strength.js";
export async function upscaleFaceDetail(before, width, height, faceMask, render, guard, detailLevel = 3.0, lockLevel = 5.0) {
    const checked = validateLevel(detailLevel);
    if (faceMask.length !== width * height)
        throw new RangeError("Face mask dimensions differ");
    if (!guard)
        throw new Error("Identity lock is required for upscale face detail");
    const result = render(before.slice(), legacyAmount(checked));
    return guardFacePixels(before, result, width, height, faceMask, guard, lockLevel);
}
//# sourceMappingURL=identity-hooks.js.map