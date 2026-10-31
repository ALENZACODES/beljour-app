/** Immutable subject snapshots. A selected bystander cannot inherit previous edits. */
import { checkedSubjectBoxes, suggestedSubject, } from "./contract.js";
const NO_SUBJECT_REASON = "No verified face boxes are available for this image.";
export class SubjectSelection {
    revision = 0;
    boxes = [];
    selectedId = null;
    source = "none";
    reason = NO_SUBJECT_REASON;
    get snapshot() {
        return Object.freeze({
            revision: this.revision,
            source: this.source,
            boxes: Object.freeze(this.boxes.map((box) => Object.freeze({ ...box }))),
            selectedId: this.selectedId,
            reason: this.reason,
        });
    }
    get active() {
        return this.boxes.find((box) => box.id === this.selectedId) ?? null;
    }
    /** Every new source invalidates selection before asynchronous detection starts. */
    begin(revision, mode = "awaiting-detector") {
        if (!Number.isSafeInteger(revision) || revision <= this.revision) {
            throw new RangeError("Source revision must increase");
        }
        this.revision = revision;
        this.boxes = [];
        this.selectedId = null;
        this.source = mode;
        this.reason = mode === "awaiting-detector"
            ? "Face detection is not connected. No boxes are guessed from pixels."
            : NO_SUBJECT_REASON;
    }
    receive(revision, boxes) {
        if (revision !== this.revision || this.source === "none")
            return false;
        const checked = checkedSubjectBoxes(boxes);
        const detected = checked.some((box) => box.origin === "detected");
        const drawn = checked.some((box) => box.origin === "drawn");
        if (detected && drawn)
            throw new RangeError("Do not mix drawn and detected face boxes");
        this.boxes = checked;
        this.selectedId = suggestedSubject(checked);
        this.source = checked.length ? (drawn ? "drawn" : "detected") : "awaiting-detector";
        this.reason = checked.length ? "Only the selected subject can receive illustrative edits." : NO_SUBJECT_REASON;
        return true;
    }
    choose(id) {
        if (this.selectedId === id)
            return false;
        if (!this.boxes.some((box) => box.id === id))
            return false;
        this.selectedId = id;
        return true;
    }
    clear() {
        this.revision += 1;
        this.boxes = [];
        this.selectedId = null;
        this.source = "none";
        this.reason = NO_SUBJECT_REASON;
    }
}
