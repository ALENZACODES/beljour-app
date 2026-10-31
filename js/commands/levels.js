/** Exact 1.0–5.0 levels in tenths; never store incremental float slider state.
 * Author: John Khan.
 */
export class ProLevelError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'ProLevelError';
    }
}
export function levelFromTenths(value) {
    if (!Number.isInteger(value) || value < 10 || value > 50) {
        throw new ProLevelError('invalid_level', 'Strength must be between 1.0 and 5.0 in 0.1 steps.');
    }
    return value;
}
export function parseLevel(value) {
    if (typeof value === 'string') {
        if (!/^[1-5](\.[0-9])?$/.test(value)) {
            throw new ProLevelError('invalid_level', 'Strength needs one decimal place.');
        }
        return levelFromTenths(Math.round(Number(value) * 10));
    }
    if (!Number.isFinite(value)) {
        throw new ProLevelError('invalid_level', 'Strength must be a finite number.');
    }
    const scaled = value * 10;
    if (Math.abs(scaled - Math.round(scaled)) > 1e-8) {
        throw new ProLevelError('invalid_level', 'Strength must be a multiple of 0.1.');
    }
    return levelFromTenths(Math.round(scaled));
}
export function levelLabel(value) {
    return (value / 10).toFixed(1);
}
export function levelDose(value) {
    return value / 50;
}
export function adjustLevel(value, deltaSteps) {
    if (!Number.isInteger(deltaSteps)) {
        throw new ProLevelError('invalid_step', 'Level step count must be an integer.');
    }
    return levelFromTenths(value + deltaSteps);
}
export function boundedAdjustLevel(value, deltaSteps) {
    if (!Number.isInteger(deltaSteps)) {
        throw new ProLevelError('invalid_step', 'Level step count must be an integer.');
    }
    return levelFromTenths(Math.max(10, Math.min(50, value + deltaSteps)));
}
export const LEVEL_TICKS = Object.freeze(Array.from({ length: 41 }, (_, index) => levelLabel(levelFromTenths(index + 10))));
export function isCompliantSlider(min, max, step) {
    try {
        return parseLevel(String(min)) === 10 && parseLevel(String(max)) === 50 && Number(step) === 0.1;
    }
    catch {
        return false;
    }
}
