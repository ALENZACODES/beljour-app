import { isRefusal, renderSkinTool, TOOLS } from "../../engines/skin/studio.js";
import { applyFoundation, isRetouchRefusal, smoothSkin } from "../../engines/beauty/skin-retouch.js";
/** Every tool the skin layer runs: the two retouch tools first, then the engines/skin tools. */
export const SKIN_LAYER_TOOLS = ["smooth", "foundation", ...TOOLS];
/** Settings a new skin layer starts with: Smooth, tan direction add, lightening off. */
export const SKIN_DEFAULTS = Object.freeze({
    tool: "smooth", style: "cassis", density: 50, redness: 50, direction: "add", undertone: "neutral",
    allow_lightening: false, seed: 7,
});
export const SKIN_TOOL_NAMES = Object.freeze({
    smooth: "Smooth", foundation: "Foundation", freckles: "Freckles", tan: "Tan", matte: "Matte", glow: "Glow", tone: "Even tone",
});
function text(layer, key) {
    const value = layer.parameters[key] ?? SKIN_DEFAULTS[key];
    return typeof value === "string" ? value : String(SKIN_DEFAULTS[key]);
}
function number(layer, key) {
    const value = layer.parameters[key];
    return typeof value === "number" && Number.isFinite(value) ? value : Number(SKIN_DEFAULTS[key]);
}
export function skinTool(layer) {
    const tool = text(layer, "tool");
    if (!SKIN_LAYER_TOOLS.includes(tool))
        throw new RangeError("Unknown skin tool");
    return tool;
}
export function applySkinLayer(image, source, layer) {
    if (layer.kind !== "skin")
        return null;
    const tool = skinTool(layer);
    if (tool === "smooth" || tool === "foundation") {
        if (!source.face)
            throw new RangeError("Read face points on this device first.");
        const masks = { hair: source.hair?.data, person: source.person?.data };
        const done = tool === "smooth" ? smoothSkin(image, source.face, layer.strength, masks)
            : applyFoundation(image, source.face, layer.strength, masks);
        if (isRetouchRefusal(done))
            throw new RangeError(done.message);
        return { image: { width: image.width, height: image.height, channels: image.channels, data: done.image },
            label: done.label, metrics: { ...done.metrics, tool, mask_source: "face points and skin colour" } };
    }
    const result = renderSkinTool(tool, image, source.face, layer.strength, {
        density: number(layer, "density"), seed: Math.round(number(layer, "seed")), direction: text(layer, "direction"),
        undertone: text(layer, "undertone"), allowLightening: layer.parameters.allow_lightening === true,
        style: text(layer, "style"), redness: number(layer, "redness"),
    });
    if (isRefusal(result))
        throw new RangeError(result.message);
    return { image: { width: image.width, height: image.height, channels: image.channels, data: result.image },
        label: result.label, metrics: { ...result.metrics, tool, mask_source: "face points" } };
}
//# sourceMappingURL=skin-layer.js.map