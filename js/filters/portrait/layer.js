import { portraitLook, portraitLooks } from "./looks.js";
import { renderPortrait } from "./compose.js";
export const DEFAULT_LOOK = "PL01";
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
    const result = renderPortrait(img, source.face, id, layer.strength);
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
//# sourceMappingURL=layer.js.map