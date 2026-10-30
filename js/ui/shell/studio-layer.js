import { BACKDROPS } from "../../engines/studio/backdrops.js";
import { StudioRefusal } from "../../engines/studio/common.js";
import { INDUSTRIES } from "../../engines/studio/headshot.js";
import { SIDES } from "../../engines/studio/relight.js";
import { renderStudio } from "../../engines/studio/studio.js";
import { keyLight } from "../../engines/beauty/key-light.js";
import { illustrate, LOOKS } from "../../engines/studio/illustration.js";
/** Tools the editor layer runs. Background removal (transparent PNG) stays in the engine until export carries alpha. */
export const STUDIO_LAYER_TOOLS = ["blur", "replace", "relight", "headshot", "authentic"];
export const STUDIO_TOOL_NAMES = Object.freeze({
    blur: "Background blur", replace: "Backdrop", relight: "Relight", headshot: "Headshot studio", authentic: "Authenticity mode",
});
export const STUDIO_DEFAULTS = Object.freeze({
    tool: "blur", backdrop: "chinon", side: "upper-left", industry: "technology",
});
export const ILLUSTRATION_DEFAULTS = Object.freeze({ look: "sancerre-cartoon" });
/** Tools that also need her 478 face points. */
export const NEEDS_FACE = new Set(["relight", "headshot", "authentic"]);
function text(layer, key, defaults) {
    const value = layer.parameters[key] ?? defaults[key];
    return typeof value === "string" ? value : String(defaults[key]);
}
export function studioTool(layer) {
    const tool = text(layer, "tool", STUDIO_DEFAULTS);
    if (!STUDIO_LAYER_TOOLS.includes(tool))
        throw new RangeError("Unknown studio tool");
    return tool;
}
function asRGB(image, data, channels) {
    if (channels === image.channels)
        return { ...image, data };
    const out = new Uint8Array(image.width * image.height * image.channels);
    for (let i = 0; i < image.width * image.height; i++)
        for (let k = 0; k < image.channels; k++)
            out[i * image.channels + k] = k < 3 ? data[i * channels + k] : 255;
    return { ...image, data: out };
}
export function applyStudioLayer(image, source, layer) {
    if (layer.kind === "illustration") {
        const look = text(layer, "look", ILLUSTRATION_DEFAULTS);
        if (!Object.hasOwn(LOOKS, look))
            throw new RangeError("Unknown illustration look");
        const result = illustrate(look, image, { amount: Math.min(1, Math.max(0, layer.strength / 100)) });
        return { image: { ...image, data: Uint8Array.from(result.image) }, label: result.label, metrics: { look, geometry_displacement: 0 } };
    }
    if (layer.kind !== "studio")
        return null;
    const tool = studioTool(layer);
    const backdrop = text(layer, "backdrop", STUDIO_DEFAULTS), side = text(layer, "side", STUDIO_DEFAULTS);
    const industry = text(layer, "industry", STUDIO_DEFAULTS);
    if (!Object.hasOwn(BACKDROPS, backdrop) || !Object.hasOwn(SIDES, side) || !Object.hasOwn(INDUSTRIES, industry))
        throw new RangeError("Unknown studio option");
    if (tool === "relight" && source.face?.length === 478) {
        // A soft key light shaped by her face points (engines/beauty/key-light.ts); face average kept.
        const lit = keyLight(image, source.face, layer.strength, side, { person: source.person?.data });
        return { image: { ...image, data: lit.image }, label: lit.label, metrics: { ...lit.metrics, tool, mask_source: "face points" } };
    }
    try {
        const result = renderStudio(tool, image, source.person?.data, source.face, { strength: layer.strength, backdrop, side, industry });
        const metrics = { ...result.metrics, mask_source: "person area" };
        result.crops.forEach(([name, x, y, w, h]) => { metrics[`crop_${name}`] = `${x},${y},${w}x${h}`; });
        return { image: asRGB(image, result.image, result.channels), label: result.label, metrics };
    }
    catch (error) {
        if (error instanceof StudioRefusal)
            throw new RangeError(error.message);
        throw error;
    }
}
//# sourceMappingURL=studio-layer.js.map