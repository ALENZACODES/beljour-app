/** "What's new in beauty" page (web/news.html): the unbranded feed of new and trending
 * ingredients and product types (news/feed.ts), filtered by concern, each with its product
 * picture when John's file for it exists, a 28-day try that starts the product in the product
 * diary (news/trial.ts, the one tracker on skin-day.html#diary) and ends in the Skin Moment
 * check-in, and the labelled partner spot (news/partner.ts), empty by default.
 *
 * Fetches only this site's own files: data/beauty-news.json, data/partner-spot.json and the
 * picture list. Asks the BELJOUR API for a region only when the operator set
 * window.BELJOUR_REGION_FROM_API to true and an API is configured. Author: John Khan.
 */
import { partnerRegion } from "../api.js";
import { announce, clear, h } from "../dom.js";
import { CONCERNS, EVIDENCE, FEED_PATH, NOT_MEDICAL, concernCounts, concernFromHash, forConcern, pictureFile, validateFeed } from "../news/feed.js";
import { PARTNER_PATH, SPONSORED, chooseRegion, slotView, validatePartnerConfig } from "../news/partner.js";
import { CHECKIN_DAY, CHECKIN_LINK, DIARY_LINK, TRIAL_NOTES, diaryProduct, migrateOldTrials, runningTrial, startTrial, trialStatus } from "../news/trial.js";
import { browserStorage } from "../engines/skin-checkin/store.js";
import { DailyStore, NOTES, usualSlot } from "../engines/skin-daily/store.js";
import { ART_DIR, presentFiles } from "./skin-moment-art.js";
const CONCERN_LABEL = Object.fromEntries(CONCERNS);
const dateLabel = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-CA", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
/** This site's own data files; `fetcher` is injected the way skin-moment-art.ts reads its list. */
async function readJson(path, fetcher = fetch) {
    const r = await fetcher(path, { cache: "no-cache" });
    if (!r.ok)
        throw new Error(`${path}: ${r.status}`);
    return r.json();
}
/** The partner config, or null when it is missing or not valid (then no slot is drawn). */
async function partnerConfig() {
    try {
        return validatePartnerConfig(await readJson(PARTNER_PATH));
    }
    catch {
        return null;
    }
}
/** The region the CDN reported through the API, only when the operator turned that on. */
function serverRegion() {
    return window.BELJOUR_REGION_FROM_API === true ? partnerRegion() : Promise.resolve(null);
}
function partnerSlot(config, region, today) {
    const view = slotView(config, region, today);
    if (view.show === "none")
        return null;
    const box = h("aside", { class: "nw-partner", "aria-label": "Partner spot", "data-show": view.show });
    if (view.show === "label") {
        box.append(h("p", { class: "nw-partner-label" }, view.label));
        return box;
    }
    const p = view.placement;
    box.append(h("p", { class: "nw-sponsored" }, SPONSORED, h("span", { class: "nw-sponsor" }, ` · ${p.sponsor}`)));
    if (p.image)
        box.append(h("img", { class: "nw-partner-img", src: p.image, alt: p.alt ?? "", width: 160, height: 160, loading: "lazy", decoding: "async" }));
    box.append(h("h2", { class: "nw-partner-head" }, p.headline), h("p", {}, p.body), h("a", { href: p.link, rel: "sponsored noopener noreferrer", target: "_blank" }, `Visit ${p.sponsor}`), h("p", { class: "nw-partner-note" }, "A paid placement, kept apart from our unbranded entries. It does not change what we write about any ingredient."));
    return box;
}
function trialBox(entry, diary, onChange) {
    const box = h("div", { class: "nw-try" }, h("h4", {}, "Try it the honest way"), h("p", {}, entry.try));
    const running = runningTrial(diary, entry.id);
    const today = diary.today();
    const actions = h("div", { class: "nw-try-actions" });
    if (running) {
        const s = trialStatus(running, today);
        box.append(h("p", { class: "nw-try-status", role: "status" }, s.line));
        actions.append(h("a", { class: "lg-button", href: DIARY_LINK }, "See it in your diary"), h("a", { class: s.due ? "lg-button lg-primary" : "lg-link", href: CHECKIN_LINK }, s.due ? "Check in now" : "Check in"));
    }
    else if (entry.trial) {
        const { product, name } = diaryProduct(entry.id, entry.title);
        const morningId = `nw-am-${entry.id}`;
        const morning = h("input", { type: "checkbox", id: morningId, checked: usualSlot(product) === "morning" });
        actions.append(h("button", { type: "button", class: "lg-button", onclick: () => {
                const out = startTrial(diary, entry, today, morning.checked ? "morning" : "night");
                announce(out.ok ? `${name} added to your product diary: day 1 of ${CHECKIN_DAY}. Tick it in your ${morning.checked ? "morning" : "night"} routine.` : out.reason);
                onChange();
            } }, `Start a ${CHECKIN_DAY}-day trial`), h("span", { class: "nw-try-slot" }, morning, h("label", { for: morningId }, "In my morning routine")), h("a", { class: "lg-link", href: CHECKIN_LINK }, "Check in"));
    }
    else {
        actions.append(h("a", { class: "lg-link", href: CHECKIN_LINK }, "Open the check-in"));
    }
    box.append(actions);
    return box;
}
function card(entry, present, diary, onChange) {
    const file = pictureFile(entry, present);
    const head = h("div", { class: "nw-card-head" }, file ? h("img", { class: "nw-pic", src: `${ART_DIR}/${file}`, alt: entry.picture_alt ?? "", width: 88, height: 88, loading: "lazy", decoding: "async" }) : null, h("div", {}, h("p", { class: "nw-chips" }, h("span", { class: entry.kind === "rule change" ? "nw-chip nw-ev-rule-change" : "nw-chip" }, entry.kind), entry.kind === "rule change" ? null : h("span", { class: `nw-chip nw-ev-${entry.evidence}` }, EVIDENCE[entry.evidence])), h("h3", { id: `nw-${entry.id}` }, entry.title), entry.aka ? h("p", { class: "nw-aka" }, `Also called: ${entry.aka}`) : null));
    const facts = h("dl", { class: "nw-facts" }, h("dt", {}, "What it is"), h("dd", {}, entry.what), h("dt", {}, "What it does"), h("dd", {}, entry.does), h("dt", {}, "May suit"), h("dd", {}, entry.suits), h("dt", {}, "Be careful"), h("dd", {}, entry.careful), h("dt", {}, "Usually found at"), h("dd", {}, h("ul", { class: "nw-found" }, ...entry.found.map((f) => h("li", {}, f)))), h("dt", {}, "For"), h("dd", {}, entry.concerns.map((c) => CONCERN_LABEL[c]).join(", ")));
    const sources = h("details", { class: "nw-sources" }, h("summary", {}, `Sources (${entry.sources.length})`), h("ul", {}, ...entry.sources.map((s) => h("li", {}, h("a", { href: s.url, rel: "noopener noreferrer", target: "_blank" }, s.title), h("span", { class: "nw-src-meta" }, ` ${s.publisher}${s.year ? `, ${s.year}` : ""}`)))));
    return h("article", { class: "nw-card", "aria-labelledby": `nw-${entry.id}` }, head, facts, trialBox(entry, diary, onChange), h("div", { class: "nw-card-foot" }, sources, h("p", { class: "nw-added" }, `Added ${dateLabel(entry.added)}`)));
}
function filters(feed, active, pick) {
    const counts = concernCounts(feed.entries);
    const options = [["all", "All"], ...CONCERNS];
    return h("div", { class: "nw-filters", role: "group", "aria-label": "Show entries for a concern" }, ...options.map(([id, label]) => h("button", { type: "button", class: "nw-filter", "aria-pressed": String(id === active),
        onclick: () => pick(id) }, label, h("span", { class: "nw-count" }, String(counts[id])))));
}
export async function mountNews(root) {
    let feed;
    try {
        feed = validateFeed(await readJson(FEED_PATH));
    }
    catch {
        clear(root);
        root.append(h("p", { class: "nw-error", role: "alert" }, "The list of new ingredients could not be read. Try reloading the page."));
        return;
    }
    const [present, config, server] = await Promise.all([presentFiles(), partnerConfig(), serverRegion()]);
    const { region } = chooseRegion(server, typeof navigator === "undefined" ? [] : navigator.languages ?? [navigator.language]);
    const storage = browserStorage();
    const diary = new DailyStore(storage);
    migrateOldTrials(diary, storage);
    let concern = concernFromHash(location.hash);
    const draw = () => {
        const shown = forConcern(feed.entries, concern);
        clear(root);
        root.append(h("p", { class: "nw-meta" }, `Updated ${dateLabel(feed.updated)} · ${feed.entries.length} entries · no brands`), filters(feed, concern, (c) => { concern = c; history.replaceState(null, "", c === "all" ? location.pathname : `#concern=${c}`); draw(); announce(`${forConcern(feed.entries, c).length} entries shown.`); }));
        const slot = partnerSlot(config, region, diary.today());
        if (slot)
            root.append(slot);
        if (diary.note === NOTES.memory)
            root.append(h("p", { class: "nw-note" }, TRIAL_NOTES.memory));
        root.append(h("p", { class: "nw-shown", "aria-live": "polite" }, concern === "all" ? `Showing all ${shown.length}` : `Showing ${shown.length} for ${CONCERN_LABEL[concern].toLowerCase()}`), h("div", { class: "nw-grid" }, ...shown.map((e) => card(e, present, diary, draw))));
        root.dataset.ready = "1";
    };
    draw();
    window.addEventListener("hashchange", () => { concern = concernFromHash(location.hash); draw(); });
}
const root = typeof document === "undefined" ? null : document.getElementById("nw-root");
if (root) {
    document.getElementById("nw-not-medical")?.replaceChildren(NOT_MEDICAL);
    void mountNews(root);
}
