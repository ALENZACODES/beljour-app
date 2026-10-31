/** Bind a drawn export to the exact source, permissions and selected subject. */
/** Author: John Khan. */
import { TOUR_EFFECTS } from "./contract.js";
import { checkedSubjectBoxes } from "../subjects/contract.js";
const MAX_EXPORT_PIXELS = 12_000_000;
const MAX_EDGE = 6000;
function validImageDimensions(width, height) {
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)) {
        throw new RangeError("The drawing dimensions are not integers");
    }
    if (width < 1 || height < 1 || width > MAX_EDGE || height > MAX_EDGE) {
        throw new RangeError("The drawing dimensions are outside the local export range");
    }
    if (width * height > MAX_EXPORT_PIXELS) {
        throw new RangeError("The drawing exceeds the local export pixel limit");
    }
}
/** Explicitly reject actual uploaded photos in this synthetic-only rehearsal. */
export function captureExportTicket(input) {
    const { state, subjects, original } = input;
    if (!original || typeof original.width !== "number" || typeof original.height !== "number") {
        throw new TypeError("There is no available local drawing");
    }
    validImageDimensions(original.width, original.height);
    if (!state.sourceLoaded || !state.permissions.local || !state.identityLock) {
        throw new Error("Local consent and identity lock are required for export");
    }
    if (subjects.source !== "drawn" || state.sourceRevision !== subjects.revision) {
        throw new Error("The synthetic subject evidence is stale or unavailable");
    }
    if (!state.selectedId || state.selectedId !== subjects.selectedId) {
        throw new Error("Select an available drawn subject before exporting");
    }
    const boxes = checkedSubjectBoxes(subjects.boxes);
    if (boxes.length !== state.faceCount || boxes.length === 0) {
        throw new Error("The subject count no longer matches the selected drawing");
    }
    const selected = boxes.find((box) => box.id === state.selectedId);
    if (!selected || selected.origin !== "drawn") {
        throw new Error("The selected subject has no checked drawn boundaries");
    }
    if (boxes.some((box) => box.origin !== "drawn")) {
        throw new Error("Mixed observed and illustrative subject sources are not accepted");
    }
    const levels = TOUR_EFFECTS.map((name) => {
        const level = state.levels[name];
        if (!Number.isFinite(level) || level < 1 || level > 5
            || Math.abs(level * 10 - Math.round(level * 10)) > 1e-8) {
            throw new RangeError("A local intensity has an invalid decimal value");
        }
        return [name, level, state.applied[name]];
    });
    const subjectGeometry = boxes.map((box) => [
        box.id, box.x, box.y, box.width, box.height, box.primary === true,
    ]);
    const signature = JSON.stringify([
        state.sourceRevision,
        original.width,
        original.height,
        state.selectedId,
        state.permissions.local,
        state.permissions.hair,
        state.permissions.face,
        state.permissions.mock,
        state.identityLock,
        levels,
        state.appearanceCue,
        state.mockMode,
        state.mockResult,
        state.seasonalId,
        subjectGeometry,
    ]);
    return Object.freeze({
        source: original,
        width: original.width,
        height: original.height,
        signature,
    });
}
/** Re-read the live state; never trust a captured reference after an await. */
export function stillCurrentExport(ticket, input) {
    try {
        const next = captureExportTicket(input);
        return next.source === ticket.source && next.signature === ticket.signature;
    }
    catch {
        return false;
    }
}
