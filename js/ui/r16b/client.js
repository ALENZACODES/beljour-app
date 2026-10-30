export class Cancelled extends Error {
    constructor() { super("Preview cancelled."); this.name = "Cancelled"; }
}
export class Client {
    factory;
    timeoutMs;
    worker = null;
    pending = null;
    constructor(factory = () => new Worker(new URL("./worker.js", import.meta.url), { type: "module" }), timeoutMs = 20000) {
        this.factory = factory;
        this.timeoutMs = timeoutMs;
    }
    run(job) {
        this.cancel();
        return new Promise((resolve, reject) => {
            const w = this.factory();
            this.worker = w;
            this.pending = { id: job.id, resolve, reject };
            const timer = setTimeout(() => {
                if (this.worker === w) {
                    this.release();
                    reject(new Error("Local preview timed out."));
                }
            }, this.timeoutMs);
            w.onmessage = e => {
                if (this.worker !== w || this.pending?.id !== e.data?.id)
                    return;
                clearTimeout(timer);
                const p = this.pending;
                this.release();
                e.data.ok ? p?.resolve(e.data.result) : p?.reject(new Error(e.data.message ?? "Local preview failed."));
            };
            w.onerror = () => { clearTimeout(timer); const p = this.pending; this.release(); p?.reject(new Error("Local preview worker stopped.")); };
            w.postMessage(job, [job.image.data.buffer]);
        });
    }
    cancel() { const p = this.pending; this.release(); p?.reject(new Cancelled()); }
    release() {
        if (this.worker) {
            this.worker.onmessage = null;
            this.worker.onerror = null;
            this.worker.terminate();
        }
        this.worker = null;
        this.pending = null;
    }
}
//# sourceMappingURL=client.js.map