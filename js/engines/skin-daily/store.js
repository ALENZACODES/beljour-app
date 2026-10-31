/** Everything the daily skin pages keep, on this device only: her routine and the times she
 * ticked each step, the product diary, the skin log and her reminder switches. The same
 * device-only storage as the check-ins (engines/skin-checkin/store.ts): localStorage when the
 * browser allows it; when it is blocked, full or broken, the page keeps working for this visit
 * and the note says so. Export as a JSON file and delete all. Nothing here is sent anywhere,
 * costs a unit or holds a photo. Cosmetic tracking only, not medical advice. Author: John Khan.
 */
import { browserStorage, CheckinStore, parseTakenAt } from "../skin-checkin/store.js";
import { scoresFromConcerns } from "../skin-checkin/index.js";
import { PRODUCT_TYPES } from "../../screens/skin-moment-products.js";
import { addDays, FEELINGS, localDay, parseDay, whileUsed } from "./index.js";
import { addStep, findStep, linkDiary, removeStep } from "./routine.js";
export const STORE_FORMAT = "beljour-skin-daily-store/1";
export const STORE_KEY = "beljour.skin-daily.v1";
/** ASSUMED: ticks older than this are dropped (the diary keeps its own dates). */
export const KEEP_TICK_DAYS = 120;
/** ASSUMED: a year of skin logs, and up to 40 products in the diary. */
export const KEEP_LOG_DAYS = 366;
export const MAX_PRODUCTS = 40;
export const MAX_NOTE = 140;
export const MAX_STORED_CHARS = 512 * 1024;
export const MAX_LABEL = 80;
const NEWS_ID = /^[a-z0-9-]{1,64}$/;
/** The name a diary entry shows: its own plain name when it has one, else its product type. */
export function entryName(e) { return e.label ?? PRODUCT_TYPES[e.product]; }
export const REMINDERS_OFF = { spf: false, gap: false, checkin: false };
export const NOTES = {
    saved: "Saved on this device only.",
    memory: "This browser is not letting the page save, so this is kept for this visit only.",
    unreadable: "What was saved on this device before could not be read, so the page starts fresh.",
    deleted: "Your routine, diary, skin log and reminders were deleted from this device.",
    deleteFailed: "Cleared from this page, but this browser did not let the page delete its saved copy. Clear this site's data in the browser settings.",
};
export class DailyStoreError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = "DailyStoreError";
    }
}
/** Where a product type usually goes; she can change it. Makeup, sunscreen, vitamin C and
 * benzoyl peroxide (skin guide slot "am") are morning; the rest are night. ASSUMED. */
const MORNING_TYPES = new Set(["skin-tint", "foundation-sheer", "foundation-medium", "foundation-full",
    "concealer", "corrector-green", "corrector-peach", "primer", "setting-powder", "highlighter", "blush-cream", "blush-powder",
    "lip-tint", "lip-balm", "sunscreen", "vitamin-c-serum", "benzoyl-gel"]);
