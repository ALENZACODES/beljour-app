/** Compare toolbar and stage on the studio page (DOM). The arithmetic lives in compare*.ts;
 * this file wires buttons, pointer and keys to it and paints the result.
 *
 * - The ten modes are a radio group: one Tab stop, arrow keys move, digits 1–0 jump.
 * - The stage canvas is focusable; its arrow keys move the split line or the loupe.
 * - Grid modes render their frames in the shell worker, so nine renders don't freeze the page.
 * - Flicker only animates when the person hasn't asked for reduced motion.
 * - Nothing here touches the network or the undo history (a stop-grid tap is a normal edit).
 *
 * Author: John Khan.
 */
import { toRGBA } from "../../engines/core/buffer.js";
import { label as drawLabel, downloadCanvas } from "./canvas.js";
import { COMPARE_MODES, MODE_INFO, splitOrientation, stopGridValues } from "./compare.js";
import { stacksFor, targetLayer } from "./compare-frames.js";
import { PHONE_MAX, stageBox } from "./compare-layout.js";
import { renderCompare } from "./compare-render.js";
import { CompareSession, LOUPE_ZOOMS } from "./compare-session.js";
import { roving } from "./focus.js";
import { stopsFor } from "./stops.js";
import { PALETTE } from "../palette.js";
function el(tag, className = "", text) {
    const n = document.createElement(tag);
    if (className)
        n.className = className;
    if (text !== undefined)
        n.textContent = text;
    return n;
}
const measureCtx = (() => {
    let ctx = null;
    return (text, font) => {
        ctx ??= document.createElement("canvas").getContext("2d");
        if (!ctx)
            return text.length * font * 0.6;
        ctx.font = `600 ${font}px system-ui, sans-serif`;
        return ctx.measureText(text).width;
    };
})();
/** Write a board's captions, centred under each pane, in the theme's ink colour. */
function drawCaptions(ctx, view) {
    ctx.save();
    ctx.fillStyle = PALETTE.ink;
    ctx.textBaseline = "top";
    ctx.textAlign = "center";
    for (const caption of view.captions) {
        ctx.font = `600 ${caption.fontPx}px system-ui, sans-serif`;
        caption.lines.forEach((line, i) => ctx.fillText(line, caption.x, caption.y + i * caption.lineHeight, caption.width));
    }
    ctx.restore();
}
export class CompareController {
    editor;
    els;
    hooks;
    session;
    view = null;
    frames = null;
    framesKey = "";
    ticket = 0;
    timer = null;
    started = performance.now();
    drag = null;
    builtFor = null;
    gridCache = new Map();
    /** When true (annotation drafting), the stage is owned by the marking tool. */
    suspended = false;
    constructor(editor, els, hooks, reducedMotion = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) {
        this.editor = editor;
        this.els = els;
        this.hooks = hooks;
        this.session = new CompareSession({}, reducedMotion);
        this.buildModes();
        this.session.subscribe(() => this.refresh());
        this.wireStage();
    }
    get reducedMotion() { return this.session.reducedMotion; }
    buildModes() {
        const group = this.els.modes;
        group.replaceChildren();
        for (const mode of COMPARE_MODES) {
            const info = MODE_INFO[mode];
            const b = el("button", "shell-mode");
            b.type = "button";
            b.setAttribute("role", "radio");
            b.dataset.mode = mode;
            b.setAttribute("aria-keyshortcuts", info.key);
            b.title = `${info.summary} (key ${info.key})`;
            b.append(el("span", "shell-mode-title", info.title));
            const key = el("span", "shell-mode-key", info.key);
            key.setAttribute("aria-hidden", "true");
            b.append(key);
            b.addEventListener("click", () => this.select(mode));
            group.append(b);
        }
        this.syncModes();
        roving(group, "[role=radio]", "horizontal", (item) => this.select(item.dataset.mode));
    }
    syncModes() {
        for (const b of this.els.modes.querySelectorAll("[role=radio]")) {
            const on = b.dataset.mode === this.session.mode;
            b.setAttribute("aria-checked", String(on));
            b.tabIndex = on ? 0 : -1;
            b.classList.toggle("is-active", on);
        }
    }
    select(mode) {
        this.session.setMode(mode);
        this.hooks.announce(`${MODE_INFO[mode].title}. ${MODE_INFO[mode].summary}`);
    }
    controlRange(label, min, max, step, value, text, onInput, key) {
        const wrap = el("label", "shell-compare-field");
        const range = el("input", "shell-range");
        range.type = "range";
        range.min = String(min);
        range.max = String(max);
        range.step = String(step);
        range.value = String(value);
        range.dataset.control = key;
        range.setAttribute("aria-valuetext", text(value));
        const out = el("output", "shell-range-output", text(value));
        range.addEventListener("input", () => { const v = Number(range.value); out.textContent = text(v); range.setAttribute("aria-valuetext", text(v)); onInput(v); });
        wrap.append(el("span", "shell-field-name", label), range, out);
        return wrap;
    }
    /** Per-mode controls; rebuilt only when the mode changes so keyboard focus isn't lost. */
    buildControls() {
        const mode = this.session.mode, s = this.session.state, box = this.els.controls;
        box.replaceChildren();
        this.builtFor = mode;
        const split = splitOrientation(mode);
        if (mode === "hold")
            box.append(el("p", "shell-compare-note", "Press and hold the picture or the Hold button. Space toggles it from the keyboard."));
        if (split) {
            box.append(this.controlRange(split === "horizontal" ? "Line, from the top" : "Line position", 0, 100, 1, Math.round(s.position * 100), (v) => `${v}% original`, (v) => this.session.setPosition(v / 100), "position"));
        }
        if (mode === "flicker") {
            const play = el("button", "shell-button", s.playing ? "Pause" : "Play");
            play.type = "button";
            play.dataset.control = "play";
            play.disabled = this.reducedMotion;
            play.addEventListener("click", () => { this.session.togglePlay(); });
            const swap = el("button", "shell-button", "Switch picture");
            swap.type = "button";
            swap.addEventListener("click", () => { this.session.toggleManual(); this.hooks.announce(this.session.describe()); });
            box.append(play, swap, this.controlRange("Speed", 400, 3000, 100, s.flickerMs, (v) => `${(v / 1000).toFixed(1)} s each`, (v) => this.session.setFlickerMs(v), "speed"));
            if (this.reducedMotion)
                box.append(el("p", "shell-compare-note", "Reduced motion is on, so the picture changes only when you press Space or Switch picture."));
        }
        if (mode === "loupe") {
            const wrap = el("label", "shell-compare-field");
            const zoom = el("select", "shell-select");
            zoom.dataset.control = "zoom";
            for (const z of LOUPE_ZOOMS) {
                const o = el("option", "", `${z}×`);
                o.value = String(z);
                zoom.append(o);
            }
            zoom.value = String(s.loupe.zoom);
            zoom.addEventListener("change", () => this.session.setLoupeZoom(Number(zoom.value)));
            wrap.append(el("span", "shell-field-name", "Magnify"), zoom);
            const centre = el("button", "shell-button", "Centre");
            centre.type = "button";
            centre.addEventListener("click", () => this.session.setLoupe(0.5, 0.5));
            box.append(wrap, centre, el("p", "shell-compare-note", "Drag the picture or use the arrow keys to move the loupe."));
        }
        if (mode === "difference") {
            box.append(this.controlRange("Sensitivity", 1, 16, 1, s.differenceGain, (v) => `${v}×`, (v) => this.session.setGain(v), "gain"));
            const legend = el("p", "shell-legend");
            const ramp = el("span", "shell-legend-ramp");
            ramp.setAttribute("aria-hidden", "true");
            legend.append(el("span", "shell-legend-low", "Blue: small change"), ramp, el("span", "shell-legend-high", "Red: large change"));
            box.append(legend);
        }
        if (mode === "stop-grid")
            box.append(el("p", "shell-compare-note", "Tap a picture to use that strength. The real layer changes only when you tap."));
        if (mode === "grid-2x2")
            box.append(el("p", "shell-compare-note", "The selected layer is the one studied. Select another in the layer stack."));
        this.els.board.hidden = !MODE_INFO[mode].board;
    }
    syncControls() {
        const s = this.session.state;
        const position = this.els.controls.querySelector("[data-control=position]");
        if (position && document.activeElement !== position) {
            position.value = String(Math.round(s.position * 100));
            position.setAttribute("aria-valuetext", `${Math.round(s.position * 100)}% original`);
        }
        const play = this.els.controls.querySelector("[data-control=play]");
        if (play) {
            play.textContent = s.playing ? "Pause" : "Play";
            play.setAttribute("aria-pressed", String(s.playing));
        }
        const zoom = this.els.controls.querySelector("[data-control=zoom]");
        if (zoom)
            zoom.value = String(s.loupe.zoom);
        this.els.hold.setAttribute("aria-pressed", String(s.held));
    }
    box() {
        const phone = window.innerWidth <= PHONE_MAX;
        // The stage may grow to its CSS max-height, so fit to that rather than to its current size.
        const cs = getComputedStyle(this.els.scroll), px = (v) => Number.parseFloat(v) || 0;
        const maxH = Number.parseFloat(cs.maxHeight);
        const width = this.els.scroll.clientWidth - px(cs.paddingLeft) - px(cs.paddingRight);
        const height = (Number.isFinite(maxH) ? maxH : this.els.scroll.clientHeight) - px(cs.paddingTop) - px(cs.paddingBottom);
        if (width >= 96 && height >= 64)
            return { box: { width, height: Math.max(height, phone ? 260 : 300) }, phone };
        return stageBox(Math.max(280, window.innerWidth), Math.max(320, window.innerHeight));
    }
    key() {
        const doc = this.editor.document, info = MODE_INFO[this.session.mode];
        return JSON.stringify([this.editor.source.id, this.editor.renderVersion, info.inputs === "pair" ? "pair" : this.session.mode, doc.layers, info.inputs === "pair" ? null : doc.selected]);
    }
    /** Recompute frames if the document changed, then paint. */
    refresh() {
        if (this.builtFor !== this.session.mode) {
            this.buildControls();
            this.syncModes();
        }
        this.syncControls();
        this.schedule();
        if (this.suspended)
            return;
        const key = this.key(), mode = this.session.mode, info = MODE_INFO[mode];
        if (key === this.framesKey && this.frames) {
            this.paint();
            return;
        }
        const ticket = ++this.ticket;
        if (info.inputs === "pair") {
            this.frames = this.editor.frames(mode);
            this.framesKey = key;
            this.paint();
            return;
        }
        const cached = this.gridCache.get(key);
        if (cached) {
            this.frames = cached;
            this.framesKey = key;
            this.paint();
            return;
        }
        let count = 0;
        try {
            count = stacksFor(mode, this.editor.document.layers, this.editor.document.selected).length;
        }
        catch (error) {
            this.showMessage(error instanceof Error ? error.message : String(error));
            return;
        }
        this.hooks.status(`Rendering ${count} previews on this device…`);
        this.els.stage.setAttribute("aria-busy", "true");
        const done = (frames) => {
            if (ticket !== this.ticket)
                return;
            this.gridCache.set(key, frames);
            if (this.gridCache.size > 8)
                this.gridCache.delete(this.gridCache.keys().next().value);
            this.frames = frames;
            this.framesKey = key;
            this.els.stage.removeAttribute("aria-busy");
            this.paint();
            this.hooks.status(`${MODE_INFO[mode].title}: ${count} previews ready.`);
        };
        const fail = (error) => {
            if (ticket !== this.ticket)
                return;
            this.els.stage.removeAttribute("aria-busy");
            this.showMessage(error instanceof Error ? error.message : String(error));
        };
        if (this.hooks.threaded) {
            const doc = this.editor.document;
            this.hooks.client.frames(this.editor.source, doc.layers, doc.selected, mode).then(done, fail);
        }
        else {
            setTimeout(() => { try {
                done(this.editor.frames(mode));
            }
            catch (error) {
                fail(error);
            } }, 0);
        }
    }
    showMessage(text) {
        this.view = null;
        this.frames = null;
        this.framesKey = "";
        this.hooks.status(text);
        this.els.measure.textContent = text;
        this.els.description.textContent = text;
    }
    schedule() {
        const s = this.session.state;
        const want = s.mode === "flicker" && s.playing && !this.reducedMotion && !this.suspended;
        if (!want && this.timer !== null) {
            clearInterval(this.timer);
            this.timer = null;
        }
        if (want && this.timer === null) {
            this.started = performance.now();
            this.timer = setInterval(() => { if (!document.hidden)
                this.paint(); }, Math.max(100, Math.round(s.flickerMs / 2)));
        }
    }
    /** Paint the current view at its display scale, with captions and the simulation label. */
    paint() {
        if (this.suspended || !this.frames)
            return;
        const { box, phone } = this.box();
        let view;
        try {
            view = renderCompare(this.session.state, this.frames, { box, phone, elapsedMs: performance.now() - this.started, measure: measureCtx });
        }
        catch (error) {
            this.showMessage(error instanceof Error ? error.message : String(error));
            return;
        }
        this.view = view;
        const canvas = this.els.canvas, ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx)
            throw new Error("2D canvas is not supported");
        canvas.width = view.image.width;
        canvas.height = view.image.height;
        ctx.putImageData(new ImageData(new Uint8ClampedArray(toRGBA(view.image)), view.image.width, view.image.height), 0, 0);
        drawCaptions(ctx, view);
        if (view.simulation)
            drawLabel(ctx, view.image.width, view.image.height, "Photo simulation · BELJOUR — FULL BEAUTY STUDIO");
        const single = MODE_INFO[this.session.mode].inputs === "pair" && !["side-by-side", "loupe"].includes(this.session.mode);
        const scale = view.layout.displayScale * (single ? this.hooks.zoom() : 1);
        canvas.style.width = `${Math.round(view.image.width * scale)}px`;
        canvas.style.height = `${Math.round(view.image.height * scale)}px`;
        canvas.setAttribute("aria-label", `${MODE_INFO[this.session.mode].title} compare of the ${this.editor.source.kind === "sample" ? "drawn sample" : "photo on this device"}`);
        this.els.description.textContent = view.description;
        this.els.measure.textContent = view.status;
        this.els.stage.dataset.compare = this.session.mode;
    }
    unitPoint(event) {
        const r = this.els.canvas.getBoundingClientRect();
        return [Math.min(1, Math.max(0, (event.clientX - r.left) / Math.max(1, r.width))), Math.min(1, Math.max(0, (event.clientY - r.top) / Math.max(1, r.height)))];
    }
    wireStage() {
        const canvas = this.els.canvas;
        canvas.addEventListener("pointerdown", (event) => {
            if (this.suspended || event.button !== 0)
                return;
            const mode = this.session.mode, split = splitOrientation(mode);
            const [ux, uy] = this.unitPoint(event);
            if (mode === "hold") {
                this.session.hold(true);
                canvas.setPointerCapture(event.pointerId);
                event.preventDefault();
                return;
            }
            if (split) {
                this.session.setPosition(split === "vertical" ? ux : split === "horizontal" ? uy : (ux + uy) / 2);
                this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY, loupe: this.session.state.loupe };
                canvas.setPointerCapture(event.pointerId);
                event.preventDefault();
                return;
            }
            if (mode === "loupe") {
                this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY, loupe: { ...this.session.state.loupe } };
                canvas.setPointerCapture(event.pointerId);
                event.preventDefault();
                return;
            }
            if (mode === "flicker") {
                this.session.toggleManual();
                this.hooks.announce(this.session.describe());
                return;
            }
            if (mode === "stop-grid")
                this.tapStop(event);
        });
        canvas.addEventListener("pointermove", (event) => {
            if (!this.drag || this.drag.id !== event.pointerId)
                return;
            const mode = this.session.mode, split = splitOrientation(mode);
            if (split) {
                const [ux, uy] = this.unitPoint(event);
                this.session.setPosition(split === "vertical" ? ux : split === "horizontal" ? uy : (ux + uy) / 2);
                return;
            }
            if (mode === "loupe" && this.frames) {
                // Drag pans the loupe: one CSS pixel moves 1 / (zoom × display scale) photo pixels.
                const r = canvas.getBoundingClientRect(), w = this.frames[0].image.width, h = this.frames[0].image.height;
                const cssScale = r.width / Math.max(1, this.view?.layout.width ?? r.width), zoom = this.drag.loupe.zoom;
                this.session.setLoupe(this.drag.loupe.x - (event.clientX - this.drag.x) / (zoom * cssScale) / w, this.drag.loupe.y - (event.clientY - this.drag.y) / (zoom * cssScale) / h);
            }
        });
        const end = (event) => {
            if (this.session.mode === "hold" && this.session.state.held && event.type !== "pointermove")
                this.session.hold(false);
            if (this.drag?.id === event.pointerId) {
                this.drag = null;
                if (splitOrientation(this.session.mode))
                    this.hooks.announce(`Line at ${Math.round(this.session.state.position * 100)}%`);
            }
        };
        for (const name of ["pointerup", "pointercancel", "lostpointercapture"])
            canvas.addEventListener(name, end);
        canvas.addEventListener("keydown", (event) => {
            if (this.suspended)
                return;
            const out = this.session.key(event);
            if (out.handled) {
                event.preventDefault();
                event.stopPropagation();
                if (out.announce)
                    this.hooks.announce(out.announce);
            }
        });
        // The R8 Hold button: hold with a pointer, toggle with the keyboard (a click with detail 0).
        const hold = this.els.hold;
        hold.addEventListener("pointerdown", (event) => {
            if (event.button !== 0)
                return;
            if (this.session.mode !== "hold")
                this.session.setMode("hold");
            this.session.hold(true);
        });
        for (const name of ["pointerup", "pointerleave", "pointercancel"])
            hold.addEventListener(name, () => { if (this.session.state.held)
                this.session.hold(false); });
        hold.addEventListener("click", (event) => {
            if (event.detail !== 0)
                return;
            if (this.session.mode !== "hold")
                this.session.setMode("hold");
            this.session.hold(!this.session.state.held);
            this.hooks.announce(this.session.describe());
        });
        this.els.board.addEventListener("click", () => { void this.saveBoard(); });
        window.addEventListener("resize", () => { if (!this.suspended)
            this.paint(); });
    }
    /** Stop grid: tapping a pane sets the target layer to that strength (one undoable edit). */
    tapStop(event) {
        if (!this.view)
            return;
        const r = this.els.canvas.getBoundingClientRect(), scale = r.width / Math.max(1, this.view.layout.width);
        const x = (event.clientX - r.left) / scale, y = (event.clientY - r.top) / scale;
        const pane = this.view.layout.panes.find((p) => x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h + p.captionH);
        const doc = this.editor.document, target = targetLayer(doc.layers, doc.selected);
        if (!pane || !target)
            return;
        const value = stopGridValues(stopsFor(target.kind))[pane.frame];
        this.editor.update(target.id, { strength: value }, `Strength from grid: ${value}%`);
        this.hooks.announce(`${target.name} set to ${value}%`);
        this.hooks.edited();
    }
    /** Save the current board (side by side, 2×2 or 3×3) with captions and, when on, the label. */
    async saveBoard() {
        if (!this.view || !MODE_INFO[this.session.mode].board)
            return;
        const copy = document.createElement("canvas");
        const ctx = copy.getContext("2d");
        if (!ctx)
            return;
        const footer = 26;
        copy.width = this.els.canvas.width;
        copy.height = this.els.canvas.height + footer;
        ctx.fillStyle = PALETTE.cream;
        ctx.fillRect(0, 0, copy.width, copy.height); // saved board: fixed light palette
        ctx.drawImage(this.els.canvas, 0, 0);
        // Provenance line on every saved board: where it was made and what it is.
        ctx.fillStyle = PALETTE.plum;
        ctx.fillRect(0, copy.height - footer, copy.width, footer);
        ctx.fillStyle = PALETTE.cream;
        ctx.font = "600 11px system-ui, sans-serif";
        ctx.textBaseline = "middle";
        ctx.textAlign = "left";
        const kind = this.view.simulation ? "Includes photo simulations" : "Local edits";
        ctx.fillText(`BELJOUR — FULL BEAUTY STUDIO · ${kind} · made on this device · ${new Date().toISOString().slice(0, 10)}`, 8, copy.height - footer / 2, copy.width - 16);
        if (!this.hooks.exportLabel() && this.view.simulation) {
            // The visible board always carries the label; the export follows the export switch.
            ctx.putImageData(new ImageData(new Uint8ClampedArray(toRGBA(this.view.image)), this.view.image.width, this.view.image.height), 0, 0);
            drawCaptions(ctx, this.view);
        }
        await downloadCanvas(copy, `beljour-${this.session.mode}-board.png`);
        this.hooks.status("Board saved on this device.");
    }
}
//# sourceMappingURL=compare-view.js.map