/** Local 1.0..5.0 amounts. Curve knots and geometry retain their own units.
 * Legacy 0%, 50%, 100% map to 1.0, 3.0, 5.0 respectively.
 * The identity-lock level is a separate 1.0..5.0 control and defaults to 5.0.
 */
export const MIN_LEVEL = 1.0;
export const MAX_LEVEL = 5.0;
export const DEFAULT_LEVEL = 3.0;
export const DEFAULT_LOCK_LEVEL = 5.0;
export const EFFECTS = ["mask_amount", "upscale_detail", "sharpen", "clarity", "reel_amount", "identity_lock"];
export function validateLevel(value) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < MIN_LEVEL || value > MAX_LEVEL ||
        Math.abs(value * 10 - Math.round(value * 10)) > 1e-8) {
        throw new RangeError("Effect strength must use 1.0-5.0 in 0.1 steps");
    }
    return Math.round(value * 10) / 10;
}
export function legacyAmount(value) {
    return (validateLevel(value) - MIN_LEVEL) / (MAX_LEVEL - MIN_LEVEL);
}
export function fromLegacyAmount(percentage) {
    if (typeof percentage !== "number" || !Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
        throw new RangeError("Legacy amount must use 0-100 percent");
    }
    return validateLevel(Math.floor(10 + percentage * 0.4 + 0.5) / 10);
}
export function nudgeLevel(value, direction) {
    if (direction !== -1 && direction !== 1)
        throw new RangeError("Nudge must be -1 or +1");
    return Math.max(10, Math.min(50, Math.round(validateLevel(value) * 10) + direction)) / 10;
}
export class StrengthLevels {
    values = {
        mask_amount: DEFAULT_LEVEL,
        upscale_detail: DEFAULT_LEVEL,
        sharpen: DEFAULT_LEVEL,
        clarity: DEFAULT_LEVEL,
        reel_amount: DEFAULT_LEVEL,
        identity_lock: DEFAULT_LOCK_LEVEL,
    };
    verify(effect) {
        if (!EFFECTS.includes(effect))
            throw new RangeError("Unknown editable effect");
    }
    get(effect) {
        this.verify(effect);
        return this.values[effect];
    }
    set(effect, level) {
        this.verify(effect);
        this.values[effect] = validateLevel(level);
        return this.values[effect];
    }
    change(effect, direction) {
        return this.set(effect, nudgeLevel(this.get(effect), direction));
    }
    snapshot() {
        return Object.freeze({ ...this.values });
    }
    clear() {
        for (const effect of EFFECTS)
            this.values[effect] = effect === "identity_lock"
                ? DEFAULT_LOCK_LEVEL : DEFAULT_LEVEL;
    }
}
