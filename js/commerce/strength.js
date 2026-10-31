const KINDS = ["complexion", "cheek", "lip", "hair", "shade"];
export const DEFAULT_LEVEL = 3.0;
export const DEFAULT_LOCK = 5.0;
export const MIN_LEVEL = 1.0;
export const MAX_LEVEL = 5.0;
export const STEP = 0.1;
export function levelTicks(value) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 1 || value > 5) {
        throw RangeError("Try-on strength must be from 1.0 to 5.0.");
    }
    const ticks = Math.round(value * 10);
    if (ticks < 10 || ticks > 50 || Math.abs(value * 10 - ticks) > 1e-7) {
        throw RangeError("Try-on strength must use increments of 0.1.");
    }
    return ticks;
}
export function validateLevel(value) { return levelTicks(value) / 10; }
export function fromLegacy(value) {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > 100) {
        throw RangeError("Legacy intensity must be an integer from 0 to 100.");
    }
    return (10 + Math.floor(value * 0.4 + 0.5)) / 10;
}
export function toLegacy(value) { return Math.floor((levelTicks(value) - 10) * 2.5 + 0.5); }
export function nudge(value, direction) {
    if (direction !== -1 && direction !== 1)
        throw RangeError("Choose a 0.1 nudge.");
    return Math.max(10, Math.min(50, levelTicks(value) + direction)) / 10;
}
export function legacyPresets() {
    return { none: fromLegacy(0), subtle: fromLegacy(25), natural: fromLegacy(50),
        strong: fromLegacy(75), full: fromLegacy(100) };
}
export class LevelHistory {
    values = new Map();
    get(kind) {
        if (!KINDS.includes(kind))
            throw RangeError("Unknown cosmetic product type.");
        return this.values.get(kind) ?? DEFAULT_LEVEL;
    }
    remember(kind, value) {
        if (!KINDS.includes(kind))
            throw RangeError("Unknown cosmetic product type.");
        const level = validateLevel(value);
        this.values.set(kind, level);
        return level;
    }
    step(kind, direction) {
        return this.remember(kind, nudge(this.get(kind), direction));
    }
    clear() { this.values.clear(); }
    snapshot() {
        return Object.fromEntries(KINDS.map((kind) => [kind, this.get(kind)]));
    }
}
