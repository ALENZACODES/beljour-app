/** Settings-only local hair recipes: export and import of chosen controls, nothing else.
 * Mirrors api/plumb_api/commerce/local_hair_recipe.py: kind (fibre, palette, short-sides),
 * strength and identity-lock levels in whole tenths 1.0-5.0, and the kind's own setting.
 * Import refuses oversized payloads, invalid JSON, a wrong format, unknown keys, private
 * fields, unknown swatch or style IDs and levels that are not whole tenths, with a coded
 * RecipeError. Importing returns settings only; it never renders, restores a face or reads
 * a photo. Style IDs are checked against the caller's local style list when given (the
 * catalogue is embedded in the page), otherwise by format. Author: John Khan.
 */
import { requireShade } from "../engines/hair_palette/index.js";
export const FORMAT = "beljour-local-hair-recipe/1";
export const MAX_BYTES = 1024;
export const KINDS = ["fibre", "palette", "short-sides"];
export const ZONES = ["crown", "parting", "hairline"];
export const PRIVATE_KEYS = new Set(["image", "photo", "pixels", "mask", "masks", "hair_mask",
    "scalp_mask", "landmarks", "points", "head", "mesh", "hash", "photo_hash", "face", "email", "account", "token",
    "secret", "api_key", "user"]);
const COMMON = ["format", "kind", "level", "lock_level"];
const KIND_KEYS = {
    fibre: ["zone", "shade_id"], palette: ["shade_id", "allow_lightening"], "short-sides": ["style_id"],
};
const STYLE_ID = /^[a-z0-9][a-z0-9-]{0,59}$/;
export class RecipeError extends RangeError {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}
/** A level from 1.0 to 5.0 that is a whole number of tenths. */
export function tenths(value, name) {
    if (typeof value !== "number" || !Number.isFinite(value))
        throw new RecipeError("invalid_level", `${name} must be a number`);
    const scaled = value * 10;
    if (Math.abs(scaled - Math.round(scaled)) > 1e-9 || Math.round(scaled) < 10 || Math.round(scaled) > 50) {
        throw new RecipeError("invalid_level", `${name} must be 1.0 to 5.0 in tenths`);
    }
    return Math.round(scaled) / 10;
}
/** Build a checked recipe; styleIds, when given, is the local style list to check against. */
export function makeRecipe(input, styleIds) {
    const kind = input.kind;
    if (!KINDS.includes(kind))
        throw new RecipeError("invalid_value", "unknown local preview kind");
    const level = tenths(input.level, "level"), lock = tenths(input.lock_level ?? 5, "lock_level");
    const allow = input.allow_lightening ?? false;
    if (typeof allow !== "boolean")
        throw new RecipeError("invalid_value", "allow_lightening must be a boolean");
    for (const key of ["zone", "shade_id", "style_id"]) {
        if (input[key] !== undefined && input[key] !== null && typeof input[key] !== "string") {
            throw new RecipeError("invalid_value", `${key} must be a string`);
        }
    }
    const zone = input.zone, shade = (input.shade_id ?? null);
    const style = input.style_id;
    const checkShade = (id) => {
        try {
            requireShade(id);
        }
        catch {
            throw new RecipeError("unknown_id", "unknown swatch or style id");
        }
    };
    if (kind === "fibre") {
        if (!ZONES.includes(zone) || style !== undefined || allow) {
            throw new RecipeError("invalid_value", "a fibre recipe needs a zone and no style");
        }
        if (shade !== null)
            checkShade(shade);
        return Object.freeze({ format: FORMAT, kind, level, lock_level: lock, zone, shade_id: shade });
    }
    if (kind === "palette") {
        if (shade === null || zone !== undefined || style !== undefined) {
            throw new RecipeError("missing_key", "a palette recipe needs exactly one swatch");
        }
        checkShade(shade);
        return Object.freeze({ format: FORMAT, kind, level, lock_level: lock, shade_id: shade, allow_lightening: allow });
    }
    if (style === undefined || zone !== undefined || shade !== null || allow) {
        throw new RecipeError("missing_key", "a short-sides recipe needs exactly one style");
    }
    if (!STYLE_ID.test(style) || (styleIds !== undefined && !styleIds.has(style))) {
        throw new RecipeError("unknown_id", "unknown swatch or style id");
    }
    return Object.freeze({ format: FORMAT, kind, level, lock_level: lock, style_id: style });
}
/** Compact JSON with sorted keys and one-decimal levels, the same text the Python export writes. */
export function exportRecipe(recipe) {
    const record = recipe;
    const parts = Object.keys(record).sort().map((key) => {
        const value = record[key];
        const text = key === "level" || key === "lock_level" ? value.toFixed(1) : JSON.stringify(value);
        return `${JSON.stringify(key)}:${text}`;
    });
    return `{${parts.join(",")}}`;
}
/** Settings only; refuses anything that is not exactly a local hair recipe. */
export function importRecipe(text, styleIds) {
    if (typeof text !== "string" || new TextEncoder().encode(text).length > MAX_BYTES) {
        throw new RecipeError("too_large", `a recipe must be a string of at most ${MAX_BYTES} bytes`);
    }
    let data;
    try {
        data = JSON.parse(text);
    }
    catch {
        throw new RecipeError("invalid_json", "the recipe is not valid JSON");
    }
    if (data === null || typeof data !== "object" || Array.isArray(data) || data.format !== FORMAT) {
        throw new RecipeError("wrong_format", "not a local hair recipe");
    }
    const record = data;
    const keys = Object.keys(record);
    if (keys.some((key) => PRIVATE_KEYS.has(key))) {
        throw new RecipeError("private_field", "a recipe must not carry photos, masks, landmarks or account data");
    }
    const kind = record.kind;
    if (!KINDS.includes(kind))
        throw new RecipeError("invalid_value", "unknown local preview kind");
    const allowed = new Set([...COMMON, ...KIND_KEYS[kind]]);
    if (keys.some((key) => !allowed.has(key)))
        throw new RecipeError("unknown_key", "the recipe has unknown keys");
    if (!("level" in record))
        throw new RecipeError("missing_key", "a recipe needs a kind and a level");
    return makeRecipe({ kind, level: record.level, lock_level: record.lock_level, zone: record.zone ?? undefined,
        shade_id: record.shade_id, style_id: record.style_id, allow_lightening: record.allow_lightening }, styleIds);
}
