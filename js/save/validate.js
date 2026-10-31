/** Runtime recipe validation (free-library plan §4B, the serialization-converter role).
 * TypeScript types vanish at run time, so every recipe read from IndexedDB, a shared file or
 * an old schema is checked here before the editor uses it. Errors are plain and specific;
 * unknown fields are refused rather than silently kept. Author: John Khan.
 */
import { MAX_SETTINGS, MAX_STEPS, MAX_VERSIONS, RECIPE_FORMAT, TOOLS, } from "./recipe.js";
export class RecipeError extends Error {
    path;
    constructor(path, message) {
        super(`${path}: ${message}`);
        this.path = path;
        this.name = "RecipeError";
    }
}
const NAME = /^[\p{L}\p{N} .,'&()+→-]{1,40}$/u;
const ID = /^look-[0-9a-f]{8}$/;
const SETTING_KEY = /^[a-z][a-zA-Z0-9_-]{0,40}$/;
const BANNED_KEYS = /^(photo|image|pixels|landmarks?|mesh|mask|face|points|exif|gps|location)$/i;
function object(raw, path) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw))
        throw new RecipeError(path, "must be an object");
    return raw;
}
function onlyKeys(o, allowed, path) {
    for (const key of Object.keys(o))
        if (!allowed.includes(key))
            throw new RecipeError(path, `unknown field "${key}"`);
}
function isoDate(raw, path) {
    if (typeof raw !== "string" || Number.isNaN(Date.parse(raw)))
        throw new RecipeError(path, "must be a date");
    return new Date(Date.parse(raw)).toISOString();
}
export function validateSettings(raw, path) {
    if (raw === undefined)
        return {};
    const o = object(raw, path);
    const entries = Object.entries(o);
    if (entries.length > MAX_SETTINGS)
        throw new RecipeError(path, `at most ${MAX_SETTINGS} settings`);
    const out = {};
    for (const [key, value] of entries) {
        if (!SETTING_KEY.test(key))
            throw new RecipeError(`${path}.${key}`, "is not an allowed setting name");
        if (BANNED_KEYS.test(key))
            throw new RecipeError(`${path}.${key}`, "a recipe never holds photos, face points or location");
        if (typeof value === "string") {
            if (value.length > 60)
                throw new RecipeError(`${path}.${key}`, "text is longer than 60 characters");
            if (/^data:|^blob:|^https?:/i.test(value))
                throw new RecipeError(`${path}.${key}`, "links and embedded files are not allowed");
            out[key] = value;
        }
        else if (typeof value === "number") {
            if (!Number.isFinite(value))
                throw new RecipeError(`${path}.${key}`, "must be a finite number");
            out[key] = value;
        }
        else if (typeof value === "boolean")
            out[key] = value;
        else
            throw new RecipeError(`${path}.${key}`, "must be text, a number or true/false");
    }
    return out;
}
export function validateStep(raw, path) {
    const o = object(raw, path);
    onlyKeys(o, ["tool", "strength", "settings", "provider"], path);
    if (typeof o.tool !== "string" || !Object.hasOwn(TOOLS, o.tool))
        throw new RecipeError(`${path}.tool`, "is not a tool this app has");
    if (typeof o.strength !== "number" || !Number.isFinite(o.strength) || o.strength < 0 || o.strength > 100) {
        throw new RecipeError(`${path}.strength`, "must be a number from 0 to 100");
    }
    const expected = TOOLS[o.tool].provider;
    const provider = (o.provider ?? expected);
    if (provider !== expected)
        throw new RecipeError(`${path}.provider`, `must be "${expected}" for ${o.tool}`);
    return { tool: o.tool, strength: Math.round(o.strength * 100) / 100, settings: validateSettings(o.settings, `${path}.settings`), provider };
}
export function validateVersion(raw, path) {
    const o = object(raw, path);
    onlyKeys(o, ["version", "created", "steps"], path);
    if (!Number.isInteger(o.version) || o.version < 1)
        throw new RecipeError(`${path}.version`, "must be a whole number from 1");
    if (!Array.isArray(o.steps) || o.steps.length < 1 || o.steps.length > MAX_STEPS) {
        throw new RecipeError(`${path}.steps`, `a version holds 1 to ${MAX_STEPS} steps`);
    }
    return { version: o.version, created: isoDate(o.created, `${path}.created`),
        steps: o.steps.map((s, i) => validateStep(s, `${path}.steps[${i}]`)) };
}
/** Validate a stored or imported recipe; returns a clean copy or throws RecipeError. */
export function validateRecipe(raw) {
    const o = object(raw, "recipe");
    if (o.format !== RECIPE_FORMAT)
        throw new RecipeError("recipe.format", `must be "${RECIPE_FORMAT}"`);
    onlyKeys(o, ["format", "id", "name", "created", "versions"], "recipe");
    if (typeof o.id !== "string" || !ID.test(o.id))
        throw new RecipeError("recipe.id", "is damaged");
    if (typeof o.name !== "string" || !NAME.test(o.name.trim()))
        throw new RecipeError("recipe.name", "needs 1 to 40 letters, numbers or spaces");
    if (!Array.isArray(o.versions) || o.versions.length < 1 || o.versions.length > MAX_VERSIONS) {
        throw new RecipeError("recipe.versions", `a look keeps 1 to ${MAX_VERSIONS} versions`);
    }
    const versions = o.versions.map((v, i) => validateVersion(v, `recipe.versions[${i}]`));
    versions.forEach((v, i) => {
        if (v.version !== i + 1)
            throw new RecipeError(`recipe.versions[${i}].version`, `must be ${i + 1}; versions run 1, 2, 3 in order`);
    });
    return { format: RECIPE_FORMAT, id: o.id, name: o.name.trim(), created: isoDate(o.created, "recipe.created"), versions };
}
/** The older My Look file (beljour-my-look/1) becomes a one-version recipe. */
export function upgradeMyLook(raw) {
    const o = object(raw, "look");
    if (o.format === RECIPE_FORMAT)
        return validateRecipe(o);
    if (o.format !== "beljour-my-look/1")
        throw new RecipeError("look.format", "is not a BELJOUR look");
    if (!Array.isArray(o.steps))
        throw new RecipeError("look.steps", "must be a list");
    const created = typeof o.created === "string" && !Number.isNaN(Date.parse(o.created)) ? o.created : new Date(0).toISOString();
    const steps = o.steps.map((s, i) => {
        const step = object(s, `look.steps[${i}]`);
        return { tool: step.kind, strength: step.strength, settings: step.params ?? {} };
    });
    return validateRecipe({ format: RECIPE_FORMAT, id: o.id, name: o.name, created,
        versions: [{ version: 1, created, steps }] });
}
/** Parse shared text safely: size-capped, JSON only. */
export function parseRecipeText(text) {
    if (typeof text !== "string" || text.length > 64 * 1024)
        throw new RecipeError("file", "is not a saved look (too large)");
    let parsed;
    try {
        parsed = JSON.parse(text);
    }
    catch {
        throw new RecipeError("file", "is not a saved look");
    }
    return upgradeMyLook(parsed);
}
