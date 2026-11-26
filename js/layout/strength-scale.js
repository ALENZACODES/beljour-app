/** R23d visible strength scale. Engines retain their checked 0–100 contract. */
export const VISIBLE_STRENGTH = Object.freeze({ min: 1.0, max: 5.0, step: 0.1 });
export const DEFAULT_VISIBLE_STRENGTH = 5.0;
export function validVisibleStrength(value) {
    return Number.isFinite(value)
        && value >= VISIBLE_STRENGTH.min
        && value <= VISIBLE_STRENGTH.max
        && Math.abs(value * 10 - Math.round(value * 10)) < 1e-7;
}
export function parseVisibleStrength(value) {
    const number = typeof value === "number" ? value : typeof value === "string" && value.trim()
        ? Number(value) : NaN;
    if (!validVisibleStrength(number))
        throw new RangeError("Strength must be 1.0–5.0 in 0.1 steps");
    return Math.round(number * 10) / 10;
}
/** 1.0 corresponds to internal zero; 5.0 corresponds to internal 100. */
export function visibleToEngine(value) {
    return Math.round((parseVisibleStrength(value) - 1) * 250) / 10;
}
export function engineToVisible(value) {
    if (!Number.isFinite(value) || value < 0 || value > 100) {
        throw new RangeError("Internal strength must be 0–100");
    }
    return Math.round((1 + value / 25) * 10) / 10;
}
export function strengthText(value) {
    return `${parseVisibleStrength(value).toFixed(1)} of 5.0`;
}
export function hasVisibleStrengthContract(control) {
    return control.min === "1" && control.max === "5" && control.step === "0.1"
        && validVisibleStrength(Number(control.value));
}
/** Configure a native range without losing browser focus or replacing the element. */
export function setStrengthRange(input, strength) {
    const level = parseVisibleStrength(strength);
    input.type = "range";
    input.min = "1";
    input.max = "5";
    input.step = "0.1";
    input.value = level.toFixed(1);
    input.dataset.editStrength = "true";
    input.setAttribute("aria-valuetext", strengthText(level));
}
export function previewKey(request) {
    if (!request.photo || !request.edit || request.photo.length > 200 || request.edit.length > 200) {
        throw new RangeError("Invalid preview identity");
    }
    return JSON.stringify([
        request.photo,
        request.edit,
        parseVisibleStrength(request.strength).toFixed(1),
        parseVisibleStrength(request.tuning).toFixed(1),
    ]);
}
/** Debounce live updates. Old queued callbacks are always invalidated. */
export class PreviewDebouncer {
    delayMs;
    queued = null;
    lastKey = "";
    serial = 0;
    disposed = false;
    constructor(delayMs = 85) {
        this.delayMs = delayMs;
        if (!Number.isFinite(delayMs) || delayMs < 0 || delayMs > 2000) {
            throw new RangeError("Invalid preview debounce delay");
        }
    }
    get pending() {
        return this.queued !== null;
    }
    schedule(key, draw) {
        if (this.disposed)
            return;
        this.cancel();
        const serial = ++this.serial;
        this.queued = setTimeout(() => {
            if (this.disposed || serial !== this.serial)
                return;
            this.queued = null;
            if (key === this.lastKey)
                return;
            this.lastKey = key;
            draw();
        }, this.delayMs);
    }
    flush(key, draw) {
        if (this.disposed)
            return;
        this.cancel();
        if (key === this.lastKey)
            return;
        this.lastKey = key;
        draw();
    }
    reset() {
        this.cancel();
        this.lastKey = "";
    }
    cancel() {
        this.serial += 1;
        if (this.queued !== null)
            clearTimeout(this.queued);
        this.queued = null;
    }
    dispose() {
        this.cancel();
        this.disposed = true;
    }
}
//# sourceMappingURL=strength-scale.js.map