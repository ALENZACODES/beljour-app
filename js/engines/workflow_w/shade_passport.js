/** Versioned local Shade Passport mirror. Author: John Khan. */
export const SHADE_PASSPORT_SCHEMA = "beljour.shade-passport.v1";
function depth(value) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) {
        throw new RangeError("depth must be finite 0..100");
    }
    return value;
}
function undertone(value) {
    if (value !== "cool" && value !== "neutral" && value !== "warm" && value !== "olive") {
        throw new RangeError("unsupported undertone");
    }
    return value;
}
function text(value, max, name) {
    if (typeof value !== "string" || value.length > max) {
        throw new RangeError(`${name} outside supported bounds`);
    }
    return value;
}
function allergens(value) {
    if (!Array.isArray(value))
        throw new RangeError("allergens must be an array");
    const rows = [...new Set(value.map(item => text(item, 80, "allergen").trim()).filter(Boolean))].sort();
    if (rows.length > 50)
        throw new RangeError("too many allergens");
    return rows;
}
export function parseShadePassport(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new RangeError("passport must be an object");
    const raw = value;
    const allowed = new Set(["schema", "depth", "undertone", "hair_base", "hairBase", "allergens", "measured_on", "measuredOn", "notes", "privacy"]);
    const unknown = Object.keys(raw).filter(key => !allowed.has(key));
    if (unknown.length)
        throw new RangeError(`unknown passport fields: ${unknown.sort().join(",")}`);
    if (raw.schema !== undefined && raw.schema !== SHADE_PASSPORT_SCHEMA)
        throw new RangeError("unsupported passport schema");
    return {
        depth: depth(raw.depth ?? 0),
        undertone: undertone(raw.undertone ?? "neutral"),
        hairBase: text(raw.hair_base ?? raw.hairBase ?? "", 80, "hairBase"),
        allergens: allergens(raw.allergens ?? []),
        measuredOn: text(raw.measured_on ?? raw.measuredOn ?? "", 32, "measuredOn"),
        notes: text(raw.notes ?? "", 1000, "notes"),
    };
}
export function passportPayload(value) {
    return {
        schema: SHADE_PASSPORT_SCHEMA,
        depth: value.depth,
        undertone: value.undertone,
        hair_base: value.hairBase,
        allergens: [...value.allergens],
        measured_on: value.measuredOn,
        notes: value.notes,
        privacy: "local export; no network transmission",
    };
}
function sorted(value) {
    if (Array.isArray(value))
        return value.map(sorted);
    if (value && typeof value === "object") {
        return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, sorted(child)]));
    }
    return value;
}
export function canonicalPassport(value) {
    return JSON.stringify(sorted(passportPayload(value)));
}
export function roundTripPassport(textValue) {
    const raw = JSON.parse(textValue);
    return parseShadePassport(raw);
}
export function redactedPassportSummary(value) {
    return {
        schema: SHADE_PASSPORT_SCHEMA,
        depth_band: Math.floor(value.depth / 10) * 10,
        undertone: value.undertone,
        allergen_count: value.allergens.length,
        has_hair_base: value.hairBase.length > 0,
        has_notes: value.notes.length > 0,
        privacy: "summary excludes free-text values",
    };
}
