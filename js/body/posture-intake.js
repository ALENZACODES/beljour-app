import { FRONT, SIDE, SIDE_OPTIONAL, makeControls } from "../engines/local/posture.js";
import { checkedOutline, outlineMask, requireHeadInsidePerson } from "./posture-polygons.js";
import { checkedSource, copyByteImage } from "./posture-safe.js";
const DIGEST = /^[0-9a-f]{64}$/;
export function viewPoints(view) {
    return view === "front" ? FRONT : SIDE;
}
export class PostureIntake {
    digestValue = null;
    image = null;
    revisionValue = 0;
    viewValue = null;
    facingValue = 0;
    person = null;
    head = null;
    headConfirmed = false;
    points = new Map();
    acceptedFrame = null;
    listeners = new Set();
    /** Replace the photo: previous pixels are zeroed and every marking is cleared. */
    setSource(digest, image, view = null, facing = 0) {
        if (!DIGEST.test(digest))
            throw new RangeError("photo digest must be 64 lowercase hex characters");
        const owned = copyByteImage(checkedSource(image));
        this.wipe();
        this.digestValue = digest;
        this.image = owned;
        if (view !== null)
            this.applyView(view, facing);
        return this.changed();
    }
    /** Forget the photo and markings entirely. */
    clear() {
        this.wipe();
        return this.changed();
    }
    setView(view, facing = view === "front" ? 0 : 1) {
        this.requirePhoto();
        this.applyView(view, facing);
        return this.changed();
    }
    setPersonOutline(points) {
        const { width, height } = this.requirePhoto();
        this.person = points === null ? null : checkedOutline(points, width, height);
        return this.changed();
    }
    setHeadOutline(points) {
        const { width, height } = this.requirePhoto();
        this.head = points === null ? null : checkedOutline(points, width, height);
        this.headConfirmed = false;
        return this.changed();
    }
    confirmHead(confirmed) {
        this.requirePhoto();
        if (confirmed && !this.head)
            throw new RangeError("draw the head outline before confirming it");
        this.headConfirmed = confirmed === true;
        return this.changed();
    }
    setPoint(name, point) {
        const { width, height } = this.requirePhoto();
        if (!this.viewValue)
            throw new RangeError("choose front or side before placing points");
        const allowed = [...viewPoints(this.viewValue), ...(this.viewValue === "side" ? SIDE_OPTIONAL : [])];
        if (!allowed.includes(name))
            throw new RangeError("that point does not belong to this view");
        if (point === null) {
            this.points.delete(name);
        }
        else {
            const [x, y] = point;
            if (!(Number.isFinite(x) && Number.isFinite(y) && x >= -0.5 && y >= -0.5 && x <= width - 0.5 && y <= height - 0.5)) {
                throw new RangeError("point lies outside the photo");
            }
            this.points.set(name, [x, y]);
        }
        return this.changed();
    }
    missing() {
        const gaps = [];
        if (!this.image)
            return ["photo_required"];
        if (!this.viewValue)
            gaps.push("view_required");
        if (!this.person)
            gaps.push("person_outline_required");
        if (!this.head)
            gaps.push("head_outline_required");
        else if (!this.headConfirmed)
            gaps.push("head_confirmation_required");
        if (this.viewValue && viewPoints(this.viewValue).some((name) => !this.points.has(name))) {
            gaps.push("control_points_required");
        }
        return gaps;
    }
    /** Validate every marking together and freeze an owned frame for this revision. */
    accept() {
        const image = this.requirePhoto();
        const gaps = this.missing();
        if (gaps.length)
            throw new RangeError(`annotation incomplete: ${gaps.join(", ")}`);
        const view = this.viewValue;
        const person = outlineMask(this.person, image.width, image.height);
        const head = outlineMask(this.head, image.width, image.height);
        requireHeadInsidePerson(head, person);
        const points = {};
        for (const [name, [x, y]] of this.points)
            points[name] = [x, y];
        const controls = makeControls(view, points, image.width, image.height, this.facingValue, [], Object.keys(points));
        this.acceptedFrame = { digest: this.digestValue, revision: this.revisionValue, view,
            image: copyByteImage(image), person, head, controls };
        this.emit();
        return this.acceptedFrame;
    }
    /** The accepted frame, only while no marking has changed since acceptance. */
    get accepted() {
        const frame = this.acceptedFrame;
        return frame && frame.revision === this.revisionValue && frame.digest === this.digestValue ? frame : null;
    }
    get revision() { return this.revisionValue; }
    get digest() { return this.digestValue; }
    /** The owned source pixels, for display only. */
    get source() { return this.image; }
    snapshot() {
        const points = {};
        for (const [name, value] of this.points)
            points[name] = [value[0], value[1]];
        return { digest: this.digestValue, width: this.image?.width ?? 0, height: this.image?.height ?? 0,
            revision: this.revisionValue, view: this.viewValue, facing: this.facingValue,
            person: this.person ? this.person.map(([x, y]) => [x, y]) : null,
            head: this.head ? this.head.map(([x, y]) => [x, y]) : null,
            headConfirmed: this.headConfirmed, points, missing: this.missing(), accepted: this.accepted !== null };
    }
    subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
    dispose() {
        this.wipe();
        this.listeners.clear();
    }
    requirePhoto() {
        if (!this.image)
            throw new RangeError("open a photo first");
        return this.image;
    }
    applyView(view, facing) {
        if (view !== "front" && view !== "side")
            throw new RangeError("view must be front or side");
        if (view === "front" ? facing !== 0 : facing !== -1 && facing !== 1) {
            throw new RangeError(view === "front" ? "front view has no facing direction" : "side view needs facing -1 or 1");
        }
        if (this.viewValue !== view || this.facingValue !== facing)
            this.points.clear();
        this.viewValue = view;
        this.facingValue = facing;
    }
    wipe() {
        this.image?.data.fill(0);
        this.acceptedFrame?.image.data.fill(0);
        this.digestValue = null;
        this.image = null;
        this.viewValue = null;
        this.facingValue = 0;
        this.person = null;
        this.head = null;
        this.headConfirmed = false;
        this.points.clear();
        this.acceptedFrame = null;
    }
    changed() {
        this.revisionValue++;
        return this.emit();
    }
    emit() {
        const snapshot = this.snapshot();
        for (const listener of this.listeners)
            listener(snapshot);
        return snapshot;
    }
}
