import { LandmarkSmoother } from "../oneEuro.js";
export const MASK_RATE = 0.35, MASK_JUMP = 0.5, PIXEL_STILL = 12, PIXEL_KEEP = 0.6;
export class PointSmoother {
    smoother;
    constructor(minCutoff = 1.5, beta = 0.02) { this.smoother = new LandmarkSmoother(minCutoff, beta); }
    smooth(points, t) {
        return this.smoother.smooth(points.map(([x, y]) => ({ x, y })), t).map((p) => [p.x, p.y]);
    }
    reset() { this.smoother.reset(); }
}
export class MaskSmoother {
    rate;
    jump;
    state = null;
    constructor(rate = MASK_RATE, jump = MASK_JUMP) {
        this.rate = rate;
        this.jump = jump;
    }
    smooth(mask) {
        if (!this.state || this.state.length !== mask.length) {
            this.state = Float32Array.from(mask);
            return Float32Array.from(mask);
        }
        const s = this.state;
        for (let i = 0; i < mask.length; i++) {
            const d = mask[i] - s[i];
            s[i] = Math.abs(d) > this.jump ? mask[i] : s[i] + this.rate * d;
        }
        return Float32Array.from(s);
    }
    reset() { this.state = null; }
}
export class PixelSmoother {
    still;
    keep;
    last = null;
    constructor(still = PIXEL_STILL, keep = PIXEL_KEEP) {
        this.still = still;
        this.keep = keep;
    }
    smooth(image) {
        const out = { width: image.width, height: image.height, channels: image.channels, data: new Uint8ClampedArray(image.data) };
        const prev = this.last;
        if (prev && prev.width === image.width && prev.height === image.height && prev.channels === image.channels) {
            const c = image.channels;
            for (let i = 0; i < image.width * image.height; i++) {
                let still = true;
                for (let k = 0; k < 3; k++)
                    if (Math.abs(image.data[i * c + k] - prev.data[i * c + k]) > this.still) {
                        still = false;
                        break;
                    }
                if (!still)
                    continue;
                for (let k = 0; k < 3; k++) {
                    const a = image.data[i * c + k], b = prev.data[i * c + k];
                    out.data[i * c + k] = Math.floor(a + this.keep * (b - a) + 0.5);
                }
            }
        }
        this.last = out;
        return out;
    }
    reset() { this.last = null; }
}
