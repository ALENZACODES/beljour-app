/** Check-ins kept on this device only. A check-in is the measured raw score per concern and the
 * time it was taken: never a photo, never the display score, never sent anywhere by this file.
 * localStorage when the browser allows it; when it is blocked, full or broken, the check-ins are
 * kept in this page only and the note says so. She can export them as a JSON file and delete
 * them all. Cosmetic tracking only, not medical advice. Author: John Khan.
 */
import { compare, history, scoresFromConcerns } from "./index.js";
export const STORE_FORMAT = "beljour-skin-checkins/1";
export const STORE_KEY = "beljour.skin-checkins.v1";
/** ASSUMED: about five years of monthly check-ins; the oldest is dropped beyond it. */
export const MAX_CHECKINS = 60;
/** ASSUMED: a stored list larger than this is not a list this page wrote, so it is not read. */
export const MAX_STORED_CHARS = 256 * 1024;
const DAY_MS = 86_400_000;
export class CheckinStoreError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = "CheckinStoreError";
    }
}
export const NOTES = {
    saved: "Saved on this device only: the measured scores and the date. No photo is kept.",
    memory: "This browser is not letting the page save. The check-in is kept in this page only; export it before you leave.",
    unreadable: "Earlier check-ins on this device could not be read, so they are not shown.",
    skipped: "An earlier check-in on this device was not in the expected form and was left out.",
    deleted: "Every check-in was deleted from this device.",
    deleteFailed: "Cleared from this page, but this browser did not let the page delete its saved copy. Clear this site's data in the browser settings.",
    exported: "Your check-ins as a JSON file: the measured scores and dates only, no photos. Cosmetic tracking, not medical advice.",
};
/** The browser's localStorage, or null when it is missing or its getter throws (private modes, blocked cookies). */
export function browserStorage() {
    try {
        return globalThis.localStorage ?? null;
    }
    catch {
        return null;
    }
}
/** Milliseconds since 1970 for an ISO 8601 time; a time without a zone is read as UTC, as the server does. */
export function parseTakenAt(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(value)) {
        throw new CheckinStoreError("taken_at_invalid", "A check-in needs the date it was taken, in ISO 8601.");
    }
    const zoned = /T.*(Z|[+-]\d{2}:?\d{2})$/i.test(value) || !value.includes("T") ? value : `${value}Z`;
    const ms = Date.parse(zoned);
    if (!Number.isFinite(ms))
        throw new CheckinStoreError("taken_at_invalid", "A check-in needs the date it was taken, in ISO 8601.");
    return ms;
}
/** Whole days from an earlier check-in to `now`, rounded down and never below 0 (the server's rule). */
export function daysBetween(takenAt, now) {
    const end = typeof now === "string" ? parseTakenAt(now) : now.getTime();
    return Math.max(0, Math.floor((end - parseTakenAt(takenAt)) / DAY_MS));
}
/** A clean copy holding only the contract's fields; scores are checked by the engine's rules. */
export function validateSnapshot(raw) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
        throw new CheckinStoreError("snapshot_not_object", "A check-in must be an object.");
    }
    const row = raw;
    parseTakenAt(row.taken_at);
    if (row.source !== "youcam" && row.source !== "local") {
        throw new CheckinStoreError("source_invalid", "A check-in comes from a YouCam analysis or the local estimate.");
    }
    const scores = scoresFromConcerns(row.concerns);
    return { taken_at: row.taken_at, source: row.source,
        concerns: Object.entries(scores).map(([concern, raw_score]) => ({ concern, raw_score })) };
}
function byTime(a, b) { return parseTakenAt(a.taken_at) - parseTakenAt(b.taken_at); }
/** Compare a later check-in with an earlier one, days counted from their dates. */
export function compareSnapshots(previous, current, photos = {}) {
    return compare(scoresFromConcerns(previous.concerns), scoresFromConcerns(current.concerns), {
        days: daysBetween(previous.taken_at, current.taken_at), previousAt: previous.taken_at,
        previousPhoto: photos.previous, currentPhoto: photos.current
    });
}
/** The trend over stored check-ins, days counted from the first as daysBetween does; when several
 * share a day count, the latest of them counts. */
