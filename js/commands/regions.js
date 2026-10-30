/** Checked local masks cached for a single photo and its level changes.
 * No inference, tracking, persistence or image upload occurs in this module.
 * Author: John Khan.
 */
import { checkedFrame, ProRenderError } from './runtime.js';
function checksum(frame) {
    let hash = 2166136261;
    hash = Math.imul(hash ^ frame.width, 16777619);
    hash = Math.imul(hash ^ frame.height, 16777619);
    for (const byte of frame.pixels)
        hash = Math.imul(hash ^ byte, 16777619);
    return (hash >>> 0).toString(16).padStart(8, '0');
}
function verifyRegions(regions, frame) {
    if (regions.width !== frame.width || regions.height !== frame.height ||
        !['user_checked', 'cleared_local', 'synthetic_test'].includes(regions.evidence)) {
        throw new ProRenderError('invalid_regions', 'Regions must belong to the selected photo.');
    }
    const safe = {
        skin: regions.skin, eyes: regions.eyes, hair: regions.hair, protected: regions.protected,
    };
    for (const mask of Object.values(safe)) {
        if (mask !== undefined && (!(mask instanceof Uint8Array) ||
            mask.byteLength !== frame.width * frame.height)) {
            throw new ProRenderError('invalid_regions', 'Region masks have invalid bytes.');
        }
    }
    return {
        width: frame.width, height: frame.height, evidence: regions.evidence,
        skin: safe.skin === undefined ? undefined : new Uint8Array(safe.skin),
        eyes: safe.eyes === undefined ? undefined : new Uint8Array(safe.eyes),
        hair: safe.hair === undefined ? undefined : new Uint8Array(safe.hair),
        protected: safe.protected === undefined ? undefined : new Uint8Array(safe.protected),
    };
}
export class PhotoRegions {
    photoKey = null;
    regions = null;
    cached = new Map();
    readCount = 0;
    hitCount = 0;
    version = 0;
    retained = 0;
    open(frame, source) {
        checkedFrame(frame);
        const key = `${frame.width}:${frame.height}:${checksum(frame)}`;
        if (this.photoKey === key) {
            this.hitCount++;
            return;
        }
        this.close();
        const supplied = source?.(frame) ?? null;
        this.regions = supplied === null ? null : verifyRegions(supplied, frame);
        this.photoKey = key;
        if (source !== null)
            this.readCount++;
    }
    get generation() { return this.version; }
    get stats() {
        return { reads: this.readCount, hits: this.hitCount,
            generation: this.version, retainedBytes: this.retained };
    }
    mask(kind, width, height) {
        if (this.photoKey === null)
            throw new ProRenderError('photo_missing', 'A photo must be open.');
        if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
            width * height > 24_000_000) {
            throw new ProRenderError('invalid_regions', 'Mask output dimensions are invalid.');
        }
        const original = this.regions;
        const mask = original?.[kind];
        if (original === null || mask === undefined)
            return null;
        const key = `${kind}:${width}x${height}`;
        const hit = this.cached.get(key);
        if (hit !== undefined) {
            this.hitCount++;
            return new Float32Array(hit);
        }
        const output = new Float32Array(width * height);
        for (let y = 0; y < height; y++) {
            const fy = Math.max(0, Math.min(original.height - 1, (y + 0.5) * original.height / height - 0.5));
            const y0 = Math.floor(fy);
            const y1 = Math.min(original.height - 1, y0 + 1);
            const wy = fy - y0;
            for (let x = 0; x < width; x++) {
                const fx = Math.max(0, Math.min(original.width - 1, (x + 0.5) * original.width / width - 0.5));
                const x0 = Math.floor(fx);
                const x1 = Math.min(original.width - 1, x0 + 1);
                const wx = fx - x0;
                const a = (mask[y0 * original.width + x0] ?? 0) * (1 - wx);
                const b = (mask[y0 * original.width + x1] ?? 0) * wx;
                const c = (mask[y1 * original.width + x0] ?? 0) * (1 - wx);
                const d = (mask[y1 * original.width + x1] ?? 0) * wx;
                output[y * width + x] = ((a + b) * (1 - wy) + (c + d) * wy) / 255;
            }
        }
        if (this.retained + output.byteLength <= 96 * 1024 * 1024) {
            this.cached.set(key, output);
            this.retained += output.byteLength;
        }
        return new Float32Array(output);
    }
    close() {
        this.photoKey = null;
        this.regions = null;
        this.cached.clear();
        this.retained = 0;
        this.version++;
    }
}
//# sourceMappingURL=regions.js.map