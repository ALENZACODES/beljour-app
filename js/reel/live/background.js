/** #80 Video background change: replace what is behind her on every frame.
 * The person mask comes from the on-device multiclass segmenter on each frame (browser.ts)
 * and is steadied over time with temporal.ts MaskSmoother (flicker averaged, real moves taken
 * at once), then its edge is softened by a small box blur so hair and shoulders blend. The
 * backdrop is one of our own plain studio colours, the frame itself blurred (a soft
 * background without a depth model) or a still image she chose. Where the mask is 1 her
 * pixels are untouched; alpha is kept. A frame without a mask is passed through unchanged.
 * EDGE_BLUR and the colours are ASSUMED. Author: John Khan.
 */
import { floatImage } from "../../engines/core/buffer.js";
import { boxMean } from "../../engines/core/filters.js";
import { checkPerson, copyFrame } from "./frames.js";
import { MaskSmoother } from "./temporal.js";
export const EDGE_BLUR = 2, SOFT_BLUR = 6;
export const BACKDROPS = {
    ivoire: [236, 230, 218], ardoise: [86, 96, 108], sauge: [158, 172, 150], nuit: [28, 32, 44],
};
export const LABEL = "Background changed on this device; you are kept as filmed.";
function blurPlane(values, width, height, radius) {
    const plane = floatImage(width, height, 1);
    plane.data.set(values);
    return Float32Array.from(boxMean(plane, radius).data);
}
function backdropPixel(backdrop, frame, soft, i, k) {
    if (backdrop.kind === "colour")
        return BACKDROPS[backdrop.name][k];
    if (backdrop.kind === "soft")
        return soft[k][i];
    const img = backdrop.image, x = i % frame.width, y = Math.floor(i / frame.width);
    const sx = Math.min(img.width - 1, Math.floor(x * img.width / frame.width));
    const sy = Math.min(img.height - 1, Math.floor(y * img.height / frame.height));
    return img.data[(sy * img.width + sx) * img.channels + k];
}
export class VideoBackground {
    backdrop;
    id = "background";
    label = LABEL;
    masks = new MaskSmoother();
    lastMask = null;
    constructor(backdrop = { kind: "colour", name: "ivoire" }) {
        this.backdrop = backdrop;
        if (backdrop.kind === "colour" && !Object.hasOwn(BACKDROPS, backdrop.name))
            throw new RangeError("unknown backdrop colour");
    }
    apply(frame, inputs, strength) {
        const { image } = frame, { width: w, height: h, channels: c } = image, n = w * h;
        checkPerson(inputs.person, image);
        if (!inputs.person) {
            this.masks.reset();
            this.lastMask = null;
            return { image: copyFrame(image), changed: false, note: "No person outline on some frames; they were left unchanged." };
        }
        const steady = this.masks.smooth(inputs.person), mask = blurPlane(steady, w, h, EDGE_BLUR);
        this.lastMask = mask;
        if (strength === 0)
            return { image: copyFrame(image), changed: false, note: "" };
        let soft = null;
        if (this.backdrop.kind === "soft") {
            soft = [0, 1, 2].map((k) => { const p = new Float32Array(n); for (let i = 0; i < n; i++)
                p[i] = image.data[i * c + k]; return blurPlane(p, w, h, SOFT_BLUR); });
        }
        const out = copyFrame(image), share = strength / 100;
        let changed = false;
        for (let i = 0; i < n; i++) {
            const away = (1 - mask[i]) * share;
            if (away <= 0)
                continue;
            for (let k = 0; k < 3; k++) {
                const a = image.data[i * c + k];
                const v = Math.floor(a + away * (backdropPixel(this.backdrop, image, soft, i, k) - a) + 0.5);
                if (v !== a)
                    changed = true;
                out.data[i * c + k] = v;
            }
        }
        return { image: out, changed, note: "" };
    }
    reset() { this.masks.reset(); this.lastMask = null; }
}
//# sourceMappingURL=background.js.map