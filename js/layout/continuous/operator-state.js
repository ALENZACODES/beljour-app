/** In-memory operator checks; every manual mark is self-reported, never verified. */
import { OPERATOR_ROUTE_IDS, operatorRoutes, validRefusal, } from "./operator-contract.js";
import { OperatorClock } from "./operator-timer.js";
export class OperatorRehearsal {
    values = new Map();
    routes = operatorRoutes();
    sourceRevision = 0;
    version = 0;
    disposed = false;
    clock;
    constructor(now) {
        this.clock = new OperatorClock(now);
        this.resetRows();
    }
    assertLive() {
        if (this.disposed)
            throw new Error("Operator rehearsal ended");
    }
    resetRows() {
        this.values.clear();
        for (const id of OPERATOR_ROUTE_IDS) {
            this.values.set(id, { result: "not-started", refusal: null, elapsedMs: null });
        }
    }
    /** Source, subject or consent changes revoke all manual marks. */
    reset(sourceRevision) {
        this.assertLive();
        if (!Number.isInteger(sourceRevision) || sourceRevision < 0) {
            throw new RangeError("Source revision must be non-negative");
        }
        this.sourceRevision = sourceRevision;
        this.version += 1;
        this.resetRows();
        this.clock.reset();
    }
    start() {
        this.assertLive();
        this.clock.start();
    }
    update(id, outcome, refusal) {
        this.assertLive();
        const old = this.values.get(id);
        if (!old)
            throw new RangeError("Unknown operator check");
        if (this.clock.snapshot().status === "idle")
            return false;
        if (this.clock.snapshot().status === "stopped")
            return false;
        const elapsedMs = this.clock.snapshot().activeMs;
        this.values.set(id, { result: outcome, refusal, elapsedMs });
        this.version += 1;
        return true;
    }
    open(id) {
        const current = this.values.get(id);
        if (!current)
            throw new RangeError("Unknown operator check");
        if (current.result === "self-reported")
            return false;
        return this.update(id, "opened", null);
    }
    /** Human checked the separate page; no API or quality evidence is asserted. */
    acknowledge(id) {
        const current = this.values.get(id);
        if (!current)
            throw new RangeError("Unknown operator check");
        if (current.result !== "opened")
            return false;
        return this.update(id, "self-reported", null);
    }
    refuse(id, reason) {
        if (!validRefusal(reason))
            throw new RangeError("Unknown refusal reason");
        return this.update(id, "refused", reason);
    }
    clear(id) {
        this.assertLive();
        if (!this.values.has(id))
            throw new RangeError("Unknown operator check");
        this.values.set(id, { result: "not-started", refusal: null, elapsedMs: null });
        this.version += 1;
        return true;
    }
    get snapshot() {
        this.assertLive();
        const rows = this.routes.map((route) => {
            const row = this.values.get(route.id);
            if (!row)
                throw new Error("Operator check missing");
            return Object.freeze({
                ...route,
                result: row.result,
                refusal: row.refusal,
                elapsedMs: row.elapsedMs,
                liveVerified: false,
            });
        });
        const counts = this.counts(rows);
        return Object.freeze({
            rows: Object.freeze(rows),
            counts,
            clock: this.clock.snapshot(),
            sourceRevision: this.sourceRevision,
            sessionVersion: this.version,
        });
    }
    counts(rows) {
        const tally = (result) => rows.filter((row) => row.result === result).length;
        return Object.freeze({
            total: rows.length,
            notStarted: tally("not-started"),
            opened: tally("opened"),
            selfReported: tally("self-reported"),
            refused: tally("refused"),
            providerProved: false,
            realFaceProved: false,
            releaseProved: false,
        });
    }
    dispose() {
        if (this.disposed)
            return;
        this.resetRows();
        this.clock.dispose();
        this.disposed = true;
    }
}
