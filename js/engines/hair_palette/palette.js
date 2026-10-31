/** Original in-house colour references, D65 Lab matching; zero external lookups.
 * A reference is an estimate, not a photographed dye result. Author: John Khan.
 */
import { ciede2000 } from "../core/colour.js";
import { RAW_HAIR_PALETTE } from "./generated/data.js";
const FAMILIES = new Set(["natural", "ash", "golden", "copper", "red", "violet",
    "mahogany", "fashion", "grey", "silver", "white"]);
const UNDERTONES = new Set(["warm", "neutral", "cool"]);
function record(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}
function triplet(value) {
    return Array.isArray(value) && value.length === 3 && value.every((v) => typeof v === "number" && Number.isFinite(v));
}
export function validatePalette(source) {
    if (!record(source) || source.format !== "beljour-hair-palette/1" || source.author !== "John Khan" ||
        typeof source.data_origin !== "string" || !Array.isArray(source.shades) || source.shades.length < 60) {
        throw RangeError("In-house hair palette source not cleared.");
    }
    const seen = new Set();
    for (const shade of source.shades) {
        if (!record(shade) || typeof shade.id !== "string" || !/^[a-z0-9-]+$/.test(shade.id) ||
            typeof shade.name !== "string" || shade.name.length < 3 ||
            !FAMILIES.has(shade.family) || !UNDERTONES.has(shade.undertone) ||
            !Number.isInteger(shade.level) || shade.level < 1 || shade.level > 10 ||
            !triplet(shade.lab) || !triplet(shade.lch) || !triplet(shade.rgb) ||
            shade.rgb.some((v) => !Number.isInteger(v) || v < 0 || v > 255) || shade.assumed !== true ||
            seen.has(shade.id)) {
            throw RangeError("Hair palette contains invalid, duplicate or unreviewed swatches.");
        }
        seen.add(shade.id);
    }
}
export function catalogue() {
    validatePalette(RAW_HAIR_PALETTE);
    return RAW_HAIR_PALETTE.shades;
}
export function requireShade(id) {
    const found = catalogue().find((row) => row.id === id);
    if (!found)
        throw RangeError("Unknown in-house colour swatch.");
    return found;
}
export function checkedLab(lab) {
    if (lab.length !== 3 || ![lab[0], lab[1], lab[2]].every(Number.isFinite) ||
        lab[0] < 0 || lab[0] > 100 || Math.abs(lab[1]) > 128 || Math.abs(lab[2]) > 128) {
        throw RangeError("Lab reading outside supported range.");
    }
    return [lab[0], lab[1], lab[2]];
}
export function measuredLevel(lab) {
    const sample = checkedLab(lab);
    const naturals = catalogue().filter((shade) => shade.family === "natural" && shade.undertone === "neutral");
    naturals.sort((a, b) => ciede2000(sample, a.lab) - ciede2000(sample, b.lab) || a.id.localeCompare(b.id));
    return naturals[0].level;
}
export function suggest(lab, options = {}) {
    const sample = checkedLab(lab);
    const depth = measuredLevel(sample);
    const { undertone, family, allowLightening = false, count = 3 } = options;
    if (undertone !== undefined && !UNDERTONES.has(undertone))
        throw RangeError("Unknown undertone.");
    if (family !== undefined && !FAMILIES.has(family))
        throw RangeError("Unknown family.");
    if (!Number.isInteger(count) || count < 1 || count > 20)
        throw RangeError("Invalid suggestion count.");
    return catalogue().filter((shade) => (undertone === undefined || shade.undertone === undertone) &&
        (family === undefined || shade.family === family) && (allowLightening || shade.level <= depth))
        .sort((a, b) => ciede2000(sample, a.lab) - ciede2000(sample, b.lab) || a.id.localeCompare(b.id))
        .slice(0, count).map((shade) => ({ shade, delta_e00: ciede2000(sample, shade.lab),
        measured_level: depth, no_auto_lightening: !allowLightening }));
}
