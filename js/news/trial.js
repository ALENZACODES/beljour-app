/** "Try it the honest way": a 28-day try of one news entry, kept in the product diary.
 *
 * Starting a try from a "What's new in beauty" entry starts that product in the product diary
 * (engines/skin-daily/store.ts, the same list as "I started a new product" on skin-day.html):
 * the nearest unbranded product type the diary knows, a plain name, the start date and a
 * morning or night routine step whose ticks count the uses. There is one tracker. After 28 days
 * the page points her to the Skin Moment check-in ("Is it working?"), which compares measured
 * scores with a noise band. Only the entry id, the plain name, the dates and the ticks are
 * kept, on this device: no photo, no product name she typed, nothing sent anywhere.
 *
 * Trials saved by the page's earlier separate store (key beljour.news-trials.v1) are moved into
 * the diary once, then that key is removed. Author: John Khan.
 */
import { DailyStoreError, NOTES, usualSlot } from "../engines/skin-daily/store.js";
import { daysBetween } from "../engines/skin-daily/index.js";
import { starterRoutine } from "../engines/skin-daily/routine.js";
import { isDate } from "./feed.js";
export const CHECKIN_DAY = 28;
export const CHECKIN_LINK = "skin-moment.html#checkin";
export const DIARY_LINK = "skin-day.html#diary";
/** ASSUMED: more running tries from this page than this is not one honest test at a time. */
export const MAX_TRIALS = 3;
/** The diary's own type for a product that fits none of its named types. */
export const GENERIC_TYPE = "skincare-other";
/** The earlier separate store, read only to move its trials into the diary. */
export const OLD_TRIAL_KEY = "beljour.news-trials.v1";
export const OLD_TRIAL_FORMAT = "beljour-news-trials/1";
/** Every entry in web/data/beauty-news.json that offers a try, as the diary product it starts:
 * the nearest product type the diary already knows, else the generic type, with a plain,
 * unbranded name for the diary and the routine step. */
export const DIARY_PRODUCTS = {
    "pdrn-serums": { product: GENERIC_TYPE, name: "PDRN serum" },
    "exosome-products": { product: GENERIC_TYPE, name: "Exosome serum" },
    "signal-peptides": { product: GENERIC_TYPE, name: "Peptide serum" },
    "copper-peptides": { product: GENERIC_TYPE, name: "Copper peptide serum" },
    "ceramide-creams": { product: "ceramide-cream", name: "Ceramide cream" },
    "mineral-sunscreen": { product: "sunscreen", name: "Mineral sunscreen" },
    "tinted-sunscreen": { product: "sunscreen", name: "Tinted sunscreen" },
    "spf-makeup": { product: "skin-tint", name: "Skin tint with SPF" },
    "bakuchiol": { product: GENERIC_TYPE, name: "Bakuchiol" },
    "retinal": { product: "retinoid-cream", name: "Retinal" },
    "adapalene": { product: "retinoid-cream", name: "Adapalene gel 0.1%" },
    "azelaic-acid": { product: "azelaic-cream", name: "Azelaic acid" },
    "tranexamic-acid": { product: GENERIC_TYPE, name: "Tranexamic acid" },
    "cysteamine": { product: GENERIC_TYPE, name: "Cysteamine cream" },
    "niacinamide": { product: "niacinamide-serum", name: "Niacinamide" },
    "vitamin-c": { product: "vitamin-c-serum", name: "Vitamin C serum" },
    "alpha-arbutin": { product: GENERIC_TYPE, name: "Alpha-arbutin serum" },
    "vitamin-a-limits": { product: "retinoid-cream", name: "Retinol night cream" },
    "microbiome-skincare": { product: GENERIC_TYPE, name: "Microbiome skincare" },
    "hydrocolloid-patches": { product: "spot-patches", name: "Hydrocolloid patches" },
    "microneedle-patches": { product: "spot-patches", name: "Microneedle patches" },
    "benzoyl-peroxide-storage": { product: "benzoyl-gel", name: "Benzoyl peroxide" },
    "hypochlorous-acid": { product: GENERIC_TYPE, name: "Hypochlorous acid spray" },
    "centella": { product: GENERIC_TYPE, name: "Centella (cica) cream" },
    "ectoin": { product: GENERIC_TYPE, name: "Ectoin cream" },
};
/** The diary product for an entry; an entry not in the table gets the generic type and its title. */
export function diaryProduct(id, title) {
    return DIARY_PRODUCTS[id] ?? { product: GENERIC_TYPE, name: title };
}
export const TRIAL_NOTES = {
    memory: "This browser is not letting the page save, so the diary keeps this try for this visit only.",
    tooMany: `You already have ${MAX_TRIALS} tries running from this page. One new product at a time gives the clearest answer.`,
};
/** The diary entry running for a news entry (not stopped), or null. */
export function runningTrial(store, id) {
    const mine = store.diary().filter((e) => e.news === id && !e.end);
    return mine.length ? mine[mine.length - 1] : null;
}
/** Where a try is on a day: day 1 is the start date; uses are her routine ticks so far. */
export function trialStatus(entry, today) {
    const day = Math.max(1, daysBetween(entry.start, today) + 1);
    const uses = entry.used.filter((d) => d <= today).length;
    const due = day >= CHECKIN_DAY;
    const daysLeft = Math.max(0, CHECKIN_DAY - day);
    const unit = entry.unit === "morning" ? (uses === 1 ? "morning" : "mornings") : (uses === 1 ? "night" : "nights");
    const ticked = `${uses} ${unit} ticked in your routine`;
    const line = due ? `Day ${day}. ${ticked}. Time to check in and see what really changed.`
        : `Day ${day} of ${CHECKIN_DAY}. ${ticked}. Check in ${daysLeft === 1 ? "tomorrow" : `in ${daysLeft} days`}.`;
    return { day, uses, due, daysLeft, line };
}
/** Start a try of a news entry in the diary on `today` (a running one is returned as it is).
 * With no routine yet, the starter routine is set first, as the diary's own picker does, so the
 * product gets a step to tick. */
