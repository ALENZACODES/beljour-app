import { ProRenderError } from './runtime.js';
export class ProPreviewCoordinator {
    runtime;
    clock;
    debounceMs;
    previewEdge;
    revision = 0;
    photoGeneration = 0;
    original = null;
    sourceKey = '';
    pending = null;
    constructor(runtime, clock = () => performance.now(), debounceMs = 60, previewEdge = 512) {
        this.runtime = runtime;
        this.clock = clock;
        this.debounceMs = debounceMs;
        this.previewEdge = previewEdge;
        if (!Number.isInteger(debounceMs) || debounceMs < 0 || debounceMs > 500 ||
            !Number.isInteger(previewEdge) || previewEdge < 64 || previewEdge > 2048) {
            throw new ProRenderError('invalid_preview_budget', 'Preview scheduler limits are invalid.');
        }
    }
    openPhoto(frame, opaqueContentKey) {
        this.closePhoto();
        this.original = frame;
        this.sourceKey = opaqueContentKey;
    }
    closePhoto() {
        this.pending?.controller.abort();
        this.pending = null;
        this.original = null;
        this.sourceKey = '';
        this.revision++;
        this.photoGeneration++;
        this.runtime.clearPhoto();
    }
    request(plan, quality = 'preview') {
        if (this.original === null) {
            throw new ProRenderError('photo_missing', 'Open a photo before editing.');
        }
        this.pending?.controller.abort();
        this.revision++;
        const ticket = {
            revision: this.revision,
            photoGeneration: this.photoGeneration,
            plan,
            quality,
            notBeforeMs: this.clock() + (quality === 'preview' ? this.debounceMs : 0),
            controller: new AbortController(),
        };
        this.pending = ticket;
        return ticket;
    }
    isCurrent(ticket) {
        return this.pending === ticket && ticket.revision === this.revision &&
            ticket.photoGeneration === this.photoGeneration && this.original !== null &&
            !ticket.controller.signal.aborted;
    }
    isReady(ticket) {
        return this.isCurrent(ticket) && this.clock() >= ticket.notBeforeMs;
    }
    async renderReady(ticket, previewScaler) {
        if (!this.isCurrent(ticket)) {
            throw new ProRenderError('stale_preview', 'A newer edit replaced this request.');
        }
        if (!this.isReady(ticket)) {
            throw new ProRenderError('preview_debouncing', 'The request is still debouncing.');
        }
        const original = this.original;
        if (original === null) {
            throw new ProRenderError('photo_missing', 'Photo is no longer available.');
        }
        const source = ticket.quality === 'preview' &&
            Math.max(original.width, original.height) > this.previewEdge ?
            previewScaler(original, this.previewEdge) : original;
        const result = await this.runtime.run(ticket.plan, source, ticket.quality, this.sourceKey, ticket.controller.signal, () => this.isCurrent(ticket));
        if (!this.isCurrent(ticket)) {
            throw new ProRenderError('stale_preview', 'The request changed while rendering.');
        }
        this.pending = null;
        return result;
    }
}
