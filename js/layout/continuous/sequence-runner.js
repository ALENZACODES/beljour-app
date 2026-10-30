/** One-at-a-time local editing; no automatic consent, YouCam, export or Pro Commands. */
/** Author: John Khan. */
import { LOCAL_EDIT_SEQUENCE, safeSequenceElapsed, sameSequenceAuthority, sequenceAuthority, sequenceStep, } from "./sequence-contract.js";
/** Session-local, fixed evidence only. Never contains pixels or subject identifiers. */
export class LocalEditSequence {
    state;
    env;
    intervalMs;
    phase = "idle";
    reason = "none";
    completed = [];
    authority = null;
    timer = null;
    revision = 0;
    startedAt = 0;
    elapsedMs = 0;
    disposed = false;
    constructor(control) {
        this.state = control.state;
        this.env = control.environment;
        const interval = control.environment.intervalMs ?? 650;
        if (!Number.isSafeInteger(interval) || interval < 250 || interval > 2000) {
            throw new RangeError("Drawn replay interval must be between 250 and 2000 ms");
        }
        this.intervalMs = interval;
    }
    get snapshot() {
        const state = this.safeCurrent();
        const next = sequenceStep(this.completed.length);
        const startable = !this.disposed && this.phase === "idle"
            && next !== null && state !== null && state.step === "hair"
            && sequenceAuthority(state) !== null && this.env.drawnSource();
        const current = !this.disposed && state !== null && this.checkAuthority(state)
            && next !== null && state.step === next.effect && this.env.drawnSource();
        return Object.freeze({
            phase: this.phase,
            reason: this.reason,
            completed: Object.freeze(this.completed.map((entry) => ({ ...entry }))),
            nextEffect: next?.effect ?? null,
            remaining: LOCAL_EDIT_SEQUENCE.length - this.completed.length,
            total: LOCAL_EDIT_SEQUENCE.length,
            autoAllowed: !this.env.reducedMotion(),
            canStart: startable,
            canAdvance: startable || (this.phase === "paused" && current),
            canResume: this.phase === "paused" && current && !this.env.hidden()
                && !this.env.reducedMotion(),
            canPause: this.phase === "running",
            elapsedMs: this.elapsedMs,
            providerCalls: 0,
            imageSent: false,
            downloadRequested: false,
            liveEvidence: false,
        });
    }
    /** Play is always requested by a visitor. The first edit executes immediately. */
    play() {
        this.assertLive();
        if (this.phase === "paused")
            return this.resume();
        if (this.phase !== "idle")
            return false;
        if (!this.begin())
            return false;
        if (this.env.hidden() || this.env.reducedMotion()) {
            this.phase = "paused";
            this.reason = this.env.hidden() ? "hidden" : "reduced-motion";
            this.env.onUpdate();
            return false;
        }
        this.phase = "running";
        this.runOne(true);
        return this.phase === "running" || this.phase === "complete";
    }
    /** A reduced-motion visitor may explicitly perform one local illustration. */
    advance() {
        this.assertLive();
        if (this.phase === "idle" && !this.begin())
            return false;
        if (this.phase !== "paused")
            return false;
        if (this.env.hidden()) {
            this.stop("hidden");
            return false;
        }
        return this.runOne(false);
    }
    pause() {
        if (this.disposed || this.phase !== "running")
            return;
        this.clearTimer();
        this.phase = "paused";
        this.reason = "none";
        this.env.onUpdate();
    }
    visibilityChanged() {
        if (!this.disposed && this.phase === "running" && this.env.hidden()) {
            this.pauseHidden();
        }
    }
    resume() {
        this.assertLive();
        if (this.phase !== "paused")
            return false;
        const state = this.safeCurrent();
        if (!state || !this.checkAuthority(state) || !this.env.drawnSource()) {
            this.stop("source-changed");
            return false;
        }
        if (state.step !== sequenceStep(this.completed.length)?.effect) {
            this.stop("step-changed");
            return false;
        }
        if (this.env.hidden()) {
            this.reason = "hidden";
            this.env.onUpdate();
            return false;
        }
        if (this.env.reducedMotion()) {
            this.reason = "reduced-motion";
            this.env.onUpdate();
            return false;
        }
        this.reason = "none";
        this.phase = "running";
        this.enqueueNext();
        this.env.onUpdate();
        return true;
    }
    stop(reason = "manual-stop") {
        if (this.disposed)
            return;
        this.clearTimer();
        if (this.phase === "complete")
            return;
        this.phase = "refused";
        this.reason = reason;
        this.env.onUpdate();
    }
    invalidate(reason = "source-changed") {
        if (this.disposed)
            return;
        if (this.phase === "running" || this.phase === "paused")
            this.stop(reason);
    }
    /** Restarting clears only sequence observations, never the actual editor. */
    clear() {
        this.assertLive();
        this.clearTimer();
        this.completed.length = 0;
        this.phase = "idle";
        this.reason = "none";
        this.authority = null;
        this.elapsedMs = 0;
        this.startedAt = 0;
        this.env.onUpdate();
    }
    dispose() {
        if (this.disposed)
            return;
        this.clearTimer();
        this.disposed = true;
        this.phase = "refused";
        this.reason = "disposed";
        this.authority = null;
        this.completed.length = 0;
    }
    begin() {
        const state = this.safeCurrent();
        const authority = state ? sequenceAuthority(state) : null;
        if (!state || !authority || !this.env.drawnSource()) {
            this.refuseBeforeStart("consent-required");
            return false;
        }
        if (!state.identityLock) {
            this.refuseBeforeStart("identity-lock-required");
            return false;
        }
        if (state.step !== "hair") {
            this.refuseBeforeStart("step-changed");
            return false;
        }
        const start = this.env.clock();
        if (!Number.isFinite(start) || start < 0) {
            this.refuseBeforeStart("invalid-clock");
            return false;
        }
        this.authority = authority;
        this.phase = "paused";
        this.reason = "none";
        this.startedAt = start;
        this.elapsedMs = 0;
        this.completed.length = 0;
        return true;
    }
    runOne(automatic) {
        if (this.disposed || this.phase === "refused")
            return false;
        const state = this.safeCurrent();
        const item = sequenceStep(this.completed.length);
        if (!state || !item || !this.env.drawnSource() || !this.checkAuthority(state)) {
            this.stop("source-changed");
            return false;
        }
        if (state.step !== item.effect) {
            this.stop("step-changed");
            return false;
        }
        if (!state.identityLock) {
            this.stop("identity-lock-required");
            return false;
        }
        const before = this.env.clock();
        if (!Number.isFinite(before) || before < 0) {
            this.stop("invalid-clock");
            return false;
        }
        try {
            if (!this.state.apply(item.effect)) {
                this.stop("edit-refused");
                return false;
            }
            if (!this.state.next()) {
                this.stop("step-changed");
                return false;
            }
        }
        catch {
            this.stop("edit-refused");
            return false;
        }
        const after = this.env.clock();
        const duration = safeSequenceElapsed(before, after);
        const total = safeSequenceElapsed(this.startedAt, after);
        if (duration === null || total === null) {
            this.stop("invalid-clock");
            return false;
        }
        this.completed.push(Object.freeze({
            effect: item.effect,
            level: state.levels[item.effect],
            durationMs: duration,
            kind: "drawn",
        }));
        this.elapsedMs = total;
        if (this.completed.length === LOCAL_EDIT_SEQUENCE.length) {
            this.phase = "complete";
            this.reason = "none";
            this.clearTimer();
        }
        else if (automatic) {
            this.phase = "running";
            this.enqueueNext();
        }
        else {
            this.phase = "paused";
        }
        this.env.onUpdate();
        return true;
    }
    enqueueNext() {
        this.clearTimer();
        if (this.phase !== "running")
            return;
        const revision = this.revision;
        try {
            this.timer = this.env.scheduler.schedule(() => {
                if (this.disposed || revision !== this.revision || this.phase !== "running")
                    return;
                this.timer = null;
                if (this.env.hidden()) {
                    this.pauseHidden();
                    return;
                }
                if (this.env.reducedMotion()) {
                    this.pauseReducedMotion();
                    return;
                }
                this.runOne(true);
            }, this.intervalMs);
        }
        catch {
            this.stop("edit-refused");
        }
    }
    pauseHidden() {
        this.clearTimer();
        this.phase = "paused";
        this.reason = "hidden";
        this.env.onUpdate();
    }
    pauseReducedMotion() {
        this.clearTimer();
        this.phase = "paused";
        this.reason = "reduced-motion";
        this.env.onUpdate();
    }
    refuseBeforeStart(reason) {
        this.phase = "refused";
        this.reason = reason;
        this.env.onUpdate();
    }
    checkAuthority(state) {
        return sameSequenceAuthority(this.authority, sequenceAuthority(state));
    }
    clearTimer() {
        this.revision += 1;
        if (this.timer !== null) {
            this.env.scheduler.cancel(this.timer);
            this.timer = null;
        }
    }
    safeCurrent() {
        if (this.disposed)
            return null;
        try {
            return this.state.snapshot;
        }
        catch {
            return null;
        }
    }
    assertLive() {
        if (this.disposed)
            throw new Error("The drawn replay has been disposed");
    }
}
//# sourceMappingURL=sequence-runner.js.map