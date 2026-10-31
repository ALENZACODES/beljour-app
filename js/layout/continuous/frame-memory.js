/** Bounded, ephemeral thumbnail pixels for the active synthetic subject. Author: John Khan. */
import { FRAME_IDS, FRAME_MAX_BYTES, FRAME_TTL_MS, isFrameId, validFrame, } from "./frame-cache-contract.js";
export class LocalFrameMemory {
    entries = new Map();
    clock;
    byteLimit;
    ttl;
    authority = "";
    used = 0;
    tick = 0;
    hitCount = 0;
    missCount = 0;
    disposed = false;
    constructor(clock = () => performance.now(), byteLimit = FRAME_MAX_BYTES, ttl = FRAME_TTL_MS) {
        if (!Number.isSafeInteger(byteLimit) || byteLimit < 128_000 || byteLimit > FRAME_MAX_BYTES) {
            throw new RangeError("Invalid local preview memory budget");
        }
        if (!Number.isSafeInteger(ttl) || ttl < 1_000 || ttl > FRAME_TTL_MS) {
            throw new RangeError("Invalid local preview lifetime");
        }
        this.clock = clock;
        this.byteLimit = byteLimit;
        this.ttl = ttl;
    }
    get size() {
        this.prune();
        return this.entries.size;
    }
    get bytes() {
        this.prune();
        return this.used;
    }
    get hits() {
        return this.hitCount;
    }
    get misses() {
        return this.missCount;
    }
    checkNow() {
        const now = this.clock();
        if (!Number.isFinite(now) || now < 0)
            throw new RangeError("Invalid local clock");
        return now;
    }
    evict(id) {
        const old = this.entries.get(id);
        if (!old)
            return;
        old.frame.rgba.fill(0);
        this.used -= old.frame.rgba.byteLength;
        this.entries.delete(id);
    }
    prune() {
        if (this.disposed)
            return;
        const now = this.checkNow();
        for (const [id, entry] of this.entries) {
            if (now >= entry.expiresAt)
                this.evict(id);
        }
    }
    useAuthority(signature) {
        if (this.disposed)
            return;
        if (!signature || signature.length > 1024)
            throw new RangeError("Unsafe session authority");
        if (signature !== this.authority) {
            this.clear();
            this.authority = signature;
        }
    }
    write(signature, frame) {
        if (this.disposed || !this.authority || signature !== this.authority
            || !validFrame(frame) || !FRAME_IDS.includes(frame.id))
            return false;
        this.prune();
        const cost = frame.rgba.byteLength;
        if (cost > this.byteLimit)
            return false;
        this.evict(frame.id);
        while (this.used + cost > this.byteLimit) {
            const oldest = [...this.entries.entries()].sort((left, right) => left[1].access - right[1].access)[0];
            if (!oldest)
                return false;
            this.evict(oldest[0]);
        }
        const copy = { ...frame, rgba: new Uint8ClampedArray(frame.rgba) };
        this.entries.set(frame.id, {
            frame: copy, expiresAt: this.checkNow() + this.ttl, access: ++this.tick,
        });
        this.used += cost;
        return true;
    }
    read(signature, id) {
        if (this.disposed || !isFrameId(id) || signature !== this.authority) {
            this.missCount += 1;
            return null;
        }
        this.prune();
        const record = this.entries.get(id);
        if (!record) {
            this.missCount += 1;
            return null;
        }
        this.hitCount += 1;
        record.access = ++this.tick;
        return { ...record.frame, rgba: new Uint8ClampedArray(record.frame.rgba) };
    }
    clear() {
        if (this.disposed)
            return;
        for (const id of [...this.entries.keys()])
            this.evict(id);
        this.authority = "";
    }
    dispose() {
        if (this.disposed)
            return;
        this.clear();
        this.disposed = true;
    }
}
