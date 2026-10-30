/** Ephemeral face picker lifecycle with mandatory photo revision checks.
 * No persistent photos, masks or face coordinates. Author: John Khan.
 */
import { composeFace, makePicker } from "./face-picker.js";
import { auditPersonEdit } from "./face-region-audit.js";
export class FaceSelectionSession {
    revision = 0;
    current = null;
    choice = null;
    selected = null;
    bystanders = [];
    lastAudit = null;
    width = 0;
    height = 0;
    newPhoto(boxes, width, height) {
        this.revision++;
        this.current = makePicker(boxes, width, height);
        this.width = width;
        this.height = height;
        this.choice = this.current.primary;
        this.selected = null;
        this.bystanders = [];
        this.lastAudit = null;
        return this.state();
    }
    state() {
        return { revision: this.revision, faceCount: this.choice?.visibleFaces ?? 0,
            chosen: this.choice?.index ?? null, code: this.choice?.code ?? "no_face_found",
            verifiedRegion: this.selected !== null };
    }
    tap(x, y) {
        if (!this.current)
            return this.state();
        const candidate = this.current.tap(x, y);
        if (candidate.index !== null)
            this.set(candidate);
        return this.state();
    }
    select(index) {
        if (!this.current)
            return this.state();
        const candidate = this.current.select(index);
        if (candidate.index !== null)
            this.set(candidate);
        return this.state();
    }
    set(candidate) {
        this.choice = candidate;
        this.selected = null;
        this.bystanders = [];
        this.lastAudit = null;
    }
    provideMasks(revision, selected, bystanders) {
        if (revision !== this.revision)
            throw new RangeError("stale photo revision");
        if (this.choice?.index === null || this.choice === null)
            throw new RangeError("select a face first");
        const expected = this.width * this.height;
        if (!(selected instanceof Float32Array) || selected.length !== expected ||
            !selected.some((v) => v > 0) || !selected.every((v) => Number.isFinite(v) && v >= 0 && v <= 1) ||
            !bystanders.every((m) => m instanceof Float32Array && m.length === expected &&
                m.every((v) => Number.isFinite(v) && v >= 0 && v <= 1))) {
            throw new RangeError("verified full-size person and bystander masks required");
        }
        this.selected = new Float32Array(selected);
        this.bystanders = bystanders.map((m) => new Float32Array(m));
        this.lastAudit = null;
        return this.state();
    }
    apply(revision, original, edited, width, height, channels = 4) {
        if (revision !== this.revision)
            throw new RangeError("photo changed during edit");
        if (this.choice?.index === null || !this.choice || !this.selected) {
            throw new RangeError("no chosen face with reviewed region");
        }
        const result = composeFace(original, edited, this.selected, this.bystanders, width, height, channels);
        const observed = auditPersonEdit({ data: original, width, height, channels }, { data: result, width, height, channels }, this.selected, this.bystanders);
        if (!observed.passed)
            throw new RangeError(`selected-person isolation refused: ${observed.status}`);
        this.lastAudit = observed;
        return result;
    }
    auditCounts() { return this.lastAudit ? { ...this.lastAudit } : null; }
    clear() {
        this.revision++;
        this.current = null;
        this.choice = null;
        this.selected = null;
        this.bystanders = [];
        this.lastAudit = null;
        this.width = 0;
        this.height = 0;
    }
}
//# sourceMappingURL=face-selection.js.map