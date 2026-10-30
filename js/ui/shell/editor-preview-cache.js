const DEFAULT_LIMIT = 24 * 1024 * 1024;
export class EditorPreviewCache {
    limitBytes;
    sourceToken = null;
    renders = new Map();
    currentBytes = 0;
    hits = 0;
    misses = 0;
    evictions = 0;
    constructor(limitBytes = DEFAULT_LIMIT) {
        this.limitBytes = limitBytes;
        if (!Number.isSafeInteger(limitBytes) || limitBytes < 1_024 || limitBytes > 128 * 1024 * 1024) {
            throw new RangeError("Invalid Studio preview cache size");
        }
    }
    get stats() {
        return {
            hits: this.hits,
            misses: this.misses,
            entries: this.renders.size,
            bytes: this.currentBytes,
            evictions: this.evictions,
        };
    }
    /** A changed photo, mask, geometry or graphics context invalidates every cached render. */
    useSource(token) {
        if (token.length === 0 || token.length > 256)
            throw new RangeError("Invalid source revision");
        if (this.sourceToken === token)
            return;
        this.clear();
        this.sourceToken = token;
    }
    get(key) {
        this.assertKey(key);
        if (!this.sourceToken)
            throw new Error("Source revision was not selected");
        const entry = this.renders.get(key);
        if (!entry) {
            this.misses += 1;
            return null;
        }
        this.hits += 1;
        this.renders.delete(key);
        this.renders.set(key, entry);
        return entry.preview;
    }
    put(key, preview) {
        this.assertKey(key);
        if (!this.sourceToken)
            throw new Error("Source revision was not selected");
        const { width, height, channels, data } = preview.image;
        const expected = width * height * channels;
        if (!Number.isSafeInteger(expected) || expected <= 0 || data.length !== expected) {
            throw new RangeError("Invalid cached preview dimensions");
        }
        const bytes = data.byteLength;
        if (bytes > this.limitBytes)
            return false;
        this.remove(key);
        while (this.currentBytes + bytes > this.limitBytes) {
            const first = this.renders.keys().next().value;
            if (first === undefined)
                break;
            this.remove(first);
            this.evictions += 1;
        }
        this.renders.set(key, { preview, bytes });
        this.currentBytes += bytes;
        return true;
    }
    clear() {
        this.renders.clear();
        this.currentBytes = 0;
        this.sourceToken = null;
    }
    remove(key) {
        const entry = this.renders.get(key);
        if (!entry)
            return;
        this.renders.delete(key);
        this.currentBytes -= entry.bytes;
    }
    assertKey(key) {
        if (key.length === 0 || key.length > 65_536)
            throw new RangeError("Invalid render key");
    }
}
//# sourceMappingURL=editor-preview-cache.js.map