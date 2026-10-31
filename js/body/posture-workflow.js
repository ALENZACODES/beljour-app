/** Revision-bound, cancellable posture preview workflow.
 * Slider drags coalesce so only the newest pending drag renders; a release always renders at
 * full size. Changing the photo (a new revision), cancelling or disposing makes every
 * outstanding request stale, and a stale result is never delivered as current.
 * Author: John Khan.
 */
import { checkedPostureLevel } from "../engines/local/posture.js";
export class PostureWorkflow {
    runner;
    schedule;
    revisionValue = 0;
    ticketValue = 0;
    latestTicket = 0;
    pendingDrag = null;
    disposed = false;
    constructor(runner, schedule = (task) => queueMicrotask(task)) {
        this.runner = runner;
        this.schedule = schedule;
    }
    get revision() { return this.revisionValue; }
    get isDisposed() { return this.disposed; }
    /** A new photo or annotation: everything outstanding becomes stale. */
    setPhoto() {
        this.requireOpen();
        this.dropPendingDrag();
        this.revisionValue++;
        return this.revisionValue;
    }
    drag(fix, level, lockLevel) {
        return this.enqueue("preview", fix, level, lockLevel);
    }
    release(fix, level, lockLevel) {
        return this.enqueue("release", fix, level, lockLevel);
    }
    cancel() {
        this.dropPendingDrag();
        this.latestTicket = ++this.ticketValue;
    }
    dispose() {
        if (this.disposed)
            return;
        this.cancel();
        this.disposed = true;
    }
    requireOpen() {
        if (this.disposed)
            throw new RangeError("posture workflow has been disposed");
    }
    dropPendingDrag() {
        const pending = this.pendingDrag;
        this.pendingDrag = null;
        pending?.resolve({ status: "stale", request: pending.request });
    }
    current(request) {
        return !this.disposed && request.revision === this.revisionValue && request.ticket === this.latestTicket;
    }
    enqueue(stage, fix, level, lockLevel) {
        this.requireOpen();
        const request = { ticket: ++this.ticketValue, revision: this.revisionValue, stage, fix,
            level: checkedPostureLevel(level), lockLevel: checkedPostureLevel(lockLevel) };
        this.latestTicket = request.ticket;
        return new Promise((resolve) => {
            if (stage === "preview") {
                this.dropPendingDrag();
                this.pendingDrag = { request, resolve };
            }
            else {
                this.dropPendingDrag();
            }
            this.schedule(() => {
                if (stage === "preview") {
                    if (this.pendingDrag?.request !== request)
                        return;
                    this.pendingDrag = null;
                }
                void this.execute(request, resolve);
            });
        });
    }
    async execute(request, resolve) {
        if (!this.current(request)) {
            resolve({ status: "stale", request });
            return;
        }
        try {
            const value = await this.runner(request);
            resolve(this.current(request) ? { status: "done", request, value } : { status: "stale", request });
        }
        catch (error) {
            resolve(this.current(request) ? { status: "failed", request, error } : { status: "stale", request });
        }
    }
}
