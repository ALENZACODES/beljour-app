import { MODES, SHADES, checkedLevel, } from "./brow-trial.js";
function normalize(value) {
    if (!MODES.includes(value.mode) || !Object.hasOwn(SHADES, value.shade)) {
        throw new RangeError("unknown brow consultation option");
    }
    return { mode: value.mode, shade: value.shade, level: checkedLevel(value.level) };
}
function choices(input) {
    if (!Array.isArray(input) || input.length < 1 || input.length > 4) {
        throw new RangeError("brow board accepts one to four options");
    }
    const entries = input.map(normalize);
    const keys = entries.map(value => `${value.mode}|${value.shade}|${value.level}`);
    if (new Set(keys).size !== keys.length) {
        throw new RangeError("brow board cannot repeat an identical option");
    }
    return entries;
}
export function compareBrowStyles(session, photo, box, options, revision = "0") {
    const entries = choices(options);
    const panels = [];
    const original = new Uint8ClampedArray(photo.data);
    for (const choice of entries) {
        const result = session.render(photo, box, { ...choice, revision });
        if (result.status !== "rendered" && result.status !== "neutral") {
            return { original, panels: [], status: "refused" };
        }
        panels.push({ choice, result });
    }
    return { original, panels, status: "ready" };
}
export function safeBrowRecipe(board) {
    if (board.status !== "ready" || board.panels.length === 0) {
        throw new RangeError("refused brow board cannot be exported");
    }
    return { format: "beljour-brow-consultation/1", simulation: true,
        options: board.panels.map(panel => ({ ...panel.choice })) };
}
export function parseBrowRecipe(document) {
    if (typeof document !== "object" || document === null || Array.isArray(document)) {
        throw new RangeError("brow recipe must be an object");
    }
    const value = document;
    if (Object.keys(value).sort().join() !== ["format", "options", "simulation"].join() ||
        value.format !== "beljour-brow-consultation/1" || value.simulation !== true) {
        throw new RangeError("brow recipe keys or simulation declaration are invalid");
    }
    if (!Array.isArray(value.options))
        throw new RangeError("brow options must be a list");
    for (const option of value.options) {
        if (typeof option !== "object" || option === null || Array.isArray(option) ||
            Object.keys(option).sort().join() !== ["level", "mode", "shade"].join()) {
            throw new RangeError("brow option has unsupported fields");
        }
    }
    return choices(value.options);
}
//# sourceMappingURL=brow-board.js.map