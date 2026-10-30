/** Explicit 1.0–5.0 strength scale for locally simulated women's edits.
 * Values are on the nearest tenth only; no inferred identity, face shape or skin tone.
 * Author: John Khan.
 */
export const MIN_LEVEL = 1.0;
export const MAX_LEVEL = 5.0;
export const DEFAULT_LEVEL = 3.0;
export const PRESET_LEVELS = Object.freeze({
    subtle: 2.0,
    light: 2.0,
    normal: 3.0,
    medium: 3.0,
    extra: 4.0,
    strong: 4.0,
    full: 4.0,
    hyper: 5.0,
});
export function checkedLevel(value) {
    if (typeof value !== 'number' || !Number.isFinite(value) ||
        value < MIN_LEVEL || value > MAX_LEVEL) {
        throw new RangeError('Strength must be within 1.0–5.0');
    }
    const tick = Math.round(value * 10);
    if (Math.abs(value * 10 - tick) > 1e-9) {
        throw new RangeError('Strength must use 0.1 increments');
    }
    return tick / 10;
}
export function presetLevel(name) {
    if (!Object.prototype.hasOwnProperty.call(PRESET_LEVELS, name)) {
        throw new RangeError('Unknown reviewed strength preset');
    }
    return PRESET_LEVELS[name];
}
/** Older 0–100 recipes: Subtle/Normal/Extra/Hyper = 2.0/3.0/4.0/5.0. */
export function fromLegacyStrength(value) {
    if (!Number.isInteger(value) || value < 0 || value > 100) {
        throw new RangeError('Legacy strength must be an integer 0..100');
    }
    return checkedLevel(Math.round((1 + 4 * value / 100) * 10) / 10);
}
export function opacityForLevel(value) {
    return (checkedLevel(value) - MIN_LEVEL) / (MAX_LEVEL - MIN_LEVEL);
}
export class StrengthMemory {
    selected = new Map();
    select(effectId, level) {
        if (!effectId || effectId.length > 64 || !/^[\x20-\x7e]+$/.test(effectId)) {
            throw new RangeError('Effect id must be a short ASCII identifier');
        }
        const chosen = level === undefined ? this.current(effectId) : checkedLevel(level);
        this.selected.set(effectId, chosen);
        return {
            effectId,
            level: chosen,
            opacity: opacityForLevel(chosen),
            simulation: 'Local screen simulation; not a physical treatment prediction.',
        };
    }
    current(effectId) {
        return this.selected.get(effectId) ?? DEFAULT_LEVEL;
    }
    clear() {
        this.selected.clear();
    }
}
//# sourceMappingURL=strength.js.map