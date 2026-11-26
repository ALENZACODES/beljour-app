/** Bounded local-only Save/Proof diagnostics; no photos, IDs or freeform errors.
 *
 * Logs are held in memory, summarized by an explicit whitelist, and vanish on
 * teardown. Timings are local execution observations, not device acceptance
 * or performance-budget results. Nothing sends data to a server or console.
 * Author: John Khan.
 */
export const DIAGNOSTIC_FORMAT = "beljour-save-proof-diagnostics/1";
export const DIAGNOSTIC_CODES = [
    "check_started",
    "check_completed",
    "check_incomplete",
    "check_cancelled",
    "photo_replaced",
    "storage_denied",
    "receipt_denied",
    "resource_limited",
];
export class LocalProofDiagnostics {
    clock;
    limit;
    entries = [];
    nextToken = 1;
    active = new Map();
    constructor(clock = { now: () => performance.now() }, limit = 32) {
        this.clock = clock;
        this.limit = limit;
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > 256) {
            throw new RangeError("local diagnostic capacity must be 1 to 256");
        }
    }
    readNow() {
        const value = this.clock.now();
        if (!Number.isFinite(value) || value < 0)
            throw new TypeError("invalid local elapsed clock");
        return value;
    }
    add(code, roundedMs) {
        if (!DIAGNOSTIC_CODES.includes(code))
            throw new TypeError("unapproved diagnostic event code");
        this.entries.push({ code, roundedMs });
        while (this.entries.length > this.limit)
            this.entries.shift();
    }
    /** An operation token is internal and never included in report output. */
    begin() {
        const at = this.readNow();
        const token = this.nextToken++;
        if (this.active.size >= this.limit) {
            const oldest = this.active.keys().next().value;
            if (oldest !== undefined)
                this.active.delete(oldest);
            this.add("check_incomplete", null);
        }
        this.active.set(token, at);
        this.add("check_started", null);
        return token;
    }
    /** Unknown/stale tokens do not create another completion or a false duration. */
    finish(token, code) {
        const begin = this.active.get(token);
        if (begin === undefined)
            return false;
        const now = this.readNow();
        this.active.delete(token);
        if (now < begin) {
            this.add("check_incomplete", null);
            return false;
        }
        const roundedMs = Math.min(1_000_000, Math.ceil((now - begin) / 10) * 10);
        this.add(code, roundedMs);
        return true;
    }
    /** Only predefined non-identifying codes; freeform messages are rejected. */
    note(code) {
        this.add(code, null);
    }
    /** Clears all volatile timings and prevents a stale token being reused. */
    reset() {
        this.entries.length = 0;
        this.active.clear();
        this.nextToken++;
    }
    report() {
        const counts = Object.fromEntries(DIAGNOSTIC_CODES.map((name) => [name, 0]));
        let completedWithTiming = 0;
        let totalRoundedMs = 0;
        for (const event of this.entries) {
            counts[event.code]++;
            if (event.roundedMs !== null) {
                completedWithTiming++;
                totalRoundedMs += event.roundedMs;
            }
        }
        return {
            format: DIAGNOSTIC_FORMAT,
            events: this.entries.length,
            counts,
            completedWithTiming,
            totalRoundedMs,
            assurance: "local-observations-only",
        };
    }
}
export function validateDiagnostics(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
        throw new TypeError("invalid local diagnostic report");
    const data = raw;
    const fields = ["format", "events", "counts", "completedWithTiming", "totalRoundedMs", "assurance"];
    if (Object.keys(data).length !== fields.length || fields.some((key) => !Object.hasOwn(data, key)) ||
        data.format !== DIAGNOSTIC_FORMAT || data.assurance !== "local-observations-only") {
        throw new TypeError("diagnostic fields differ from the approved format");
    }
    const valid = (value) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000_000;
    if (!valid(data.events) || data.events > 256 || !valid(data.completedWithTiming) ||
        !valid(data.totalRoundedMs)) {
        throw new TypeError("invalid local timing counts");
    }
    const rawCounts = data.counts;
    if (!rawCounts || typeof rawCounts !== "object" || Array.isArray(rawCounts)) {
        throw new TypeError("invalid approved diagnostic codes");
    }
    const object = rawCounts;
    if (Object.keys(object).length !== DIAGNOSTIC_CODES.length ||
        DIAGNOSTIC_CODES.some((code) => !Object.hasOwn(object, code) || !valid(object[code]))) {
        throw new TypeError("invalid diagnostic counts");
    }
    const total = DIAGNOSTIC_CODES.reduce((sum, code) => sum + object[code], 0);
    if (total !== data.events || data.completedWithTiming > data.events ||
        data.totalRoundedMs > data.completedWithTiming * 1_000_000) {
        throw new TypeError("unsupported diagnostic summary");
    }
    return data;
}
//# sourceMappingURL=proof-diagnostics.js.map