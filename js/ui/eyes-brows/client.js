export class PreviewCancelled extends Error {
    constructor() { super("This preview was replaced or cancelled."); this.name = "PreviewCancelled"; }
}
export class PreviewClient {
    create;
    timeoutMs;
    worker = null;
    pending = null;
    timeout = null;
    closed = false;
    constructor(create = () => new Worker(new URL("./worker.js", import.meta.url), { type: "module" }), timeoutMs = 20_000) {
        this.create = create;
        this.timeoutMs = timeoutMs;
        if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000)
            throw new RangeError("Invalid local preview timeout.");
    }
    run(job) {
        if (this.closed)
            return Promise.reject(new Error("The preview worker is closed."));
        this.cancel();
        return new Promise((resolve, reject) => {
            let worker;
            try {
                worker = this.create();
            }
            catch {
                reject(new Error("This browser cannot start a local preview worker."));
                return;
            }
            this.worker = worker;
            this.pending = { id: job.id, resolve, reject };
            worker.onmessage = (event) => {
                if (this.worker !== worker || !this.pending || this.pending.id !== event.data?.id)
                    return;
                const pending = this.pending;
                this.release();
                if (event.data.ok === true)
                    pending.resolve(event.data.result);
                else
                    pending.reject(new Error(typeof event.data.message === "string" ? event.data.message : "The local preview failed."));
            };
            worker.onerror = () => {
                if (this.worker !== worker)
                    return;
                const pending = this.pending;
                this.release();
                pending?.reject(new Error("The local preview worker stopped. Your original photo is safe."));
            };
            this.timeout = setTimeout(() => {
                if (this.worker !== worker)
                    return;
                const pending = this.pending;
                this.release();
                pending?.reject(new Error("This preview exceeded the local time limit. Reduce the image or effect detail."));
            }, this.timeoutMs);
            try {
                // job() owns a clone. Transferring it cannot detach the session's original.
                worker.postMessage(job, [job.image.data.buffer]);
            }
            catch {
                const pending = this.pending;
                this.release();
                pending?.reject(new Error("The preview could not be sent to the local worker."));
            }
        });
    }
    cancel() {
        const pending = this.pending;
        this.release();
        pending?.reject(new PreviewCancelled());
    }
    release() {
        if (this.timeout !== null)
            clearTimeout(this.timeout);
        this.timeout = null;
        if (this.worker) {
            this.worker.onmessage = null;
            this.worker.onerror = null;
            this.worker.terminate();
        }
        this.worker = null;
        this.pending = null;
    }
    dispose() { this.closed = true; this.cancel(); }
    get running() { return this.pending !== null; }
}
