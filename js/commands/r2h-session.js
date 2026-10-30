/** Single-photo Pro UI composition; default identity comparison is mandatory.
 * No model loads, network, localStorage, photo persistence or provider calls.
 * Author: John Khan.
 */
import { CpuCleanup } from './cpu-cleanup.js';
import { CpuUpscale } from './cpu-upscale.js';
import { ProPreviewCoordinator } from './preview.js';
import { PhotoRegions } from './regions.js';
import { checkedFrame, ProBrowserRuntime, ProRenderError, } from './runtime.js';
export class R2HBrowserSession {
    regions = new PhotoRegions();
    runtime;
    previews;
    active = null;
    version = 0;
    lastPlan = null;
    cleanup = null;
    upscale = null;
    undoStack = [];
    undoBytes = 0;
    constructor(identity, extensions = {}, budget, clock = () => performance.now()) {
        const cleanup = async (frame, step, quality, signal) => {
            if (this.cleanup === null)
                throw new ProRenderError('photo_missing', 'Open a photo first.');
            if (step.level === 10)
                return frame;
            return this.cleanup.render(frame, step.level, quality === 'preview', signal);
        };
        const upscale = async (frame, step, quality, signal) => {
            if (this.upscale === null)
                throw new ProRenderError('photo_missing', 'Open a photo first.');
            return this.upscale.render(frame, step.scale, step.level, quality === 'preview', signal, step.level === 10);
        };
        this.runtime = new ProBrowserRuntime({ cleanup, upscale, ...extensions }, identity, budget, clock);
        this.previews = new ProPreviewCoordinator(this.runtime, clock);
    }
    openPhoto(source, opaqueContentKey, supplier = null, checkedSpots = []) {
        checkedFrame(source);
        if (opaqueContentKey.length < 1 || opaqueContentKey.length > 128) {
            throw new ProRenderError('invalid_photo_key', 'Photo key must be nonempty and bounded.');
        }
        this.closePhoto();
        this.regions.open(source, supplier);
        this.active = { ...source, pixels: new Uint8Array(source.pixels) };
        this.cleanup = new CpuCleanup(this.regions, checkedSpots);
        this.upscale = new CpuUpscale(this.regions);
        this.version++;
        this.previews.openPhoto(this.active, opaqueContentKey);
    }
    closePhoto() {
        this.active = null;
        this.regions.close();
        this.previews.closePhoto();
        this.cleanup = null;
        this.upscale = null;
        this.lastPlan = null;
        this.version++;
        this.undoStack.length = 0;
        this.undoBytes = 0;
    }
    async run(plan, quality = 'export', signal = new AbortController().signal, current = () => true) {
        const source = this.active;
        if (source === null)
            throw new ProRenderError('photo_missing', 'Select a photo before editing.');
        const generation = this.version;
        const accepted = () => this.version === generation && current();
        const report = await this.runtime.run(plan, source, quality, `photo-generation-${generation}`, signal, accepted);
        if (!accepted())
            throw new ProRenderError('stale_preview', 'Photo has changed.');
        this.lastPlan = plan.version;
        this.remember(source);
        return report;
    }
    request(plan, quality = 'preview') {
        return this.previews.request(plan, quality);
    }
    async renderReady(ticket, previewScaler) {
        const report = await this.previews.renderReady(ticket, previewScaler);
        this.lastPlan = ticket.plan.version;
        return report;
    }
    undo() {
        const restored = this.undoStack.pop();
        if (restored === undefined)
            return null;
        this.undoBytes -= restored.pixels.byteLength;
        return { ...restored, pixels: new Uint8Array(restored.pixels) };
    }
    remember(before) {
        if (before.pixels.byteLength > 32 * 1024 * 1024)
            return;
        while (this.undoStack.length > 0 &&
            this.undoBytes + before.pixels.byteLength > 32 * 1024 * 1024) {
            const oldest = this.undoStack.shift();
            if (oldest !== undefined)
                this.undoBytes -= oldest.pixels.byteLength;
        }
        this.undoStack.push({ ...before, pixels: new Uint8Array(before.pixels) });
        this.undoBytes += before.pixels.byteLength;
    }
    get state() {
        const stats = this.regions.stats;
        return {
            photoOpen: this.active !== null,
            revision: this.version,
            regionReads: stats.reads,
            regionHits: stats.hits,
            cachedBytes: this.runtime.cachedBytes + stats.retainedBytes,
            lastPlan: this.lastPlan,
        };
    }
    get cleanupMetrics() {
        return this.readCleanupMetrics();
    }
    readCleanupMetrics() {
        return this.cleanup?.lastMetrics ?? null;
    }
    get upscaleMetrics() {
        return this.upscale?.lastMetrics ?? null;
    }
}
//# sourceMappingURL=r2h-session.js.map