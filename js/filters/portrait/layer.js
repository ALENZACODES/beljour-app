/**
 * The portrait-look layer kind in the studio shell: what a "portrait" layer stores, how it
 * renders and the options its strip shows. A layer is one ShellLayer with kind "portrait":
 * strength is the 0-100 slider and the one parameter `look` names the look (PL01 ...). Undo,
 * history, compare and My Looks work as for every other layer. Every result is labelled a
 * local simulation; the look runs only with the photo's own 478 face points.
 * Author: John Khan.
 */
import { easedPercent } from "../../ui/shell/eased.js";
import { portraitLook, portraitLooks } from "./looks.js";
import { renderPortrait } from "./compose.js";
export const DEFAULT_LOOK = "PL01";
export const STUDIO_BOOST = (eased) => ({ grade: 2, reach: 2.6 + Math.min(1, eased / 100) });
export function defaultPortraitParams(lookId = DEFAULT_LOOK) {
    if (!portraitLook(lookId))
        throw new RangeError("Pick a portrait look");
    return { look: lookId };
}
/** Every look in its own order, at its gentle default. */
export function portraitOptions() {
    return portraitLooks().map((look) => ({ id: `portrait:look:${look.id}`, look: look.id, label: look.name,
        description: look.description, rank: look.recipe.rank, params: defaultPortraitParams(look.id),
        strength: look.recipe.defaults.strength, sparkle: look.sparkle !== null }));
}
export function applyPortraitLayer(img, source, layer) {
    const id = layer.parameters.look;
    if (typeof id !== "string" || !portraitLook(id))
        throw new RangeError("Pick a portrait look");
    // The studio boosts the colour grade so a look reads clearly at Natural (owner bar, Oct 30):
    // the grade runs at 2x the eased slider (full recipe from Subtle up) and its change is extended
    // 3.1x at Subtle, 3.35x at Natural and 3.6x at Full.
    const eased = easedPercent(layer.strength);
    // A boost that would lighten skin past the guard steps down (never past the parity render).
    let result = renderPortrait(img, source.face, id, eased, STUDIO_BOOST(eased));
    for (const reach of [2.4, 1.8, 1.3]) {
        if (result.status !== "refused" || result.code !== "skin_lightened")
            break;
        result = renderPortrait(img, source.face, id, eased, { grade: 2, reach });
    }
    if (result.status === "refused" && result.code === "skin_lightened")
        result = renderPortrait(img, source.face, id, eased);
    if (result.status === "refused")
        throw new Error(`${result.name} was not applied (${result.code}). ${result.notes.join(" ")}`);
    const image = { width: img.width, height: img.height, channels: 3, data: new Uint8Array(img.width * img.height * 3) };
    for (let p = 0; p < img.width * img.height; p++) {
        for (let c = 0; c < 3; c++)
            image.data[p * 3 + c] = result.image.data[p * result.image.channels + c];
    }
    const i = result.identity;
    return { image, label: `Local simulation · ${result.name}`, metrics: { look: result.look, name: result.name,
            strength_used: result.strength, status: result.status, glints: result.glints,
            marks_found: i?.marksFound ?? 0, marks_kept: i?.marksKept ?? 0, skin_lift: i?.skinLift ?? 0,
            polish_used: i?.polishUsed ?? 0, label: result.label, notes: result.notes.join(" ") } };
}
