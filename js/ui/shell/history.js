/** Bounded, immutable undo/redo journal. Stores settings, never pixels or a face mesh.
 * Every document-changing action creates one checkpoint. Restoring an old step
 * truncates redo on the next change. No localStorage of biometric information.
 * Author: John Khan.
 */
import { validateStack } from "./layers.js";
import { checkDoc } from "../../editor/create/doc.js";
export const HISTORY_LIMIT = 80;
export function copyState(state) {
    return { ...state, layers: state.layers.map((layer) => ({ ...layer, parameters: { ...layer.parameters } })) };
}
function checkState(s) {
    if (!(s.zoom >= 0.25 && s.zoom <= 8 && Number.isFinite(s.zoom)))
        throw new RangeError("Zoom is outside 25–800%");
    validateStack(s.layers);
    if (s.selected !== null && !s.layers.some((l) => l.id === s.selected))
        throw new RangeError("Selected layer no longer exists");
    if (s.create)
        checkDoc(s.create);
}
export function initialState(sourceId, studio = "enhance") {
    return { sourceId, studio, layers: [], selected: null, showBefore: false, zoom: 1 };
}
export class History {
    limit;
    steps;
    cursor = 0;
    sequence = 0;
    constructor(initial, limit = HISTORY_LIMIT) {
        this.limit = limit;
        if (!Number.isInteger(limit) || limit < 2)
            throw new RangeError("History limit must be at least 2");
        checkState(initial);
        this.steps = [{ state: copyState(initial), label: "Original", sequence: this.sequence }];
    }
    get current() { return copyState(this.steps[this.cursor].state); }
    get step() { return this.cursor; }
    get length() { return this.steps.length; }
    get canUndo() { return this.cursor > 0; }
    get canRedo() { return this.cursor < this.steps.length - 1; }
    get timeline() {
        return this.steps.map(({ label }, index) => ({ index, label, active: index === this.cursor }));
    }
    commit(label, candidate) {
        if (!label.trim() || label.length > 100)
            throw new RangeError("History step needs a short label");
        checkState(candidate);
        const next = copyState(candidate);
        if (next.sourceId !== this.steps[this.cursor].state.sourceId)
            throw new RangeError("Load a new source with reset(), not a history step");
        if (JSON.stringify(next) === JSON.stringify(this.steps[this.cursor].state))
            return false;
        this.steps = this.steps.slice(0, this.cursor + 1);
        this.steps.push({ state: next, label, sequence: ++this.sequence });
        if (this.steps.length > this.limit)
            this.steps.shift();
        this.cursor = this.steps.length - 1;
        return true;
    }
    change(label, transform) {
        return this.commit(label, transform(this.current));
    }
    undo() { if (this.canUndo)
        this.cursor--; return this.current; }
    redo() { if (this.canRedo)
        this.cursor++; return this.current; }
    jump(index) {
        if (!Number.isInteger(index) || index < 0 || index >= this.steps.length)
            throw new RangeError("History step does not exist");
        this.cursor = index;
        return this.current;
    }
    reset(next) {
        checkState(next);
        this.sequence = 0;
        this.cursor = 0;
        this.steps = [{ label: "Original", state: copyState(next), sequence: 0 }];
        return this.current;
    }
    /** Document settings for a local, photo-free debug report only. */
    summary() {
        return { count: this.length, current: this.cursor, labels: this.steps.map((s) => s.label) };
    }
}
//# sourceMappingURL=history.js.map