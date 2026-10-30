export class Cancelled extends Error {
    constructor() { super("render cancelled"); this.name = "Cancelled"; }
}
export class Client {
    create;
    timeoutMs;
    worker = null;
    rejecter = null;
    timer = null;
    constructor(create = () => new Worker(new URL("./worker.js", import.meta.url), { type: "module" }), timeoutMs = 15_000) {
        this.create = create;
        this.timeoutMs = timeoutMs;
    }
    cancel() { if (this.timer)
        clearTimeout(this.timer); this.timer = null; this.worker?.terminate(); this.worker = null; if (this.rejecter) {
        const reject = this.rejecter;
        this.rejecter = null;
        reject(new Cancelled());
    } }
    run(job) { this.cancel(); return new Promise((resolve, reject) => { const worker = this.create(); this.worker = worker; this.rejecter = reject; const finish = () => { if (this.timer)
        clearTimeout(this.timer); this.timer = null; if (this.worker === worker)
        this.worker = null; if (this.rejecter === reject)
        this.rejecter = null; worker.terminate(); }; worker.onmessage = event => { const raw = event.data; if (raw.id !== job.id)
        return; if (!raw.ok || !raw.result) {
        finish();
        reject(new Error(raw.error ?? "worker failed"));
        return;
    } finish(); resolve(raw.result); }; worker.onerror = () => { finish(); reject(new Error("worker crashed")); }; this.timer = setTimeout(() => { finish(); reject(new Error("local render timed out")); }, this.timeoutMs); worker.postMessage({ job }); }); }
}
//# sourceMappingURL=client.js.map