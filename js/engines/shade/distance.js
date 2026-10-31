/** Checked CIEDE2000 distances and no-lightening shade ranking over the shared catalogues.
 * Mirrors api/plumb_api/engines/shade/distance.py. delta_e() is the canonical ciede2000 of
 * engines/core/colour.ts (Sharma, Wu and Dalal 2005) behind checkedLab(): a bad, nonfinite
 * or out-of-range Lab triple throws RangeError instead of being clipped or coerced.
 * Never-lighter rules are unchanged: skin swatches at most never_lighter_allowance L*
 * (thresholds.json, 1.0) lighter than the reading, as in matchShades(); hair swatches no
 * level above the measured hair level, as in hair_palette suggest(). allowLighter lifts the
 * rule and must be an explicit user choice. Ties break by id (code-point order).
 * Matches are in-house colour estimates, not physical product matches. Author: John Khan.
 */
import { ciede2000 } from "../core/colour.js";
import { measuredLevel } from "../hair_palette/palette.js";
import { SHADE_DATA } from "./generated/data.js";
import { checkedLab, loadShades } from "./loaders.js";
export const MATCH_NOTE = "In-house colour estimate. Not a physical product match.";
/** CIEDE2000 between two checked Lab (D65) triples. */
export function delta_e(first, second) {
    return ciede2000(checkedLab(first), checkedLab(second));
}
export const deltaE = delta_e;
/** delta_e() for each [first, second] pair, in order; any bad pair refuses the whole call. */
export function deltaEPairs(pairs) {
    const out = [];
    for (const pair of pairs) {
        if (pair.length !== 2)
            throw new RangeError("Each pair needs exactly two Lab triples");
        out.push(delta_e(pair[0], pair[1]));
    }
    return out;
}
/** CIEDE2000 from a reading to one catalogue swatch. */
export function distanceToShade(lab, shade) {
    return delta_e(lab, shade.lab);
}
function records(shades) {
    if (typeof shades === "string")
        return loadShades(shades);
    if (!Array.isArray(shades) || shades.length === 0) {
        throw new RangeError("Expected a catalogue kind or a non-empty list of shade records");
    }
    if (new Set(shades.map((row) => row.id)).size !== shades.length) {
        throw new RangeError("Shade records must have unique ids");
    }
    return shades;
}
/** Swatches nearest first by CIEDE2000, never lighter than the rules above unless allowed.
 * An empty result means nothing is deep enough; callers should refuse, not lighten. */
export function rankShades(lab, shades = "reference", options = {}) {
    const { allowLighter = false, limit } = options;
    if (typeof allowLighter !== "boolean")
        throw new RangeError("allowLighter must be a boolean");
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
        throw new RangeError("limit must be a positive integer");
    }
    const reading = checkedLab(lab);
    const rows = records(shades);
    const allowance = SHADE_DATA.thresholds.never_lighter_allowance;
    const hairLevel = rows.some((row) => row.surface === "hair") ? measuredLevel(reading) : null;
    const out = [];
    for (const row of rows) {
        const lighterBy = row.lab[0] - reading[0];
        const level = row.surface === "hair" ? hairLevel : null;
        const tooLight = level !== null ? row.level > level : lighterBy > allowance;
        if (tooLight && !allowLighter)
            continue;
        out.push(Object.freeze({ record: row, delta_e: ciede2000(reading, row.lab), lighter_by: lighterBy,
            measured_level: level }));
    }
    out.sort((a, b) => a.delta_e - b.delta_e || (a.record.id < b.record.id ? -1 : a.record.id > b.record.id ? 1 : 0));
    return Object.freeze(limit === undefined ? out : out.slice(0, limit));
}
/** The first rankShades() match, or null when no swatch passes the never-lighter rule. */
export function nearestShade(lab, shades = "reference", options = {}) {
    return rankShades(lab, shades, { ...options, limit: 1 })[0] ?? null;
}
