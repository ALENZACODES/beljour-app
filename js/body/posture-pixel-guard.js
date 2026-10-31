import { checkedPostureLevel } from "../engines/local/posture.js";
import { IdentityLockUnavailable } from "./posture-session.js";
import { checkedHeadMask, checkedSource } from "./posture-safe.js";
export class HeadPixelGuard {
    width;
    height;
    channels;
    indices;
    anchor;
    disposed = false;
    constructor(source, head) {
        const image = checkedSource(source);
        const covered = checkedHeadMask(head, image.width, image.height);
        this.width = image.width;
        this.height = image.height;
        this.channels = image.channels;
        const marked = [];
        for (let p = 0; p < covered.length; p++)
            if (covered[p])
                marked.push(p);
        this.indices = Uint32Array.from(marked);
        this.anchor = new Uint8Array(marked.length * this.channels);
        marked.forEach((pixel, k) => {
            for (let c = 0; c < this.channels; c++)
                this.anchor[k * this.channels + c] = image.data[pixel * this.channels + c];
        });
    }
    get protectedPixels() { return this.indices.length; }
    get isDisposed() { return this.disposed; }
    requireShape(image, what) {
        if (!image || image.width !== this.width || image.height !== this.height || image.channels !== this.channels ||
            image.data.length !== this.width * this.height * this.channels) {
            throw new IdentityLockUnavailable(`Head protection received an incompatible ${what} image.`);
        }
    }
    /** Exact agreement share between an image's marked head bytes and the anchor. */
    agreement(image) {
        this.requireShape(image, "comparison");
        let same = 0;
        for (let k = 0; k < this.indices.length; k++) {
            const base = this.indices[k] * this.channels;
            let equal = true;
            for (let c = 0; c < this.channels; c++) {
                if (image.data[base + c] !== this.anchor[k * this.channels + c]) {
                    equal = false;
                    break;
                }
            }
            if (equal)
                same++;
        }
        return this.indices.length ? same / this.indices.length : 0;
    }
    guard(before, after, lockLevel) {
        if (this.disposed)
            throw new IdentityLockUnavailable("Head protection has been released.");
        try {
            checkedPostureLevel(lockLevel);
        }
        catch {
            throw new IdentityLockUnavailable("Head protection received an invalid lock level.");
        }
        this.requireShape(before, "source");
        this.requireShape(after, "edited");
        if (this.agreement(before) !== 1) {
            throw new IdentityLockUnavailable("The original head pixels changed; mark the head again.");
        }
        const data = new Uint8Array(after.data);
        for (let k = 0; k < this.indices.length; k++) {
            const base = this.indices[k] * this.channels;
            for (let c = 0; c < this.channels; c++)
                data[base + c] = this.anchor[k * this.channels + c];
        }
        const image = { ...after, data };
        return { image, similarity: this.agreement(image) };
    }
    dispose() {
        if (this.disposed)
            return;
        this.anchor.fill(0);
        this.indices.fill(0);
        this.anchor = new Uint8Array(0);
        this.indices = new Uint32Array(0);
        this.disposed = true;
    }
}
