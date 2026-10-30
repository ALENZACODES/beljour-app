/** "What's new in beauty": the reader and checker for the unbranded feed in
 * web/data/beauty-news.json (copied to dist/data/ by the build).
 *
 * The page shows the feed only after validateFeed accepts all of it: the format and version,
 * every entry's fields, a title from the reviewed allow-list (terms.ts), concerns and channels
 * from fixed lists, a date, at least one source on a non-commercial host that was read beyond
 * its title, and no promise words anywhere. The brand check runs in the tests
 * (web/test/news-feed.test.mjs) against the hashed deny-list, with normaliseWords below.
 * Cosmetic information, not medical advice. Author: John Khan.
 */
import { PRODUCT_TYPES } from "../screens/skin-moment-products.js";
import { BANNED_WORDS, CHANNELS, SOURCE_HOSTS, SOURCE_KINDS, SOURCE_READ, TITLES } from "./terms.js";
export const FEED_FORMAT = "beljour-beauty-news/1";
export const FEED_VERSION = 1;
export const FEED_PATH = "data/beauty-news.json";
export const NOT_MEDICAL = "Not medical advice. Cosmetic information about ingredients and product types, written by us from the sources listed; no brand pays to appear.";
export const CONCERNS = [
    ["redness", "Redness"], ["breakouts", "Breakouts"], ["dryness", "Dryness"],
    ["dark-spots", "Dark spots"], ["texture", "Texture"], ["ageing", "Ageing"],
];
const CONCERN_IDS = new Set(CONCERNS.map(([id]) => id));
export const KINDS = ["ingredient", "product type", "rule change"];
export const EVIDENCE = {
    "well-studied": "Well studied",
    "some-trials": "Some trials",
    "early": "Early evidence",
    "rule-change": "Rule change",
};
export class NewsFeedError extends Error {
    where;
    constructor(where, message) {
        super(`${where}: ${message}`);
        this.where = where;
        this.name = "NewsFeedError";
    }
}
const TEXT_MAX = 600;
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ENTRY_KEYS = new Set(["id", "title", "aka", "kind", "what", "does", "evidence", "concerns", "suits", "careful", "found",
    "picture", "picture_alt", "try", "trial", "added", "sources"]);
