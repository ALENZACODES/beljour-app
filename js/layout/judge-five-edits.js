export const FIVE_EDIT_STEPS = [
    { id: "hair-colour", family: "hair", title: "1 · Hair colour", cue: "Choose the first hair tone." },
    { id: "hair-highlight", family: "hair", title: "2 · Hair highlights", cue: "Add a separate strand highlight." },
    { id: "cheek-colour", family: "face", title: "3 · Cheek colour", cue: "Set the illustrative cheek shade." },
    { id: "lip-colour", family: "face", title: "4 · Lip colour", cue: "Add a muted illustrative lip tone." },
    { id: "eyeliner", family: "face", title: "5 · Eyeliner", cue: "Add drawn eyeliner near the eyes." },
];
export const EMPTY_JUDGE_DETAILS = Object.freeze({
    "hair-highlight": false,
    "lip-colour": false,
    eyeliner: false,
});
/** Consent affects each edit separately; the final five-edit label is derived. */
export function fiveEditSummary(state) {
    const status = {
        "hair-colour": state.source !== null && state.permissions.local
            && state.permissions.hair && state.hair !== "none",
        "hair-highlight": state.source !== null && state.permissions.local
            && state.permissions.hair && state.details["hair-highlight"],
        "cheek-colour": state.source !== null && state.permissions.local
            && state.permissions.face && state.face !== "none",
        "lip-colour": state.source !== null && state.permissions.local
            && state.permissions.face && state.details["lip-colour"],
        eyeliner: state.source !== null && state.permissions.local
            && state.permissions.face && state.details.eyeliner,
    };
    const rows = FIVE_EDIT_STEPS.map((step) => ({
        id: step.id,
        title: step.title,
        applied: status[step.id],
        permission: step.family,
    }));
    const appliedCount = rows.filter((row) => row.applied).length;
    return Object.freeze({
        appliedCount,
        total: 5,
        allApplied: appliedCount === 5,
        rows: Object.freeze(rows),
        hasProviderEvidence: false,
        labelsAreIllustrative: true,
    });
}
export function validateFiveEditId(value) {
    return FIVE_EDIT_STEPS.some((step) => step.id === value);
}
export function fiveEditHeadline(state) {
    const summary = fiveEditSummary(state);
    return `${summary.appliedCount} of 5 local illustrative edits selected`;
}
