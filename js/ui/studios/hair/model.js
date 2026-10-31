/** Offline Hair Studio catalogue, selectors and provenance: *not* provider output.
 * A browser never fetches the catalogue or adds a new synthetic template ID to a
 * live request. R11 may activate only IDs from a genuinely reviewed S1 manifest.
 * Clean-room UI metadata; no reused third-party thumbnails or filter names.
 * Author: John Khan.
 */
import { HAIR_DATA } from "./generated/catalogue.js";
export const HAIR_GROUPS = HAIR_DATA.groups;
export const HAIR_STYLES = HAIR_DATA.styles;
export const HAIR_CATALOGUE_FORMAT = HAIR_DATA.format;
export const DEFAULT_HAIR_STRENGTH = 30;
export const HAIR_TEXTURES = ["straight", "wavy", "curly", "coily"];
export const HAIR_LENGTHS = ["short", "medium", "long"];
export const HAIR_GRID_SIZES = [4, 9];
export const DEFAULT_QUERY = {
    group: "all", texture: "all", length: "all", term: "", source: "all", favouritesOnly: false,
};
export function styleById(id) {
    return HAIR_STYLES.find((row) => row.id === id) ?? null;
}
export function clampStrength(raw) {
    if (!Number.isFinite(raw))
        throw new RangeError("Hair strength must be finite");
    return Math.max(0, Math.min(100, Math.round(raw)));
}
export function defaultSelection(styleId = "tpl-bob") {
    if (!styleById(styleId))
        throw new RangeError("Choose a known hair style");
    return { styleId, strength: DEFAULT_HAIR_STRENGTH,
        adjuncts: { bangs: 0, curl: 0, extension: 0, volume: 0 },
        keepColour: true, variantCount: 4, reference: null, referenceRights: false };
}
/** Every catalogue row is either a synthetic S1 item or an authored inspiration.
 * Deliberately no ``canApplyLive`` source flag: it must come from a separate real
 * S1 manifest after the operator verifies actual provider availability.
 */
export function liveTemplateId(styleId, verifiedIds) {
    const item = styleById(styleId);
    if (!item || item.source !== "synthetic-s1" || !item.template_id)
        return null;
    return verifiedIds.has(item.template_id) ? item.template_id : null;
}
export function sourceLabel(row) {
    return row.source === "synthetic-s1"
        ? "S1 synthetic catalogue — live template unverified"
        : "Cut idea only — no YouCam template or rendered result";
}
export function filteredStyles(query, favourites = new Set()) {
    const term = query.term.trim().toLocaleLowerCase();
    if (term.length > 80)
        throw new RangeError("Hair search may be at most 80 characters");
    return HAIR_STYLES.filter((row) => {
        if (query.group !== "all" && row.group !== query.group)
            return false;
        if (query.texture !== "all" && !row.textures.includes(query.texture))
            return false;
        if (query.length !== "all" && !row.lengths.includes(query.length))
            return false;
        if (query.source !== "all" && row.source !== query.source)
            return false;
        if (query.favouritesOnly && !favourites.has(row.id))
            return false;
        return !term || `${row.name} ${row.description} ${row.tags.join(" ")}`.toLocaleLowerCase().includes(term);
    });
}
export function groupedStyles(query, favourites = new Set()) {
    const rows = filteredStyles(query, favourites);
    return HAIR_GROUPS.map((group) => ({ group, items: rows.filter((row) => row.group === group.id) }))
        .filter(({ items }) => items.length > 0);
}
export function catalogueSummary() {
    return { total: HAIR_STYLES.length,
        s1Synthetic: HAIR_STYLES.filter((row) => row.source === "synthetic-s1").length,
        concepts: HAIR_STYLES.filter((row) => row.source === "inspiration").length,
        verifiedLive: 0,
        shortSides: HAIR_STYLES.filter((row) => row.group === "short-sides").length,
        shortStyles: HAIR_STYLES.filter((row) => row.lengths.includes("short")).length };
}
export function groupCounts() {
    return HAIR_GROUPS.map((row) => ({ name: row.id, title: row.title,
        count: HAIR_STYLES.filter((item) => item.group === row.id).length, description: row.detail }));
}
/** A user-facing recommendation is based on cut goals, not measured attractiveness.
 * Favourites and equal access mean a cut is never restricted to a gender.
 */
export function recommendedStyles(preferences, limit = 6) {
    const rows = HAIR_STYLES.map((style) => {
        let score = 0;
        if (preferences.length !== "any" && style.lengths.includes(preferences.length))
            score += 5;
        if (preferences.texture !== "any" && style.textures.includes(preferences.texture))
            score += 5;
        if (preferences.shortSides && style.group === "short-sides")
            score += 6;
        if (preferences.occasion && style.group === "formal")
            score += 6;
        if (style.source === "synthetic-s1")
            score += 1; // narrower claim, not better visual quality
        return { style, score };
    });
    rows.sort((a, b) => b.score - a.score || a.style.name.localeCompare(b.style.name));
    return rows.slice(0, Math.max(0, Math.min(20, Math.trunc(limit)))).map((x) => x.style);
}
export function guardCatalogue() {
    const issues = [], ids = new Set();
    if (HAIR_CATALOGUE_FORMAT !== "beljour-hair-catalogue/1")
        issues.push("Version mismatch");
    for (const style of HAIR_STYLES) {
        if (ids.has(style.id))
            issues.push(`Duplicate id ${style.id}`);
        ids.add(style.id);
        if (!HAIR_GROUPS.some((g) => g.id === style.group))
            issues.push(`Unknown group: ${style.id}`);
        if (style.source === "inspiration" && style.template_id !== null)
            issues.push(`Unverified provider id ${style.id}`);
        if (style.source === "synthetic-s1" && String(style.template_id) !== String(style.id))
            issues.push("Bad S1 link");
        if (!String(style.name).trim() || !String(style.description).trim())
            issues.push("Empty copy");
    }
    return issues;
}