export function snapshotHistory(snapshots) {
    const sorted = [...snapshots].sort(byTime);
    const points = [];
    for (const snap of sorted) {
        const day = daysBetween(sorted[0].taken_at, snap.taken_at);
        const point = { day, scores: scoresFromConcerns(snap.concerns) };
        if (points.length && points[points.length - 1].day === day)
            points[points.length - 1] = point;
        else
            points.push(point);
    }
    return history(points);
}
export class CheckinStore {
    storage;
    clock;
    items = [];
    lastNote = "";
    constructor(storage = browserStorage(), clock = () => new Date()) {
        this.storage = storage;
        this.clock = clock;
        let text = null;
        try {
            text = storage?.getItem(STORE_KEY) ?? null;
        }
        catch {
            this.lastNote = NOTES.unreadable;
            return;
        }
        if (text === null)
            return;
        try {
            if (text.length > MAX_STORED_CHARS)
                throw new Error("too large");
            const value = JSON.parse(text);
            const rows = value?.checkins;
            if (value?.format !== STORE_FORMAT || !Array.isArray(rows))
                throw new Error("unknown form");
            for (const row of rows) {
                try {
                    this.items.push(validateSnapshot(row));
                }
                catch {
                    this.lastNote = NOTES.skipped;
                }
            }
            this.items.sort(byTime);
        }
        catch {
            this.items = [];
            this.lastNote = NOTES.unreadable;
        }
    }
    /** The plain line to show after the last action (empty when there is nothing to say). */
    get note() { return this.lastNote; }
    /** Oldest first. Copies, so a caller cannot change what is stored. */
    list() { return this.items.map((s) => validateSnapshot(s)); }
    latest() { return this.items.length ? validateSnapshot(this.items[this.items.length - 1]) : null; }
    /** Keep one check-in. Anything beyond the contract's fields (a photo, a display score) is dropped. */
    add(raw) {
        const snapshot = validateSnapshot(raw);
        this.items.push(snapshot);
        this.items.sort(byTime);
        if (this.items.length > MAX_CHECKINS)
            this.items.splice(0, this.items.length - MAX_CHECKINS);
        return { snapshot, ...this.persist() };
    }
    /** Delete every check-in, from this page and from the device. */
    deleteAll() {
        this.items = [];
        if (!this.storage)
            return this.outcome(true, NOTES.deleted); // nothing was ever written to the device
        try {
            this.storage.removeItem(STORE_KEY);
            return this.outcome(true, NOTES.deleted);
        }
        catch {
            return this.outcome(false, NOTES.deleteFailed);
        }
    }
    exportData() {
        this.lastNote = NOTES.exported;
        return { format: STORE_FORMAT, exported_at: this.clock().toISOString(), note: NOTES.exported, checkins: this.list() };
    }
    /** The export as the text of a .json file. */
    exportText() { return JSON.stringify(this.exportData(), null, 1) + "\n"; }
    persist() {
        try {
            if (!this.storage)
                throw new Error("no storage");
            this.storage.setItem(STORE_KEY, JSON.stringify({ format: STORE_FORMAT, checkins: this.items }));
            return this.outcome(true, NOTES.saved);
        }
        catch {
            return this.outcome(false, NOTES.memory);
        }
    }
    outcome(stored, note) { this.lastNote = note; return { stored, note }; }
}
/** Check-ins read back from an exported file, each validated; refuses a file that is not an export. */
export function parseExport(text) {
    let value;
    try {
        value = JSON.parse(text);
    }
    catch {
        throw new CheckinStoreError("not_an_export", "This is not a check-in export file.");
    }
    const rows = value?.checkins;
    if (value?.format !== STORE_FORMAT || !Array.isArray(rows)) {
        throw new CheckinStoreError("not_an_export", "This is not a check-in export file.");
    }
    return rows.map((row) => validateSnapshot(row)).sort(byTime);
}
