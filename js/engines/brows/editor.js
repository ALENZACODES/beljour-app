/** In-memory annotation history with bounded ownership and review state. Author: John Khan. */
import { number } from "./contracts.js";
import { exportObservations, observationDocument, parseObservations, validateMarks } from "./annotations.js";
export class BrowObservationEditor {
    document;
    undoStack = [];
    redoStack = [];
    revision = 0;
    savedRevision = 0;
    disposed = false;
    listeners = new Set();
    historyLimit;
    constructor(width, height, historyLimit = 24) {
        number(historyLimit, "historyLimit", 1, 48);
        if (!Number.isInteger(historyLimit))
            throw new RangeError("historyLimit must be an integer");
        this.historyLimit = historyLimit;
        this.document = observationDocument(width, height, []);
    }
    active() {
        if (this.disposed)
            throw new Error("brow observation editor is disposed");
    }
    copy(document) {
        return observationDocument(document.width, document.height, document.marks, document.reviewed);
    }
    state() {
        return { document: this.copy(this.document), revision: this.revision,
            canUndo: this.undoStack.length > 0, canRedo: this.redoStack.length > 0,
            dirty: this.revision !== this.savedRevision, disposed: this.disposed };
    }
    subscribe(listener) {
        this.active();
        this.listeners.add(listener);
        listener(this.state());
        return () => this.listeners.delete(listener);
    }
    notify() {
        for (const listener of [...this.listeners]) {
            try {
                listener(this.state());
            }
            catch { /* A view failure cannot discard an edit. */ }
        }
    }
    commit(next) {
        this.active();
        this.undoStack.push(this.copy(this.document));
        if (this.undoStack.length > this.historyLimit)
            this.undoStack.shift();
        this.redoStack.length = 0;
        this.document = this.copy(next);
        this.revision++;
        this.notify();
    }
    add(mark) {
        this.active();
        const marks = validateMarks([...this.document.marks, mark]);
        this.commit(observationDocument(this.document.width, this.document.height, marks, false));
    }
    replace(index, mark) {
        this.active();
        if (!Number.isInteger(index) || index < 0 || index >= this.document.marks.length)
            throw new RangeError("mark index is out of range");
        const marks = validateMarks(this.document.marks);
        marks[index] = validateMarks([mark])[0];
        this.commit(observationDocument(this.document.width, this.document.height, marks, false));
    }
    remove(index) {
        this.active();
        if (!Number.isInteger(index) || index < 0 || index >= this.document.marks.length)
            throw new RangeError("mark index is out of range");
        const marks = this.document.marks.filter((_, i) => i !== index);
        this.commit(observationDocument(this.document.width, this.document.height, marks, false));
    }
    confirmReview() {
        this.active();
        this.commit(observationDocument(this.document.width, this.document.height, this.document.marks, true));
    }
    clear() {
        this.active();
        this.commit(observationDocument(this.document.width, this.document.height, []));
    }
    undo() {
        this.active();
        const previous = this.undoStack.pop();
        if (!previous)
            return false;
        this.redoStack.push(this.copy(this.document));
        this.document = previous;
        this.revision++;
        this.notify();
        return true;
    }
    redo() {
        this.active();
        const next = this.redoStack.pop();
        if (!next)
            return false;
        this.undoStack.push(this.copy(this.document));
        this.document = next;
        this.revision++;
        this.notify();
        return true;
    }
    importText(value) {
        this.active();
        const document = parseObservations(value, [this.document.width, this.document.height]);
        this.commit(document);
    }
    exportText() {
        this.active();
        const text = exportObservations(this.document);
        this.savedRevision = this.revision;
        this.notify();
        return text;
    }
    dispose() {
        if (this.disposed)
            return;
        this.document = observationDocument(this.document.width, this.document.height, []);
        this.undoStack.length = 0;
        this.redoStack.length = 0;
        this.disposed = true;
        this.revision++;
        this.notify();
        this.listeners.clear();
    }
}
//# sourceMappingURL=editor.js.map