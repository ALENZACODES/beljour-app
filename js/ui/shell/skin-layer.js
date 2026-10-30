import { isRefusal, renderSkinTool, TOOLS } from "../../engines/skin/studio.js";
/** Settings a new skin layer starts with: Even tone, tan direction add, lightening off. */
export const SKIN_DEFAULTS = Object.freeze({
    tool: "tone", style: "cassis", density: 50, redness: 50, direction: "add", undertone: "neutral",
    allow_lightening: false, seed: 7,
});
export const SKIN_TOOL_NAMES = Object.freeze({
    freckles: "Freckles", tan: "Tan", matte: "Matte", glow: "Glow", tone: "Even tone",
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
    if (!TOOLS.includes(tool))
        throw new RangeError("Unknown skin tool");
    return tool;
}
export function applySkinLayer(image, source, layer) {
    if (layer.kind !== "skin")
        return null;
    const tool = skinTool(layer);
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