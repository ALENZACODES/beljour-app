/** The seven local illustrated stages available to a consented rehearsal. */
/** Author: John Khan. */
import { TOUR_EFFECTS, } from "./contract.js";
export const LOCAL_EDIT_SEQUENCE = Object.freeze([
    { effect: "hair", title: "Hair colour", caption: "A drawn hair shade, not a salon result." },
    { effect: "colour", title: "Hair highlights", caption: "An independent illustrative colour layer." },
    { effect: "concealer", title: "Concealer guide", caption: "A placement guide, not skin assessment." },
    { effect: "appearance", title: "Appearance cues", caption: "Selected style cue, not gender inference." },
    { effect: "ratio", title: "Ratio guide", caption: "Reference grid, not a beauty score." },
    { effect: "turn", title: "Turn guide", caption: "No hidden-side pixels are generated." },
    { effect: "posture", title: "Posture guide", caption: "A drawn alignment plan, not body editing." },
]);
export function sequenceAuthority(state) {
    if (!state.sourceLoaded || !state.selectedId || !state.identityLock)
        return null;
    if (!state.permissions.local || !state.permissions.hair || !state.permissions.face)
        return null;
    if (!Number.isSafeInteger(state.sourceRevision) || state.sourceRevision < 1)
        return null;
    const levels = TOUR_EFFECTS.map((effect) => state.levels[effect]);
    if (levels.some((value) => !Number.isFinite(value) || value < 1 || value > 5
        || Math.abs(Math.round(value * 10) - value * 10) > 0.000001))
        return null;
    return Object.freeze({
        revision: state.sourceRevision,
        selectedId: state.selectedId,
        levels: Object.freeze(levels),
    });
}
export function sameSequenceAuthority(left, right) {
    if (!left || !right)
        return false;
    if (left.revision !== right.revision || left.selectedId !== right.selectedId)
        return false;
    if (left.levels.length !== TOUR_EFFECTS.length || right.levels.length !== TOUR_EFFECTS.length) {
        return false;
    }
    return left.levels.every((level, index) => level === right.levels[index]);
}
export function sequenceStep(index) {
    if (!Number.isSafeInteger(index) || index < 0 || index >= LOCAL_EDIT_SEQUENCE.length)
        return null;
    return LOCAL_EDIT_SEQUENCE[index];
}
export function safeSequenceElapsed(start, end) {
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start)
        return null;
    if (end - start > 300_000)
        return null;
    return Math.round((end - start) * 10) / 10;
}
export function sequenceReadableStatus(status) {
    const observed = `${status.completed.length} of ${status.total} local illustrations observed`;
    if (status.phase === "complete")
        return `${observed}. Stopped before provider or export.`;
    if (status.phase === "running")
        return `${observed}. Playing the drawn steps.`;
    if (status.phase === "paused") {
        const context = status.reason === "hidden" ? "Page hidden; waiting for you to return."
            : status.reason === "reduced-motion" ? "Reduced-motion mode: use One local edit."
                : "Paused by the visitor.";
        return `${observed}. ${context} Applied edits remain.`;
    }
    if (status.phase === "refused") {
        const refusal = {
            none: "Local replay is unavailable.",
            "consent-required": "Choose local, hair and face consent first.",
            "source-changed": "The source or selected subject changed. Start a new run.",
            "step-changed": "The editor moved to another step. Start from Hair colour.",
            "identity-lock-required": "Identity lock must remain on.",
            hidden: "The page became hidden. Resume when it is visible.",
            "reduced-motion": "Automatic replay is off for reduced motion. Use One edit instead.",
            "invalid-clock": "Timing was unavailable. Manual editing remains possible.",
            "manual-stop": "Replay was stopped by the visitor.",
            "edit-refused": "The local illustration was refused; original pixels remain available.",
            disposed: "Rehearsal view closed.",
        };
        return `${observed}. ${refusal[status.reason]}`;
    }
    return `${observed}. An explicit click and current permissions are required.`;
}
//# sourceMappingURL=sequence-contract.js.map