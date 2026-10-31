export const JUDGE_TARGET_MS = 3 * 60 * 1000;
const MAX_ELAPSED_MS = 24 * 60 * 60 * 1000;
export function formatRehearsalTime(milliseconds) {
    const time = Number.isFinite(milliseconds)
        ? Math.max(0, Math.min(MAX_ELAPSED_MS, Math.floor(milliseconds)))
        : 0;
    const minutes = Math.floor(time / 60_000);
    const seconds = Math.floor(time / 1000) % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
export function rehearsalBudgetLabel(milliseconds, target = JUDGE_TARGET_MS) {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) {
        return "Timing unavailable";
    }
    if (!Number.isFinite(target) || target <= 0) {
        return "No timing target set";
    }
    const delta = Math.abs(target - milliseconds);
    if (milliseconds <= target) {
        return `${formatRehearsalTime(delta)} of the three-minute target remaining`;
    }
    return `${formatRehearsalTime(delta)} past the three-minute target`;
}
/**
 * The measured clock starts when a person opens the guide, and stops on exit.
 * It is paused when the page is hidden. No timestamps or telemetry persist.
 * Explicit injection makes it deterministic without editing the global clock.
 */
export class JudgeRehearsal {
    clock;
    accumulated = 0;
    runningFrom = null;
    started = false;
    finished = false;
    lastNow = 0;
    constructor(clock = { now: () => performance.now() }) {
        this.clock = clock;
    }
    safeNow() {
        let timestamp;
        try {
            timestamp = this.clock.now();
        }
        catch {
            return this.lastNow;
        }
        if (!Number.isFinite(timestamp))
            return this.lastNow;
        this.lastNow = Math.max(this.lastNow, timestamp);
        return this.lastNow;
    }
    start() {
        if (this.finished || this.runningFrom !== null)
            return false;
        this.runningFrom = this.safeNow();
        this.started = true;
        return true;
    }
    pause() {
        if (this.runningFrom === null || this.finished)
            return false;
        this.accumulated = Math.min(MAX_ELAPSED_MS, this.elapsedMs());
        this.runningFrom = null;
        return true;
    }
    resume() {
        if (!this.started || this.finished)
            return false;
        return this.start();
    }
    stop() {
        if (this.finished)
            return this.accumulated;
        this.pause();
        this.finished = true;
        return this.accumulated;
    }
    elapsedMs() {
        if (this.runningFrom === null)
            return this.accumulated;
        const elapsed = Math.max(0, this.safeNow() - this.runningFrom);
        return Math.min(MAX_ELAPSED_MS, this.accumulated + elapsed);
    }
    snapshot() {
        const elapsedMs = this.elapsedMs();
        return {
            elapsedMs,
            running: this.runningFrom !== null,
            hasStarted: this.started,
            withinTarget: elapsedMs <= JUDGE_TARGET_MS,
            display: formatRehearsalTime(elapsedMs),
            budgetDisplay: rehearsalBudgetLabel(elapsedMs),
        };
    }
    reset() {
        this.accumulated = 0;
        this.runningFrom = null;
        this.started = false;
        this.finished = false;
        this.lastNow = 0;
    }
}
/** Event listeners are attached only while Judge Mode is active. */
export function observeRehearsalVisibility(clock, doc) {
    const onVisibility = () => {
        if (doc.hidden)
            clock.pause();
        else
            clock.resume();
    };
    doc.addEventListener("visibilitychange", onVisibility);
    if (doc.hidden)
        clock.pause();
    return () => doc.removeEventListener("visibilitychange", onVisibility);
}
