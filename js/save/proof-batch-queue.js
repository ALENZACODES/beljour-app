/** Cooperative queue for locally replaying a saved look over a declared batch.
 *
 * The queue retains only count-only per-slot verdicts, not images. A caller
 * supplies transient frames on demand. A photo/recipe source replacement
 * invalidates the run; a restarted batch must use a fresh queue instance.
 * In-memory resume does not imply persistent background work or face quality.
 * Author: John Khan.
 */
import { ProofLedger, validateLedger } from "./proof-ledger.js";
import { bindReport, createProofPlan } from "./proof-plan.js";
import { proveReplay } from "./proof.js";
const MAX_ITEMS = 1000;
const MAX_WORKERS = 4;
function validCount(value, min, max) {
    return Number.isSafeInteger(value) && value >= min && value <= max;
}
function makePause() {
    return new Promise((resolve) => { setTimeout(resolve, 0); });
}
/**
 * Use a fresh coordinator after a photo source replacement; resuming this one
 * while another source is active would mix people across the same index slots.
 */
export class LocalProofBatchQueue {
    source;
    ledger;
    revision;
    initialTotal;
    pending = false;
    poisoned = false;
    exits = 0;
    constructor(source) {
        this.source = source;
        if (!source || !validCount(source.total, 1, MAX_ITEMS) ||
            !validCount(source.available, 0, source.total) ||
            typeof source.read !== "function" || typeof source.revision !== "function") {
            throw new TypeError("invalid local proof batch source");
        }
        const revision = source.revision();
        if (!validCount(revision, 0, Number.MAX_SAFE_INTEGER))
            throw new TypeError("invalid source revision");
        this.initialTotal = source.total;
        this.revision = revision;
        this.ledger = new ProofLedger(source.total);
    }
    sameSource() {
        return this.source.revision() === this.revision &&
            this.source.total === this.initialTotal &&
            this.source.available <= this.initialTotal;
    }
    inspected() {
        return this.ledger.checked();
    }
    snapshot() {
        return validateLedger(this.ledger.summary());
    }
    /** Safely stop accepting receipts after a source or edit change. */
    invalidate() {
        this.poisoned = true;
    }
    /**
     * Resumes uninspected slots inside the same live epoch. Duplicate slots
     * cannot be credited twice; an interrupted reader leaves its slot missing.
     */
    async run(look, engine, options = {}) {
        if (this.pending)
            throw new Error("proof batch already running");
        if (this.poisoned || !this.sameSource())
            throw new Error("proof batch source changed");
        const workers = options.workers ?? 1;
        if (!validCount(workers, 1, MAX_WORKERS))
            throw new RangeError("proof worker count must be 1 to 4");
        const plan = await createProofPlan(look, this.initialTotal);
        if (this.poisoned || !this.sameSource())
            throw new Error("proof batch source changed before replay");
        const pause = options.yieldControl ?? makePause;
        let next = 0;
        let interrupted = "complete";
        this.pending = true;
        const worker = async () => {
            while (next < this.source.available) {
                if (options.abort?.aborted) {
                    interrupted = "aborted";
                    return;
                }
                if (this.poisoned || !this.sameSource()) {
                    interrupted = "source_changed";
                    this.poisoned = true;
                    return;
                }
                const slot = next++;
                if (this.ledger.has(slot))
                    continue;
                await pause();
                if (options.abort?.aborted) {
                    interrupted = "aborted";
                    return;
                }
                if (this.poisoned || !this.sameSource()) {
                    interrupted = "source_changed";
                    this.poisoned = true;
                    return;
                }
                let photo;
                try {
                    photo = await this.source.read(slot);
                }
                catch {
                    // A missing record is not an engine success; leave it missing.
                    continue;
                }
                if (options.abort?.aborted) {
                    interrupted = "aborted";
                    return;
                }
                if (this.poisoned || !this.sameSource()) {
                    interrupted = "source_changed";
                    this.poisoned = true;
                    return;
                }
                const check = proveReplay(look, photo, engine);
                if (options.abort?.aborted) {
                    interrupted = "aborted";
                    return;
                }
                if (this.poisoned || !this.sameSource()) {
                    interrupted = "source_changed";
                    this.poisoned = true;
                    return;
                }
                this.ledger.add(slot, check);
                options.onProgress?.(this.snapshot());
            }
        };
        try {
            await Promise.all(Array.from({ length: workers }, () => worker()));
            if (this.poisoned || !this.sameSource())
                interrupted = "source_changed";
            else if (options.abort?.aborted)
                interrupted = "aborted";
            const proof = bindReport(plan, this.ledger.summary());
            this.exits++;
            return {
                format: "beljour-save-batch-queue/1",
                exit: interrupted,
                status: interrupted === "complete" ? proof.status : "UNPROVEN",
                proof: interrupted === "source_changed" ||
                    (interrupted !== "complete" && proof.status === "PASS") ? null : proof,
            };
        }
        finally {
            this.pending = false;
        }
    }
    /** Total number of completed run attempts; never written to a server. */
    attempts() {
        return this.exits;
    }
}
//# sourceMappingURL=proof-batch-queue.js.map