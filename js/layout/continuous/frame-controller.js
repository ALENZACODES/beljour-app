import { FRAME_IDS, cacheAuthority, } from "./frame-cache-contract.js";
import { LocalFrameMemory } from "./frame-memory.js";
export class DrawnFrameController {
    current;
    capture;
    changed;
    memory;
    phase = "empty";
    selected = null;
    revision = 0;
    signature = null;
    disposed = false;
    constructor(options) {
        this.current = options.current;
        this.capture = options.capture;
        this.changed = options.changed ?? (() => { });
        this.memory = options.memory ?? new LocalFrameMemory(options.now);
    }
    freshSignature() {
        const context = this.current();
        return cacheAuthority(context.state, context.drawn)?.signature ?? null;
    }
    notify() {
        if (!this.disposed)
            this.changed();
    }
    /** Independently guard every asynchronous state update on paint, render and read. */
    ensureFresh() {
        if (this.disposed)
            return false;
        if (this.signature !== null && this.freshSignature() !== this.signature) {
            this.invalidate("stale");
            return false;
        }
        return true;
    }
    get snapshot() {
        this.ensureFresh();
        return {
            phase: this.phase,
            available: this.memory.size,
            bytes: this.memory.bytes,
            hits: this.memory.hits,
            misses: this.memory.misses,
            selected: this.selected,
            networkCalls: 0,
            unitsSpent: 0,
            liveVerified: false,
        };
    }
    readSelected() {
        if (!this.ensureFresh() || !this.signature || !this.selected || this.phase !== "ready") {
            return null;
        }
        const frame = this.memory.read(this.signature, this.selected);
        if (!frame)
            this.invalidate("stale");
        return frame;
    }
    select(id) {
        if (!this.ensureFresh() || !this.signature || this.phase !== "ready"
            || !FRAME_IDS.includes(id))
            return false;
        const value = this.memory.read(this.signature, id);
        if (!value) {
            this.invalidate("stale");
            return false;
        }
        value.rgba.fill(0);
        this.selected = id;
        this.notify();
        return true;
    }
    async prepare() {
        if (this.disposed)
            return this.snapshot;
        this.invalidate("empty");
        const context = this.current();
        const authority = cacheAuthority(context.state, context.drawn);
        if (!authority) {
            this.phase = "refused";
            this.notify();
            return this.snapshot;
        }
        const ticket = this.revision;
        this.signature = authority.signature;
        this.memory.useAuthority(authority.signature);
        this.phase = "warming";
        this.notify();
        try {
            for (const id of FRAME_IDS) {
                const frame = await this.capture(id, context.state);
                if (this.disposed || ticket !== this.revision) {
                    frame.rgba.fill(0);
                    return this.snapshot;
                }
                if (this.freshSignature() !== authority.signature) {
                    frame.rgba.fill(0);
                    this.invalidate("stale");
                    return this.snapshot;
                }
                const saved = this.memory.write(authority.signature, frame);
                frame.rgba.fill(0);
                if (!saved)
                    throw new Error("Drawn cache exceeded memory limit");
            }
            if (this.disposed || ticket !== this.revision)
                return this.snapshot;
            this.phase = "ready";
            this.selected = "hair";
            this.notify();
        }
        catch {
            if (!this.disposed && ticket === this.revision) {
                this.invalidate("refused");
                this.notify();
            }
        }
        return this.snapshot;
    }
    invalidate(next = "empty") {
        if (this.disposed)
            return;
        this.revision += 1;
        this.signature = null;
        this.selected = null;
        this.memory.clear();
        this.phase = next;
    }
    dispose() {
        if (this.disposed)
            return;
        this.invalidate("empty");
        this.memory.dispose();
        this.disposed = true;
        this.phase = "disposed";
    }
}
//# sourceMappingURL=frame-controller.js.map