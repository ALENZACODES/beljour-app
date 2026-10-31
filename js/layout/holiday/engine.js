import { isRegion, occasion, occasions, upcoming } from "./calendar.js";
export const PREFS_KEY = "beljour.holiday-prefs";
export const TAGS_KEY = "beljour.look-occasions";
export const PREFS_FORMAT = "beljour-holiday-prefs/1";
export const WINDOW_DAYS = 45; // the seasonal calendar's own suggestion window
export const SHOWN = 3; // occasions shown at once on Home; ASSUMED
/** ASSUMED, pending the curated holiday catalogue's own kind field: anything not plainly secular
 * is treated as cultural or religious, so it is shown only when she chooses it. */
export const KINDS = Object.freeze({
    halloween: "secular", new_year: "secular", thanksgiving: "secular", kwanzaa: "cultural",
    christmas: "religious", easter: "religious", hanukkah: "religious", eid_al_fitr: "religious",
    eid_al_adha: "religious", diwali: "religious", holi: "religious", vaisakhi: "religious",
    gurpurab: "religious", bandi_chhor_divas: "religious",
});
/** One existing look per occasion, chosen for the light of the day only (no symbols, no claim
 * about what the day means). Names are checked against the catalogues by the tests. ASSUMED. */
export const OCCASION_LOOKS = Object.freeze({
    halloween: { studio: "filters", id: "C23", name: "Toulouse", reason: "A moody evening grade.", needsFace: false },
    new_year: { studio: "portrait", id: "PL13", name: "Vence", reason: "An evening look with fine glints.", needsFace: true },
    thanksgiving: { studio: "filters", id: "C30", name: "Périgord", reason: "Warm autumn light.", needsFace: false },
    christmas: { studio: "filters", id: "C40", name: "Uzès", reason: "Warm indoor evening light.", needsFace: false },
    easter: { studio: "filters", id: "C09", name: "Provence", reason: "Soft spring daylight.", needsFace: false },
    kwanzaa: { studio: "filters", id: "C50", name: "Arcachon", reason: "Warm, low-contrast evening light.", needsFace: false },
    hanukkah: { studio: "filters", id: "C107", name: "Croissy", reason: "Soft, warm indoor light.", needsFace: false },
    eid_al_fitr: { studio: "portrait", id: "PL08", name: "Mougins", reason: "Golden warmth with gentle polish.", needsFace: true },
    eid_al_adha: { studio: "portrait", id: "PL02", name: "Amboise", reason: "A classic, gentle portrait.", needsFace: true },
    diwali: { studio: "filters", id: "C02", name: "Biarritz", reason: "Rich warm colour for evening light.", needsFace: false },
    holi: { studio: "filters", id: "C26", name: "Colmar", reason: "Lively daytime colour.", needsFace: false },
    vaisakhi: { studio: "filters", id: "C14", name: "Lyon", reason: "Gentle spring warmth.", needsFace: false },
    gurpurab: { studio: "filters", id: "C55", name: "Bréhat", reason: "Soft, neutral light.", needsFace: false },
    bandi_chhor_divas: { studio: "filters", id: "C33", name: "Royan", reason: "Warm evening colour.", needsFace: false },
});
export class HolidayError extends Error {
}
export function kindOf(id) {
    return KINDS[id] ?? "religious";
}
export function defaultPrefs() {
    return { format: PREFS_FORMAT, region: "CA", follow: occasions().filter((o) => kindOf(o.id) === "secular").map((o) => o.id), variants: {} };
}
function knownOccasion(id) {
    const info = typeof id === "string" ? occasion(id) : null;
    if (!info)
        throw new HolidayError("An occasion this app doesn't have");
    return info;
}
export function validatePrefs(raw) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw))
        throw new HolidayError("Holiday settings are damaged");
    const p = raw;
    if (p.format !== PREFS_FORMAT)
        throw new HolidayError("Holiday settings are from another version");
    if (!isRegion(p.region))
        throw new HolidayError("Pick a region");
    if (!Array.isArray(p.follow) || p.follow.length > occasions().length)
        throw new HolidayError("Holiday settings are damaged");
    const follow = [...new Set(p.follow.map((id) => knownOccasion(id).id))];
    if (typeof p.variants !== "object" || p.variants === null || Array.isArray(p.variants))
        throw new HolidayError("Holiday settings are damaged");
    const variants = {};
    for (const [id, value] of Object.entries(p.variants)) {
        const info = knownOccasion(id);
        if (typeof value !== "string" || !info.variants.includes(value))
            throw new HolidayError(`${info.name} has no such date choice`);
        variants[id] = value;
    }
    return { format: PREFS_FORMAT, region: p.region, follow, variants };
}
/** Her holiday choices, kept in this browser only. */
export class HolidayPrefsStore {
    store;
    current;
    constructor(store) {
        this.store = store;
        this.current = this.read();
    }
    read() {
        try {
            const raw = this.store?.getItem(PREFS_KEY);
            return raw ? validatePrefs(JSON.parse(raw)) : defaultPrefs();
        }
        catch {
            return defaultPrefs();
        }
    }
    write() {
        try {
            this.store?.setItem(PREFS_KEY, JSON.stringify(this.current));
        }
        catch { /* kept for this visit */ }
    }
    get() { return validatePrefs(JSON.parse(JSON.stringify(this.current))); }
    setRegion(region) {
        if (!isRegion(region))
            throw new HolidayError("Pick a region");
        this.current = { ...this.current, region };
        this.write();
        return this.get();
    }
    /** Show or hide an occasion; only ever called from her own tick or untick. */
    follow(id, on) {
        const info = knownOccasion(id);
        const rest = this.current.follow.filter((x) => x !== info.id);
        this.current = { ...this.current, follow: on ? [...rest, info.id] : rest };
        this.write();
        return this.get();
    }
    setVariant(id, variant) {
        const info = knownOccasion(id);
        this.current = validatePrefs({ ...this.current, variants: { ...this.current.variants, [info.id]: variant } });
        this.write();
        return this.get();
    }
    reset() {
        this.current = defaultPrefs();
        try {
            this.store?.removeItem(PREFS_KEY);
        }
        catch { /* nothing stored */ }
        return this.get();
    }
}
const LOOK_ID = /^look-[0-9a-f]{8}$/;
/** Which saved look she keeps for which occasion (look id -> occasion id), in this browser only. */
export class OccasionTags {
    store;
    tags;
    constructor(store) {
        this.store = store;
        this.tags = this.read();
    }
    read() {
        try {
            const raw = JSON.parse(this.store?.getItem(TAGS_KEY) ?? "{}");
            if (typeof raw !== "object" || raw === null || Array.isArray(raw))
                return {};
            return Object.fromEntries(Object.entries(raw)
                .filter(([id, o]) => LOOK_ID.test(id) && typeof o === "string" && occasion(o) !== null));
        }
        catch {
            return {};
        }
    }
    write() {
        try {
            this.store?.setItem(TAGS_KEY, JSON.stringify(this.tags));
        }
        catch { /* kept for this visit */ }
    }
    of(lookId) { return this.tags[lookId] ?? null; }
    tag(lookId, occasionId) {
        if (!LOOK_ID.test(lookId))
            throw new HolidayError("That look id is damaged");
        this.tags = { ...this.tags, [lookId]: knownOccasion(occasionId).id };
        this.write();
    }
    untag(lookId) {
        const { [lookId]: _gone, ...rest } = this.tags;
        this.tags = rest;
        this.write();
    }
    /** Drop tags whose look she has since removed; returns how many went. */
    prune(looks) {
        const ids = new Set(looks.map((l) => l.id));
        const before = Object.keys(this.tags).length;
        this.tags = Object.fromEntries(Object.entries(this.tags).filter(([id]) => ids.has(id)));
        if (Object.keys(this.tags).length !== before)
            this.write();
        return before - Object.keys(this.tags).length;
    }
    /** Her looks kept for an occasion, newest first. */
    looksFor(occasionId, looks) {
        return looks.filter((l) => this.tags[l.id] === occasionId).sort((a, b) => b.created.localeCompare(a.created));
    }
}
const TRY = /^try=(filters|portrait):([A-Z]{1,2}\d{1,3})$/;
/** The studio hash that adds one built look as a layer: try=filters:C40, try=portrait:PL13. */
export function tryHash(studio, id) {
    const hash = `try=${studio}:${id}`;
    if (!TRY.test(hash))
        throw new HolidayError("That look id is damaged");
    return hash;
}
export function parseTry(value) {
    const m = TRY.exec(value);
    return m ? { studio: m[1], id: m[2] } : null;
}
export function suggestionFor(occasionId, looks, tags) {
    const own = tags.looksFor(occasionId, looks)[0];
    if (own)
        return { source: "saved", lookId: own.id, name: own.name, reason: "Your own look for this day.", hash: `look=${own.id}` };
    const built = OCCASION_LOOKS[occasionId];
    if (!built)
        throw new HolidayError(`No look is set for ${occasionId}`);
    return { source: "built-in", studio: built.studio, id: built.id, name: built.name, reason: built.reason,
        needsFace: built.needsFace, hash: tryHash(built.studio, built.id) };
}
/** What's coming up for her: the occasions she follows, soonest first, each with a look. */
export function comingUp(today, prefs, looks, tags, limit = SHOWN) {
    const p = validatePrefs(prefs);
    return upcoming(today, p.region, p.follow, WINDOW_DAYS, p.variants).slice(0, limit).map((u) => ({
        ...u, kind: kindOf(u.occurrence.occasion),
        dateNote: u.occurrence.verified ? "" : "This date comes from a table that hasn't been checked yet; it can differ where you are.",
        suggestion: suggestionFor(u.occurrence.occasion, looks, tags)
    }));
}