export function startTrial(store, item, today, slot) {
    const running = runningTrial(store, item.id);
    if (running)
        return { ok: true, entry: running };
    const fromNews = new Set(store.diary().filter((e) => e.news && !e.end).map((e) => e.news));
    if (fromNews.size >= MAX_TRIALS)
        return { ok: false, reason: TRIAL_NOTES.tooMany };
    const { product, name } = diaryProduct(item.id, item.title);
    try {
        if (!store.routine())
            store.setRoutine(starterRoutine());
        return { ok: true, entry: store.startProduct(product, today, slot ?? usualSlot(product), { news: item.id, label: name }) };
    }
    catch (err) {
        if (err instanceof DailyStoreError)
            return { ok: false, reason: err.message };
        throw err;
    }
}
function oldTrial(raw) {
    if (!raw || typeof raw !== "object")
        return false;
    const t = raw;
    return typeof t.id === "string" && /^[a-z0-9-]{1,64}$/.test(t.id) && typeof t.title === "string" && t.title.length <= 120
        && isDate(t.started) && Array.isArray(t.nights) && t.nights.length <= 400 && t.nights.every(isDate);
}
/** Move the trials saved by the earlier separate store into the diary, once: each becomes a diary
 * product started on its own date, its logged nights counted as uses; one already in the diary
 * is not added twice. The old key is removed only when the diary saved them (or there was nothing
 * readable to move), so a browser that cannot save loses nothing. Returns how many were moved. */
export function migrateOldTrials(store, storage) {
    let raw = null;
    try {
        raw = storage?.getItem(OLD_TRIAL_KEY) ?? null;
    }
    catch {
        return 0;
    }
    if (raw === null)
        return 0;
    let trials = [];
    try {
        const doc = raw.length < 64 * 1024 ? JSON.parse(raw) : null;
        if (doc && doc.format === OLD_TRIAL_FORMAT && Array.isArray(doc.trials))
            trials = doc.trials.filter(oldTrial).slice(0, MAX_TRIALS);
    }
    catch {
        trials = [];
    }
    let moved = 0, kept = true;
    for (const t of trials) {
        if (store.diary().some((e) => e.news === t.id))
            continue;
        const { product, name } = diaryProduct(t.id, t.title);
        try {
            if (!store.routine())
                store.setRoutine(starterRoutine());
            store.startProduct(product, t.started, usualSlot(product), { news: t.id, label: name, used: t.nights });
            moved += 1;
        }
        catch (err) {
            if (!(err instanceof DailyStoreError))
                throw err;
            kept = false;
        }
        if (store.note !== NOTES.saved)
            kept = false;
    }
    if (kept) {
        try {
            storage?.removeItem(OLD_TRIAL_KEY);
        }
        catch { /* left for the next visit */ }
    }
    return moved;
}
//# sourceMappingURL=trial.js.map