/** In-memory operator history with strict invalidation. Author: John Khan. */
import { RELEASE_CHECKS, isReleaseId, isReleaseRefusal, releaseCheck, } from "./catalogue.js";
function safeTime(value) {
    if (!Number.isFinite(value) || value < 0 || value > 1e15) {
        throw new RangeError("Clock reading out of range");
    }
    return value;
}
function blankRow(id) {
    return { id, state: "unobserved", refusal: null, elapsedMs: null };
}
export class ReleaseSession {
    now;
    phase = "not-started";
    revision = 0;
    rows = new Map(RELEASE_CHECKS.map((row) => [row.id, blankRow(row.id)]));
    startedAt = null;
    endedAt = null;
    priorMs = 0;
    constructor(now = () => performance.now()) {
        this.now = now;
    }
    time() {
        return safeTime(this.now());
    }
    get snapshot() {
        const rows = RELEASE_CHECKS.map((definition) => ({ ...this.rows.get(definition.id) }));
        return Object.freeze({
            phase: this.phase,
            revision: this.revision,
            elapsedMs: this.elapsed(),
            rows: Object.freeze(rows),
            localChecks: rows.filter((row) => row.state === "reviewed").length,
            independentlyVerified: false,
            productionReady: false,
        });
    }
    elapsed() {
        const runningMs = this.startedAt === null ? 0 : Math.max(0, this.time() - this.startedAt);
        return Math.round(Math.min(this.priorMs + runningMs, 3_600_000));
    }
    start() {
        if (this.phase !== "not-started")
            throw new Error("Already started or stopped");
        this.startedAt = this.time();
        this.priorMs = 0;
        this.endedAt = null;
        this.phase = "running";
        this.revision += 1;
    }
    stop() {
        if (this.phase !== "running")
            throw new Error("Rehearsal is not running");
        this.priorMs = this.elapsed();
        this.startedAt = null;
        this.endedAt = this.time();
        this.phase = "stopped";
        this.revision += 1;
    }
    reset() {
        this.phase = "not-started";
        this.revision += 1;
        this.startedAt = null;
        this.endedAt = null;
        this.priorMs = 0;
        this.rows = new Map(RELEASE_CHECKS.map((definition) => [definition.id, blankRow(definition.id)]));
    }
    update(id, state, refusal) {
        if (!isReleaseId(id))
            throw new RangeError("Unknown release check");
        if (this.phase !== "running")
            throw new Error("Start the rehearsal first");
        const definition = releaseCheck(id);
        if (definition.classification === "independent" && state === "reviewed") {
            throw new Error("Independent release evidence cannot be verified in this browser");
        }
        this.rows.set(id, { id, state, refusal, elapsedMs: this.elapsed() });
        this.revision += 1;
    }
    open(id) {
        if (!releaseCheck(id).route)
            throw new Error("This check has no public route");
        this.update(id, "opened", null);
    }
    review(id) {
        const definition = releaseCheck(id);
        if (definition.classification !== "operator") {
            throw new Error("Only operator checks can be marked reviewed");
        }
        const previous = this.rows.get(id);
        if (!previous || (previous.state !== "opened" && previous.state !== "reviewed")) {
            throw new Error("Open the application route before reporting a review");
        }
        this.update(id, "reviewed", null);
    }
    refuse(id, reason) {
        if (!isReleaseRefusal(reason))
            throw new RangeError("Invalid refusal category");
        this.update(id, "refused", reason);
    }
    clear(id) {
        if (this.phase !== "running")
            throw new Error("Rehearsal is not running");
        this.rows.set(id, blankRow(id));
        this.revision += 1;
    }
    /** New photo, subject or permission: stale marks have no evidentiary value. */
    invalidate(reason) {
        if (!["source", "subject", "consent", "identity-lock"].includes(reason)) {
            throw new RangeError("Invalid invalidation reason");
        }
        for (const definition of RELEASE_CHECKS) {
            if (definition.classification === "operator") {
                this.rows.set(definition.id, blankRow(definition.id));
            }
        }
        this.revision += 1;
    }
    get stoppedAt() {
        return this.endedAt;
    }
}
