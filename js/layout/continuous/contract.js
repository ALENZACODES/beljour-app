/** Public, self-contained contract for the optional continuous judge tour. */
import { parseVisibleStrength } from "../strength-scale.js";
import { PALETTE } from "../../ui/palette.js";
export const TOUR_STEPS = [
    { id: "source", title: "Drawn sample", caption: "Open original drawn figures, not photographs of people." },
    { id: "faces", title: "Locate the figures", caption: "Display known diagram boxes; no face detector was run." },
    { id: "subject", title: "Choose a person", caption: "Only the selected figure is eligible for an edit." },
    { id: "consent", title: "Choose permissions", caption: "Local and mock actions require separate opt-ins." },
    { id: "hair", title: "Hair style", caption: "Preview a local, drawn hair-colour overlay." },
    { id: "colour", title: "Colour detail", caption: "Add a second, independent highlight layer." },
    { id: "concealer", title: "Concealer", caption: "Illustrate a placement guide, not a skin diagnosis." },
    { id: "appearance", title: "Masc and fem levels",
        caption: "Demonstrate controlled optional style cues; never infer identity." },
    { id: "ratio", title: "Golden ratio", caption: "Show a reference grid; no measured beauty score is produced." },
    { id: "turn", title: "Face turning", caption: "A drawn orientation guide does not invent hidden-side pixels." },
    { id: "posture", title: "Posture", caption: "A visual alignment guide, not anatomical correction." },
    { id: "pro", title: "Five Pro Commands",
        caption: "Review the exact commands; execution requires the owner adapter." },
    { id: "seasonal", title: "Seasonal packs",
        caption: "List verified packs from a public catalogue if it is connected." },
    { id: "tryon", title: "Mock YouCam try-on", caption: "No provider task or YouCam unit is used in this tour." },
    { id: "compare", title: "Before and after",
        caption: "Move the divider to compare the original and local illustration." },
    { id: "save", title: "Save labelled image", caption: "Export an explicitly marked illustration from this browser." },
];
export const TOUR_STRENGTH = Object.freeze({ min: "1", max: "5", step: "0.1" });
export const TOUR_LOCAL_MARK = "SIMULATION — ILLUSTRATIVE DEMO";
/** Keys kept from the blue, white and red tour; values are the plum palette since 2026-10-29,
 * fixed (ui/palette.ts) because the tour paints the same pixels in every theme. */
export const TOUR_THEME = Object.freeze({ blue: PALETTE.plum, red: PALETTE.wine, white: PALETTE.cream });
export const TOUR_EFFECTS = [
    "hair", "colour", "concealer", "appearance", "ratio", "turn", "posture",
];
export function stepAt(index) {
    if (!Number.isInteger(index) || index < 0 || index >= TOUR_STEPS.length) {
        throw new RangeError("Invalid continuous demonstration step");
    }
    return TOUR_STEPS[index].id;
}
export function stepIndex(step) {
    return TOUR_STEPS.findIndex((item) => item.id === step);
}
export function checkedLevel(value) {
    return parseVisibleStrength(value);
}
export function isTourEffect(value) {
    return TOUR_EFFECTS.some((effect) => effect === value);
}
export function requiredPermission(effect) {
    return effect === "hair" || effect === "colour" ? "hair" : "face";
}
export function emptyApplied() {
    return {
        hair: false,
        colour: false,
        concealer: false,
        appearance: false,
        ratio: false,
        turn: false,
        posture: false,
    };
}
export function defaultLevels() {
    return { hair: 3, colour: 3, concealer: 3, appearance: 3, ratio: 3, turn: 3, posture: 3 };
}
export function completedTourCount(state) {
    return state.completed.length;
}
//# sourceMappingURL=contract.js.map