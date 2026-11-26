/** Bounded and private per-photo edit memo; level nudges never require a new
 * provider upload or analysis. Browser-only metadata, no persistent photos.
 * Author: John Khan.
 */
import { levelTicks } from "./strength.js";
const ITEMS = 32;
const TTL_MS = 600_000;
const MAX_PROVIDER_BYTES = 48_000_000;
function photoHash(value) {
    if (!/^[0-9a-f]{64}$/.test(value))
        throw RangeError("Photo key must be a SHA-256.");
}
export function editKey(photo, edit, level) {
    photoHash(photo);
    if (!edit || edit.length > 100)
        throw RangeError("Invalid edit name.");
    return { photoHash: photo, edit, level: levelTicks(level) };
}
function keyText(key) { return `${key.photoHash}/${key.edit}/${key.level}`; }
export class PhotoEditCache {
    now;
    entries = new Map();
    hits = 0;
    computes = 0;
    constructor(now = Date.now) {
        this.now = now;
    }
    getOrCompute(key, compute) {
        const cacheKey = keyText(key);
        const stored = this.entries.get(cacheKey);
        const time = this.now();
        if (stored && time >= stored.time && time - stored.time <= TTL_MS) {
            this.entries.delete(cacheKey);
            this.entries.set(cacheKey, stored);
            this.hits++;
            return stored.value;
        }
        const value = compute();
        this.computes++;
        this.entries.delete(cacheKey);
        this.entries.set(cacheKey, { time, value });
        while (this.entries.size > ITEMS)
            this.entries.delete(this.entries.keys().next().value);
        return value;
    }
    dropPhoto(photo) {
        photoHash(photo);
        for (const key of this.entries.keys())
            if (key.startsWith(`${photo}/`))
                this.entries.delete(key);
    }
    clear() { this.entries.clear(); }
}
/** In the browser only the returned content is cached, never the YouCam key.
 * A request key must come from the trusted local wrapper, not a product label.
 */
export class ProviderResponseCache {
    now;
    entries = new Map();
    totalBytes = 0;
    hits = 0;
    misses = 0;
    constructor(now = Date.now) {
        this.now = now;
    }
    get(key) {
        const row = this.entries.get(key);
        if (!row || this.now() < row.time || this.now() - row.time > TTL_MS) {
            if (row)
                this.remove(key);
            this.misses++;
            return null;
        }
        this.entries.delete(key);
        this.entries.set(key, row);
        this.hits++;
        return row.value;
    }
    put(key, value) {
        if (!/^[0-9a-f]{64}$/.test(key) || !/^data:image\/(?:png|jpeg|webp);base64,/.test(value.image)) {
            throw RangeError("Unverified preview content or cache identity.");
        }
        if (value.image.length > MAX_PROVIDER_BYTES)
            return;
        this.remove(key);
        this.entries.set(key, { time: this.now(), value });
        this.totalBytes += value.image.length;
        while (this.entries.size > ITEMS || this.totalBytes > MAX_PROVIDER_BYTES) {
            this.remove(this.entries.keys().next().value);
        }
    }
    remove(key) {
        const item = this.entries.get(key);
        if (item)
            this.totalBytes -= item.value.image.length;
        this.entries.delete(key);
    }
    clear() { this.entries.clear(); this.totalBytes = 0; }
    get bytesUsed() { return this.totalBytes; }
}
//# sourceMappingURL=preview-cache.js.map