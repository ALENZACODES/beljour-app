/** The Create panel in the Studio: a live page (her edited photo, or a collage or story board,
 * with its frame and layers) she works on directly, the tool tabs (tabs.ts), the Create layer
 * list and Save.
 *
 * On the page: tap a layer to select it and drag to move it; drag the round corner handle to
 * resize and turn it; two fingers move, resize and turn together. In Draw, a finger or the mouse
 * draws. On a board, dragging a photo slides it inside its cell (a freeform print moves).
 * From the keyboard (the page has focus): arrows move the selected layer (Shift: further),
 * + and - resize, [ and ] turn, Delete removes it, Escape lets go.
 * A gesture is previewed live and becomes one step in the Studio's history when it ends.
 * Author: John Khan.
 */
import { h } from "../../dom.js";
import { PHOTO_MARK } from "../../ui/palette.js";
import { describe, editLayer, find, nextId, removeLayer, reorder, } from "./doc.js";
import { HANDLE_PX, clampScale, corners, dragHandle, hitBox, hitHandle, handlePoint, moveBy, pinch, screenToPage, wrapAngle, } from "./geometry.js";
import { approxMeasure, fontCss } from "./text.js";
import { StrokeBuilder } from "./ink.js";
import { sharedAssets } from "./assets.js";
import { layerSize, pageGeometry, renderPage } from "./render.js";
import { sheetPool } from "./export.js";
import { panBy } from "./board.js";
import { btn, hexOf } from "./kit.js";
import { CREATE_TABS, tabControls } from "./tabs.js";
const PREVIEW_SIDE = 720; // ASSUMED: preview long side in CSS pixels; the saved file is full size
export class CreatePanel {
    editor;
    deps;
    element;
    tab;
    selected = null;
    cell = null;
    eyedrop = null;
    assets;
    draft = null;
    gesture = null;
    pointers = new Map();
    canvas;
    tabsEl;
    controls;
    layersEl;
    statusEl;
    unsubscribe;
    /** The drawing sheet reused by every preview redraw, released with the panel. */
    sheets;
    geometry = null;
    scale = 1;
    disposed = false;
    constructor(editor, tab = "text", deps = {}) {
        this.editor = editor;
        this.deps = deps;
        this.tab = tab;
        this.assets = (deps.assets ?? sharedAssets).bind({ edited: () => editor.rendered().image, original: () => editor.source.image });
        this.assets.onload = () => this.paint();
        this.canvas = h("canvas", { class: "cr-stage", tabindex: "0", role: "img",
            "aria-label": "Your page. Select a layer to move it with the arrow keys; plus and minus resize, brackets turn, Delete removes." });
        this.tabsEl = h("div", { class: "cr-tabs", role: "tablist", "aria-label": "Create tools" });
        this.controls = h("div", { class: "cr-controls" });
        this.layersEl = h("ol", { class: "cr-layers", "aria-label": "Create layers, top first" });
        this.statusEl = h("p", { class: "cr-status fine", role: "status", "aria-live": "polite" }, "Everything here is drawn on this device. Nothing is uploaded.");
        const save = btn("Save photo", () => this.save(), { cls: "cr-btn btn-primary" });
        this.element = h("section", { class: "cr-panel", "aria-label": "Create: text, drawing, stickers, frames, collage and story" }, h("h2", {}, "Create"), h("p", { class: "fine" }, "Text, drawing, stickers, frames, collages and stories on your photo. Every change is a step in History; Undo works here too."), this.tabsEl, h("div", { class: "cr-body" }, h("div", { class: "cr-stage-wrap" }, this.canvas), h("div", { class: "cr-side" }, this.controls, h("h3", { class: "cr-layers-title" }, "Create layers"), this.layersEl)), h("div", { class: "cr-footer" }, btn("Undo", () => { this.editor.undo(); this.deps.onChange?.(); }), btn("Redo", () => { this.editor.redo(); this.deps.onChange?.(); }), save), this.statusEl);
        this.sheets = sheetPool(this.element.ownerDocument ?? document);
        this.wireStage();
        this.unsubscribe = editor.subscribe(() => { if (!this.disposed) {
            this.draft = null;
            this.refresh();
        } });
        this.refresh();
        void (this.deps.doc ?? globalThis.document)?.fonts?.load?.('600 40px "Fraunces"').then(() => this.paint(), () => undefined);
    }
    dispose() { this.disposed = true; this.unsubscribe(); this.sheets.release(); if (this.assets.onload)
        this.assets.onload = null; }
    /** The document shown: a live gesture's preview, or the Studio's current step. */
    get doc() { return this.draft ?? this.editor.create; }
    get layer() { return this.selected ? this.doc.layers.find((l) => l.id === this.selected) ?? null : null; }
    say(text) { this.statusEl.textContent = text; }
    /** Make `doc` one history step. */
    commit(label, doc) {
        this.draft = null;
        try {
            if (!this.editor.setCreate(label, doc))
                this.refresh();
            else {
                this.say(`${label}. Undo takes it back.`);
                this.deps.onChange?.();
            }
        }
        catch (error) {
            this.say(error instanceof Error ? error.message : String(error));
            this.refresh();
        }
    }
    /** Show `doc` without a history step (while a slider or a finger is moving). */
    preview(doc) { this.draft = doc; this.paint(); }
    select(id) { this.selected = id; this.refresh(); }
    setTab(tab) { this.tab = tab; this.eyedrop = null; this.refresh(); }
    startEyedrop(apply) { this.eyedrop = apply; this.say("Tap the picture to take its colour."); }
    measure = (text, font, size) => {
        const ctx = this.canvas.getContext?.("2d");
        if (!ctx)
            return approxMeasure(text, font, size);
        ctx.save();
        ctx.font = fontCss(font, size);
        const w = ctx.measureText(text).width;
        ctx.restore();
        return w;
    };
    /** The page's size in units (1000 wide). */
    get pageUnits() { return pageGeometry(this.doc, this.editor.rendered().image).units; }
    refresh() {
        if (this.selected && !this.doc.layers.some((l) => l.id === this.selected))
            this.selected = null;
        if (this.cell !== null && (!this.doc.board || this.cell >= this.doc.board.cells.length))
            this.cell = null;
        const focus = focusKey(this.element.ownerDocument?.activeElement ?? null);
        this.tabsEl.replaceChildren(...CREATE_TABS.map((t) => {
            const b = btn(t.label, () => this.setTab(t.id), { cls: "cr-tab" });
            b.setAttribute("role", "tab");
            b.setAttribute("aria-selected", String(t.id === this.tab));
            b.dataset.tab = t.id;
            return b;
        }));
        this.controls.replaceChildren(...tabControls(this));
        this.renderLayers();
        this.paint();
        if (focus)
            Array.from(this.element.querySelectorAll("button, input, select, textarea")).find((e) => focusKey(e) === focus)?.focus();
    }
    renderLayers() {
        const items = [...this.doc.layers].reverse().map((l) => {
            const name = describe(l) + (l.hidden ? " (hidden)" : "");
            const pick = btn(name, () => this.select(l.id), { pressed: l.id === this.selected, cls: "cr-layer-name" });
            const act = (label, change) => btn(label, () => this.commit(`${describe(l)}: ${label.toLowerCase()}`, change()), { title: `${label}: ${describe(l)}` });
            return h("li", { class: "cr-layer" }, pick, act("Up", () => reorder(this.doc, l.id, 1)), act("Down", () => reorder(this.doc, l.id, -1)), act(l.hidden ? "Show" : "Hide", () => editLayer(this.doc, l.id, { hidden: !l.hidden })), act("Delete", () => removeLayer(this.doc, l.id)));
        });
        this.layersEl.replaceChildren(...(items.length ? items : [h("li", { class: "fine" }, "No layers yet. Add text, a drawing or a sticker.")]));
    }
    // ---- the page ----------------------------------------------------------------------------
    paint(overlay = true) {
        const ctx = this.canvas.getContext?.("2d");
        const base = this.editor.rendered().image;
        let g;
        try {
            g = pageGeometry(this.doc, base);
        }
        catch (error) {
            this.say(error instanceof Error ? error.message : String(error));
            return;
        }
        this.geometry = g;
        const dpr = Math.min(2, Math.max(1, globalThis.devicePixelRatio ?? 1));
        this.scale = Math.min(1, PREVIEW_SIDE / Math.max(g.pixels.width, g.pixels.height)) * dpr;
        const w = Math.max(1, Math.round(g.pixels.width * this.scale)), hgt = Math.max(1, Math.round(g.pixels.height * this.scale));
        if (this.canvas.width !== w)
            this.canvas.width = w;
        if (this.canvas.height !== hgt)
            this.canvas.height = hgt;
        this.canvas.style.aspectRatio = `${g.pixels.width} / ${g.pixels.height}`;
        this.canvas.dataset.pagePixels = `${g.pixels.width}x${g.pixels.height}`; // the saved file's size
        if (!ctx)
            return;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, w, hgt);
        try {
            renderPage({ ctx, assets: this.assets, sheet: this.sheets.sheet, measure: this.measure }, this.doc, { base: this.assets.photo("edited"), scale: this.scale, preview: true });
        }
        catch (error) {
            this.say(error instanceof Error ? error.message : String(error));
            return;
        }
        if (overlay)
            this.drawSelection(ctx, g);
    }
    drawSelection(ctx, g) {
        const k = g.pxPerUnit * this.scale;
        const outline = (pts) => {
            for (const [colour, width, dash] of [[PHOTO_MARK.halo, 4, []], [PHOTO_MARK.core, 2, [8, 6]]]) {
                ctx.save();
                ctx.strokeStyle = colour;
                ctx.lineWidth = width;
                ctx.setLineDash([...dash]);
                ctx.beginPath();
                pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * k, y * k) : ctx.moveTo(x * k, y * k)));
                ctx.closePath();
                ctx.stroke();
                ctx.restore();
            }
        };
        if (this.cell !== null && g.cells[this.cell]) {
            const c = g.cells[this.cell];
            outline(corners({ x: c.x + c.width / 2, y: c.y + c.height / 2, scale: 1, rotation: c.rotation, flip: false }, c));
        }
        const l = this.layer;
        if (!l || l.type === "ink" || l.hidden)
            return;
        const size = layerSize(l, this.assets, this.measure);
        if (!size)
            return;
        outline(corners(l.transform, size));
        const [hx, hy] = handlePoint(l.transform, size), r = HANDLE_PX * this.pxPerCss() / 2;
        ctx.save();
        ctx.fillStyle = PHOTO_MARK.core;
        ctx.strokeStyle = PHOTO_MARK.halo;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(hx * k, hy * k, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }
    /** Canvas pixels per CSS pixel of the page on screen. */
    pxPerCss() {
        const rect = this.canvas.getBoundingClientRect?.();
        return rect && rect.width > 0 ? this.canvas.width / rect.width : 1;
    }
    /** Page units per CSS pixel. */
    unitsPerCss() { return (this.geometry?.units.width ?? 1000) / Math.max(1, this.canvas.getBoundingClientRect?.().width ?? 1000); }
    pagePoint(e) {
        const g = this.geometry ?? pageGeometry(this.doc, this.editor.rendered().image);
        return screenToPage(this.canvas.getBoundingClientRect(), g.units, e.clientX, e.clientY);
    }
    /** The top-most visible box layer under a point. */
    hitLayer(p) {
        const pad = 6 * this.unitsPerCss();
        for (let i = this.doc.layers.length - 1; i >= 0; i--) {
            const l = this.doc.layers[i];
            if (l.hidden || l.type === "ink")
                continue;
            const size = layerSize(l, this.assets, this.measure);
            if (size && hitBox(l.transform, size, p, pad))
                return l.id;
        }
        return null;
    }
    hitCell(p) {
        const cells = this.geometry?.cells ?? [];
        for (let i = cells.length - 1; i >= 0; i--) {
            const c = cells[i];
            if (hitBox({ x: c.x + c.width / 2, y: c.y + c.height / 2, scale: 1, rotation: c.rotation, flip: false }, c, p))
                return i;
        }
        return null;
    }
    wireStage() {
        const c = this.canvas;
        c.addEventListener("pointerdown", (e) => this.down(e));
        c.addEventListener("pointermove", (e) => this.move(e));
        for (const t of ["pointerup", "pointercancel"])
            c.addEventListener(t, (e) => this.up(e));
        c.addEventListener("keydown", (e) => this.key(e));
        c.addEventListener("wheel", (e) => this.wheel(e), { passive: false });
    }
    down(e) {
        const p = this.pagePoint(e);
        this.pointers.set(e.pointerId, p);
        try {
            this.canvas.setPointerCapture?.(e.pointerId);
        }
        catch { /* synthetic events have no capture */ }
        e.preventDefault?.();
        if (this.eyedrop) {
            this.sample(p);
            return;
        }
        if (this.pointers.size === 2 && this.layer && this.layer.type !== "ink") {
            const [a, b] = [...this.pointers.values()];
            this.gesture = { kind: "pinch", id: this.layer.id, a0: a, b0: b, t0: this.layer.transform };
            return;
        }
        if (this.pointers.size > 1)
            return;
        if (this.tab === "draw") {
            this.startStroke(p);
            return;
        }
        const sel = this.layer;
        if (sel && sel.type !== "ink") {
            const size = layerSize(sel, this.assets, this.measure);
            if (size && hitHandle(sel.transform, size, p, HANDLE_PX * this.unitsPerCss())) {
                this.gesture = { kind: "handle", id: sel.id, start: p, t0: sel.transform };
                return;
            }
        }
        const hit = this.hitLayer(p);
        if (hit) {
            const l = find(this.doc, hit);
            // tapping text opens Text, a sticker opens Stickers, so its own controls are at hand
            const own = l.type === "text" ? "text" : "stickers";
            if (hit !== this.selected || this.tab !== own) {
                this.selected = hit;
                this.cell = null;
                this.tab = own;
                this.refresh();
            }
            this.gesture = { kind: "move", id: hit, start: p, t0: l.transform };
            return;
        }
        const cell = this.hitCell(p);
        if (cell !== null && this.doc.board) {
            if (cell !== this.cell || this.selected) {
                this.cell = cell;
                this.selected = null;
                this.refresh();
            }
            const c = this.doc.board.cells[cell];
            this.gesture = this.doc.board.layout.startsWith("free-") ? { kind: "cellmove", cell, start: p, dx0: c.dx, dy0: c.dy } : { kind: "pan", cell, last: p };
            return;
        }
        if (this.selected || this.cell !== null) {
            this.selected = null;
            this.cell = null;
            this.refresh();
        }
    }
    move(e) {
        if (!this.pointers.has(e.pointerId))
            return;
        const p = this.pagePoint(e);
        this.pointers.set(e.pointerId, p);
        const g = this.gesture;
        if (!g)
            return;
        if (g.kind === "stroke") {
            if (g.builder.add(p[0], p[1]))
                this.preview(this.withStroke(g));
            return;
        }
        if (g.kind === "pan") {
            this.preview(this.panned(g.cell, p[0] - g.last[0], p[1] - g.last[1], this.doc));
            g.last = p;
            return;
        }
        if (g.kind === "cellmove") {
            const f = this.boardUnitsPerPage();
            this.preview(this.cellChanged(g.cell, { dx: clampAbs(g.dx0 + (p[0] - g.start[0]) * f, 2000), dy: clampAbs(g.dy0 + (p[1] - g.start[1]) * f, 4000) }));
            return;
        }
        if (g.kind === "pinch") {
            const pts = [...this.pointers.values()];
            if (pts.length < 2)
                return;
            this.previewTransform(g.id, pinch(g.t0, g.a0, g.b0, pts[0], pts[1]));
            return;
        }
        this.previewTransform(g.id, g.kind === "move" ? moveBy(g.t0, p[0] - g.start[0], p[1] - g.start[1]) : dragHandle(g.t0, g.start, p));
    }
    up(e) {
        this.pointers.delete(e.pointerId);
        const g = this.gesture;
        if (!g || this.pointers.size)
            return;
        this.gesture = null;
        const draft = this.draft;
        if (!draft) {
            this.paint();
            return;
        }
        if (g.kind === "stroke")
            this.commit(`Draw: ${g.builder.brush} stroke`, draft);
        else if (g.kind === "pan")
            this.commit("Collage: photo moved in its cell", draft);
        else if (g.kind === "cellmove")
            this.commit("Collage: print moved", draft);
        else
            this.commit(`${describe(find(draft, g.id))}: ${g.kind === "move" ? "moved" : "resized and turned"}`, draft);
    }
    wheel(e) {
        const doc = this.doc;
        if (this.cell === null || !doc.board)
            return;
        e.preventDefault();
        const c = doc.board.cells[this.cell];
        this.commit("Collage: zoom in a cell", this.cellChanged(this.cell, { zoom: Math.min(4, Math.max(1, c.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1))) }));
    }
    key(e) {
        const l = this.layer;
        if (e.key === "Escape") {
            this.select(null);
            return;
        }
        if (!l || l.type === "ink")
            return;
        const step = e.shiftKey ? 25 : 5, t = l.transform;
        let next = null;
        if (e.key === "ArrowLeft")
            next = moveBy(t, -step, 0);
        else if (e.key === "ArrowRight")
            next = moveBy(t, step, 0);
        else if (e.key === "ArrowUp")
            next = moveBy(t, 0, -step);
        else if (e.key === "ArrowDown")
            next = moveBy(t, 0, step);
        else if (e.key === "+" || e.key === "=")
            next = { ...t, scale: clampScale(t.scale * 1.1) };
        else if (e.key === "-")
            next = { ...t, scale: clampScale(t.scale / 1.1) };
        else if (e.key === "[" || e.key === "]")
            next = { ...t, rotation: wrapAngle(t.rotation + (e.key === "]" ? 1 : -1) * Math.PI / 36) };
        else if (e.key === "Delete" || e.key === "Backspace") {
            e.preventDefault?.();
            this.commit(`${describe(l)}: deleted`, removeLayer(this.doc, l.id));
            return;
        }
        if (!next)
            return;
        e.preventDefault?.();
        this.commit(`${describe(l)}: ${e.key.startsWith("Arrow") ? "moved" : e.key === "[" || e.key === "]" ? "turned" : "resized"}`, editLayer(this.doc, l.id, { transform: next }));
    }
    previewTransform(id, transform) {
        try {
            this.preview(editLayer(this.editor.create, id, { transform }));
        }
        catch { /* a step past the limits is ignored */ }
    }
    // ---- drawing -------------------------------------------------------------------------------
    brush = "pen";
    inkColour = PHOTO_MARK.core;
    inkSize = 8;
    startStroke(p) {
        const builder = new StrokeBuilder(this.brush, this.inkColour, this.inkSize);
        builder.add(p[0], p[1]);
        const top = this.doc.layers[this.doc.layers.length - 1];
        const target = this.layer?.type === "ink" ? this.layer.id : top?.type === "ink" ? top.id : null;
        this.gesture = { kind: "stroke", builder, layer: target };
        this.preview(this.withStroke(this.gesture));
    }
    withStroke(g) {
        const base = this.editor.create, stroke = g.builder.stroke();
        if (g.layer) {
            const l = find(base, g.layer);
            if (l.type === "ink")
                return editLayer(base, l.id, { strokes: [...l.strokes, stroke] });
        }
        const id = nextId(base);
        g.layer = null;
        return { ...base, layers: [...base.layers, { type: "ink", id, hidden: false, opacity: 1, strokes: [stroke] }] };
    }
    // ---- boards --------------------------------------------------------------------------------
    /** Board units per page unit (they differ only when a frame sits inside a fixed board). */
    boardUnitsPerPage() {
        const g = this.geometry;
        return g ? g.pxPerUnit / (g.frame.picture.width / 1000) : 1;
    }
    cellChanged(i, change) {
        const doc = this.editor.create, b = doc.board;
        return { ...doc, board: { ...b, cells: b.cells.map((c, j) => (j === i ? { ...c, ...change } : c)) } };
    }
    panned(i, dx, dy, current) {
        const b = current.board, cell = b.cells[i], rect = this.geometry?.cells[i];
        const pic = cell.asset ? this.assets.photo(cell.asset) : null;
        if (!pic || !rect)
            return current;
        const moved = panBy(cell, pic.width, pic.height, rect.width, rect.height, dx, dy);
        return { ...current, board: { ...b, cells: b.cells.map((c, j) => (j === i ? moved : c)) } };
    }
    sample(p) {
        const apply = this.eyedrop;
        this.eyedrop = null;
        const ctx = this.canvas.getContext?.("2d");
        const g = this.geometry;
        if (!ctx || !g || !apply)
            return;
        this.paint(false);
        const k = g.pxPerUnit * this.scale;
        const px = ctx.getImageData(Math.min(this.canvas.width - 1, Math.max(0, Math.floor(p[0] * k))), Math.min(this.canvas.height - 1, Math.max(0, Math.floor(p[1] * k))), 1, 1).data;
        const hex = hexOf(px[0], px[1], px[2]);
        apply(hex);
        this.say(`Took ${hex} from the picture.`);
    }
    async save() {
        await this.assets.ready();
        if (this.deps.save) {
            this.deps.save();
            this.say("Saved through the Studio's Save photo, with the simulation label when it applies.");
        }
        else
            this.say("Use Save photo at the bottom of the Studio.");
    }
}
function clampAbs(v, limit) { return Math.max(-limit, Math.min(limit, v)); }
function focusKey(el) {
    if (!el || !el.getAttribute)
        return null;
    return el.getAttribute("aria-label") ?? el.getAttribute("title") ?? (el.textContent || null);
}
/** Mount the panel: the element, and what to call when it closes. */
export function createScreen(editor, tab, deps = {}) {
    const panel = new CreatePanel(editor, tab, deps);
    return { element: panel.element, dispose: () => panel.dispose(), panel };
}
