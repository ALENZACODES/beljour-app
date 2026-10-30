/** Untrusted recipe import/export. No photograph or landmarks enter recipe JSON. */
import { validateCurve } from "./curves.js";
import { validateMasks } from "./masks.js";
import { checkRecipe, ProInputError, defaultRecipe } from "./types.js";
export const RECIPE_FORMAT = "beljour-pro-recipe/1";
const MAX_RECIPE_BYTES = 8_192;
const CHANNELS = ["master", "red", "green", "blue"];
function record(value, name) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new ProInputError(`${name} must be a record`, "PRO_RECIPE_INVALID");
    }
    return value;
}
function finite(value, name) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new ProInputError(`${name} must be a finite number`, "PRO_RECIPE_INVALID");
    }
    return value;
}
function exactKeys(value, keys, name) {
    if (Object.keys(value).some((key) => !keys.includes(key))) {
        throw new ProInputError(`${name} has unrecognized fields`, "PRO_RECIPE_INVALID");
    }
    if (keys.some((key) => !Object.hasOwn(value, key))) {
        throw new ProInputError(`${name} has missing fields`, "PRO_RECIPE_INVALID");
    }
}
function parseCurve(value, name) {
    if (!Array.isArray(value) || value.length > 16 || value.length < 2) {
        throw new ProInputError(`${name} needs 2 to 16 points`, "PRO_RECIPE_INVALID");
    }
    const points = value.map((element) => {
        const point = record(element, `${name} point`);
        exactKeys(point, ["x", "y"], `${name} point`);
        return { x: finite(point.x, "curve x"), y: finite(point.y, "curve y") };
    });
    validateCurve(points);
    return points;
}
export function parseRecipe(input) {
    if (typeof input !== "string" || new TextEncoder().encode(input).length > MAX_RECIPE_BYTES) {
        throw new ProInputError("Recipe must be JSON at most 8 KB", "PRO_RECIPE_SIZE");
    }
    let parsed;
    try {
        parsed = JSON.parse(input);
    }
    catch {
        throw new ProInputError("Recipe JSON could not be read", "PRO_RECIPE_INVALID");
    }
    const envelope = record(parsed, "recipe envelope");
    exactKeys(envelope, ["format", "recipe"], "recipe envelope");
    if (envelope.format !== RECIPE_FORMAT) {
        throw new ProInputError("This recipe version is not supported", "PRO_RECIPE_VERSION");
    }
    const payload = record(envelope.recipe, "recipe");
    const oldKeys = ["curves", "crop", "export", "simulation", "simulationLabel"];
    const allowed = [...oldKeys, "masks"];
    if (Object.keys(payload).some((key) => !allowed.includes(key))
        || oldKeys.some((key) => !Object.hasOwn(payload, key))) {
        throw new ProInputError("Recipe contains unknown or missing fields", "PRO_RECIPE_INVALID");
    }
    const curves = record(payload.curves, "curves");
    exactKeys(curves, CHANNELS, "curves");
    const channels = Object.fromEntries(CHANNELS.map((channel) => [channel, parseCurve(curves[channel], channel)]));
    const crop = record(payload.crop, "crop");
    const fields = ["x", "y", "width", "height", "aspect", "rotation"];
    exactKeys(crop, fields, "crop");
    if (typeof crop.aspect !== "string") {
        throw new ProInputError("Crop aspect must be a named preset");
    }
    if (typeof payload.export !== "string") {
        throw new ProInputError("Export must be a named preset");
    }
    if (typeof payload.simulation !== "boolean" || typeof payload.simulationLabel !== "boolean") {
        throw new ProInputError("Simulation flags must be booleans");
    }
    const masks = [];
    if (Object.hasOwn(payload, "masks")) {
        if (!Array.isArray(payload.masks) || payload.masks.length > 16) {
            throw new ProInputError("Masks must be an array of at most sixteen", "PRO_RECIPE_INVALID");
        }
        for (const value of payload.masks) {
            const item = record(value, "mask");
            const base = ["kind", "mode", "opacity"];
            const point = (v) => {
                const obj = record(v, "mask point");
                exactKeys(obj, ["x", "y"], "mask point");
                return { x: finite(obj.x, "mask x"), y: finite(obj.y, "mask y") };
            };
            if (item.kind === "brush") {
                exactKeys(item, [...base, "points", "radius", "hardness"], "brush mask");
                if (!Array.isArray(item.points) || item.points.length > 48) {
                    throw new ProInputError("Invalid brush stroke length", "PRO_RECIPE_INVALID");
                }
                masks.push({ kind: "brush", mode: item.mode,
                    opacity: finite(item.opacity, "opacity"), points: item.points.map(point),
                    radius: finite(item.radius, "radius"), hardness: finite(item.hardness, "hardness") });
            }
            else if (item.kind === "linear") {
                exactKeys(item, [...base, "start", "end", "feather"], "linear mask");
                masks.push({ kind: "linear", mode: item.mode,
                    opacity: finite(item.opacity, "opacity"), start: point(item.start),
                    end: point(item.end), feather: finite(item.feather, "feather") });
            }
            else if (item.kind === "radial") {
                exactKeys(item, [...base, "center", "radiusX", "radiusY", "feather"], "radial mask");
                masks.push({ kind: "radial", mode: item.mode,
                    opacity: finite(item.opacity, "opacity"), center: point(item.center),
                    radiusX: finite(item.radiusX, "radiusX"), radiusY: finite(item.radiusY, "radiusY"),
                    feather: finite(item.feather, "feather") });
            }
            else {
                throw new ProInputError("Unknown mask type", "PRO_RECIPE_INVALID");
            }
        }
    }
    validateMasks(masks);
    const normalized = {
        masks,
        curves: channels,
        crop: {
            x: finite(crop.x, "crop x"),
            y: finite(crop.y, "crop y"),
            width: finite(crop.width, "crop width"),
            height: finite(crop.height, "crop height"),
            aspect: crop.aspect,
            rotation: finite(crop.rotation, "rotation"),
        },
        export: payload.export,
        simulation: payload.simulation,
        simulationLabel: payload.simulationLabel,
    };
    return checkRecipe(normalized);
}
export function serializeRecipe(recipe) {
    checkRecipe(recipe);
    for (const channel of CHANNELS)
        validateCurve(recipe.curves[channel]);
    const safe = { format: RECIPE_FORMAT, recipe };
    const serialized = JSON.stringify(safe);
    if (new TextEncoder().encode(serialized).length > MAX_RECIPE_BYTES) {
        throw new ProInputError("Recipe exceeds 8 KB", "PRO_RECIPE_SIZE");
    }
    return serialized;
}
export function cloneRecipe(recipe) {
    return parseRecipe(serializeRecipe(recipe));
}
export function emptyRecipe() {
    return cloneRecipe(defaultRecipe());
}
//# sourceMappingURL=recipe.js.map