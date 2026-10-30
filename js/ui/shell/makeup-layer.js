import { applyMakeup, FINISHES, isMakeupRefusal, LOOKS } from "../../engines/beauty/makeup.js";
const FIRST = LOOKS[0];
/** A new makeup layer starts with the first named look. */
export const MAKEUP_DEFAULTS = Object.freeze({
    look: FIRST.id, lip: FIRST.lip, finish: FIRST.finish, blush: FIRST.blush, shadow: FIRST.shadow, liner: FIRST.liner,
});
export const MAKEUP_PRODUCTS = ["lip", "blush", "shadow", "liner"];
export const MAKEUP_PRODUCT_NAMES = Object.freeze({
    lip: "Lipstick", blush: "Blush", shadow: "Eyeshadow", liner: "Eyeliner",
});
/** The parameters of a named look. */
export function lookParams(id) {
    const look = LOOKS.find((row) => row.id === id);
    if (!look)
        throw new RangeError("Unknown makeup look");
    return { look: look.id, lip: look.lip, finish: look.finish, blush: look.blush, shadow: look.shadow, liner: look.liner };
}
function text(layer, key) {
    const value = layer.parameters[key] ?? MAKEUP_DEFAULTS[key];
    return typeof value === "string" ? value : String(MAKEUP_DEFAULTS[key]);
}
export function applyMakeupLayer(image, source, layer) {
    if (layer.kind !== "face-makeup")
        return null;
    if (!source.face)
        throw new RangeError("Read face points on this device first.");
    const finish = text(layer, "finish");
    if (!FINISHES.includes(finish))
        throw new RangeError("Unknown lipstick finish");
    const result = applyMakeup(image, source.face, layer.strength, { lip: text(layer, "lip"), finish: finish,
        blush: text(layer, "blush"), shadow: text(layer, "shadow"), liner: text(layer, "liner"),
        hair: source.hair?.data, person: source.person?.data });
    if (isMakeupRefusal(result))
        throw new RangeError(result.message);
    return { image: { width: image.width, height: image.height, channels: image.channels, data: result.image },
        label: result.label, metrics: { ...result.metrics, look: text(layer, "look"), mask_source: "face points" } };
}
//# sourceMappingURL=makeup-layer.js.map