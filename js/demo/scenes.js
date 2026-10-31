/** The offline demo tour: one drawn-sample scene for each of the ten compare modes, in the
 * order the demo video shows local tools (plan §11, 1:16 to 2:42). Every scene runs on this
 * device with no network, no account and no photo of a person.
 * Author: John Khan.
 */
import { DEMO_SCHEMA, validateScene } from "./schema.js";
import { defaultCompareState } from "../ui/shell/compare-session.js";
const view = (changes) => ({ ...defaultCompareState(), ...changes,
    loupe: { ...defaultCompareState().loupe, ...(changes.loupe ?? {}) } });
const RAW = [
    { schema: DEMO_SCHEMA, id: "dark-photo-split", title: "Repair a dark photo", sample: "low-light",
        line: "Enhance lifts the light and removes grain on this device. Drag the line to compare.",
        layers: [{ kind: "enhance", params: { mode: "low_light" }, strength: 75, opacity: 1 }],
        compare: view({ mode: "split-vertical", position: 0.5 }) },
    { schema: DEMO_SCHEMA, id: "fibre-stops", title: "Fibre cover, nine strengths", sample: "crown",
        line: "The same crown with hair fibres from off to full. A photo-based estimate, not a diagnosis.",
        layers: [{ kind: "hair-fibre", params: { product: "fibres" }, strength: 66, opacity: 1 }],
        compare: view({ mode: "stop-grid" }) },
    { schema: DEMO_SCHEMA, id: "spray-side-by-side", title: "Spray, side by side", sample: "crown",
        line: "Before and after next to each other, captioned, ready to save as a board.",
        layers: [{ kind: "hair-fibre", params: { product: "spray" }, strength: 75, opacity: 1 }],
        compare: view({ mode: "side-by-side" }) },
    { schema: DEMO_SCHEMA, id: "beard-flicker", title: "Short boxed beard", sample: "portrait",
        line: "Flicker between before and after. With reduced motion on, press Space instead.",
        layers: [{ kind: "beard", params: { style: "short_boxed", length: 3, colour: "#3B2A22" }, strength: 75, opacity: 1 }],
        compare: view({ mode: "flicker", flickerMs: 800, playing: true }) },
    { schema: DEMO_SCHEMA, id: "beard-loupe", title: "Stubble up close", sample: "portrait",
        line: "The loupe magnifies the same spot of both pictures, so you can judge the strands.",
        layers: [{ kind: "beard", params: { style: "stubble", length: 2 }, strength: 66, opacity: 1 }],
        compare: view({ mode: "loupe", loupe: { x: 0.5, y: 0.78, zoom: 4 } }) },
    { schema: DEMO_SCHEMA, id: "stack-grid", title: "Two layers, four views", sample: "portrait",
        line: "Original, all edits, the beard alone, and everything without the beard.",
        layers: [{ kind: "enhance", params: { mode: "portrait" }, strength: 50, opacity: 1 },
            { kind: "beard", params: { style: "moustache", length: 3 }, strength: 66, opacity: 1 }],
        select: 1, compare: view({ mode: "grid-2x2" }) },
    { schema: DEMO_SCHEMA, id: "lean-difference", title: "What a posture edit changes", sample: "body-front",
        line: "Coloured pixels moved or were filled. Photo edit, not medical advice.",
        layers: [{ kind: "posture", params: { fix: "lean" }, strength: 66, opacity: 1 }],
        compare: view({ mode: "difference", differenceGain: 4 }) },
    { schema: DEMO_SCHEMA, id: "head-diagonal", title: "Forward head, side view", sample: "body-side",
        line: "A diagonal split shows the head and shoulders together. Photo edit, not medical advice.",
        layers: [{ kind: "posture", params: { fix: "forward_head" }, strength: 66, opacity: 1 }],
        compare: view({ mode: "split-diagonal", position: 0.5 }) },
    { schema: DEMO_SCHEMA, id: "slouch-horizontal", title: "Upper back, top and bottom", sample: "body-side",
        line: "The original sits above the line and the edit below it. Photo edit, not medical advice.",
        layers: [{ kind: "posture", params: { fix: "slouch" }, strength: 66, opacity: 1 }],
        compare: view({ mode: "split-horizontal", position: 0.45 }) },
    { schema: DEMO_SCHEMA, id: "vivid-hold", title: "Hold for the original", sample: "low-light",
        line: "Press and hold the picture, or press Space, to see the original.",
        layers: [{ kind: "enhance", params: { mode: "vivid" }, strength: 66, opacity: 1 }],
        compare: view({ mode: "hold" }) },
];
export const DEMO_SCENES = Object.freeze(RAW.map(validateScene));
export function scene(id) {
    const found = DEMO_SCENES.find((s) => s.id === id);
    if (!found)
        throw new RangeError(`There is no demo scene called ${id}`);
    return found;
}
