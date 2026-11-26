import { BRUSH_MODES, BRUSH_NAMES, brushOf, retouchDefaults, START_STRENGTH, strokesOf } from "./layer.js";
import { SPACING } from "./mask.js";
import { availableSnaps } from "./snap.js";
import { BRUSHES, encodeStrokes, MAX_POINTS, MAX_SIZE, MIN_SIZE, thin } from "./stroke.js";
export const DEFAULT_SETTINGS = Object.freeze({
    brush: "heal", mode: "paint", size: 0.03, hardness: 0.5, opacity: 1, flow: 0.7, snap: "none", colour: "#7A3B2E", showMask: false, move: false,
});
export const MODE_NAMES = Object.freeze({
    paint: "Paint", erase: "Erase", dodge: "Dodge (lightens)", burn: "Burn", push: "Push", bloat: "Bloat", pinch: "Pinch", restore: "Restore", freeze: "Freeze",
});
export class BrushSession {
    editor;
    state = { ...DEFAULT_SETTINGS };
    constructor(editor) {
        this.editor = editor;
    }
    get settings() { return this.state; }
    /** Change settings, keeping each one in range and the mode valid for the brush. */
    set(changes) {
        const next = { ...this.state, ...changes };
        if (!BRUSHES.includes(next.brush))
            throw new RangeError("Unknown brush");
        if (changes.brush && changes.brush !== this.state.brush && !changes.mode)
            next.mode = BRUSH_MODES[next.brush][0];
        if (!BRUSH_MODES[next.brush].includes(next.mode))
            next.mode = BRUSH_MODES[next.brush][0];
        next.size = Math.min(MAX_SIZE, Math.max(MIN_SIZE, next.size));
        for (const key of ["hardness", "opacity", "flow"])
            next[key] = Math.min(1, Math.max(0, next[key]));
        if (!/^#[0-9A-Fa-f]{6}$/.test(next.colour))
            throw new RangeError("Colour must be #RRGGBB");
        if (!this.snaps().includes(next.snap))
            next.snap = "none";
        this.state = next;
        return this.state;
    }
    /** Snaps this photo can offer (face parts need face points; hair needs a marked hair area). */
    snaps() {
        const { image, face, hair } = this.editor.source;
        return availableSnaps({ width: image.width, height: image.height, face, hair });
    }
    /** The layer this brush paints into: the selected layer if it is this brush, else the topmost
     * layer of this brush, else none yet (the first stroke makes one). A colour layer holds one
     * colour, so a new colour starts its own layer. */
    target() {
        const mine = (l) => l.kind === "retouch" && brushOf(l) === this.state.brush
            && (this.state.brush !== "colour" || String(l.parameters.colour).toUpperCase() === this.state.colour.toUpperCase());
        const selected = this.editor.selected;
        if (selected && mine(selected))
            return selected;
        return [...this.editor.document.layers].reverse().find(mine) ?? null;
    }
    /** Dab spacing in pixels for the current brush on this photo: pointer samples closer than
     * this are dropped, since the brush draws its own dabs in between. */
    spacing() {
        const { width, height } = this.editor.source.image;
        return Math.max(0.5, SPACING * this.state.size * Math.min(width, height));
    }
    /** The stroke the current settings make from these pointer points (photo shares 0..1). */
    stroke(points) {
        const { width, height } = this.editor.source.image;
        const s = this.state;
        // Bloat and pinch keep repeated points: holding still keeps growing or shrinking.
        const held = s.mode === "bloat" || s.mode === "pinch";
        return { mode: s.mode, snap: s.snap, size: s.size, hardness: s.hardness, opacity: s.opacity, flow: s.flow,
            points: held ? points.slice(0, MAX_POINTS) : thin(points, width, height, this.spacing()) };
    }
    /** Commit one finished stroke as one history step. Returns the layer it went to. */
    commit(points) {
        if (!points.length)
            throw new RangeError("Nothing was painted");
        const stroke = this.stroke(points);
        const brush = this.state.brush;
        const layer = this.target();
        const label = `${BRUSH_NAMES[brush]} stroke`;
        const fresh = (strength) => {
            const params = { ...retouchDefaults(brush), strokes: encodeStrokes([stroke]) };
            if (brush === "colour")
                params.colour = this.state.colour;
            return this.editor.add("retouch", params, strength);
        };
        if (!layer) {
            if (stroke.mode === "erase")
                throw new RangeError(`Nothing to erase yet: paint with ${BRUSH_NAMES[brush]} first.`);
            return fresh(START_STRENGTH[brush]);
        }
        let text;
        try {
            text = encodeStrokes([...strokesOf(layer), stroke]);
        }
        catch (error) {
            // A full layer (too many strokes or points to store): a painted stroke starts the next layer
            // of this brush, at the same strength, so painting carries on; it becomes the target.
            if (!(error instanceof RangeError) || stroke.mode === "erase")
                throw error;
            return fresh(layer.strength);
        }
        this.editor.paintStrokes(layer.id, text, label);
        return this.editor.selected ?? layer;
    }
    /** Clear every stroke of the target layer, as one undoable step. */
    clear() {
        const layer = this.target();
        if (!layer)
            return;
        this.editor.paintStrokes(layer.id, "", `Clear ${BRUSH_NAMES[this.state.brush]} strokes`);
    }
}
//# sourceMappingURL=session.js.map