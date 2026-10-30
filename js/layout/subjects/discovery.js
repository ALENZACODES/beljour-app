import { SubjectSelection } from "./selection.js";
/** A null adapter is a closed boundary, never a stub that invents detections. */
export class SubjectDiscovery {
    adapter;
    selection = new SubjectSelection();
    revision = 0;
    controller = null;
    disposed = false;
    constructor(adapter = null) {
        this.adapter = adapter;
    }
    get snapshot() {
        return this.selection.snapshot;
    }
    reset() {
        if (this.disposed)
            throw new Error("Subject discovery is disposed");
        this.controller?.abort();
        this.controller = null;
        this.revision += 1;
        this.selection.begin(this.revision);
        return this.revision;
    }
    async find(pixels) {
        const revision = this.reset();
        if (!this.adapter)
            return { notice: "unavailable", count: 0, revision };
        if (pixels.width < 16 || pixels.height < 16) {
            return { notice: "refused", count: 0, revision };
        }
        const controller = new AbortController();
        this.controller = controller;
        try {
            const response = await this.adapter.detect({ pixels, revision, signal: controller.signal });
            if (this.disposed || controller.signal.aborted || revision !== this.revision) {
                return { notice: "stale", count: 0, revision };
            }
            if (response.revision !== revision)
                return { notice: "stale", count: 0, revision };
            this.selection.receive(revision, response.boxes);
            return { notice: "detected", count: response.boxes.length, revision };
        }
        catch {
            return { notice: "refused", count: 0, revision };
        }
        finally {
            if (this.controller === controller)
                this.controller = null;
        }
    }
    seedDrawn(boxes) {
        const revision = this.reset();
        this.selection.receive(revision, boxes);
    }
    dispose() {
        if (this.disposed)
            return;
        this.controller?.abort();
        this.controller = null;
        this.selection.clear();
        this.disposed = true;
    }
}
//# sourceMappingURL=discovery.js.map