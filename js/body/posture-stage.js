/** Display stage for the body studio: bounded preview, before/after split and markings.
 * Display copies are downscaled to at most 1024 pixels on the long edge and never become an
 * export source. Pointer positions are mapped back to source pixel coordinates.
 * Author: John Khan.
 */
import { resizeArea, toRGBA } from "../engines/core/buffer.js";
/** ASSUMED: 1024 px keeps a 12 MP source's display copy near 1 MP. */
export const DISPLAY_MAX_EDGE = 1024;
export function displaySize(width, height, maxEdge = DISPLAY_MAX_EDGE) {
    const scale = Math.min(1, maxEdge / Math.max(width, height));
    return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), scale };
}
export function displayCopy(image, maxEdge = DISPLAY_MAX_EDGE) {
    const size = displaySize(image.width, image.height, maxEdge);
    return size.width === image.width && size.height === image.height
        ? { ...image, data: new Uint8Array(image.data) }
        : resizeArea(image, size.width, size.height);
}
/** Columns left of `split` (0..1 of the width) show the source; the rest show the edit. */
export function splitComposite(before, after, split) {
    if (before.width !== after.width || before.height !== after.height || before.channels !== after.channels) {
        throw new RangeError("before and after must be the same size");
    }
    if (!(Number.isFinite(split) && split >= 0 && split <= 1))
        throw new RangeError("split must be between 0 and 1");
    const cut = Math.round(split * before.width);
    const data = new Uint8Array(after.data);
    const { width, height, channels } = before;
    for (let y = 0; y < height; y++) {
        const row = y * width * channels;
        data.set(before.data.subarray(row, row + cut * channels), row);
    }
    return { width, height, channels, data };
}
export class PostureStage {
    element;
    scale = 1;
    sourceWidth = 0;
    sourceHeight = 0;
    constructor(label = "Photo preview") {
        this.element = document.createElement("canvas");
        this.element.setAttribute("role", "img");
        this.element.setAttribute("aria-label", label);
    }
    /** Show the source alone, or a before/after split once an edit exists. `original` is the
     * full-size photo the markings and pointer coordinates refer to (defaults to `source`). */
    show(source, edited = null, split = 0.5, markings = null, original = source) {
        const before = displayCopy(source);
        const shown = edited ? splitComposite(before, displayCopy(edited), split) : before;
        this.sourceWidth = original.width;
        this.sourceHeight = original.height;
        this.scale = shown.width / original.width;
        this.element.width = shown.width;
        this.element.height = shown.height;
        const context = this.element.getContext("2d");
        if (!context)
            return;
        const pixels = context.createImageData(shown.width, shown.height);
        pixels.data.set(toRGBA(shown));
        context.putImageData(pixels, 0, 0);
        if (markings)
            this.drawMarkings(context, markings);
    }
    /** Map a display-space position to source pixel coordinates. */
    toSource(x, y) {
        if (!this.sourceWidth)
            throw new RangeError("no photo on the stage");
        return [Math.min(this.sourceWidth - 0.5, Math.max(-0.5, x / this.scale)),
            Math.min(this.sourceHeight - 0.5, Math.max(-0.5, y / this.scale))];
    }
    clear() {
        this.element.getContext("2d")?.clearRect(0, 0, this.element.width, this.element.height);
        this.element.width = 0;
        this.element.height = 0;
        this.sourceWidth = this.sourceHeight = 0;
    }
    drawMarkings(context, markings) {
        for (const outline of [markings.person, markings.head]) {
            if (!outline || outline.length < 2)
                continue;
            context.beginPath();
            context.moveTo(outline[0][0] * this.scale, outline[0][1] * this.scale);
            for (const [x, y] of outline.slice(1))
                context.lineTo(x * this.scale, y * this.scale);
            context.closePath();
            context.stroke();
        }
        for (const [x, y] of Object.values(markings.points)) {
            context.beginPath();
            context.arc(x * this.scale, y * this.scale, 3, 0, 2 * Math.PI);
            context.fill();
        }
    }
}
