/** Read-only shade catalogues shared by the browser shade, commerce and readiness modules.
 * Mirrors api/plumb_api/engines/shade/loaders.py:
 *   "base"      the 80 historical W6 skin references (generated SHADE_DATA.shades);
 *   "reference" base plus the 16 very deep anchors (deep-reference.ts), 96 in all;
 *   "hair"      the 90 in-house hair-colour swatches (hair_palette catalogue()).
 * Every value is an ASSUMED engineering estimate, not tested against real products.
 * Records and catalogues are frozen and built once. Author: John Khan.
 */
import { catalogue as hairCatalogue, checkedLab as paletteCheckedLab } from "../hair_palette/palette.js";
import { DEEP_REFERENCE } from "./deep-reference.js";
import { SHADE_DATA } from "./generated/data.js";
/** The hair palette's Lab check (three finite numbers, L* 0..100, |a*|, |b*| <= 128); anything
 * without a numeric length (null, a bare number) is refused with RangeError as well. */
export function checkedLab(lab) {
    if (lab === null || lab === undefined || typeof lab.length !== "number") {
        throw new RangeError("Lab needs three numeric coordinates");
    }
    return paletteCheckedLab(lab);
}
export const KINDS = Object.freeze(["reference", "base", "hair"]);
export const NOTE = "ASSUMED in-house estimate. Not tested against real products.";
export const SOURCES = Object.freeze({
    base: "engines/shade/reference_shades.json",
    reference: "engines/shade/reference_shades.json+engines/shade/deep_reference_shades.json",
    hair: "engines/hair_palette/catalogue.json",
});
const SKIN_UNDERTONES = new Set(["cool", "neutral", "warm", "olive"]);
function freezeRecord(record) {
    Object.freeze(record.lab);
    return Object.freeze(record);
}
function skin(row) {
    const { depth, step, undertone } = row;
    if (!Number.isInteger(depth) || depth < 1 || depth > 10 ||
        !Number.isInteger(step) || step < 1) {
        throw new RangeError(`shade ${row.id}: depth must be 1..10 and step a positive integer`);
    }
    if (undertone === undefined || !SKIN_UNDERTONES.has(undertone)) {
        throw new RangeError(`shade ${row.id}: unknown undertone`);
    }
    return freezeRecord({ id: row.id, name: row.name, surface: "skin", lab: checkedLab(row.lab), undertone,
        level: depth, step: step, family: null, assumed: true });
}
let skinRecords = null;
const built = new Map();
function skinTable() {
    if (skinRecords === null) {
        const rows = [...SHADE_DATA.shades, ...DEEP_REFERENCE];
        const records = rows.map(skin);
        if (new Set(records.map((r) => r.id)).size !== records.length) {
            throw new RangeError("a skin reference id is listed twice");
        }
        skinRecords = Object.freeze(records);
    }
    return skinRecords;
}
function build(kind) {
    if (kind === "hair") {
        return Object.freeze(hairCatalogue().map((row) => freezeRecord({ id: row.id, name: row.name,
            surface: "hair", lab: [row.lab[0], row.lab[1], row.lab[2]], undertone: row.undertone, level: row.level,
            step: null, family: row.family, assumed: true })));
    }
    const all = skinTable();
    return kind === "base" ? Object.freeze(all.slice(0, SHADE_DATA.shades.length)) : all;
}
/** The named catalogue; throws RangeError for an unknown kind. */
export function loadShadeCatalogue(kind = "reference") {
    if (!KINDS.includes(kind))
        throw new RangeError("Unknown shade catalogue kind");
    let found = built.get(kind);
    if (found === undefined) {
        const records = build(kind);
        found = Object.freeze({ kind, records, count: records.length, source: SOURCES[kind], note: NOTE });
        built.set(kind, found);
    }
    return found;
}
export function loadShades(kind = "reference") {
    return loadShadeCatalogue(kind).records;
}
/** The 96 skin references the W6 reader matches against. */
export function loadReferenceShades() { return loadShades("reference"); }
/** The 80 historical skin references. */
export function loadBaseShades() { return loadShades("base"); }
/** The 90 in-house hair-colour swatches. */
export function loadHairShades() { return loadShades("hair"); }
/** Look a swatch up by id in one catalogue, or in skin references then hair when kind is omitted. */
export function shadeById(id, kind) {
    if (typeof id !== "string" || id === "")
        throw new RangeError("Shade id must be a non-empty string");
    for (const name of kind === undefined ? ["reference", "hair"] : [kind]) {
        const found = loadShades(name).find((row) => row.id === id);
        if (found !== undefined)
            return found;
    }
    throw new RangeError("Unknown shade id");
}
//# sourceMappingURL=loaders.js.map