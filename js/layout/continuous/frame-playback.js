/** A three-step replay of cache hits, never a task runner. Author: John Khan. */
import { FRAME_IDS, } from "./frame-cache-contract.js";
/** No background repetition. No cache miss may trigger rendering or a remote fallback. */
export class CachedFramePlayback {
    cache;
    select;
    scheduler;
    hidden;
    reducedMotion;
    changed;
    stepMs;
    phase = "idle";
    index = -1;
    observed = 0;
    handle = null;
    generation = 0;
    disposed = false;
    constructor(options) {
        const delay = options.stepMs ?? 650;
        if (!Number.isSafeInteger(delay) || delay < 250 || delay > 2000) {
            throw new RangeError("Cached slideshow delay must be 250 to 2000 milliseconds");
        }
        this.cache = options.cache;
        this.select = options.select;
        this.scheduler = options.scheduler;
        this.hidden = options.hidden;
        this.reducedMotion = options.reducedMotion;
        this.changed = options.changed ?? (() => { });
        this.stepMs = delay;
    }
    get snapshot() {
        return {
            phase: this.phase,
            index: this.index,
            observed: this.observed,
            selected: this.index < 0 ? null : FRAME_IDS[this.index],
            providerRequests: 0,
            unitsSpent: 0,
            automaticDownload: false,
        };
    }
    clearTimer() {
        if (this.handle !== null) {
            this.scheduler.cancel(this.handle);
            this.handle = null;
        }
        this.generation += 1;
    }
    emit() {
        if (!this.disposed)
            this.changed();
    }
    cacheReady() {
        const status = this.cache();
        return status.phase === "ready" && status.available === FRAME_IDS.length;
    }
    step() {
        if (!this.cacheReady() || this.hidden()) {
            this.stop("refused");
            return false;
        }
        const next = this.index + 1;
        if (next >= FRAME_IDS.length) {
            this.clearTimer();
            this.phase = "complete";
            this.emit();
            return false;
        }
        if (!this.select(FRAME_IDS[next])) {
            this.stop("refused");
            return false;
        }
        this.index = next;
        this.observed = Math.max(this.observed, next + 1);
        if (this.index === FRAME_IDS.length - 1) {
            this.clearTimer();
            this.phase = "complete";
        }
        this.emit();
        return true;
    }
    scheduleNext() {
        if (this.disposed || this.phase !== "playing")
            return;
        this.clearTimer();
        const ticket = this.generation;
        this.handle = this.scheduler.schedule(() => {
            if (ticket !== this.generation || this.disposed || this.phase !== "playing")
                return;
            this.handle = null;
            if (this.step() && this.phase === "playing")
                this.scheduleNext();
        }, this.stepMs);
    }
    start() {
        if (this.disposed || !this.cacheReady() || this.hidden() || this.reducedMotion()) {
            if (!this.disposed)
                this.stop("refused");
            return false;
        }
        this.stop();
        this.phase = "playing";
        if (!this.step())
            return false;
        if (this.phase === "playing")
            this.scheduleNext();
        return true;
    }
    pause() {
        if (this.disposed || this.phase !== "playing")
            return;
        this.clearTimer();
        this.phase = "paused";
        this.emit();
    }
    resume() {
        if (this.disposed || this.phase !== "paused")
            return false;
        if (this.hidden() || this.reducedMotion() || !this.cacheReady()) {
            this.stop("refused");
            return false;
        }
        this.phase = "playing";
        this.scheduleNext();
        this.emit();
        return true;
    }
    advance() {
        if (this.disposed)
            return false;
        if (this.phase === "playing")
            this.pause();
        if (this.phase === "complete")
            return false;
        this.phase = "paused";
        return this.step();
    }
    visibilityChanged() {
        if (this.hidden())
            this.pause();
    }
    stop(next = "idle", notify = true) {
        if (this.disposed)
            return;
        this.clearTimer();
        this.phase = next;
        this.index = -1;
        this.observed = 0;
        if (notify)
            this.emit();
    }
    dispose() {
        if (this.disposed)
            return;
        this.stop();
        this.clearTimer();
        this.disposed = true;
        this.phase = "disposed";
    }
}
