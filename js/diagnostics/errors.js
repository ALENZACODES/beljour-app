/** Bounded, local diagnostic codes. Never read exception messages, stacks, URLs,
 * file names or arbitrary object properties. Nothing is uploaded. Author: John Khan. */
export const DIAGNOSTIC_CODES = ["script_error", "unhandled_rejection", "storage_denied", "render_refused", "context_lost", "offline_unavailable"];
export const DIAGNOSTIC_AREAS = ["editor", "storage", "gpu", "offline", "application"];
export class LocalDiagnostics {
    capacity;
    rows = [];
    sequence = 0;
    listeners = new Set();
    constructor(capacity = 40) {
        this.capacity = capacity;
        if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100)
            throw new RangeError("Diagnostic capacity must be 1 to 100");
    }
    record(code, area = "application", durationMs) {
        if (!DIAGNOSTIC_CODES.includes(code) || !DIAGNOSTIC_AREAS.includes(area))
            return false;
        const row = { sequence: ++this.sequence, code, area };
        if (typeof durationMs === "number" && Number.isFinite(durationMs) && durationMs >= 0)
            row.durationMs = Math.min(60_000, Math.round(durationMs));
        this.rows.push(row);
        if (this.rows.length > this.capacity)
            this.rows.shift();
        this.changed();
        return true;
    }
    snapshot() { return this.rows.map((row) => ({ ...row })); }
    exportText() {
        return JSON.stringify({ format: "beljour-local-diagnostics/1", scope: "this page only", events: this.snapshot() }, null, 2);
    }
    clear() { this.rows = []; this.sequence = 0; this.changed(); }
    subscribe(listener) {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    }
    changed() { for (const listener of this.listeners) {
        try {
            listener();
        }
        catch { /* an optional panel cannot break editing */ }
    } }
    /** Listeners record only constant codes. Even hostile getters on an Error are untouched. */
    listen(target) {
        const error = () => { this.record("script_error"); };
        const rejected = () => { this.record("unhandled_rejection"); };
        target.addEventListener("error", error);
        target.addEventListener("unhandledrejection", rejected);
        let active = true;
        return () => {
            if (!active)
                return;
            active = false;
            target.removeEventListener("error", error);
            target.removeEventListener("unhandledrejection", rejected);
        };
    }
}
