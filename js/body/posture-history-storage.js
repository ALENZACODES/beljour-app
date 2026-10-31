/** Versioned, source-bound recovery of posture edit settings for this tab.
 * The record holds only the validated fix, view, level, lock level and undo cursor,
 * a one-way photo binding and an integrity digest. The digest catches corruption
 * and partial writes; it is not a secret, so it does not stop a deliberate rewrite,
 * and every restored value is validated again regardless. No pixels, keypoints, masks,
 * filenames or the photo's own digest are written, and nothing leaves the device.
 * Readable at rest; posture-history-protected.ts is the encrypted alternative.
 * Author: John Khan.
 */
import { checkedPostureSettings } from "./posture-history.js";
export const POSTURE_HISTORY_FORMAT = "beljour-posture-history/1";
export const POSTURE_HISTORY_KEY = "beljour:posture-history:v1";
export const POSTURE_HISTORY_RECORD_BYTES = 16384;
const RECORD_KEYS = "binding,check,cursor,entries,format";
const STORE_KEY = /^[a-z0-9:_-]{1,64}$/;
const HASH = /^[0-9a-f]{64}$/;
function checkedKey(key) {
    if (typeof key !== "string" || !STORE_KEY.test(key))
        throw new RangeError("Invalid posture history key");
}
async function sha256Hex(text) {
    if (!globalThis.crypto?.subtle)
        throw new RangeError("Secure hashing unavailable");
    const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join("");
}
/** Domain-separated one-way binding, so the stored value is not the photo digest itself. */
export async function postureHistoryBinding(sourceSha256) {
    if (typeof sourceSha256 !== "string" || !HASH.test(sourceSha256)) {
        throw new RangeError("photo hash must be 64 lowercase hexadecimal characters");
    }
    return sha256Hex(`${POSTURE_HISTORY_FORMAT}\0source\0${sourceSha256}`);
}
/** The digest covers every stored field in a fixed order, independent of parsed key order. */
async function recordCheck(binding, entries, cursor) {
    return sha256Hex(`${POSTURE_HISTORY_FORMAT}\0check\0${JSON.stringify({ binding, entries, cursor })}`);
}
export async function savePostureHistory(store, sourceSha256, history, key = POSTURE_HISTORY_KEY) {
    checkedKey(key);
    const binding = await postureHistoryBinding(sourceSha256);
    const settings = checkedPostureSettings(history.exportSettings(sourceSha256), history.maxEntries, history.maxBytes);
    const check = await recordCheck(binding, settings.entries, settings.cursor);
    const record = JSON.stringify({
        format: POSTURE_HISTORY_FORMAT, binding,
        entries: settings.entries, cursor: settings.cursor, check,
    });
    if (record.length > POSTURE_HISTORY_RECORD_BYTES)
        throw new RangeError("Posture history is oversized");
    store.setItem(key, record);
}
/** False when nothing is stored. Throws, without changing `history`, for another photo,
 * a corrupted or invalid record or an unknown version. */
export async function restorePostureHistory(store, sourceSha256, history, key = POSTURE_HISTORY_KEY) {
    checkedKey(key);
    const raw = store.getItem(key);
    if (raw === null)
        return false;
    if (typeof raw !== "string" || raw.length > POSTURE_HISTORY_RECORD_BYTES) {
        throw new RangeError("Posture history is oversized");
    }
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        throw new RangeError("Invalid posture history record");
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) ||
        Object.keys(parsed).sort().join(",") !== RECORD_KEYS) {
        throw new RangeError("Invalid posture history record");
    }
    const fields = parsed;
    if (fields.format !== POSTURE_HISTORY_FORMAT)
        throw new RangeError("Unsupported posture history version");
    if (typeof fields.binding !== "string" || typeof fields.check !== "string") {
        throw new RangeError("Invalid posture history record");
    }
    if (fields.binding !== await postureHistoryBinding(sourceSha256)) {
        throw new RangeError("Posture history belongs to a different photo");
    }
    const settings = checkedPostureSettings({ entries: fields.entries, cursor: fields.cursor }, history.maxEntries, history.maxBytes);
    if (fields.check !== await recordCheck(fields.binding, settings.entries, settings.cursor)) {
        throw new RangeError("Posture history failed its integrity check");
    }
    history.restoreSettings(sourceSha256, settings);
    return true;
}
export function clearPostureHistory(store, key = POSTURE_HISTORY_KEY) {
    checkedKey(key);
    store.removeItem(key);
}
/** This tab's sessionStorage, or null when the browser denies it (memory-only editing). */
export function browserPostureSettingsStore() {
    try {
        return globalThis.sessionStorage ?? null;
    }
    catch {
        return null;
    }
}
