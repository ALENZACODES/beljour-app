/** Settings-only posture edit history for one open photo, with undo, redo and replay.
 * Entries hold the fix, view, level and identity-lock level that produced a render,
 * never pixels, keypoints or masks. A redo re-renders through the caller's normal
 * guarded pipeline. No storage APIs or network. Author: John Khan.
 */
import { FIXES, checkedPostureLevel } from "../engines/local/posture.js";
/** ASSUMED bounds: enough for a long session of slider releases, and far below the
 * 64 KiB recovery record that posture-history-protected.ts accepts. */
export const MAX_POSTURE_HISTORY_ENTRIES = 64;
export const MAX_POSTURE_HISTORY_BYTES = 8192;
const HASH = /^[0-9a-f]{64}$/;
const EDIT_KEYS = "fix,level,lockLevel,view";
const SETTINGS_KEYS = "cursor,entries";
function checkedPhoto(photoHash) {
    if (typeof photoHash !== "string" || !HASH.test(photoHash)) {
        throw new RangeError("photo hash must be 64 lowercase hexadecimal characters");
    }
    return photoHash;
}
function plainObject(value, keys, what) {
    if (!value || typeof value !== "object" || Array.isArray(value) ||
        Object.getPrototypeOf(value) !== Object.prototype ||
        Object.keys(value).sort().join(",") !== keys) {
        throw new RangeError(`Invalid posture history ${what}`);
    }
    return value;
}
/** Validates one stored or committed edit and returns a frozen copy in fixed key order. */
export function checkedPostureEdit(value) {
    const fields = plainObject(value, EDIT_KEYS, "entry");
    const fix = fields.fix;
    if (typeof fix !== "string" || !Object.prototype.hasOwnProperty.call(FIXES, fix)) {
        throw new RangeError("Invalid posture history entry");
    }
    const known = fix;
    if (fields.view !== FIXES[known].view)
        throw new RangeError("Invalid posture history entry");
    if (typeof fields.level !== "number" || typeof fields.lockLevel !== "number") {
        throw new RangeError("Invalid posture history entry");
    }
    return Object.freeze({
        fix: known,
        view: FIXES[known].view,
        level: checkedPostureLevel(fields.level),
        lockLevel: checkedPostureLevel(fields.lockLevel),
    });
}
export function serializedHistoryBytes(entries) {
    return new TextEncoder().encode(JSON.stringify(entries)).length;
}
/** Full validation of an exported history, used before any restore mutates state. */
export function checkedPostureSettings(value, maxEntries = MAX_POSTURE_HISTORY_ENTRIES, maxBytes = MAX_POSTURE_HISTORY_BYTES) {
    const fields = plainObject(value, SETTINGS_KEYS, "settings");
    if (!Array.isArray(fields.entries) || fields.entries.length > maxEntries) {
        throw new RangeError("Invalid posture history settings");
    }
    const entries = Object.freeze(fields.entries.map(checkedPostureEdit));
    const cursor = fields.cursor;
    if (typeof cursor !== "number" || !Number.isInteger(cursor) || cursor < 0 || cursor > entries.length) {
        throw new RangeError("Invalid posture history cursor");
    }
    if (serializedHistoryBytes(entries) > maxBytes)
        throw new RangeError("Posture history is oversized");
    return Object.freeze({ entries, cursor });
}
function sameEdit(a, b) {
    return !!a && a.fix === b.fix && a.level === b.level && a.lockLevel === b.lockLevel;
}
export class PostureEditHistory {
    maxEntries;
    maxBytes;
    photo = null;
    entries = [];
    cursor = 0;
    /** Bumped by every mutation so a replay that finishes late cannot move the cursor. */
    revision = 0;
    constructor(maxEntries = MAX_POSTURE_HISTORY_ENTRIES, maxBytes = MAX_POSTURE_HISTORY_BYTES) {
        this.maxEntries = maxEntries;
        this.maxBytes = maxBytes;
        if (!Number.isInteger(maxEntries) || maxEntries < 1 || maxEntries > 1024 ||
            !Number.isInteger(maxBytes) || maxBytes < 256 || maxBytes > 65536) {
            throw new RangeError("Invalid posture history bounds");
        }
    }
    /** Opening a different photo discards the previous photo's history. */
    open(photoHash) {
        const hash = checkedPhoto(photoHash);
        if (this.photo === hash)
            return;
        this.photo = hash;
        this.reset();
    }
    /** Photo closed or replaced elsewhere: nothing about the old photo is kept. */
    close() {
        this.photo = null;
        this.reset();
    }
    /** Annotation changes make every stored edit describe a different body outline. */
    invalidate(photoHash) {
        this.require(photoHash);
        this.reset();
    }
    get snapshot() {
        const selected = this.cursor ? this.entries[this.cursor - 1] : null;
        return {
            open: this.photo !== null,
            entries: this.entries.length,
            cursor: this.cursor,
            selected: selected ? { ...selected } : null,
            canUndo: this.cursor > 0,
            canRedo: this.cursor < this.entries.length,
        };
    }
    /** Record a rendered edit. Any redo branch beyond the cursor is dropped. */
    commit(photoHash, edit) {
        this.require(photoHash);
        const checked = checkedPostureEdit({ ...edit });
        const current = this.cursor ? this.entries[this.cursor - 1] : null;
        // Re-releasing a slider on the selected value is not a new edit and keeps any redo branch.
        if (sameEdit(current, checked))
            return this.snapshot;
        const next = this.entries.slice(0, this.cursor);
        next.push(checked);
        while (next.length > this.maxEntries || serializedHistoryBytes(next) > this.maxBytes)
            next.shift();
        this.entries = next;
        this.cursor = next.length;
        this.revision += 1;
        return this.snapshot;
    }
    /** The edit a step would select (null means the untouched photo), or undefined if none. */
    peek(photoHash, step) {
        this.require(photoHash);
        const target = this.target(step);
        if (target === null)
            return undefined;
        return target ? { ...this.entries[target - 1] } : null;
    }
    /** Synchronous cursor move for callers that already rendered the target edit. */
    move(photoHash, step) {
        this.require(photoHash);
        const target = this.target(step);
        if (target === null)
            throw new RangeError(`Nothing to ${step}`);
        this.cursor = target;
        this.revision += 1;
        return this.snapshot;
    }
    /** Render the target edit first and move only if the history did not change meanwhile.
     * Returns null when there is nothing to step to or the result was superseded; a render
     * failure leaves the cursor where it was. */
    async replay(photoHash, step, render) {
        this.require(photoHash);
        const target = this.target(step);
        if (target === null)
            return null;
        const revision = this.revision;
        const edit = target ? { ...this.entries[target - 1] } : null;
        const result = await render(edit);
        if (this.revision !== revision || this.photo !== photoHash)
            return null;
        this.cursor = target;
        this.revision += 1;
        return result;
    }
    exportSettings(photoHash) {
        this.require(photoHash);
        return { entries: this.entries.map(entry => ({ ...entry })), cursor: this.cursor };
    }
    /** Replace this photo's history with validated settings; invalid input changes nothing. */
    restoreSettings(photoHash, settings) {
        this.require(photoHash);
        const checked = checkedPostureSettings({ entries: settings?.entries, cursor: settings?.cursor }, this.maxEntries, this.maxBytes);
        this.entries = [...checked.entries];
        this.cursor = checked.cursor;
        this.revision += 1;
        return this.snapshot;
    }
    target(step) {
        if (step === "undo")
            return this.cursor > 0 ? this.cursor - 1 : null;
        if (step === "redo")
            return this.cursor < this.entries.length ? this.cursor + 1 : null;
        throw new RangeError("Unknown history step");
    }
    require(photoHash) {
        const hash = checkedPhoto(photoHash);
        if (this.photo === null)
            throw new RangeError("No photo is open for posture history");
        if (this.photo !== hash)
            throw new RangeError("Posture history belongs to a different photo");
    }
    reset() {
        this.entries = [];
        this.cursor = 0;
        this.revision += 1;
    }
}
