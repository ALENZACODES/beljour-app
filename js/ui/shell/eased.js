/** Slider percent to the engine's percent, eased so the Natural stop (50) already reads clearly
 * (75) and Full stays the engine's full amount: 100 * s * (2 - s). Monotonic; 0 stays 0.
 * Author: John Khan.
 */
export function easedPercent(percent) {
    const s = Math.max(0, Math.min(1, percent / 100));
    return Math.round(1000 * s * (2 - s)) / 10;
}
