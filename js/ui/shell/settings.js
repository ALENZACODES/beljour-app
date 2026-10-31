/** R7 posture decisions are pending. Keep the shipped 3% body band and 6% cap
 * as the only defaults, exposed to the editor as optional per-layer overrides.
 * This file is the *sole R8 configuration source*: the math remains in R7.
 * Author: John Khan.
 */
import { BAND_SHARE, CAP_SHARE } from "../../engines/local/posture.js";
export const POSTURE_DEFAULTS = Object.freeze({ bandShare: BAND_SHARE, capShare: CAP_SHARE });
export function postureSettings(overrides = {}) {
    const bandShare = overrides.bandShare ?? POSTURE_DEFAULTS.bandShare;
    const capShare = overrides.capShare ?? POSTURE_DEFAULTS.capShare;
    if (!(Number.isFinite(bandShare) && bandShare >= 0.01 && bandShare <= 0.10))
        throw new RangeError("Body band must be 1–10% of photo width");
    if (!(Number.isFinite(capShare) && capShare >= 0.01 && capShare <= 0.12))
        throw new RangeError("Body movement cap must be 1–12% of torso height");
    return { bandShare, capShare };
}
