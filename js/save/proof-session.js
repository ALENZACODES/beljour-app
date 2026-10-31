/** Volatile Save proof session. State contains counts only; never a photo.
 *
 * Rapid photo replacement cancels the old check, ignores its completion and
 * prevents a stale badge or receipt from becoming visible on a new photo.
 * The session does not provide background processing or permanent persistence.
 * Author: John Khan.
 */
import { validateSaveAudit } from "./proof-service.js";
import { auditScheduledBatch, validateSafeProgress, } from "./proof-scheduler.js";
function snapshot(state) {
    return {
        format: "beljour-save-proof-session/1",
        phase: state.phase,
        reason: state.reason,
        progress: state.progress ? validateSafeProgress(state.progress) : null,
        audit: state.audit ? validateSaveAudit(state.audit) : null,
    };
}
function initial() {
    return { format: "beljour-save-proof-session/1", phase: "idle", reason: "not_checked", progress: null, audit: null };
}
/** Verify that no additional person-level, filename or photo fields entered a saved state. */
export function validateSessionState(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new TypeError("invalid proof session");
    const obj = value;
    const keys = ["format", "phase", "reason", "progress", "audit"];
    if (Object.keys(obj).length !== keys.length || keys.some((key) => !Object.hasOwn(obj, key))) {
        throw new TypeError("unknown proof session fields");
    }
    const phases = ["idle", "checking", "pass", "fail", "unproven", "cancelled", "error"];
    const reasons = ["none", "not_checked", "cancelled", "changed_photo", "incomplete", "mechanical_failure", "invalid_input"];
    if (obj.format !== "beljour-save-proof-session/1" || !phases.includes(obj.phase) || !reasons.includes(obj.reason)) {
        throw new TypeError("invalid proof session verdict");
    }
    const phase = obj.phase;
    const reason = obj.reason;
    const progress = obj.progress === null ? null : validateSafeProgress(obj.progress);
    const audit = obj.audit === null ? null : validateSaveAudit(obj.audit);
    if (phase === "idle" && (progress !== null || audit !== null || reason !== "not_checked")) {
        throw new TypeError("idle proof has evidence");
    }
    if (phase === "checking" && (audit !== null || reason !== "none")) {
        throw new TypeError("unfinished check claims a receipt");
    }
    if ((phase === "pass" || phase === "fail" || phase === "unproven") &&
        (audit === null || progress === null || audit.replay.report.counts.completed !== progress.completed)) {
        throw new TypeError("proof result is not supported by counts");
    }
    if (phase === "pass" && audit?.status !== "PASS")
        throw new TypeError("unsupported proof pass");
    if (phase === "fail" && audit?.status !== "FAIL")
        throw new TypeError("unsupported proof failure");
    if (phase === "unproven" && audit?.status !== "UNPROVEN")
        throw new TypeError("unsupported unproven status");
    if ((phase === "cancelled" || phase === "error") && (audit !== null || reason === "none")) {
        throw new TypeError("cancelled or failed check has an accepted receipt");
    }
    return { format: "beljour-save-proof-session/1", phase, reason, progress, audit };
}
/**
 * The scheduler may yield while a UI replaces its source. The generation
 * number makes it impossible for that old asynchronous run to publish status.
 */
export class ProofSession {
    generation = 0;
    disposed = false;
    current = initial();
    listeners = new Set();
    controller = null;
    state() {
        return snapshot(this.current);
    }
    subscribe(listener) {
        if (this.disposed)
            throw new Error("proof session was disposed");
        this.listeners.add(listener);
        listener(this.state());
        return () => { this.listeners.delete(listener); };
    }
    emit(next) {
        if (this.disposed)
            return;
        this.current = validateSessionState(next);
        for (const listener of [...this.listeners])
            listener(this.state());
    }
    stop(reason) {
        const hadWork = this.current.phase === "checking";
        this.generation++;
        this.controller?.abort();
        this.controller = null;
        if (hadWork) {
            this.emit({ format: "beljour-save-proof-session/1", phase: "cancelled", reason,
                progress: this.current.progress, audit: null });
        }
    }
    /** User cancellation is different from changing to a different photo. */
    cancel() {
        this.stop("cancelled");
    }
    /** Always clear old proof when source or recipe changes, including a PASS. */
    changeSource() {
        this.stop("changed_photo");
        this.emit(initial());
    }
    /** No event listeners, frames or audit result survive teardown. */
    dispose() {
        if (this.disposed)
            return;
        this.stop("cancelled");
        this.disposed = true;
        this.listeners.clear();
        this.current = initial();
    }
    async run(recipe, source, engine, options = {}) {
        if (this.disposed)
            throw new Error("proof session was disposed");
        this.stop("cancelled");
        const generation = ++this.generation;
        const controller = new AbortController();
        this.controller = controller;
        const externalAbort = options.abort;
        const cancelFromExternal = () => { controller.abort(); };
        externalAbort?.addEventListener("abort", cancelFromExternal, { once: true });
        if (externalAbort?.aborted)
            controller.abort();
        this.emit({ format: "beljour-save-proof-session/1", phase: "checking", reason: "none", progress: null, audit: null });
        try {
            const measured = await auditScheduledBatch(recipe, source, engine, {
                ...options,
                abort: controller.signal,
                onProgress: (progress) => {
                    if (this.disposed || generation !== this.generation)
                        return;
                    this.emit({ format: "beljour-save-proof-session/1", phase: "checking", reason: "none", progress, audit: null });
                },
            });
            if (this.disposed || generation !== this.generation)
                return this.state();
            if (measured.exit !== "complete") {
                this.emit({ format: "beljour-save-proof-session/1", phase: "cancelled",
                    reason: measured.exit === "source_changed" ? "changed_photo" : "cancelled",
                    progress: measured.progress, audit: null });
            }
            else {
                const status = measured.audit.status;
                const phase = status === "PASS" ? "pass" : status === "FAIL" ? "fail" : "unproven";
                const reason = status === "PASS" ? "none" : status === "FAIL" ? "mechanical_failure" : "incomplete";
                this.emit({ format: "beljour-save-proof-session/1", phase, reason,
                    progress: measured.progress, audit: measured.audit });
            }
            return this.state();
        }
        catch {
            if (!this.disposed && generation === this.generation) {
                this.emit({ format: "beljour-save-proof-session/1", phase: "error", reason: "invalid_input",
                    progress: this.current.progress, audit: null });
            }
            return this.state();
        }
        finally {
            externalAbort?.removeEventListener("abort", cancelFromExternal);
            if (generation === this.generation)
                this.controller = null;
        }
    }
}
