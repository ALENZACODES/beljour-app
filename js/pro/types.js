/** Public data contract for local curves, geometric edits and image export. */
import { validateMasks } from "./masks.js";
export class ProInputError extends Error {
    code;
    constructor(message, code = "PRO_INVALID_INPUT") {
        super(message);
        this.code = code;
        this.name = "ProInputError";
    }
}
export function requireFinite(value, name, min, max) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
        throw new ProInputError(`${name} must be a finite number from ${min} to ${max}`);
    }
    return value;
}
export function requireDimensions(width, height) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
        throw new ProInputError("Image dimensions must be positive whole numbers");
    }
    if (width > 16384 || height > 16384 || width * height > 12_000_000) {
        throw new ProInputError("This editor supports up to 12 megapixels and 16384 pixels per edge", "PRO_IMAGE_LIMIT");
    }
}
export const ASPECT_RATIOS = Object.freeze({
    free: null,
    original: null,
    square: 1,
    portrait: 4 / 5,
    story: 9 / 16,
    landscape: 16 / 9,
    photo: 3 / 2,
});
export function defaultCurves() {
    const identity = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
    return { master: identity, red: identity, green: identity, blue: identity };
}
export function defaultRecipe() {
    return {
        curves: defaultCurves(),
        masks: [],
        crop: { x: 0, y: 0, width: 1, height: 1, aspect: "original", rotation: 0 },
        export: "original",
        simulation: true,
        simulationLabel: true,
    };
}
export function checkCrop(crop) {
    const x = requireFinite(crop.x, "crop x", 0, 1);
    const y = requireFinite(crop.y, "crop y", 0, 1);
    const width = requireFinite(crop.width, "crop width", Number.EPSILON, 1);
    const height = requireFinite(crop.height, "crop height", Number.EPSILON, 1);
    requireFinite(crop.rotation, "rotation", -180, 180);
    if (x + width > 1 + 1e-9 || y + height > 1 + 1e-9) {
        throw new ProInputError("The crop rectangle must fit inside the photograph");
    }
    if (!Object.hasOwn(ASPECT_RATIOS, crop.aspect)) {
        throw new ProInputError("Unknown crop aspect preset");
    }
    return crop;
}
export function checkRecipe(recipe) {
    checkCrop(recipe.crop);
    validateMasks(recipe.masks);
    if (typeof recipe.simulation !== "boolean" || typeof recipe.simulationLabel !== "boolean") {
        throw new ProInputError("Simulation settings must be booleans");
    }
    if (!["original", "web", "portrait", "story", "lossless"].includes(recipe.export)) {
        throw new ProInputError("Unknown export preset");
    }
    return recipe;
}
