/** State is a UI fact, not a claim that editing works offline or on a phone. */
export class InstallState {
    offline;
    install;
    waiting = false;
    acknowledged = false;
    error = "none";
    observers = new Set();
    constructor(capability) {
        this.offline = capability.secure && capability.worker ? "available" : "unsupported";
        this.install = capability.secure ? capability.standalone ? "installed" : "browser-menu" : "unsupported";
    }
    get snapshot() {
        return {
            offline: this.offline,
            install: this.install,
            updateWaiting: this.waiting,
            updateAcknowledged: this.acknowledged,
            errorCode: this.error,
            verifiedOffline: false,
            explanation: "Only public shell files may be cached. Actual offline editing and device installation need real-browser checks.",
        };
    }
    subscribe(listener) {
        this.observers.add(listener);
        listener(this.snapshot);
        return () => this.observers.delete(listener);
    }
    notify() {
        const snap = this.snapshot;
        for (const observer of this.observers)
            observer(snap);
    }
    setOffline(value, error = "none") {
        if (this.offline === "unsupported" && value !== "unsupported")
            return;
        this.offline = value;
        this.error = error;
        this.notify();
    }
    promptAvailable() {
        if (this.install === "browser-menu" || this.install === "dismissed") {
            this.install = "prompt-ready";
            this.notify();
        }
    }
    promptStarted() {
        if (this.install !== "prompt-ready")
            throw new RangeError("No install prompt available");
        this.install = "asking";
        this.notify();
    }
    promptChoice(accepted) {
        if (this.install !== "asking")
            throw new RangeError("Install choice without prompt");
        this.install = accepted ? "accepted" : "dismissed";
        this.notify();
    }
    promptFailed() {
        this.install = "browser-menu";
        this.error = "prompt";
        this.notify();
    }
    installed() {
        this.install = "installed";
        this.notify();
    }
    setUpdateWaiting(waiting) {
        this.waiting = waiting;
        if (!waiting)
            this.acknowledged = false;
        this.notify();
    }
    confirmSavedWork(value) {
        this.acknowledged = this.waiting && value;
        this.notify();
    }
    appliedUpdate() {
        this.waiting = false;
        this.acknowledged = false;
        this.notify();
    }
    canApplyUpdate() {
        return this.waiting && this.acknowledged;
    }
    dispose() {
        this.observers.clear();
    }
}
//# sourceMappingURL=install-state.js.map