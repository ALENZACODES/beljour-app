/** Source-revision tickets for guarded upscale slider previews and releases.
 * Mirrors api/plumb_api/engines/upscale/preview_session.py and adds the async
 * side: every job runs with its own AbortSignal. A newer ticket of the same kind
 * aborts the older job, and only the newest, uncancelled ticket for the current
 * photo revision may deliver a result. Previews use a bounded copy (longest edge
 * 512) and are never exportable; releases are full size. Tickets hold settings
 * and counters only, never pixels. Author: John Khan.
 */
import { validateLevel } from "../../pro/strength.js";
export const PREVIEW_MAX_EDGE = 512;
function checkedSide(value) {
    if (!Number.isInteger(value) || value < 8 || value > 16_384)
        throw new RangeError("Invalid source dimensions");
    return value;
}
export function previewSize(width, height) {
    checkedSide(width);
    checkedSide(height);
    const longest = Math.max(width, height);
    if (longest <= PREVIEW_MAX_EDGE)
        return { width, height };
    const factor = PREVIEW_MAX_EDGE / longest;
    return { width: Math.max(8, Math.round(width * factor)), height: Math.max(8, Math.round(height * factor)) };
}
export class UpscalePreviewSession {
    source = null;
    size = { width: 0, height: 0 };
    currentRevision = 0;
    sequence = 0;
    latest = new Map();
    cancelled = new Set();
    controllers = new Map();
    get revision() {
        return this.currentRevision;
    }
    open(sourceSha256, width, height) {
        if (typeof sourceSha256 !== "string" || !/^[0-9a-f]{64}$/.test(sourceSha256)) {
            throw new RangeError("Source digest must be 64 lowercase hexadecimal characters");
        }
        previewSize(width, height);
        this.reset();
        this.source = sourceSha256;
        this.size = { width, height };
        return this.currentRevision;
    }
    close() {
        this.reset();
        this.source = null;
    }
    reset() {
        for (const controller of this.controllers.values())
            controller.abort();
        this.controllers.clear();
        this.latest.clear();
        this.cancelled.clear();
        this.currentRevision += 1;
    }
    issue(kind, settings) {
        if (this.source === null)
            throw new RangeError("No photo is open");
        const { scale = 2, detailLevel = 3.0, lockLevel = 5.0 } = settings;
        if (scale !== 2 && scale !== 4)
            throw new RangeError("Scale must be 2 or 4");
        const size = kind === "preview" ? previewSize(this.size.width, this.size.height) : this.size;
        const ticket = Object.freeze({
            kind, revision: this.currentRevision, sequence: ++this.sequence, scale,
            detailLevel: validateLevel(detailLevel), lockLevel: validateLevel(lockLevel),
            width: size.width, height: size.height, fullResolution: kind === "release",
        });
        this.controllers.get(kind)?.abort();
        this.controllers.delete(kind);
        this.latest.set(kind, ticket.sequence);
        return ticket;
    }
    preview(settings = {}) {
        return this.issue("preview", settings);
    }
    release(settings = {}) {
        return this.issue("release", settings);
    }
    cancel(ticket) {
        this.cancelled.add(ticket.sequence);
        if (this.latest.get(ticket.kind) === ticket.sequence)
            this.controllers.get(ticket.kind)?.abort();
    }
    accepts(ticket) {
        return this.source !== null && ticket.revision === this.currentRevision &&
            this.latest.get(ticket.kind) === ticket.sequence && !this.cancelled.has(ticket.sequence);
    }
    exportable(ticket) {
        return ticket.kind === "release" && this.accepts(ticket);
    }
    /** Run the job for a current ticket; resolves to null if it went stale meanwhile. */
    async run(ticket, job) {
        if (!this.accepts(ticket))
            return null;
        const controller = new AbortController();
        this.controllers.get(ticket.kind)?.abort();
        this.controllers.set(ticket.kind, controller);
        try {
            const result = await job(controller.signal);
            return this.accepts(ticket) && !controller.signal.aborted ? result : null;
        }
        finally {
            if (this.controllers.get(ticket.kind) === controller)
                this.controllers.delete(ticket.kind);
        }
    }
}