export function usualSlot(product) { return MORNING_TYPES.has(product) ? "morning" : "night"; }
function fresh() { return { routine: null, ticks: {}, diary: [], logs: [], reminders: { ...REMINDERS_OFF }, shown: {} }; }
const isDay = (v) => { try {
    parseDay(v);
    return true;
}
catch {
    return false;
} };
const isObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
function cleanRoutine(raw) {
    if (!isObject(raw) || !Array.isArray(raw.morning) || !Array.isArray(raw.night))
        return null;
    const step = (s) => isObject(s) && typeof s.id === "string" && typeof s.text === "string"
        ? { id: s.id, text: s.text.slice(0, 80), product: typeof s.product === "string" && s.product in PRODUCT_TYPES ? s.product : null,
            because: typeof s.because === "string" ? s.because : null, ...(s.gapNights === 2 || s.gapNights === 3 ? { gapNights: s.gapNights } : {}),
            ...(s.skipOnGapNights === true ? { skipOnGapNights: true } : {}), diary: typeof s.diary === "string" ? s.diary : null }
        : null;
    const keep = (x) => x !== null;
    const gaps = Array.isArray(raw.gaps) ? raw.gaps.filter((g) => isObject(g) && typeof g.use === "string" && typeof g.notWith === "string").map((g) => ({ use: g.use, notWith: g.notWith })) : [];
    return { source: raw.source === "plan" ? "plan" : "starter", from: typeof raw.from === "string" ? raw.from : null,
        morning: raw.morning.map(step).filter(keep), night: raw.night.map(step).filter(keep), gaps,
        key: typeof raw.key === "string" && /^[a-z0-9]{1,24}$/.test(raw.key) ? raw.key : "r0",
        next: typeof raw.next === "number" && Number.isInteger(raw.next) && raw.next > 0 ? raw.next : 1000 };
}
function cleanEntry(raw) {
    if (!isObject(raw) || typeof raw.id !== "string" || typeof raw.product !== "string" || !(raw.product in PRODUCT_TYPES) || !isDay(raw.start))
        return null;
    const end = raw.end === null || raw.end === undefined ? null : isDay(raw.end) ? raw.end : null;
    return { id: raw.id, product: raw.product, start: raw.start, end, unit: raw.unit === "morning" ? "morning" : "night",
        used: Array.isArray(raw.used) ? [...new Set(raw.used.filter(isDay))].sort() : [], step: typeof raw.step === "string" ? raw.step : null,
        ...origin(raw.news, raw.label) };
}
/** The news fields kept on an entry: only a well-formed entry id and a short plain name. */
function origin(news, label) {
    const out = {};
    if (typeof news === "string" && NEWS_ID.test(news))
        out.news = news;
    if (typeof label === "string" && label.trim())
        out.label = label.replace(/\s+/g, " ").trim().slice(0, MAX_LABEL);
    return out;
}
function cleanLog(raw) {
    if (!isObject(raw) || !isDay(raw.date) || !Array.isArray(raw.feel))
        return null;
    const feel = raw.feel;
    return { date: raw.date, feel: FEELINGS.map((f) => f.id).filter((id) => feel.includes(id)),
        patch: raw.patch === true, note: typeof raw.note === "string" ? raw.note.slice(0, MAX_NOTE) : "" };
}
/** A clean copy of stored data; anything not in the expected form is left out. */
export function cleanData(raw) {
    const out = fresh();
    if (!isObject(raw))
        return out;
    out.routine = cleanRoutine(raw.routine);
    if (isObject(raw.ticks)) {
        for (const [day, row] of Object.entries(raw.ticks)) {
            if (!isDay(day) || !isObject(row))
                continue;
            const kept = Object.entries(row).filter(([id, at]) => typeof id === "string" && typeof at === "string");
            if (kept.length)
                out.ticks[day] = Object.fromEntries(kept);
        }
    }
    out.diary = Array.isArray(raw.diary) ? raw.diary.map(cleanEntry).filter((e) => !!e).slice(-MAX_PRODUCTS) : [];
    out.logs = Array.isArray(raw.logs) ? raw.logs.map(cleanLog).filter((l) => !!l) : [];
    if (isObject(raw.reminders))
        out.reminders = { spf: raw.reminders.spf === true, gap: raw.reminders.gap === true, checkin: raw.reminders.checkin === true };
    if (isObject(raw.shown)) {
        for (const [day, ids] of Object.entries(raw.shown))
            if (isDay(day) && Array.isArray(ids))
                out.shown[day] = ids.filter((x) => typeof x === "string");
    }
    return out;
}
export class DailyStore {
    storage;
    clock;
    data = fresh();
    lastNote = "";
    ids = 0;
    constructor(storage = browserStorage(), clock = () => new Date()) {
        this.storage = storage;
        this.clock = clock;
        let text = null;
        try {
            text = storage?.getItem(STORE_KEY) ?? null;
        }
        catch {
            this.lastNote = NOTES.unreadable;
            return;
        }
        if (text === null)
            return;
        try {
            if (text.length > MAX_STORED_CHARS)
                throw new Error("too large");
            const value = JSON.parse(text);
            if (value?.format !== STORE_FORMAT)
                throw new Error("unknown form");
            this.data = cleanData(value.data);
        }
        catch {
            this.data = fresh();
            this.lastNote = NOTES.unreadable;
        }
    }
    get note() { return this.lastNote; }
    /** Her local date now. */
    today() { return localDay(this.clock()); }
    now() { return this.clock(); }
    /** True when nothing has been set up yet (a first visit). */
    get empty() { return !this.data.routine && !this.data.diary.length && !this.data.logs.length; }
    /* ---------------- routine ---------------- */
    routine() { return this.data.routine ? structuredClone(this.data.routine) : null; }
    setRoutine(r) {
        // Diary links follow the step: a removed step no longer counts ticks for its product.
        const ids = new Set(r ? [...r.morning, ...r.night].map((s) => s.id) : []);
        for (const e of this.data.diary)
            if (e.step && !ids.has(e.step))
                e.step = null;
        this.data.routine = r ? structuredClone(r) : null;
        this.persist();
    }
    /** The first date she ticked anything still kept (today when she never has): days before it
     * are not "missed", they are before she started. */
    firstDay() {
        const days = Object.keys(this.data.ticks).sort();
        return days.length && days[0] < this.today() ? days[0] : this.today();
    }
    ticks(day) { return { ...(this.data.ticks[day] ?? {}) }; }
    /** Tick or untick one step for a date; a step linked to a product counts that date as a use. */
    toggle(day, stepId) {
        parseDay(day);
        const row = { ...(this.data.ticks[day] ?? {}) };
        const on = !row[stepId];
        if (on)
            row[stepId] = this.clock().toISOString();
        else
            delete row[stepId];
        if (Object.keys(row).length)
            this.data.ticks[day] = row;
        else
            delete this.data.ticks[day];
        const step = this.data.routine ? findStep(this.data.routine, stepId)?.step : undefined;
        const entry = step?.diary ? this.data.diary.find((e) => e.id === step.diary) : undefined;
        if (entry) {
            const used = new Set(entry.used);
            if (on)
                used.add(day);
            else
                used.delete(day);
            entry.used = [...used].sort();
        }
        this.prune();
        this.persist();
        return on;
    }
    /* ---------------- product diary ---------------- */
    diary() { return this.data.diary.map((e) => ({ ...e, used: [...e.used] })); }
    /** "I started a new product": a diary entry, and a routine step whose ticks count its uses (an
     * existing step of the same product type in that slot is linked instead of adding a second).
     * `options.news` and `options.label` record a start from the news page; `options.used` adds
     * dates already logged elsewhere (on or after the start). */
    startProduct(product, start, slot = usualSlot(product), options = {}) {
        if (!(product in PRODUCT_TYPES))
            throw new DailyStoreError("product_unknown", "Pick one of the product types.");
        if (!isDay(start))
            throw new DailyStoreError("date_invalid", "Give the date you started, YYYY-MM-DD.");
        if (this.data.diary.filter((e) => !e.end).length >= MAX_PRODUCTS)
            throw new DailyStoreError("too_many_products", `The diary holds up to ${MAX_PRODUCTS} products.`);
        const id = `p${this.clock().getTime().toString(36)}${(this.ids++).toString(36)}`;
        const type = product;
        const from = origin(options.news, options.label);
        let routine = this.data.routine ?? null;
        let stepId = null;
        if (routine) {
            const same = routine[slot].find((s) => s.product === type && !s.diary);
            if (same) {
                routine = linkDiary(routine, same.id, id);
                stepId = same.id;
            }
            else {
                try {
                    const added = addStep(routine, slot, from.label ?? PRODUCT_TYPES[type], type, id);
                    routine = added.routine;
                    stepId = added.step.id;
                }
                catch {
                    stepId = null;
                }
            }
        }
        const entry = { id, product: type, start, end: null, unit: slot, used: [], step: stepId, ...from };
        // Ticks of that step already made on or after the start count too, and dates she logged before.
        const used = new Set((options.used ?? []).filter((d) => isDay(d) && d >= start));
        if (stepId)
            for (const [day, row] of Object.entries(this.data.ticks))
                if (row[stepId] && day >= start)
                    used.add(day);
        entry.used = [...used].sort();
        this.data.diary.push(entry);
        if (routine)
            this.data.routine = routine;
        this.persist();
        return { ...entry, used: [...entry.used] };
    }
    /** She stopped using it: the diary keeps the dates; the routine step goes. */
    stopProduct(id, end = this.today()) {
        const entry = this.data.diary.find((e) => e.id === id);
        if (!entry)
            throw new DailyStoreError("no_such_product", "That product is not in the diary.");
        if (!isDay(end) || end < entry.start)
            throw new DailyStoreError("date_invalid", "The stop date must be on or after the start date.");
        entry.end = end;
        if (entry.step && this.data.routine && findStep(this.data.routine, entry.step))
            this.data.routine = removeStep(this.data.routine, entry.step);
        entry.step = null;
        this.persist();
    }
    removeProduct(id) {
        const entry = this.data.diary.find((e) => e.id === id);
        if (!entry)
            throw new DailyStoreError("no_such_product", "That product is not in the diary.");
        if (entry.step && this.data.routine && findStep(this.data.routine, entry.step))
            this.data.routine = linkDiary(this.data.routine, entry.step, null);
        this.data.diary = this.data.diary.filter((e) => e.id !== id);
        this.persist();
    }
    /* ---------------- skin log ---------------- */
    logs() { return this.data.logs.map((l) => ({ ...l, feel: [...l.feel] })); }
    logFor(day) { const l = this.data.logs.find((x) => x.date === day); return l ? { ...l, feel: [...l.feel] } : null; }
    /** Today's (or a date's) log: one per date, the latest wins. */
    log(entry) {
        if (!isDay(entry.date))
            throw new DailyStoreError("date_invalid", "A log needs its date, YYYY-MM-DD.");
        const note = (entry.note ?? "").trim();
        if (note.length > MAX_NOTE)
            throw new DailyStoreError("note_too_long", `Keep the note under ${MAX_NOTE} characters.`);
        const row = cleanLog({ date: entry.date, feel: [...(entry.feel ?? [])], patch: entry.patch === true, note });
        this.data.logs = [...this.data.logs.filter((l) => l.date !== entry.date), row].sort((a, b) => (a.date < b.date ? -1 : 1));
        this.prune();
        this.persist();
        return { ...row, feel: [...row.feel] };
    }
    /* ---------------- reminders ---------------- */
    reminders() { return { ...this.data.reminders }; }
    setReminders(next) {
        this.data.reminders = { ...this.data.reminders, ...Object.fromEntries(Object.entries(next).map(([k, v]) => [k, v === true])) };
        this.persist();
        return this.reminders();
    }
    wasShown(day, id) { return (this.data.shown[day] ?? []).includes(id); }
    markShown(day, id) {
        this.data.shown = { [day]: [...new Set([...(this.data.shown[day] ?? []), id])] }; // only today's list is kept
        this.persist();
    }
    /* ---------------- whole store ---------------- */
    exportText() {
        return JSON.stringify({ format: STORE_FORMAT, exported_at: this.clock().toISOString(),
            note: "Your routine, product diary, skin log and reminder switches from this device. No photos. Cosmetic tracking, not medical advice.",
            data: this.data }, null, 1) + "\n";
    }
    deleteAll() {
        this.data = fresh();
        if (!this.storage) {
            this.lastNote = NOTES.deleted;
            return { stored: true, note: NOTES.deleted };
        }
        try {
            this.storage.removeItem(STORE_KEY);
            this.lastNote = NOTES.deleted;
            return { stored: true, note: NOTES.deleted };
        }
        catch {
            this.lastNote = NOTES.deleteFailed;
            return { stored: false, note: NOTES.deleteFailed };
        }
    }
    prune() {
        const today = this.today();
        const tickFloor = addDays(today, -KEEP_TICK_DAYS), logFloor = addDays(today, -KEEP_LOG_DAYS);
        for (const day of Object.keys(this.data.ticks))
            if (day < tickFloor)
                delete this.data.ticks[day];
        this.data.logs = this.data.logs.filter((l) => l.date >= logFloor);
    }
    persist() {
        try {
            if (!this.storage)
                throw new Error("no storage");
            this.storage.setItem(STORE_KEY, JSON.stringify({ format: STORE_FORMAT, data: this.data }));
            this.lastNote = NOTES.saved;
        }
        catch {
            this.lastNote = NOTES.memory;
        }
    }
}
/** Her check-ins as the diary reads them: her local date of each and its measured raw scores. */
export function checkinDays(snapshots) {
    return snapshots.map((s) => ({ date: localDay(new Date(parseTakenAt(s.taken_at))), scores: scoresFromConcerns(s.concerns) }));
}
/** "Is it working?" for one diary product, from the check-ins kept on this device. */
export function diaryResult(entry, snapshots) {
    return whileUsed({ start: entry.start, end: entry.end, used: entry.used, unit: entry.unit }, checkinDays(snapshots));
}
/** The check-ins already kept on this device by the Skin Moment page. */
export function deviceCheckins(storage = browserStorage()) {
    return new CheckinStore(storage).list();
}
