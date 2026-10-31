export const RESCUE_ID = "rescue";
export const RESCUE_STEPS = [{ kind: "enhance", strength: 30, params: { mode: "natural" } },
    { kind: "under-eye", strength: 30, params: {} }];
export const RESCUE_NOT_BUILT = ["dull skin glow", "flyaway hair"];
export function rescueLine() {
    return `Gentle enhance and under-eye brightening matched to your own cheek. Not in Rescue yet: ${RESCUE_NOT_BUILT.join(", ")} (Glow is in the Skin tools).`;
}
/** The layers Rescue adds, in order. A copy, so callers can't change the recipe. */
export function rescueSteps() {
    return RESCUE_STEPS.map((s) => ({ ...s, params: { ...s.params } }));
}
