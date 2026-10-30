export const DEFAULT_BUDGET = 8 * 1024 * 1024;
/** Delimiters in user-supplied preset labels cannot alias other parameters. */
function keyPart(value) {
    return encodeURIComponent(value);
}
export function thumbKey(k) {
    if (k.revision !== undefined && (!Number.isSafeInteger(k.revision) || k.revision < 0)) {
        throw new RangeError("thumbnail geometry revision must be a non-negative integer");
    }
    if (k.snapshot !== undefined && !/^[0-9a-f]{16}$/.test(k.snapshot)) {
        throw new RangeError("thumbnail snapshot must be a local revision hash");
    }
    const params = Object.keys(k.params).sort().map((key) => `${keyPart(key)}=${keyPart(String(k.params[key]))}`).join("&");
    const base = `${keyPart(k.source)}|${k.side}|${keyPart(k.recipe)}|${k.strength}|${params}`;
    const versioned = k.revision === undefined ? base : `${base}|revision=${k.revision}`;
    return k.snapshot === undefined ? versioned : `${versioned}|snapshot=${k.snapshot}`;
}
/** A local-only, non-cryptographic revision for a *small* filter thumbnail.
 *
 * Source IDs can remain constant when an editor adjusts facial landmarks,
 * a person mask or even the small photo's pixels in place. The hash includes
 * the actual bytes instead of trusting a counter supplied by another studio.
 * It is only a cache key, not a photo identifier or a security digest; never
 * transmit, persist or log it. All images stay on this device.
 */
export function thumbSourceStamp(source) {
    let first = 0x811c9dc5;
    let second = 0x9e3779b9;
    const mix = (value) => {
        first = Math.imul(first ^ value, 0x01000193) >>> 0;
        second = (Math.imul(second ^ value, 0x5bd1e995) + 0x165667b1) >>> 0;
    };
    const number = new DataView(new ArrayBuffer(8));
    const mixNumber = (value) => {
        number.setFloat64(0, value, true);
        for (let byte = 0; byte < 8; byte++)
            mix(number.getUint8(byte));
    };
    const mixBytes = (bytes) => {
        mixNumber(bytes.length);
        for (const byte of bytes)
            mix(byte);
    };
    const { image, face, person } = source;
    mixNumber(image.width);
    mixNumber(image.height);
    mixNumber(image.channels);
    mixBytes(new Uint8Array(image.data.buffer, image.data.byteOffset, image.data.byteLength));
    if (face) {
        mix(1);
        mixNumber(face.length);
        for (const point of face) {
            mixNumber(point[0]);
            mixNumber(point[1]);
        }
    }
    else {
        mix(0);
    }
    if (person) {
        mix(1);
        mixNumber(person.width);
        mixNumber(person.height);
        mixNumber(person.channels);
        mixBytes(new Uint8Array(person.data.buffer, person.data.byteOffset, person.data.byteLength));
    }
    else {
        mix(0);
    }
    return `${first.toString(16).padStart(8, "0")}${second.toString(16).padStart(8, "0")}`;
}
export class ThumbCache {
    budget;
    items = new Map();
    used = 0;
    hitCount = 0;
    missCount = 0;
    evicted = 0;
    constructor(budget = DEFAULT_BUDGET) {
        this.budget = budget;
        if (!(Number.isInteger(budget) && budget > 0))
            throw new RangeError("cache budget must be a positive number of bytes");
    }
    get(key) {
        const hit = this.items.get(key);
        if (!hit) {
            this.missCount++;
            return undefined;
        }
        this.hitCount++;
        this.items.delete(key);
        this.items.set(key, hit);
        return hit;
    }
    /** Immutable-use accessor for batch previews: callers cannot poison cache. */
    getCopy(key) {
        const image = this.get(key);
        return image ? { ...image, data: Uint8Array.from(image.data) } : undefined;
    }
    /** Store an owned copy; subsequent edits to the caller buffer cannot corrupt it. */
    setCopy(key, image) {
        this.set(key, { ...image, data: Uint8Array.from(image.data) });
    }
    set(key, image) {
        const size = image.data.length;
        const old = this.items.get(key);
        if (old) {
            this.used -= old.data.length;
            this.items.delete(key);
        }
        // Oversized tiles are always skipped, even when source metadata is bad.
        // Do not preserve an older thumbnail with the now-outdated same key.
        if (size > this.budget)
            return;
        if (!(Number.isSafeInteger(image.width) && image.width > 0 &&
            Number.isSafeInteger(image.height) && image.height > 0 &&
            Number.isInteger(image.channels) && image.channels >= 1 && image.channels <= 4 &&
            image.width * image.height * image.channels === size)) {
            throw new RangeError("thumbnail buffer does not match its dimensions");
        }
        this.items.set(key, image);
        this.used += size;
        while (this.used > this.budget) {
            const first = this.items.keys().next().value;
            this.used -= this.items.get(first).data.length;
            this.items.delete(first);
            this.evicted++;
        }
    }
    /** Drop every tile of one photo (its id prefix), for example after it was marked again. */
    dropSource(source) {
        let n = 0;
        for (const key of [...this.items.keys()]) {
            if (key.startsWith(`${keyPart(source)}|`)) {
                this.used -= this.items.get(key).data.length;
                this.items.delete(key);
                n++;
            }
        }
        return n;
    }
    clear() { this.items.clear(); this.used = 0; }
    get stats() {
        return { hits: this.hitCount, misses: this.missCount, evictions: this.evicted, bytes: this.used, size: this.items.size };
    }
}
//# sourceMappingURL=cache.js.map