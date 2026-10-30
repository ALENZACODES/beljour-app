/** Public Workstream H decimal levels, adapted to the filter kernel's 0..100 scale.
 *
 * A level of 1.0 is deliberately a gentle 20% filter, not a no-op.
 * Internal zero remains available for identity and the historical goldens.
 * Use the public Pro level parser to avoid diverging decimal constraints.
 * No data is sent off device. Author: John Khan.
 */
import { LEVEL_TICKS, levelDose, parseLevel, ProLevelError } from "../../commands/index.js";
export const MIN_LEVEL = 1.0;
export const MAX_LEVEL = 5.0;
export const LEVEL_STEP = 0.1;
export const LEVELS = LEVEL_TICKS.length;
export const PERCENT_PER_LEVEL = 20;
export const DEFAULT_LEVEL = 1.5;
export function checkedLevel(value) {
    try {
        return parseLevel(value) / 10;
    }
    catch (error) {
        if (error instanceof ProLevelError) {
            throw new RangeError("filter level must be 1.0-5.0 in 0.1 steps");
        }
        throw error;
    }
}
export function toPercent(level) {
    const tenths = parseLevel(checkedLevel(level));
    return levelDose(tenths) * 100;
}
export function fromPercent(percent) {
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
        throw new RangeError("internal filter strength must be 0..100");
    }
    const steps = Math.round(10 * Math.max(MIN_LEVEL, percent / PERCENT_PER_LEVEL));
    return checkedLevel(steps / 10);
}
export function levelValues() {
    return LEVEL_TICKS.map((level) => Number(level));
}
//# sourceMappingURL=strength.js.map