import { h } from "../dom.js";
export class HairPainter {
    width;
    height;
    hair;
    placement;
    undoStack = [];
    strokeChanges = null;
    prior = null;
    constructor(width, height, hair, placement) {
        this.width = width;
        this.height = height;
        if (!(Number.isInteger(width) && Number.isInteger(height) && width >= 2 && height >= 2 && width * height <= 4194304)) {
            throw new RangeError("Hair markings need an image from 2 pixels to 4 megapixels.");
        }
        for (const mask of [hair, placement]) {
            if (!mask)
                continue;
            if (mask.width !== width || mask.height !== height || mask.data.length !== width * height)
                throw new RangeError("The markings do not match this photo.");
            for (const value of mask.data)
                if (!Number.isFinite(value) || value < 0 || value > 1)
                    throw new RangeError("Markings must stay in 0..1.");
        }
        this.hair = hair ? Float32Array.from(hair.data) : new Float32Array(width * height);
        this.placement = placement ? Float32Array.from(placement.data) : new Float32Array(width * height);
        for (let i = 0; i < this.placement.length; i++)
            this.placement[i] = Math.min(this.placement[i], this.hair[i]);
    }
    begin() { this.strokeChanges = new Map(); this.prior = null; }
    remember(index) {
        if (!this.strokeChanges?.has(index))
            this.strokeChanges?.set(index, { at: index, hair: this.hair[index], paint: this.placement[index] });
    }
    dab(x, y, radius, mode, erase = false) {
        if (![x, y, radius].every(Number.isFinite) || radius < 1 || radius > 128)
            throw new RangeError("Use a brush radius from 1 to 128 pixels.");
        if (mode !== "hair" && mode !== "placement")
            throw new RangeError("Choose hair or placement.");
        if (!this.strokeChanges)
            this.begin();
        const x0 = Math.max(0, Math.floor(x - radius)), x1 = Math.min(this.width - 1, Math.ceil(x + radius));
        const y0 = Math.max(0, Math.floor(y - radius)), y1 = Math.min(this.height - 1, Math.ceil(y + radius));
        for (let py = y0; py <= y1; py++)
            for (let px = x0; px <= x1; px++) {
                const distance = Math.hypot(px - x, py - y);
                if (distance > radius)
                    continue;
                const alpha = Math.min(1, Math.max(0, (radius - distance) / Math.max(1, radius * .2)));
                const i = py * this.width + px;
                this.remember(i);
                if (mode === "hair") {
                    this.hair[i] = erase ? this.hair[i] * (1 - alpha) : Math.max(this.hair[i], alpha);
                    this.placement[i] = Math.min(this.placement[i], this.hair[i]);
                }
                else {
                    this.placement[i] = erase ? this.placement[i] * (1 - alpha) : Math.min(this.hair[i], Math.max(this.placement[i], alpha));
                }
            }
    }
    line(x, y, radius, mode, erase = false) {
        if (!this.strokeChanges)
            this.begin();
        const start = this.prior ?? [x, y];
        const distance = Math.hypot(x - start[0], y - start[1]);
        const steps = Math.max(1, Math.ceil(distance / Math.max(1, radius / 3)));
        for (let i = 1; i <= steps; i++)
            this.dab(start[0] + (x - start[0]) * i / steps, start[1] + (y - start[1]) * i / steps, radius, mode, erase);
        this.prior = [x, y];
    }
    end() {
        if (this.strokeChanges?.size)
            this.undoStack.push([...this.strokeChanges.values()]);
        this.strokeChanges = null;
        this.prior = null;
        // A bounded history, measured in changed pixels, not full-photo copies.
        while (this.undoStack.length > 12 || this.undoStack.reduce((n, row) => n + row.length, 0) > 250000)
            this.undoStack.shift();
    }
    undo() {
        this.end();
        const changes = this.undoStack.pop();
        if (!changes)
            return false;
        for (const c of changes) {
            this.hair[c.at] = c.hair;
            this.placement[c.at] = c.paint;
        }
        return true;
    }
    clear(mode) {
        this.begin();
        for (let i = 0; i < this.hair.length; i++) {
            if (mode === "hair" ? this.hair[i] > 0 : this.placement[i] > 0) {
                this.remember(i);
                if (mode === "hair")
                    this.hair[i] = 0;
                this.placement[i] = 0;
            }
        }
        this.end();
    }
    get hairPixels() { let n = 0; for (const v of this.hair)
        if (v >= .5)
            n++; return n; }
    get paintedPixels() { let n = 0; for (const v of this.placement)
        if (v > 0)
            n++; return n; }
    masks() {
        const hair = { width: this.width, height: this.height, channels: 1, data: Float32Array.from(this.hair) };
        return { hair, placement: this.paintedPixels ? { ...hair, data: Float32Array.from(this.placement) } : undefined };
    }
}
export function paintOverlay(image, painter) {
    const data = new Uint8ClampedArray(image.width * image.height * 4);
    for (let i = 0; i < painter.hair.length; i++) {
        const hair = painter.hair[i] * .35;
        const placement = painter.placement[i] * .65;
        for (let c = 0; c < 3; c++) {
            const base = image.data[i * image.channels + c];
            const blue = c === 2 ? 145 : 0;
            data[i * 4 + c] = Math.round((base * (1 - hair) + blue * hair) * (1 - placement) + 255 * placement);
        }
        data[i * 4 + 3] = 255;
    }
    return data;
}
/** Mouse, touch and keyboard use the same pure brush. Commit is explicit. */
export function hairPainterSection(image, painter, commit, initialMode = "hair") {
    let mode = initialMode, erase = false, radius = Math.max(3, Math.round(image.width / 35));
    let down = false, cursor = [Math.floor(image.width / 2), Math.floor(image.height / 2)];
    const canvas = h("canvas", { width: image.width, height: image.height, tabindex: 0,
        "aria-label": "Mark hair. Arrow keys move the brush; Space paints; E toggles erase.", class: "beauty-paint-canvas",
        style: { maxWidth: "100%", touchAction: "none", border: "1px solid var(--plum, #6B3044)" } });
    const status = h("p", { class: "fine", "aria-live": "polite" });
    const submit = h("button", { type: "button", class: "btn" }, "Use these markings");
    const repaint = () => {
        const context = canvas.getContext("2d");
        if (context && typeof ImageData !== "undefined") {
            context.putImageData(new ImageData(new Uint8ClampedArray(paintOverlay(image, painter)), image.width, image.height), 0, 0);
            context.strokeStyle = "#FFFFFF";
            context.lineWidth = Math.max(1, image.width / 200);
            context.beginPath();
            context.arc(cursor[0], cursor[1], radius, 0, Math.PI * 2);
            context.stroke();
        }
        status.textContent = `${painter.hairPixels} hair pixels; ${painter.paintedPixels} placement pixels. ${erase ? "Erase" : "Paint"} ${mode}.`;
        submit.disabled = painter.hairPixels < 16;
    };
    const choose = h("select", { "aria-label": "Marking type" }, h("option", { value: "hair" }, "1. Mark hair"), h("option", { value: "placement" }, "2. Paint lightening placement"));
    choose.value = mode;
    choose.addEventListener("change", () => { mode = choose.value; repaint(); });
    const eraser = h("input", { type: "checkbox", "aria-label": "Erase markings" });
    eraser.addEventListener("change", () => { erase = eraser.checked; repaint(); });
    const size = h("input", { type: "range", min: 1, max: 128, value: radius, "aria-label": "Brush radius" });
    const sizeValue = h("output", {}, `${radius} px · Brush radius`);
    size.addEventListener("input", () => { radius = Number(size.value); sizeValue.textContent = `${radius} px · Brush radius`; repaint(); });
    const point = (event) => {
        const rect = canvas.getBoundingClientRect();
        return [Math.max(0, Math.min(image.width - 1, (event.clientX - rect.left) * image.width / rect.width)),
            Math.max(0, Math.min(image.height - 1, (event.clientY - rect.top) * image.height / rect.height))];
    };
    canvas.addEventListener("pointerdown", event => {
        down = true;
        painter.begin();
        cursor = point(event);
        canvas.setPointerCapture?.(event.pointerId);
        painter.line(...cursor, radius, mode, erase);
        repaint();
    });
    canvas.addEventListener("pointermove", event => { if (down) {
        cursor = point(event);
        painter.line(...cursor, radius, mode, erase);
        repaint();
    } });
    for (const type of ["pointerup", "pointercancel"])
        canvas.addEventListener(type, () => { down = false; painter.end(); repaint(); });
    canvas.addEventListener("keydown", event => {
        const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
        if (arrows[event.key]) {
            event.preventDefault();
            const [x, y] = arrows[event.key];
            cursor = [Math.max(0, Math.min(image.width - 1, cursor[0] + x * radius)), Math.max(0, Math.min(image.height - 1, cursor[1] + y * radius))];
        }
        else if (event.key === " ") {
            event.preventDefault();
            painter.begin();
            painter.dab(...cursor, radius, mode, erase);
            painter.end();
        }
        else if (event.key.toLowerCase() === "e") {
            erase = !erase;
            eraser.checked = erase;
        }
        else
            return;
        repaint();
    });
    submit.addEventListener("click", () => { if (painter.hairPixels >= 16) {
        const masks = painter.masks();
        commit(masks.hair, masks.placement);
    } });
    repaint();
    return h("section", { class: "hair-painter" }, h("h3", {}, "Mark your own hair"), h("p", { class: "fine" }, "Manual selection. Keep skin and background outside the blue area. White marks show lightening placement. Nothing is uploaded."), choose, h("label", {}, eraser, " Erase"), h("label", {}, "Brush size ", size, sizeValue), canvas, status, h("div", { class: "row" }, h("button", { type: "button", class: "btn btn-quiet", onclick: () => { painter.undo(); repaint(); } }, "Undo marking"), h("button", { type: "button", class: "btn btn-quiet", onclick: () => { painter.clear(mode); repaint(); } }, "Clear selected markings"), submit));
}
//# sourceMappingURL=hair-painter.js.map