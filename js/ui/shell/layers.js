/** Immutable ordered layers; order represents actual render order (bottom to top).
 * Layer IDs are local; remote task identifiers never become stack indexes.
 * Author: John Khan.
 */
import { isSimulationKind } from "./types.js";
import { clampStrength } from "./stops.js";
import { GENTLE_DEFAULT } from "../../layout/effects.js";
import { MAX_STROKE_TEXT } from "../../editor/brush/stroke.js";
export const MAX_LAYERS = 32;
export const MAX_PARAMS = 40;
export function clampOpacity(n) {
    if (!Number.isFinite(n))
        throw new RangeError("Opacity must be finite");
    return Math.max(0, Math.min(1, Math.round(n * 100) / 100));
}
/** Settings are short values, except a retouch brush layer's `strokes`, which holds its painted
 * strokes as text (editor/brush/stroke.ts) up to MAX_STROKE_TEXT. */
function validParams(params) {
    // 40: the Adjust and Colour mixer tools keep one key per slider that is off its default.
    return Object.keys(params).length <= MAX_PARAMS && Object.entries(params).every(([k, v]) => /^[a-z][a-z0-9_-]{0,40}$/.test(k)
        && (typeof v === "string" && (v.length <= 100 || k === "strokes" && v.length <= MAX_STROKE_TEXT)
            || typeof v === "number" && Number.isFinite(v) || typeof v === "boolean"));
}
export function layer(id, kind, name, origin = "sample", params = {}) {
    if (!/^[a-z0-9-]{1,70}$/.test(id))
        throw new RangeError("Layer ID must be a local token");
    if (!name || name.length > 80 || !validParams(params))
        throw new RangeError("Invalid layer fields");
    const provenance = kind === "styling" ? "youcam" : "local";
    return { id, kind, name, enabled: true, opacity: 1, strength: GENTLE_DEFAULT, parameters: { ...params },
        provenance, simulation: isSimulationKind(kind), origin };
}
export function validateStack(stack) {
    if (stack.length > MAX_LAYERS)
        throw new RangeError("Too many layers (maximum 32)");
    const ids = new Set();
    for (const item of stack) {
        if (ids.has(item.id))
            throw new RangeError("A layer ID is duplicated");
        ids.add(item.id);
        if (!(item.strength >= 0 && item.strength <= 100 && Number.isFinite(item.strength)))
            throw new RangeError("Layer strength must be 0–100");
        if (!(item.opacity >= 0 && item.opacity <= 1 && Number.isFinite(item.opacity)))
            throw new RangeError("Layer opacity must be 0–1");
        if (!validParams(item.parameters))
            throw new RangeError("Layer options aren't valid");
        if (item.provenance !== (item.kind === "styling" ? "youcam" : "local"))
            throw new RangeError("Layer provenance differs from its engine");
    }
}
export function appendLayer(stack, item) {
    const next = [...stack, item];
    validateStack(next);
    return next;
}
export function editLayer(stack, id, edits) {
    if (!stack.some((i) => i.id === id))
        throw new RangeError("Layer not found");
    const next = stack.map((i) => i.id === id ? { ...i, ...edits,
        strength: edits.strength === undefined ? i.strength : clampStrength(edits.strength),
        opacity: edits.opacity === undefined ? i.opacity : clampOpacity(edits.opacity),
        parameters: edits.parameters ? { ...edits.parameters } : i.parameters } : i);
    validateStack(next);
    return next;
}
export function removeLayer(stack, id) {
    if (!stack.some((i) => i.id === id))
        throw new RangeError("Layer not found");
    return stack.filter((i) => i.id !== id);
}
export function moveLayer(stack, id, delta) {
    const old = stack.findIndex((i) => i.id === id), target = old + delta;
    if (old < 0)
        throw new RangeError("Layer not found");
    if (target < 0 || target >= stack.length)
        return [...stack];
    const next = [...stack];
    [next[old], next[target]] = [next[target], next[old]];
    return next;
}
export function effective(stack) {
    return stack.filter((i) => i.enabled && i.opacity > 0 && i.strength > 0);
}
/** The one layer count shown everywhere (Studio header, compare status, measure line): every
 * layer in the list, and how many of them are switched off (hidden, 0 strength or 0 opacity). */
export function countLine(stack) {
    const n = stack.length, off = n - effective(stack).length;
    return `${n} layer${n === 1 ? "" : "s"}${off ? ` (${off} off)` : ""}`;
}
export function describeStack(stack) {
    return { local: stack.filter((i) => i.provenance === "local").length,
        provider: stack.filter((i) => i.provenance === "youcam").length,
        hidden: stack.filter((i) => !i.enabled).length,
        simulation: stack.some((i) => i.enabled && i.simulation) };
}
//# sourceMappingURL=layers.js.map