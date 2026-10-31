/** The 0-100 strength slider to an engine amount for tools whose change sits near the edge of what
 * the eye sees (age, gender, freckles, tan, teeth, beard removal, hair fibres). An ease-out, the same
 * idea as the lighting mix in pipeline.ts: the gentle defaults (30 and 50) already read clearly and
 * 100 is the engine's full amount. 1 - (1 - s)^k: 0.66 at 30 and 0.88 at 50 for k = 3. Monotonic,
 * 0 stays 0. k = 3 is ASSUMED (tuned with the Batch 2 probe on the synthetic samples).
 * rootStrength is the steeper curve for edits on a small area (gender, teeth, full beard, hair
 * fibres): (s/100)^p lifts 30 close to full while every step up to 100 still changes the picture,
 * which an ease-out with a high power would flatten.
 * Author: John Khan.
 */
export const EASE_K = 3;
export function easeStrength(strength, k = EASE_K) {
    if (!(Number.isFinite(strength) && strength >= 0 && strength <= 100))
        throw new RangeError("strength must be 0..100");
    if (!(Number.isFinite(k) && k >= 1))
        throw new RangeError("ease power must be 1 or more");
    return 1 - (1 - strength / 100) ** k;
}
/** (strength/100)^power, power in (0, 1]: about 0.83 at 30 and 0.90 at 50 for power 0.15. */
export function rootStrength(strength, power) {
    if (!(Number.isFinite(strength) && strength >= 0 && strength <= 100))
        throw new RangeError("strength must be 0..100");
    if (!(Number.isFinite(power) && power > 0 && power <= 1))
        throw new RangeError("root power must be above 0 and at most 1");
    return (strength / 100) ** power;
}
