const MAX_SAMPLES = 64;
export function percentile(values, position) {
    if (!values.length)
        return null;
    if (!Number.isFinite(position) || position < 0 || position > 1) {
        throw new RangeError("Percentile outside 0 to 1");
    }
    const sorted = [...values].sort((a, b) => a - b);
    if (sorted.some((value) => !Number.isFinite(value) || value < 0)) {
        throw new RangeError("Invalid measured duration");
    }
    const rank = (sorted.length - 1) * position;
    const lower = Math.floor(rank);
    const upper = Math.ceil(rank);
    return Math.round((sorted[lower] + (sorted[upper] - sorted[lower]) * (rank - lower)) * 10) / 10;
}
export class ContinuousTimings {
    samples = [];
    disposed = false;
    record(phase, elapsedMs) {
        if (this.disposed)
            throw new Error("Measurements ended");
        if (phase !== "preview" && phase !== "export")
            throw new RangeError("Unknown timing phase");
        if (!Number.isFinite(elapsedMs) || elapsedMs < 0 || elapsedMs > 300_000) {
            throw new RangeError("Invalid timing observation");
        }
        if (this.samples.length >= MAX_SAMPLES)
            this.samples.shift();
        this.samples.push({ phase, elapsedMs: Math.round(elapsedMs * 10) / 10 });
    }
    summary(phase) {
        const values = this.samples.filter((row) => row.phase === phase).map((row) => row.elapsedMs);
        const budgetMs = phase === "preview" ? 100 : 2000;
        const medianMs = percentile(values, 0.5);
        const p95Ms = percentile(values, 0.95);
        return {
            phase, count: values.length, medianMs, p95Ms, budgetMs,
            measured: values.length > 0,
            budgetExceeded: p95Ms === null ? null : p95Ms > budgetMs,
        };
    }
    snapshots() {
        return this.samples.map((row) => ({ ...row }));
    }
    reset() {
        this.samples.splice(0);
    }
    dispose() {
        this.reset();
        this.disposed = true;
    }
}
export function performanceText(summary) {
    if (!summary.measured)
        return `${summary.phase}: unmeasured (${summary.budgetMs}ms reference)`;
    return `${summary.phase}: median ${summary.medianMs}ms, p95 ${summary.p95Ms}ms `
        + `over ${summary.count} observations; reference ${summary.budgetMs}ms`;
}
//# sourceMappingURL=performance.js.map