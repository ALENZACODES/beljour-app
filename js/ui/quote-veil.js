/** A saying about beauty from around the world, shown over the page while Beljour loads.
 *
 * The page keeps loading underneath: this module never blocks or delays the app's own scripts.
 * It shows only while the page is really still loading (if the page has already finished by the
 * time the sayings arrive, nothing is shown), stays for at least MIN_VISIBLE_MS so it can be
 * read, then fades out once the page has loaded. A tap, a click or Escape / Enter / Space skips
 * it at once. With prefers-reduced-motion there is no fade.
 *
 * The sayings live in assets/quotes/beauty-quotes.json (one file in the web build); their
 * sources are in docs/QUOTES-SOURCES.md, not on screen. On screen: the saying in its own
 * language and script, its English meaning below, and one small line naming the language and
 * the author or work. Romanisations stay in the data and are not shown.
 *
 * Fonts: Fraunces (bundled, Latin only) for Latin-script sayings it fully covers; every other
 * script uses the device's own fonts through a named stack. Nothing is downloaded.
 *
 * Automated browsers (navigator.webdriver) get no veil, so screenshots and checks of the
 * pages are not covered by it; `?quote=<id>` forces a given saying (for checking how a script
 * renders) and `&quotehold=1` keeps it up until skipped.
 * Author: John Khan.
 */
