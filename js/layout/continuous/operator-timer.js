export const OPERATOR_TARGET_MS = 180_000;
const MAX_TIME = 86_400_000;
export function checkedClockTime(value) {
    if (!Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) {
        throw new RangeError("Invalid rehearsal clock reading");
    }
    return value;
}
export class OperatorClock {
    now;
    status = "idle";
    begunAt = null;
    runningFrom = null;
    activeMs = 0;
    finishedAt = null;
    lastSeen = 0;
    disposed = false;
    constructor(now) {
        this.now = now;
    }
    readNow() {
        if (this.disposed)
            throw new Error("Rehearsal clock closed");
        const next = checkedClockTime(this.now());
        if (next < this.lastSeen)
            throw new RangeError("Clock moved backward");
        this.lastSeen = next;
        return next;
    }
    start() {
        const now = this.readNow();
        if (this.status !== "idle")
            throw new Error("Rehearsal clock already started");
        this.begunAt = now;
        this.runningFrom = now;
        this.status = "running";
    }
    pause() {
        const now = this.readNow();
        if (this.status !== "running" || this.runningFrom === null)
            return false;
        this.activeMs += now - this.runningFrom;
        this.runningFrom = null;
        this.status = "paused";
        return true;
    }
    resume() {
        const now = this.readNow();
        if (this.status !== "paused")
            return false;
        this.runningFrom = now;
        this.status = "running";
        return true;
    }
    stop() {
        const now = this.readNow();
        if (this.status === "idle" || this.status === "stopped")
            return;
        if (this.runningFrom !== null)
            this.activeMs += now - this.runningFrom;
        this.runningFrom = null;
        this.finishedAt = now;
        this.status = "stopped";
    }
    reset() {
        this.readNow();
        this.status = "idle";
        this.begunAt = null;
        this.runningFrom = null;
        this.finishedAt = null;
        this.activeMs = 0;
    }
    snapshot() {
        const now = this.readNow();
        const additional = this.runningFrom === null ? 0 : now - this.runningFrom;
        const activeMs = Math.min(MAX_TIME, Math.max(0, this.activeMs + additional));
        const end = this.finishedAt ?? now;
        const wallMs = this.begunAt === null ? 0 : Math.min(MAX_TIME, end - this.begunAt);
        return Object.freeze({
            status: this.status,
            activeMs: Math.round(activeMs),
            wallMs: Math.round(wallMs),
            targetMs: OPERATOR_TARGET_MS,
            remainingMs: Math.max(0, OPERATOR_TARGET_MS - activeMs),
            exceeded: activeMs > OPERATOR_TARGET_MS,
            percent: Math.min(100, Math.round(100 * activeMs / OPERATOR_TARGET_MS)),
        });
    }
    dispose() {
        if (this.disposed)
            return;
        this.status = "stopped";
        this.runningFrom = null;
        this.disposed = true;
    }
}
export function operatorClockCaption(reading) {
    if (reading.status === "idle")
        return "Three-minute rehearsal clock not started.";
    const seconds = (reading.activeMs / 1000).toFixed(1);
    const limit = reading.exceeded ? "Target exceeded" : "Within the three-minute target";
    return `${seconds}s active (${reading.status}); ${limit}. Actual device performance is separate.`;
}
//# sourceMappingURL=operator-timer.js.map