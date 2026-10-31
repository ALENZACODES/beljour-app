/** Makeup on this device as a shell layer kind, "face-makeup" (the "makeup" studio is the YouCam try-on): lipstick, blush, eyeshadow and eyeliner drawn on this
 * device by web/src/engines/beauty/makeup.ts from the photo's own face points. Nothing is sent
 * anywhere. Each product is a hex colour or "none"; the lipstick has a matte, satin or gloss finish.
 * Author: John Khan.
 */
import { easedPercent } from "./eased.js";
import { applyMakeup, FINISHES, isMakeupRefusal, LOOKS } from "../../engines/beauty/makeup.js";
import { applyFoundation, isRetouchRefusal } from "../../engines/beauty/skin-retouch.js";
import { correctUnderEyes } from "../../engines/beauty/under-eye.js";
import { isRefusal, renderSkinTool } from "../../engines/skin/studio.js";
const FIRST = LOOKS[0];
/** A new makeup layer starts with the first named look. */
export const MAKEUP_DEFAULTS = Object.freeze({
    look: FIRST.id, lip: FIRST.lip, finish: FIRST.finish, blush: FIRST.blush, shadow: FIRST.shadow, liner: FIRST.liner,
});
export const MAKEUP_PRODUCTS = ["lip", "blush", "shadow", "liner"];
export const MAKEUP_PRODUCT_NAMES = Object.freeze({
    lip: "Lipstick", blush: "Blush", shadow: "Eyeshadow", liner: "Eyeliner",
});
/** Values of the optional look keys that leave a plain look exactly as before. */
const LOOK_NEUTRAL = Object.freeze({
    base: "none", baseStrength: 0, concealer: 0, skinFinish: "none", skinFinishStrength: 0, brow: "none", shadowStyle: "lid", trueLip: false,
    lipOpacity: 1, blushOpacity: 1, shadowOpacity: 1, linerOpacity: 1, browOpacity: 1, wing: 1, lift: 1, linerWeight: 1,
    deepLip: "", deepBlush: "", deepLiner: "", deepShadow: "",
});
/** The parameters of a named look. */
export function lookParams(id) {
    const look = LOOKS.find((row) => row.id === id);
    if (!look)
        throw new RangeError("Unknown makeup look");
    const { id: lookId, name: _name, ...rest } = look;
    // every look sets every key, so picking a plain look after a full look leaves nothing of the full look behind
    return { look: lookId, ...LOOK_NEUTRAL, ...rest };
}
/** Optional look settings carried as layer parameters (full looks: skin base, opacities, shadow style, wing, brow, deep-skin shades). */
const NUMBER_KEYS = ["lipOpacity", "blushOpacity", "shadowOpacity", "linerOpacity", "browOpacity", "wing", "lift", "linerWeight"];
const TEXT_KEYS = ["brow", "shadowStyle", "deepLip", "deepBlush", "deepLiner", "deepShadow"];
function extras(layer) {
    const out = {};
    for (const k of NUMBER_KEYS) {
        const v = layer.parameters[k];
        if (typeof v === "number" && Number.isFinite(v))
            out[k] = v;
    }
    for (const k of TEXT_KEYS) {
        const v = layer.parameters[k];
        if (typeof v === "string" && v)
            out[k] = v;
    }
    if (layer.parameters.trueLip === true)
        out.trueLip = true;
    return out;
}
/** A full look's skin base before the colour: her own-shade foundation, then glow or matte (both engines' own masks). */
function skinBase(image, source, layer, amount) {
    let out = image;
    const base = layer.parameters.base, baseStrength = layer.parameters.baseStrength;
    if (base === "foundation" && typeof baseStrength === "number" && baseStrength > 0) {
        const done = applyFoundation(out, source.face, baseStrength * amount, { hair: source.hair?.data, person: source.person?.data });
        if (isRetouchRefusal(done))
            throw new RangeError(done.message);
        out = { ...out, data: done.image };
    }
    // r5: a light concealer under the eyes (the bare look), the under-eye engine matched to her own cheek
    const concealer = layer.parameters.concealer;
    if (typeof concealer === "number" && concealer > 0 && source.face) {
        const done = correctUnderEyes(out, source.face, { strength: concealer * amount, includeBags: false });
        if (done.status === "edited")
            out = done.image;
    }
    const finish = layer.parameters.skinFinish, finishStrength = layer.parameters.skinFinishStrength;
    if (typeof finish === "string" && finish !== "none" && typeof finishStrength === "number" && finishStrength > 0) {
        const [tool, style] = finish.split("-");
        if (tool !== "glow" && tool !== "matte")
            throw new RangeError("Unknown skin finish");
        const done = renderSkinTool(tool, out, source.face, finishStrength * amount, { style: style ?? "cassis" });
        if (isRefusal(done))
            throw new RangeError(done.message);
        out = { ...out, data: done.image };
    }
    return out;
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
    const based = skinBase(image, source, layer, Math.max(0, Math.min(1, layer.strength / 100)));
    const result = applyMakeup(based, source.face, easedPercent(layer.strength), { lip: text(layer, "lip"), finish: finish,
        blush: text(layer, "blush"), shadow: text(layer, "shadow"), liner: text(layer, "liner"), ...extras(layer),
        hair: source.hair?.data, person: source.person?.data });
    if (isMakeupRefusal(result))
        throw new RangeError(result.message);
    return { image: { width: image.width, height: image.height, channels: image.channels, data: result.image },
        label: result.label, metrics: { ...result.metrics, look: text(layer, "look"), mask_source: "face points" } };
}
