/** Shared strength ticks. Posture's three non-zero stops come from R7, not a fork.
 * Strength changes the *engine geometry* rather than cross-fading two warped faces.
 * Author: John Khan.
 */
import { STOPS as BODY_STOPS } from "../../engines/local/posture.js";
export const COMMON_STOPS = [
    { name: "Off", value: 0 }, { name: "Subtle", value: 25 }, { name: "Natural", value: 50 },
    { name: "Extra", value: 75 }, { name: "Full", value: 100 },
];
export const POSTURE_STOPS = [
    { name: "Off", value: 0 },
    { name: "Subtle", value: BODY_STOPS.subtle * 100 },
    { name: "Normal", value: BODY_STOPS.normal * 100 },
    { name: "Full", value: BODY_STOPS.full * 100 },
];
export function stopsFor(kind) {
    return kind === "posture" ? POSTURE_STOPS : COMMON_STOPS;
}
export function clampStrength(value) {
    if (!Number.isFinite(value))
        throw new RangeError("Strength must be a finite number");
    return Math.max(0, Math.min(100, Math.round(value * 100) / 100));
}
export function nearestStop(kind, value) {
    return stopsFor(kind).reduce((best, next) => Math.abs(next.value - value) < Math.abs(best.value - value) ? next : best);
}
export function strengthName(kind, value) {
    const stop = stopsFor(kind).find((s) => Math.abs(value - s.value) < 0.0001);
    return stop ? stop.name : `${Math.round(value)}%`;
}
/** Usability 4.2: the number is always shown with its nearest word, e.g. "30 · Subtle". */
export function strengthLabel(kind, value) {
    const v = clampStrength(value);
    return `${Math.round(v)} · ${nearestStop(kind, v).name}`;
}
/** Haptic ticks at 33, 66 and 100 (usability 4.2). */
export const HAPTIC_TICKS = [33, 66, 100];
/** Ticks passed or reached when a slider moves from `from` to `to`. */
export function crossedTicks(from, to) {
    if (!Number.isFinite(from) || !Number.isFinite(to) || from === to)
        return [];
    const lo = Math.min(from, to), hi = Math.max(from, to);
    return HAPTIC_TICKS.filter((t) => (from < to ? t > lo && t <= hi : t >= lo && t < hi));
}
/** One short vibration when a tick is crossed, where the device supports it. */
export function hapticTick(from, to, device = globalThis.navigator) {
    if (!crossedTicks(from, to).length || typeof device?.vibrate !== "function")
        return false;
    return device.vibrate(10);
}
