export function focusKind(target) {
    const tag = target?.tagName?.toLowerCase();
    if (tag === "a")
        return "link";
    if (tag === "button")
        return "button";
    if (tag === "input" || tag === "textarea")
        return "input";
    if (tag === "select" || tag === "summary")
        return "control";
    return "other";
}
export class FocusObservationSession {
    host;
    total = 0;
    kinds = new Set();
    distinct = new Set();
    last = null;
    repeated = 0;
    active = false;
    handler;
    constructor(host) {
        this.host = host;
        this.handler = (event) => {
            if (!this.active || !event.target)
                return;
            this.total = Math.min(this.total + 1, 10000);
            this.kinds.add(focusKind(event.target));
            if (this.distinct.size < 100)
                this.distinct.add(event.target);
            this.repeated = this.last === event.target ? this.repeated + 1 : 0;
            this.last = event.target;
        };
    }
    start() {
        if (this.active)
            return;
        this.total = 0;
        this.repeated = 0;
        this.last = null;
        this.kinds.clear();
        this.distinct.clear();
        this.active = true;
        this.host.addEventListener("focusin", this.handler);
    }
    stop() {
        if (this.active)
            this.host.removeEventListener("focusin", this.handler);
        this.active = false;
        return this.snapshot;
    }
    get snapshot() {
        return {
            total: this.total,
            distinctKinds: [...this.kinds].sort(),
            // A hint only. Returning to the same element can be intentional.
            trappedCandidate: this.total >= 8 && this.distinct.size === 1 && this.repeated >= 7,
            started: this.active,
        };
    }
    dispose() {
        this.stop();
        this.distinct.clear();
        this.kinds.clear();
        this.last = null;
    }
}
