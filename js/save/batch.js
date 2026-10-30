import { applyLookToFaces } from "./face-apply.js";
export class BatchRun {
    look;
    deps;
    selection;
    versionNumber;
    items;
    cursor = 0;
    controller = null;
    cancelledFlag = false;
    constructor(look, photos, deps, selection = "all", versionNumber) {
        this.look = look;
        this.deps = deps;
        this.selection = selection;
        this.versionNumber = versionNumber;
        if (!photos.length || photos.length > 50)
            throw new RangeError("a batch takes 1 to 50 photos");
        this.items = photos.map((p, index) => ({ index, name: p.name, status: "pending", faces: 0, facesEdited: [], note: "",
            before: p.photo, after: null, report: null }));
    }
    progress() {
        const count = (s) => this.items.filter((i) => i.status === s).length;
        return { done: count("done"), skipped: count("skipped-no-face"), failed: count("failed"), total: this.items.length,
            finished: this.cursor >= this.items.length, cancelled: this.cancelledFlag && this.cursor < this.items.length };
    }
    /** Stop after the photo being worked on. Finished photos keep their results. */
    cancel() { this.cancelledFlag = true; this.controller?.abort(); }
    /** Run (or resume) until finished or cancelled. Calls `onProgress` after each photo. */
    async run(onProgress) {
        this.cancelledFlag = false;
        const controller = new AbortController();
        this.controller = controller;
        while (this.cursor < this.items.length) {
            if (controller.signal.aborted)
                break;
            const item = this.items[this.cursor];
            if (item.status === "pending")
                await this.process(item);
            this.cursor++;
            onProgress?.(this.progress(), item);
            // yield so a cancel tapped during a long batch is seen before the next photo
            await Promise.resolve();
        }
        this.controller = null;
        return this.progress();
    }
    async process(item) {
        try {
            const faces = await this.deps.findFaces(item.before);
            item.faces = faces.length;
            if (!faces.length) {
                item.status = "skipped-no-face";
                item.note = "No face found; skipped.";
                return;
            }
            const chosen = this.selection === "all" ? faces : faces.filter((f) => this.selection.includes(f.id));
            if (!chosen.length) {
                item.status = "skipped-no-face";
                item.note = "None of the chosen faces is in this photo; skipped.";
                return;
            }
            // Bound every local effect to the selected face rectangles. Re-running
            // each face from the source ensures a previous selection does not alter
            // what another face's adaptive-dose engine sees.
            const output = applyLookToFaces(this.look, item.before, chosen, this.deps.engine, { version: this.versionNumber,
                doseFor: (f) => this.deps.doseFor ? this.deps.doseFor(item.before, f) : 1,
                youcamAvailable: this.deps.youcamAvailable });
            item.after = output.photo;
            item.report = output.reports[output.reports.length - 1] ?? null;
            item.facesEdited = output.faceIds;
            item.status = "done";
            const skipped = output.reports.flatMap((r) => r.skipped.map((s) => s.reason));
            item.note = skipped.length ? [...new Set(skipped)].join(" ") : "";
        }
        catch (error) {
            item.status = "failed";
            item.note = error instanceof Error ? error.message : String(error);
        }
    }
    /** The review grid: every photo, before and after on tap, with its status. */
    grid() { return this.items.map((i) => ({ ...i })); }
    /** Re-run one photo after she tweaks it individually (for example a lower dose). */
    async redo(index, deps) {
        const item = this.items[index];
        if (!item)
            throw new RangeError("no photo at that position");
        const saved = { ...this.deps };
        Object.assign(this.deps, deps ?? {});
        try {
            item.status = "pending";
            await this.process(item);
        }
        finally {
            Object.assign(this.deps, saved);
        }
        return { ...item };
    }
    /** Photos ready to save, in order. */
    finished() { return this.items.filter((i) => i.status === "done" && i.after); }
}
export function summary(p) {
    const parts = [`${p.done} of ${p.total} done`];
    if (p.skipped)
        parts.push(`${p.skipped} skipped (no face)`);
    if (p.failed)
        parts.push(`${p.failed} could not be edited`);
    if (p.cancelled)
        parts.push("paused; tap Resume to continue");
    return parts.join(", ") + ".";
}
//# sourceMappingURL=batch.js.map