/** Original-first, image-local hairstyle consultation panels. Author: John Khan. */
import { DEFAULT_LOCK_LEVEL, checkedLevel } from "../gender_look/levels.js";
import { validatePhoto } from "./contracts.js";
import { SIMULATION_LABEL, TEXTURES, definition } from "./style-guides.js";
import { renderStyleGuide } from "./style-preview.js";
function copy(image) {
    const result = new Uint8ClampedArray(new ArrayBuffer(image.length));
    result.set(image);
    return result;
}
export function checkedChoices(input) {
    if (!Array.isArray(input) || input.length < 1 || input.length > 4) {
        throw new RangeError("choose between one and four hairstyles");
    }
    const seen = new Set();
    for (const entry of input) {
        definition(entry.style);
        checkedLevel(entry.level);
        if (!TEXTURES.includes(entry.texture))
            throw new RangeError("unknown hair texture");
        if (seen.has(entry.style))
            throw new RangeError("duplicate hairstyle");
        seen.add(entry.style);
    }
    return input;
}
export function comparison(photo, hairMask, geometry, choices, options) {
    const selected = checkedChoices(choices);
    const lock = checkedLevel(options.lockLevel ?? DEFAULT_LOCK_LEVEL);
    validatePhoto(photo);
    const untouched = copy(photo.data);
    const original = { ...photo, data: untouched };
    const panels = [{
            index: 0, name: "Original", original: true, data: copy(untouched),
            rendered: true, changedPixelShare: 0, status: "original",
        }];
    const results = [];
    for (const item of selected) {
        const params = {
            texture: item.texture, sideMask: options.sideMask, protectedMask: options.protectedMask,
            primaryBox: options.primaryBox, lockLevel: lock, identityGuard: options.identityGuard,
        };
        const result = options.session
            ? options.session.render(original, hairMask, geometry, item.style, item.level, params)
            : renderStyleGuide(original, hairMask, geometry, item.style, item.level, params);
        results.push(result);
        panels.push({
            index: panels.length, name: definition(item.style).title, original: false,
            data: copy(result.data), rendered: result.rendered,
            changedPixelShare: result.changedPixelShare, status: result.status,
        });
    }
    return {
        panels, distinctStyles: selected.length, processed: results.filter(result => result.rendered).length,
        refused: results.filter(result => !result.rendered).length,
        guardCalls: results.filter(result => result.guardCalled).length,
        simulationLabel: SIMULATION_LABEL,
    };
}
export function safeRecipe(board, choices) {
    const selected = checkedChoices(choices);
    if (board.distinctStyles !== selected.length)
        throw new RangeError("comparison and recipe length differ");
    return {
        format: "beljour-women-style-choices/1", simulation: true,
        choices: selected.map(item => ({ style: item.style, level: checkedLevel(item.level), texture: item.texture })),
    };
}
