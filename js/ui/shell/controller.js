/** R8 editor document controller: all effects are reversible settings over one source.
 * Does not store photos in history, send network requests or hold API keys.
 * R9 adds option picks from the thumbnail strip and the compare frames, on the same
 * history and layer stack (no second table).
 * Author: John Khan.
 */
import { checkFace } from "../../engines/shape/geometry.js";
import { requireMask } from "../../engines/core/buffer.js";
import { browserShellRenderer } from "./gpu-renderer.js";
import { defaultSample, readiness, tool } from "./catalogue.js";
import { GENTLE_DEFAULT } from "../../layout/effects.js";
import { isSimulationBrush } from "../../editor/brush/layer.js";
import { SINGLE_KINDS } from "../../editor/adjust/stack.js";
import { ADJUST_KINDS } from "./types.js";
/** A new layer's strength: the gentle default for looks; the photo-adjustment tools start at 100,
 * because their sliders are the amount and every slider starts at no change. */
export function defaultStrength(kind) {
    return ADJUST_KINDS.includes(kind) ? 100 : GENTLE_DEFAULT;
}
import { History, initialState } from "./history.js";
import { appendLayer, editLayer, moveLayer, removeLayer } from "./layers.js";
import { makeSample } from "./demo.js";
import { renderLayers } from "./pipeline.js";
import { defaultParams } from "./thumbnails.js";
import { FrameCache, compareFrames } from "./compare-frames.js";
import { EditorPreviewCache } from "./editor-preview-cache.js";
import { EMPTY as EMPTY_CREATE, checkDoc } from "../../editor/create/doc.js";
import { isSimulationKind } from "./types.js";
export class Editor {
    renderer;
    photo;
    journal;
    nextId = 0;
    sourceVersion = 0;
    get renderVersion() { return `${this.sourceVersion}:${this.renderer.generation}`; }
    showingOriginal = false;
    cached = null;
    frameCache = new FrameCache();
    studioCache = new EditorPreviewCache();
    listeners = new Set();
    subscribe(listener) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
    constructor(sample = "low-light", renderer = browserShellRenderer()) {
        this.renderer = renderer;
        this.photo = makeSample(sample);
        this.journal = new History(initialState(this.photo.id));
    }
    get source() { return this.photo; }
    get history() { return this.journal; }
    get document() { return this.journal.current; }
    get selected() {
        return this.document.layers.find((l) => l.id === this.document.selected) ?? null;
    }
    get canApply() {
        return readiness(this.document.studio, this.photo).ready && tool(this.document.studio).source === "local";
    }
    get blockedReason() {
        const ready = readiness(this.document.studio, this.photo);
        return ready.ready ? null : ready.reason;
    }
    /** New source deliberately resets all layers and undo steps. */
    load(source, preferred = "enhance") {
        this.photo = { ...source, geometryRevision: ++this.sourceVersion };
        this.frameCache.clear();
        this.studioCache.clear();
        this.nextId = 0;
        this.showingOriginal = false;
        this.journal.reset(initialState(source.id, preferred));
        this.invalidate();
    }
    /** Apply a user-drawn mask or R7 control-point fixture to this on-device photo.
     * The source image stays the same. Restarting history prevents old layers from
     * accidentally rendering against geometry that has since been replaced.
     */
    mark(selection) {
        const current = this.photo;
        if (selection.mask.width !== current.image.width || selection.mask.height !== current.image.height) {
            throw new RangeError("Markings must have the same dimensions as the source photo");
        }
        const updated = selection.kind === "crown"
            ? { ...current, crown: selection.mask }
            : { ...current, body: selection.controls, person: selection.mask };
        this.load(updated, selection.kind === "crown" ? "hair-fibre" : "posture");
    }
    /** Attach the person area the on-device segmenter read, keeping face points and edits. */
    setPerson(person) {
        requireMask(person);
        if (person.width !== this.photo.image.width || person.height !== this.photo.image.height)
            throw new RangeError("The person area must match the photo size.");
        this.photo = { ...this.photo, geometryRevision: ++this.sourceVersion, person: { ...person, data: Float32Array.from(person.data) } };
        this.frameCache.clear();
        this.studioCache.clear();
        this.invalidate();
    }
    /** Commit a manual hair mask without changing source pixels or settings history. */
    setHair(hair, placement) {
        for (const mask of [hair, placement]) {
            if (!mask)
                continue;
            requireMask(mask);
            if (mask.data.length !== mask.width * mask.height || mask.width !== this.photo.image.width || mask.height !== this.photo.image.height)
                throw new RangeError("Hair markings must match the photo size.");
        }
        this.photo = { ...this.photo, geometryRevision: ++this.sourceVersion, hair: { ...hair, data: Float32Array.from(hair.data) },
            hairPaint: placement ? { ...placement, data: Float32Array.from(placement.data) } : undefined };
        this.frameCache.clear();
        this.studioCache.clear();
        this.invalidate();
    }
    /** Attaching geometry resets prior edits so their coordinate system cannot become stale. */
    setFace(points) {
        checkFace(points);
        const { width, height } = this.photo.image;
        if (points.some(([x, y]) => x < -width || x > width * 2 || y < -height || y > height * 2))
            throw new RangeError("Face points are outside this photo.");
        this.load({ ...this.photo, face: points.map(([x, y]) => [x, y]) }, this.document.studio);
    }
    /** A group photo's faces: each is checked like setFace; the first becomes the face being
     * edited. Edits reset, as with setFace; per-face edits live in save/multi-face.ts. */
    setFaces(faces) {
        if (faces.length < 2 || faces.length > 6)
            throw new RangeError("A group photo needs 2 to 6 faces.");
        const { width, height } = this.photo.image;
        for (const points of faces) {
            checkFace(points);
            if (points.some(([x, y]) => x < -width || x > width * 2 || y < -height || y > height * 2))
                throw new RangeError("Face points are outside this photo.");
        }
        const copies = faces.map((points) => points.map(([x, y]) => [x, y]));
        this.load({ ...this.photo, face: copies[0], faces: copies }, this.document.studio);
    }
    dispose() {
        this.renderer.dispose();
        this.frameCache.clear();
        this.studioCache.clear();
        this.cached = null;
        this.listeners.clear();
    }
    loadSample(sample, preferred) {
        const row = preferred ?? this.document.studio;
        this.load(makeSample(sample), row);
    }
    /** Navigation is not an edit to undo. It is a new snapshot state only when chosen. */
    selectStudio(studio) {
        if (this.document.studio === studio)
            return;
        if (this.journal.change(`Open ${tool(studio).title}`, (s) => ({ ...s, studio })))
            this.invalidate();
    }
    choose(id) {
        if (id !== null && !this.document.layers.some((l) => l.id === id))
            throw new RangeError("Layer not found");
        if (this.document.selected === id)
            return;
        if (this.journal.change("Select layer", (s) => ({ ...s, selected: id })))
            this.invalidate();
    }
    invalidate() { this.cached = null; for (const listener of [...this.listeners]) {
        try {
            listener();
        }
        catch { /* Optional recovery UI cannot interrupt an edit. */ }
    } }
    change(label, fn) {
        if (this.journal.change(label, fn))
            this.invalidate();
    }
    add(kind = this.document.studio, overrides = {}, strength = defaultStrength(kind), label) {
        const ready = readiness(kind, this.photo);
        if (!ready.ready)
            throw new Error(ready.reason);
        // Adjust, Colour mixer, Curves and Crop are one layer each: adding again opens that layer.
        const single = SINGLE_KINDS.includes(kind) ? this.document.layers.find((l) => l.kind === kind) : undefined;
        if (single) {
            this.change(`Open ${tool(kind).title}`, (s) => ({ ...s, selected: single.id,
                layers: Object.keys(overrides).length ? editLayer(s.layers, single.id, { parameters: { ...single.parameters, ...overrides } }) : s.layers }));
            return this.selected;
        }
        const row = tool(kind), id = `layer-${++this.nextId}`;
        const params = { ...defaultParams(kind, this.photo), ...overrides };
        // Filters are photo looks, not simulations of a change to her (filters-plan.md §1.1 rule 7).
        const item = { id, kind, name: row.title, enabled: true, opacity: 1, strength,
            parameters: params, provenance: "local",
            simulation: kind === "retouch" ? isSimulationBrush(params) : isSimulationKind(kind),
            origin: this.photo.kind === "sample" ? "sample" : "photo" };
        this.change(label ?? `Apply ${row.title}`, (s) => ({ ...s, layers: appendLayer(s.layers, item), selected: id }));
        return item;
    }
    /** A thumbnail pick: change the selected layer of that tool in one step, or add a new layer. */
    applyOption(kind, params, label, strength) {
        const chosen = this.selected?.kind === kind ? this.selected
            : SINGLE_KINDS.includes(kind) ? this.document.layers.find((l) => l.kind === kind) ?? null : null;
        if (chosen && chosen.kind === kind) {
            this.change(`${tool(kind).title}: ${label}`, (s) => ({ ...s, selected: chosen.id, layers: editLayer(s.layers, chosen.id, { enabled: true, ...(strength === undefined ? {} : { strength }), parameters: { ...chosen.parameters, ...params } }) }));
            return this.selected;
        }
        return this.add(kind, params, strength ?? defaultStrength(kind));
    }
    /** Replace a layer's settings in one undo step (a crop drag, a curve point, a reset). */
    setParams(id, parameters, label = "Change settings") {
        if (!this.document.layers.some((l) => l.id === id))
            throw new RangeError("Layer not found");
        this.change(label, (s) => ({ ...s, selected: id, layers: editLayer(s.layers, id, { parameters: { ...parameters } }) }));
    }
    update(id, changes, label = "Change layer") {
        this.change(label, (s) => ({ ...s, layers: editLayer(s.layers, id, changes) }));
    }
    param(id, key, value) {
        const item = this.document.layers.find((l) => l.id === id);
        if (!item)
            throw new RangeError("Layer not found");
        this.change(`Set ${key}`, (s) => ({ ...s, layers: editLayer(s.layers, id, { parameters: { ...item.parameters, [key]: value } }) }));
    }
    /** One retouch brush stroke (or a cleared brush): the layer's strokes change in one history
     * step, and the layer is selected, so Undo takes back exactly that stroke. */
    paintStrokes(id, strokes, label) {
        const item = this.document.layers.find((l) => l.id === id);
        if (!item)
            throw new RangeError("Layer not found");
        if (item.kind !== "retouch")
            throw new RangeError("Only a retouch brush layer holds strokes");
        this.change(label, (s) => ({ ...s, selected: id, layers: editLayer(s.layers, id, { parameters: { ...item.parameters, strokes } }) }));
    }
    toggle(id) {
        const item = this.document.layers.find((l) => l.id === id);
        if (!item)
            throw new RangeError("Layer not found");
        this.update(id, { enabled: !item.enabled }, item.enabled ? "Hide layer" : "Show layer");
    }
    move(id, by) {
        this.change("Reorder layer", (s) => ({ ...s, layers: moveLayer(s.layers, id, by) }));
    }
    remove(id) {
        this.change("Remove layer", (s) => ({ ...s, layers: removeLayer(s.layers, id),
            selected: s.selected === id ? null : s.selected }));
    }
    /** The Create document (text, stickers, drawing, frame, board) in the current history step. */
    get create() { return this.document.create ?? EMPTY_CREATE; }
    /** One history step for a Create change; an empty document leaves no trace in the state.
     * Returns false when nothing changed. */
    setCreate(label, doc) {
        checkDoc(doc);
        const keep = doc.layers.length > 0 || doc.frame !== null || doc.board !== null;
        const changed = this.journal.change(label, (s) => {
            const next = { ...s };
            if (keep)
                next.create = doc;
            else
                delete next.create;
            return next;
        });
        if (changed)
            this.invalidate();
        return changed;
    }
    resetLayers() {
        this.change("Reset all edits", (s) => ({ ...s, layers: [], selected: null, showBefore: false }));
    }
    /** The Studio's Reset: every layer and the Create document (text, stickers, drawing, frame,
     * board) in one undoable step, so the photo saved next is the original, as Reset says. */
    resetAll() {
        this.change("Reset all edits", (s) => {
            const next = { ...s, layers: [], selected: null, showBefore: false };
            delete next.create;
            return next;
        });
    }
    setShowBefore(enabled) {
        // A held compare must never create two undo entries per pointer gesture.
        this.showingOriginal = enabled;
    }
    zoom(value) {
        this.change("Change zoom", (s) => ({ ...s, zoom: Math.min(8, Math.max(0.25, value)) }));
    }
    undo() { const result = this.journal.undo(); this.invalidate(); return result; }
    redo() { const result = this.journal.redo(); this.invalidate(); return result; }
    jump(i) { const result = this.journal.jump(i); this.invalidate(); return result; }
    preview() {
        const state = this.document;
        if (this.showingOriginal || state.showBefore)
            return { image: this.photo.image, labels: [], metrics: [], effective: 0 };
        return this.rendered();
    }
    /** The edited preview, ignoring any held "before" view. */
    rendered() {
        const state = this.document;
        const key = JSON.stringify(state.layers) + ":" + this.renderer.generation;
        if (this.cached?.key === key)
            return this.cached.result;
        this.studioCache.useSource(`${this.sourceVersion}:${this.photo.id}:${this.renderer.generation}`);
        const reused = this.studioCache.get(key);
        if (reused) {
            this.cached = { key, result: reused };
            return reused;
        }
        const result = renderLayers(this.photo, state.layers, this.renderer);
        this.studioCache.put(key, result);
        this.cached = { key, result };
        return result;
    }
    /** The pictures a compare mode needs. Pair modes reuse the cached preview; grids render scaled. */
    frames(mode) {
        const state = this.document;
        return compareFrames(this.photo, state.layers, state.selected, mode, this.rendered(), this.frameCache);
    }
    /** A photo-free document inventory; do not include layer geometry or photo bytes. */
    summary() {
        return { sample: this.photo.kind === "sample", dimensions: `${this.photo.image.width}×${this.photo.image.height}`,
            count: this.document.layers.length, steps: this.journal.length, localOnly: true };
    }
    /** Convenient guarded sample adoption from studio nav. */
    loadRecommendedSample() { this.loadSample(defaultSample(this.document.studio), this.document.studio); }
}
//# sourceMappingURL=controller.js.map