export const QUOTES_URL = "assets/quotes/beauty-quotes.json";
export const QUOTES_FORMAT = "beljour-beauty-quotes/1";
/** Shortest time the saying stays up, so it can be read (John's brief: about 1.2 s). */
export const MIN_VISIBLE_MS = 1200;
/** Fade in and out. ASSUMED: long enough to feel gentle, short enough not to drag. */
export const FADE_MS = 450;
/** Fade after a skip. */
export const SKIP_FADE_MS = 160;
/** Never cover a page longer than this, even if its load event is slow. ASSUMED. */
export const MAX_VISIBLE_MS = 8000;
const LAST_KEY = "beljour.quoteVeil.last";
export const RTL_SCRIPTS = new Set(["Arab", "Hebr"]);
/** Unicode ranges of each script's letters (enough to check that a text is in its script). */
export const SCRIPT_RANGES = {
    Latn: [[0x41, 0x5a], [0x61, 0x7a], [0xc0, 0x24f], [0x300, 0x36f], [0x1e00, 0x1eff]],
    Grek: [[0x300, 0x36f], [0x370, 0x3ff], [0x1f00, 0x1fff]],
    Cyrl: [[0x400, 0x4ff]],
    Deva: [[0x900, 0x97f]],
    Taml: [[0xb80, 0xbff]],
    Hebr: [[0x591, 0x5f4]],
    Arab: [[0x600, 0x6ff], [0x750, 0x77f], [0xfb50, 0xfdff], [0xfe70, 0xfeff]],
    Hant: [[0x3400, 0x4dbf], [0x4e00, 0x9fff], [0xf900, 0xfaff]],
    Jpan: [[0x3040, 0x30ff], [0x3400, 0x4dbf], [0x4e00, 0x9fff]],
    Kore: [[0x1100, 0x11ff], [0x3130, 0x318f], [0xac00, 0xd7af]],
    Thai: [[0xe00, 0xe7f]],
};
/** Characters the bundled Fraunces file covers: its @font-face unicode-range in theme.css. */
const FRAUNCES_RANGES = [
    [0x0000, 0x00ff], [0x0131, 0x0131], [0x0152, 0x0153], [0x02bb, 0x02bc], [0x02c6, 0x02c6], [0x02da, 0x02da],
    [0x02dc, 0x02dc], [0x2000, 0x206f], [0x2074, 0x2074], [0x20ac, 0x20ac], [0x2122, 0x2122], [0x2191, 0x2191],
    [0x2193, 0x2193], [0x2212, 0x2212], [0x2215, 0x2215], [0xfeff, 0xfeff], [0xfffd, 0xfffd],
];
const inRanges = (code, ranges) => ranges.some(([lo, hi]) => code >= lo && code <= hi);
/** True when every character is in the bundled Fraunces subset, so the line never mixes fonts. */
export function fitsBundledSerif(text) {
    for (const ch of text)
        if (!inRanges(ch.codePointAt(0) ?? 0, FRAUNCES_RANGES))
            return false;
    return true;
}
/** CSS class picking the font stack for a saying (see quote-veil.css). */
export function fontClass(quote) {
    if (quote.script === "Latn")
        return fitsBundledSerif(quote.text) ? "qv-f-brand" : "qv-f-latin";
    if (quote.script === "Arab")
        return quote.lang === "ur" ? "qv-f-urdu" : "qv-f-arab";
    return `qv-f-${quote.script.toLowerCase()}`;
}
/** Fraction of a text's letters that belong to the given script (spaces and punctuation ignored). */
export function scriptShare(text, script) {
    let letters = 0;
    let inScript = 0;
    for (const ch of text) {
        if (!/\p{L}|\p{M}/u.test(ch))
            continue;
        letters += 1;
        if (inRanges(ch.codePointAt(0) ?? 0, SCRIPT_RANGES[script]))
            inScript += 1;
    }
    return letters ? inScript / letters : 0;
}
/** Problems with one entry, empty when it is fine. The page skips entries with problems. */
export function quoteProblems(value) {
    if (!value || typeof value !== "object")
        return ["not an object"];
    const q = value;
    const problems = [];
    for (const key of ["id", "lang", "script", "language", "text", "meaning", "by"]) {
        if (typeof q[key] !== "string" || !q[key].trim())
            problems.push(`${key} missing or empty`);
    }
    if (typeof q.rtl !== "boolean")
        problems.push("rtl flag missing");
    if (problems.length)
        return problems;
    const script = q.script;
    if (!(script in SCRIPT_RANGES))
        return [`unknown script ${String(q.script)}`];
    if (!/^[a-z]{2,3}(-[A-Z][a-z]{3})?(-[A-Z]{2})?$/.test(q.lang))
        problems.push(`lang ${String(q.lang)} is not a BCP 47 tag`);
    if (q.rtl !== RTL_SCRIPTS.has(script))
        problems.push(`rtl flag ${String(q.rtl)} is wrong for ${script}`);
    if (scriptShare(q.text, script) < 0.9)
        problems.push(`text is not in ${script}`);
    if (script !== "Latn" && !(typeof q.romanisation === "string" && q.romanisation.trim()))
        problems.push("romanisation missing");
    if (scriptShare(q.meaning, "Latn") < 0.99)
        problems.push("meaning is not plain English");
    return problems;
}
/** The usable sayings from the file: right format, each entry valid, ids and texts unique. */
export function usableQuotes(file) {
    if (!file || typeof file !== "object" || file.format !== QUOTES_FORMAT)
        return [];
    const list = file.quotes;
    if (!Array.isArray(list))
        return [];
    const ids = new Set();
    const texts = new Set();
    const out = [];
    for (const entry of list) {
        if (quoteProblems(entry).length)
            continue;
        const q = entry;
        if (ids.has(q.id) || texts.has(q.text))
            continue;
        ids.add(q.id);
        texts.add(q.text);
        out.push(q);
    }
    return out;
}
/** A saying for this load: a forced id if it exists, else a random one that differs from the last. */
export function pickQuote(quotes, lastId, random, forcedId) {
    if (!quotes.length)
        return null;
    if (forcedId) {
        const forced = quotes.find((q) => q.id === forcedId);
        if (forced)
            return forced;
    }
    const pool = quotes.length > 1 ? quotes.filter((q) => q.id !== lastId) : quotes;
    const index = Math.min(pool.length - 1, Math.floor(random() * pool.length));
    return pool[index] ?? null;
}
/** When the veil may start fading: never before the minimum, never after the maximum. */
export function fadeAt(shownAt, loadedAt) {
    if (loadedAt === null)
        return shownAt + MAX_VISIBLE_MS;
    return Math.min(shownAt + MAX_VISIBLE_MS, Math.max(shownAt + MIN_VISIBLE_MS, loadedAt));
}
function readLast(win) {
    try {
        return win.localStorage.getItem(LAST_KEY);
    }
    catch {
        return null;
    }
}
function writeLast(win, id) {
    try {
        win.localStorage.setItem(LAST_KEY, id);
    }
    catch { /* private window: a repeat is harmless */ }
}
/** The veil's elements for one saying. */
export function buildVeil(doc, quote) {
    const veil = doc.createElement("div");
    veil.className = "qv";
    veil.dataset.quoteId = quote.id;
    const figure = doc.createElement("figure");
    figure.className = "qv-figure";
    figure.setAttribute("aria-label", "A saying about beauty, shown while Beljour loads");
    const text = doc.createElement("blockquote");
    text.className = `qv-text ${fontClass(quote)}${quote.text.length > 90 ? " qv-long" : ""}`;
    text.lang = quote.lang;
    text.dir = quote.rtl ? "rtl" : "ltr";
    quote.text.split("\n").forEach((line, i) => {
        if (i)
            text.append(doc.createElement("br"));
        text.append(doc.createTextNode(line));
    });
    const meaning = doc.createElement("p");
    meaning.className = "qv-meaning";
    meaning.lang = "en";
    meaning.textContent = quote.meaning;
    const by = doc.createElement("figcaption");
    by.className = "qv-by";
    by.lang = "en";
    by.textContent = `${quote.language} · ${quote.by}`;
    figure.append(text, meaning, by);
    const skip = doc.createElement("button");
    skip.type = "button";
    skip.className = "qv-skip";
    skip.textContent = "Skip";
    veil.append(figure, skip);
    return veil;
}
/** The sayings file from this site (same origin, nothing sent); empty when it cannot be read. */
export async function loadQuotes(fetcher = fetch) {
    try {
        const reply = await fetcher(QUOTES_URL, { credentials: "same-origin" });
        return reply.ok ? usableQuotes(await reply.json()) : [];
    }
    catch {
        return []; // offline or blocked: the page simply loads without a saying
    }
}
/** Show a saying while the page loads. Safe to call once per page; does nothing outside a browser. */
export async function startQuoteVeil(win) {
    const doc = win.document;
    const params = new URLSearchParams(win.location.search);
    const forcedId = params.get("quote");
    const hold = params.get("quotehold") === "1";
    if (!forcedId && (win.navigator.webdriver || doc.readyState === "complete"))
        return;
    let loadedAt = doc.readyState === "complete" ? win.performance.now() : null;
    const onLoad = () => { loadedAt = win.performance.now(); schedule(); };
    if (loadedAt === null)
        win.addEventListener("load", onLoad, { once: true });
    const quotes = await loadQuotes(win.fetch.bind(win));
    const quote = pickQuote(quotes, readLast(win), Math.random, forcedId);
    // Only while the page is really loading: if it finished first, showing now would delay it.
    if (!quote || !doc.body || (!forcedId && doc.readyState === "complete")) {
        win.removeEventListener("load", onLoad);
        return;
    }
    writeLast(win, quote.id);
    const reduced = win.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const veil = buildVeil(doc, quote);
    if (reduced)
        veil.classList.add("qv-still");
    doc.body.append(veil);
    const shownAt = win.performance.now();
    win.requestAnimationFrame(() => win.requestAnimationFrame(() => veil.classList.add("qv-in")));
    let timer = 0;
    let gone = false;
    function close(fade) {
        if (gone)
            return;
        gone = true;
        win.clearTimeout(timer);
        win.removeEventListener("keydown", onKey, true);
        win.removeEventListener("load", onLoad);
        veil.classList.remove("qv-in");
        veil.classList.add("qv-out");
        win.setTimeout(() => veil.remove(), reduced ? 0 : fade);
    }
    function schedule() {
        if (gone || hold)
            return;
        win.clearTimeout(timer);
        timer = win.setTimeout(() => close(FADE_MS), Math.max(0, fadeAt(shownAt, loadedAt) - win.performance.now()));
    }
    function onKey(event) {
        if (event.key === "Escape" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            close(SKIP_FADE_MS);
        }
    }
    veil.addEventListener("pointerdown", () => close(SKIP_FADE_MS));
    veil.querySelector(".qv-skip")?.addEventListener("click", () => close(SKIP_FADE_MS));
    win.addEventListener("keydown", onKey, true);
    schedule();
}
if (typeof window !== "undefined" && typeof document !== "undefined")
    void startQuoteVeil(window);
