/** DOM-free state for the seven-fix posture panel: photo readiness, levels and lock.
 * A fix is offered only for a confirmed matching view with both masks present, and a
 * face-adjacent fix also needs an identity guard. Nothing is inferred from pixels.
 * Author: John Khan.
 */
import { DEFAULT_POSTURE_LEVEL, DEFAULT_POSTURE_LOCK, FACE_MOVING_FIXES, PostureLevelMemory, checkedPostureLevel, postureFixes } from "../engines/local/posture.js";
const DIGEST = /^[0-9a-f]{64}$/;
export function checkedPanelPhoto(photo) {
    if (!photo || !DIGEST.test(photo.digest))
        throw new RangeError("photo digest must be 64 lowercase hex characters");
    if (!(Number.isInteger(photo.width) && Number.isInteger(photo.height) && photo.width >= 8 && photo.height >= 8 &&
        photo.width <= 16384 && photo.height <= 16384)) {
        throw new RangeError("invalid photo dimensions");
    }
    if (photo.view !== null && photo.view !== "front" && photo.view !== "side")
        throw new RangeError("view must be front or side");
    if (typeof photo.personMask !== "boolean" || typeof photo.headMask !== "boolean") {
        throw new RangeError("mask readiness must be explicit booleans");
    }
    return { ...photo };
}
export class PosturePanelState {
    photoValue = null;
    selectedFix = null;
    lock = DEFAULT_POSTURE_LOCK;
    guard = false;
    levels = new PostureLevelMemory();
    /** A new photo clears the selection; saved per-fix levels and the lock remain. */
    setPhoto(photo) {
        this.photoValue = photo === null ? null : checkedPanelPhoto(photo);
        this.selectedFix = null;
        return this.snapshot();
    }
    setGuardAvailable(available) {
        this.guard = available === true;
        if (this.selectedFix && !this.availability(this.selectedFix).enabled)
            this.selectedFix = null;
        return this.snapshot();
    }
    availability(fix) {
        const entry = postureFixes().find((item) => item.fix === fix);
        if (!entry)
            throw new RangeError("unknown posture fix");
        const photo = this.photoValue;
        let reason = null;
        if (!photo)
            reason = "photo_required";
        else if (photo.view === null)
            reason = "view_required";
        else if (photo.view !== entry.view)
            reason = "wrong_view";
        else if (!photo.personMask)
            reason = "person_mask_required";
        else if (!photo.headMask)
            reason = "head_mask_required";
        else if (FACE_MOVING_FIXES.has(fix) && !this.guard)
            reason = "identity_guard_required";
        return { fix, id: entry.id, name: entry.name, view: entry.view, enabled: reason === null, reason,
            warning: entry.reason };
    }
    select(fix) {
        const state = this.availability(fix);
        if (!state.enabled)
            throw new RangeError(`posture fix unavailable: ${state.reason}`);
        this.selectedFix = fix;
        return this.snapshot();
    }
    setLevel(level) {
        if (!this.selectedFix)
            throw new RangeError("choose a posture fix first");
        this.levels.set(this.selectedFix, level);
        return this.snapshot();
    }
    setLock(level) {
        this.lock = checkedPostureLevel(level);
        return this.snapshot();
    }
    get selected() { return this.selectedFix; }
    get level() { return this.selectedFix ? this.levels.get(this.selectedFix) : DEFAULT_POSTURE_LEVEL; }
    get lockLevel() { return this.lock; }
    get photo() { return this.photoValue ? { ...this.photoValue } : null; }
    snapshot() {
        return { photo: this.photo, selected: this.selectedFix, level: this.level, lockLevel: this.lock,
            guardAvailable: this.guard,
            fixes: postureFixes().map((entry) => this.availability(entry.fix)) };
    }
}
