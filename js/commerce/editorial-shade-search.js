/** Editorial Shade Book search over the 90 original hair swatches; local, no photographs.
 * - Folios are numbered 1..N in source order (no manufacturer codes).
 * - Text search is multi-term: every term must prefix-match a word of the name, id,
 *   family or undertone. Results keep folio order, so pages are stable.
 * - Family and undertone facets are independent: each counts the matches of every
 *   other filter, ignoring its own, so choosing one never hides the other's options.
 * - Numeric Lab search keeps shades within a CIEDE2000 limit (default the committed 6.0)
 *   and orders them nearest first, ties by folio.
 * - Building the index refuses duplicate ids, names or folios.
 * Digital swatches only, not dye products. Author: John Khan.
 */
import { ciede2000 } from "../engines/core/colour.js";
import { catalogue, checkedLab } from "../engines/hair_palette/palette.js";
import { SHADE_DATA } from "../engines/shade/generated/data.js";
export const PAGE_SIZE = 12;
export const MAX_QUERY_LENGTH = 100;
const words = (text) => text.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 0);
/** Index the book in source order; throws RangeError on duplicate ids, names or folios. */
export function buildShadeIndex(shades = catalogue(), folios) {
    const numbers = folios ?? shades.map((_, i) => i + 1);
    if (numbers.length !== shades.length)
        throw new RangeError("Every swatch needs one folio number");
    for (const [label, values] of [["id", shades.map((s) => s.id)], ["name", shades.map((s) => s.name.toLowerCase())],
        ["folio", numbers.map(String)]]) {
        if (new Set(values).size !== values.length)
            throw new RangeError(`Duplicate shade ${label} in the book`);
    }
    const entries = shades.map((s, i) => Object.freeze({
        folio: numbers[i], id: s.id, name: s.name, family: s.family, undertone: s.undertone, level: s.level,
        lab: s.lab, lch: s.lch,
        terms: Object.freeze([...new Set([...words(s.name), ...words(s.id), s.family, s.undertone])]),
    }));
    entries.sort((a, b) => a.folio - b.folio);
    return Object.freeze({ entries: Object.freeze(entries),
        families: Object.freeze([...new Set(shades.map((s) => s.family))].sort()),
        undertones: Object.freeze([...new Set(shades.map((s) => s.undertone))].sort()) });
}
function count(entries, key, names) {
    const out = {};
    for (const name of names)
        out[name] = 0;
    for (const e of entries)
        out[e[key]] += 1;
    return Object.freeze(out);
}
/** One page of matches with independent family and undertone facet counts. */
export function searchShades(index, query = {}) {
    const { text = "", family, undertone, lab, page = 1 } = query;
    if (typeof text !== "string" || text.length > MAX_QUERY_LENGTH)
        throw new RangeError("Search text must be at most 100 characters");
    if (family !== undefined && !index.families.includes(family))
        throw new RangeError("Unknown colour family");
    if (undertone !== undefined && !index.undertones.includes(undertone))
        throw new RangeError("Unknown undertone");
    if (!Number.isInteger(page) || page < 1)
        throw new RangeError("Page must be a positive integer");
    const limit = query.maxDeltaE ?? SHADE_DATA.thresholds.confidence.refuse_delta_e_above;
    if (!(typeof limit === "number" && limit > 0 && limit <= 100))
        throw new RangeError("Lab search limit must be in (0, 100]");
    const target = lab === undefined ? null : checkedLab(lab);
    const terms = words(text);
    const distance = new Map();
    const base = index.entries.filter((e) => {
        if (!terms.every((t) => e.terms.some((w) => w.startsWith(t))))
            return false;
        if (target === null)
            return true;
        const d = ciede2000(target, e.lab);
        distance.set(e.id, d);
        return d <= limit;
    });
    const matches = base.filter((e) => (family === undefined || e.family === family) &&
        (undertone === undefined || e.undertone === undertone));
    if (target !== null)
        matches.sort((a, b) => distance.get(a.id) - distance.get(b.id) || a.folio - b.folio);
    const pages = Math.ceil(matches.length / PAGE_SIZE);
    if (page > Math.max(1, pages))
        throw new RangeError("Page is past the last page of results");
    const hits = matches.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
        .map((e) => Object.freeze({ ...e, delta_e: target === null ? null : distance.get(e.id) }));
    return Object.freeze({
        total: matches.length, page, pages, hits: Object.freeze(hits),
        facets: Object.freeze({
            family: count(base.filter((e) => undertone === undefined || e.undertone === undertone), "family", index.families),
            undertone: count(base.filter((e) => family === undefined || e.family === family), "undertone", index.undertones),
        }),
    });
}
//# sourceMappingURL=editorial-shade-search.js.map