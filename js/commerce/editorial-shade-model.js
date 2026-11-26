/** Editorial Shade Book data and browsing state for the 90 original hair swatches.
 * Mirrors api/plumb_api/engines/hair_palette/editorial.py and is checked against
 * parity/editorial-shade-book-r33f.json: the same folio numbers (catalogue order),
 * authored names, exact source Lab/LCh labels, undertone and movement notes and
 * integer RGB/glint/shadow presentation colours. Folio numbers are presentation order,
 * not a manufacturer's code; movement and shine are artistic, not measured; choosing a
 * folio applies no edit. Author: John Khan.
 */
import { catalogue } from "../engines/hair_palette/index.js";
export const PAGE_SIZE = 12;
export const NOTE = "Digital in-house swatches with artistic movement and shine; not physical dye products " +
    "or measured hair motion. Choosing a folio applies no edit.";
const LEVEL_WORDS = ["", "Ink", "Espresso", "Cocoa", "Walnut", "Chestnut", "Toffee", "Honey", "Wheat", "Linen", "Pearl"];
export const FAMILY_WORDS = {
    natural: "Natural", ash: "Ash", golden: "Gilt", copper: "Copper", red: "Garnet", violet: "Plum",
    mahogany: "Mahogany", fashion: "Prism", grey: "Slate", silver: "Silver", white: "Frost",
};
export const UNDERTONE_NOTES = {
    warm: "Warm: reads golden to copper beside the skin.",
    neutral: "Neutral: neither golden nor ashy on screen.",
    cool: "Cool: reads ashy to blue-violet beside the skin.",
};
const FAMILY_MOVEMENT = {
    natural: ["a soft bend", 4], ash: ["a cool, even fall", 3], golden: ["a lifted wave", 6],
    copper: ["a loose spiral", 7], red: ["a swept wave", 6], violet: ["a ribboned wave", 5],
    mahogany: ["a deep S-wave", 5], fashion: ["a ribboned curl", 8], grey: ["a straight fall", 2],
    silver: ["a glassy fall", 2], white: ["an airy wisp", 3],
};
const GLINT_SHARE = 35;
const SHADOW_SHARE = 62;
/** Exactly four decimals from the integer ten-thousandths, as the Python labels. */
export function fixed4(value) {
    const scaled = Math.round(value * 10000);
    const whole = Math.floor(Math.abs(scaled) / 10000), part = Math.abs(scaled) % 10000;
    return `${scaled < 0 ? "-" : ""}${whole}.${String(part).padStart(4, "0")}`;
}
const hex = (rgb) => "#" + rgb.map((c) => c.toString(16).padStart(2, "0")).join("");
export const glint = (rgb) => rgb.map((c) => c + Math.floor(((255 - c) * GLINT_SHARE + 50) / 100));
export const shadow = (rgb) => rgb.map((c) => Math.floor((c * SHADOW_SHARE + 50) / 100));
const depth = (level) => level <= 3 ? "Deep" : level <= 6 ? "Mid" : "Light";
export function displayName(shade) {
    if (shade.family === "fashion")
        return `${shade.name.split(" ")[0]} ${FAMILY_WORDS.fashion}`;
    const name = `${LEVEL_WORDS[shade.level]} ${FAMILY_WORDS[shade.family]}`;
    return ["-n", "-w", "-c"].includes(shade.id.slice(-2)) ? `${name}, ${shade.undertone}` : name;
}
function folioOf(number, shade) {
    const [L, a, b] = shade.lab;
    const [lchL, chroma, hue] = shade.lch;
    const [phrase, wave] = FAMILY_MOVEMENT[shade.family];
    return Object.freeze({
        number, code: `No. ${String(number).padStart(2, "0")}`, shade_id: shade.id, name: displayName(shade),
        source_name: shade.name, family: shade.family, undertone: shade.undertone, level: shade.level,
        lab_label: `L* ${fixed4(L)} · a* ${fixed4(a)} · b* ${fixed4(b)}`,
        lch_label: `L ${fixed4(lchL)} · C ${fixed4(chroma)} · h ${fixed4(hue)}°`,
        undertone_note: UNDERTONE_NOTES[shade.undertone],
        movement_note: `${depth(shade.level)} ${FAMILY_WORDS[shade.family].toLowerCase()}, level ${shade.level}, ` +
            `drawn with ${phrase}.`,
        wave, shine: 30 + 4 * shade.level, rgb: hex(shade.rgb), glint: hex(glint(shade.rgb)),
        shadow: hex(shadow(shade.rgb)),
    });
}
let built = null;
/** All folios in catalogue order, numbered from 1; names and shades are unique. */
export function editorialFolios() {
    if (built === null) {
        const rows = catalogue().map((shade, index) => folioOf(index + 1, shade));
        if (new Set(rows.map((r) => r.name)).size !== rows.length || new Set(rows.map((r) => r.shade_id)).size !== rows.length) {
            throw new RangeError("editorial folios need unique names and shades");
        }
        built = Object.freeze(rows);
    }
    return built;
}
export function folioByNumber(number) {
    const rows = editorialFolios();
    if (!Number.isInteger(number) || number < 1 || number > rows.length)
        throw new RangeError("unknown folio number");
    return rows[number - 1];
}
const searchText = (f) => [f.code, f.name, f.source_name, f.shade_id, f.family, f.undertone,
    f.movement_note].join(" ").toLowerCase();
/** Family and undertone facets plus a case-insensitive text search, in folio order. */
export function filterFolios(filter = {}, rows = editorialFolios()) {
    const { family = null, undertone = null, query = "" } = filter;
    if (family !== null && !(family in FAMILY_WORDS))
        throw new RangeError("unknown hair family");
    if (undertone !== null && !(undertone in UNDERTONE_NOTES))
        throw new RangeError("unknown undertone");
    if (typeof query !== "string" || query.length > 80)
        throw new RangeError("search text must be at most 80 characters");
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => (family === null || row.family === family) &&
        (undertone === null || row.undertone === undertone) && (!needle || searchText(row).includes(needle)));
}
/** One page of at most PAGE_SIZE folios; the page number is clamped to the range. */
export function pageOf(rows, number = 1) {
    const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    const page = Math.min(Math.max(1, Math.trunc(number)), pages);
    return { page, pages, total: rows.length, folios: rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) };
}
/** Browsing state: facets, search, page and the chosen folio. Pure, no DOM. */
export class EditorialShadeBookModel {
    filter = { family: null, undertone: null, query: "" };
    current = 1;
    chosen = null;
    get family() { return this.filter.family; }
    get undertone() { return this.filter.undertone; }
    get query() { return this.filter.query; }
    get selected() { return this.chosen === null ? null : folioByNumber(this.chosen); }
    matches() { return filterFolios(this.filter); }
    view() { return pageOf(this.matches(), this.current); }
    setFilter(change) {
        const next = { ...this.filter, ...change };
        filterFolios(next, []);
        this.filter = next;
        this.current = 1;
        return this.view();
    }
    goTo(page) {
        this.current = pageOf(this.matches(), page).page;
        return this.view();
    }
    next() { return this.goTo(this.current + 1); }
    previous() { return this.goTo(this.current - 1); }
    select(number) {
        const folio = folioByNumber(number);
        this.chosen = folio.number;
        return folio;
    }
    clearSelection() { this.chosen = null; }
}
//# sourceMappingURL=editorial-shade-model.js.map