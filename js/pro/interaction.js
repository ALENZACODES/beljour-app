/** Drag previews never allocate full-size canvases. Release requests full output.
 * Caller supplies a render callback and owns canvases/resources. A stale callback
 * may finish but cannot publish into the new-photo preview through this API.
 */
import { validateLevel } from "./strength.js";
export const DRAG_MAX_EDGE = 512;
export const FULL_MAX_PIXELS = 12_000_000;
export function planResolution(width, height, stage) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
        width * height > FULL_MAX_PIXELS || width > 16_384 || height > 16_384) {
        throw new RangeError("Image exceeds the 12 MP limit");
    }
    if (stage !== "drag" && stage !== "release")
        throw new RangeError("Unknown preview stage");
    if (stage === "release")
        return { width, height };
    const scale = Math.min(1, DRAG_MAX_EDGE / Math.max(width, height));
    return { width: Math.max(1, Math.floor(width * scale + 0.5)),
        height: Math.max(1, Math.floor(height * scale + 0.5)) };
}
export class ProgressivePreview {
    revision = 0;
    photoHash = null;
    request(hash, width, height, level, stage) {
        if (!/^[a-f0-9]{64}$/.test(hash))
            throw new RangeError("Photo identity must be SHA-256");
        const checked = validateLevel(level);
        const shape = planResolution(width, height, stage);
        const token = ++this.revision;
        this.photoHash = hash;
        return Object.freeze({ revision: token, photoHash: hash, level: checked, stage,
            ...shape, fullResolution: stage === "release" });
    }
    isCurrent(job) {
        return job.revision === this.revision && job.photoHash === this.photoHash;
    }
    /** A pending render may complete, but onSuccess is never called for stale work. */
    async run(job, render, onSuccess) {
        if (!this.isCurrent(job))
            return false;
        const result = await render(job);
        if (!this.isCurrent(job))
            return false;
        onSuccess(result);
        return true;
    }
    cancel() {
        this.revision++;
        this.photoHash = null;
    }
}
//# sourceMappingURL=interaction.js.map