const SOURCE_KEYS = new Set(["title", "publisher", "year", "kind", "read", "url"]);
/** A real calendar date written YYYY-MM-DD. */
export function isDate(value) {
    if (typeof value !== "string" || !DATE.test(value))
        return false;
    const d = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
/** Lower-case words with accents dropped and punctuation as spaces: the deny-list's form
 * (scripts/build_news_denylist.py normalise). */
export function normaliseWords(text) {
    const plain = text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
    return plain.replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
}
/** Every 1 to `most` word run of a text, normalised, for the hashed brand check. */
export function wordRuns(text, most = 4) {
    const words = normaliseWords(text);
    const runs = [];
    for (let n = 1; n <= most; n++)
        for (let i = 0; i + n <= words.length; i++)
            runs.push(words.slice(i, i + n).join(" "));
    return runs;
}
/** Every human-readable string in a value (keys named url are links, not copy). */
export function copyOf(value) {
    if (typeof value === "string")
        return [value];
    if (Array.isArray(value))
        return value.flatMap(copyOf);
    if (value && typeof value === "object")
        return Object.entries(value).flatMap(([k, v]) => (k === "url" ? [] : copyOf(v)));
    return [];
}
function text(where, value, optional = false) {
    if (value === undefined && optional)
        return undefined;
    if (typeof value !== "string" || !value.trim())
        throw new NewsFeedError(where, "must be non-empty text");
    if (value.length > TEXT_MAX)
        throw new NewsFeedError(where, `is longer than ${TEXT_MAX} characters`);
    const banned = BANNED_WORDS.exec(value);
    if (banned)
        throw new NewsFeedError(where, `uses the word "${banned[0]}"`);
    return value;
}
function source(where, raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
        throw new NewsFeedError(where, "must be an object");
    const s = raw;
    for (const k of Object.keys(s))
        if (!SOURCE_KEYS.has(k))
            throw new NewsFeedError(where, `unknown field ${k}`);
    const kind = text(`${where}.kind`, s.kind);
    if (!SOURCE_KINDS.has(kind))
        throw new NewsFeedError(`${where}.kind`, `${kind} is not a non-commercial source kind`);
    const read = text(`${where}.read`, s.read);
    if (!SOURCE_READ.has(read))
        throw new NewsFeedError(`${where}.read`, `unknown value ${read}`);
    if (typeof s.url !== "string")
        throw new NewsFeedError(`${where}.url`, "must be a link");
    let url;
    try {
        url = new URL(s.url);
    }
    catch {
        throw new NewsFeedError(`${where}.url`, "is not a link");
    }
    if (url.protocol !== "https:" || !SOURCE_HOSTS.has(url.hostname))
        throw new NewsFeedError(`${where}.url`, `${url.hostname} is not an allowed source host`);
    if (s.year !== undefined && (!Number.isInteger(s.year) || s.year < 1990 || s.year > 2100)) {
        throw new NewsFeedError(`${where}.year`, "must be a year");
    }
    return { title: text(`${where}.title`, s.title), publisher: text(`${where}.publisher`, s.publisher),
        ...(s.year !== undefined ? { year: s.year } : {}), kind, read, url: s.url };
}
function entry(where, raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
        throw new NewsFeedError(where, "must be an object");
    const e = raw;
    for (const k of Object.keys(e))
        if (!ENTRY_KEYS.has(k))
            throw new NewsFeedError(where, `unknown field ${k}`);
    if (typeof e.id !== "string" || !ID.test(e.id))
        throw new NewsFeedError(`${where}.id`, "must be a lower-case slug");
    const title = text(`${where}.title`, e.title);
    if (!TITLES.has(title))
        throw new NewsFeedError(`${where}.title`, `"${title}" is not in the reviewed title list (news/terms.ts)`);
    if (!KINDS.includes(e.kind))
        throw new NewsFeedError(`${where}.kind`, "unknown kind");
    if (typeof e.evidence !== "string" || !(e.evidence in EVIDENCE))
        throw new NewsFeedError(`${where}.evidence`, "unknown evidence level");
    if ((e.evidence === "rule-change") !== (e.kind === "rule change"))
        throw new NewsFeedError(`${where}.evidence`, "rule changes, and only they, are marked as a rule change");
    const concerns = e.concerns;
    if (!Array.isArray(concerns) || !concerns.length || concerns.some((c) => typeof c !== "string" || !CONCERN_IDS.has(c)) || new Set(concerns).size !== concerns.length) {
        throw new NewsFeedError(`${where}.concerns`, "must list one or more known concerns, once each");
    }
    const found = e.found;
    if (!Array.isArray(found) || !found.length || found.some((c) => typeof c !== "string" || !CHANNELS.has(c))) {
        throw new NewsFeedError(`${where}.found`, "must list kinds of shop from the fixed list");
    }
    let picture = null;
    if (e.picture !== null) {
        if (typeof e.picture !== "string" || !(e.picture in PRODUCT_TYPES))
            throw new NewsFeedError(`${where}.picture`, "is not a product picture slot");
        picture = e.picture;
        text(`${where}.picture_alt`, e.picture_alt);
    }
    if (typeof e.trial !== "boolean")
        throw new NewsFeedError(`${where}.trial`, "must be true or false");
    if (!isDate(e.added))
        throw new NewsFeedError(`${where}.added`, "must be a date YYYY-MM-DD");
    if (!Array.isArray(e.sources) || !e.sources.length)
        throw new NewsFeedError(`${where}.sources`, "needs at least one source");
    const sources = e.sources.map((s, i) => source(`${where}.sources[${i}]`, s));
    if (!sources.some((s) => s.read !== "title only"))
        throw new NewsFeedError(`${where}.sources`, "needs one source read beyond its title");
    return {
        id: e.id, title, ...(e.aka !== undefined ? { aka: text(`${where}.aka`, e.aka) } : {}), kind: e.kind,
        what: text(`${where}.what`, e.what), does: text(`${where}.does`, e.does), evidence: e.evidence,
        concerns: concerns, suits: text(`${where}.suits`, e.suits), careful: text(`${where}.careful`, e.careful),
        found: found, picture, ...(picture ? { picture_alt: e.picture_alt } : {}),
        try: text(`${where}.try`, e.try), trial: e.trial, added: e.added, sources,
    };
}
/** The whole feed, or a NewsFeedError naming the first field that is wrong. */
export function validateFeed(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
        throw new NewsFeedError("feed", "must be an object");
    const f = raw;
    if (f.format !== FEED_FORMAT)
        throw new NewsFeedError("feed.format", `must be ${FEED_FORMAT}`);
    if (f.version !== FEED_VERSION)
        throw new NewsFeedError("feed.version", `must be ${FEED_VERSION}`);
    if (!isDate(f.updated))
        throw new NewsFeedError("feed.updated", "must be a date YYYY-MM-DD");
    if (f.author !== "John Khan")
        throw new NewsFeedError("feed.author", "must be John Khan");
    const note = text("feed.note", f.note);
    if (!Array.isArray(f.entries) || !f.entries.length)
        throw new NewsFeedError("feed.entries", "must list entries");
    const entries = f.entries.map((e, i) => entry(`entries[${i}]`, e));
    const ids = new Set();
    const titles = new Set();
    for (const e of entries) {
        if (ids.has(e.id))
            throw new NewsFeedError(`entries.${e.id}`, "id is used twice");
        if (titles.has(e.title))
            throw new NewsFeedError(`entries.${e.id}`, "title is used twice");
        if (e.added > f.updated)
            throw new NewsFeedError(`entries.${e.id}.added`, "is after the feed's updated date");
        ids.add(e.id);
        titles.add(e.title);
    }
    return { format: FEED_FORMAT, version: FEED_VERSION, updated: f.updated, author: "John Khan", note, entries };
}
/** Entries for one concern ("all" keeps every entry), newest first, then in feed order. */
export function forConcern(entries, concern) {
    const kept = entries.map((e, i) => ({ e, i })).filter(({ e }) => concern === "all" || e.concerns.includes(concern));
    return kept.sort((a, b) => (a.e.added === b.e.added ? a.i - b.i : a.e.added < b.e.added ? 1 : -1)).map(({ e }) => e);
}
/** How many entries each concern filter would show. */
export function concernCounts(entries) {
    const counts = { all: entries.length };
    for (const [id] of CONCERNS)
        counts[id] = entries.filter((e) => e.concerns.includes(id)).length;
    return counts;
}
/** The product picture file for an entry, relative to assets/skin-moment/, only when the build
 * listed it (skin-moment-art.ts presentFiles); otherwise null and the card is text only. */
export function pictureFile(entry, present) {
    if (!entry.picture)
        return null;
    const file = `products/product-${entry.picture}.png`;
    return present.has(file) ? file : null;
}
/** The concern a page address asks for (#concern=redness), or "all". */
export function concernFromHash(hash) {
    const m = /(?:^|[#&])concern=([a-z-]+)/.exec(hash);
    return m && CONCERN_IDS.has(m[1]) ? m[1] : "all";
}
//# sourceMappingURL=feed.js.map