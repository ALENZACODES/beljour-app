/** Morning and night routine: two lists of steps, built from her latest Skin Moment plan or from a
 * simple starter routine, that she ticks off each day and can reorder, add to and remove from.
 *
 * From a plan (services/skin_moment.build_plan, from the services/skin.py routine): every
 * "Morning: X" line is a morning step and every "Evening: X" line a night step, in plan order;
 * "Two or three nights this week: X" is a night step used only on its gap nights, and
 * "X on the same night as Y" in the stop list makes Y a step skipped on those nights (the skin
 * guide: exfoliants never on a retinoid night). Each step shows the unbranded product type
 * picture its words name (screens/skin-moment-products.ts). A missed day is just missed: there is
 * no streak and no score. Everything stays on this device (store.ts). Cosmetic routine, not
 * medical advice. Author: John Khan.
 */
import { productForLine, PRODUCT_TYPES } from "../../screens/skin-moment-products.js";
import { gapNight } from "./index.js";
export const SLOTS = ["morning", "night"];
export const SLOT_TITLES = { morning: "This morning", night: "Tonight" };
export const STARTER = {
    morning: ["Gentle cleanser", "Moisturiser", "Broad spectrum sunscreen, SPF 30 or more"],
    night: ["Gentle cleanser", "Moisturiser"],
};
/** ASSUMED: the skin guide says two or three nights; a routine starts at the gentler two. */
export const DEFAULT_GAP_NIGHTS = 2;
export const MAX_STEPS = 12;
export const MAX_TEXT = 80;
const make = (r, text, extra = {}) => ({ id: `${r.key}.${r.next++}`, text, product: productForLine(text), ...extra });
/** A fresh key per routine made: the time in base 36 plus a counter (ASSUMED unique enough on one device). */
let made = 0;
export function routineKey(now = Date.now()) { return `r${now.toString(36)}${(made++).toString(36)}`; }
function empty(source, from, key) {
    return { source, from, morning: [], night: [], gaps: [], key, next: 1 };
}
export function starterRoutine(key = routineKey()) {
    const r = empty("starter", null, key);
    for (const slot of SLOTS)
        r[slot] = STARTER[slot].map((t) => make(r, t));
    return r;
}
const MORNING = /^Morning:\s*(.+)$/i, EVENING = /^Evening:\s*(.+)$/i, NIGHTS = /^Two or three nights this week:\s*(.+)$/i;
const SAME_NIGHT = /^(.+?) on the same night as (.+)$/i;
/** Her routine from a plan's lines; null when the plan names no morning or evening step. */
export function routineFromPlan(plan, from = null, key = routineKey()) {
    const r = empty("plan", from, key);
    for (const line of plan.today) {
        const m = MORNING.exec(line.text.trim()), e = EVENING.exec(line.text.trim());
        if (m)
            r.morning.push(make(r, m[1], { because: line.because ?? null }));
        else if (e)
            r.night.push(make(r, e[1], { because: line.because ?? null }));
    }
    if (!r.morning.length && !r.night.length)
        return null;
    for (const line of plan.stop) {
        const s = SAME_NIGHT.exec(line.text.trim());
        if (s)
            r.gaps.push({ use: s[1], notWith: s[2] });
    }
    for (const line of plan.this_week) {
        const n = NIGHTS.exec(line.text.trim());
        if (n)
            r.night.push(make(r, n[1], { because: line.because ?? null, gapNights: DEFAULT_GAP_NIGHTS }));
    }
    for (const gap of r.gaps)
        for (const step of r.night)
            if (step.text === gap.notWith)
                step.skipOnGapNights = true;
    r.morning = r.morning.slice(0, MAX_STEPS);
    r.night = r.night.slice(0, MAX_STEPS);
    return r;
}
export class RoutineEditError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = "RoutineEditError";
    }
}
function copy(r) {
    return { ...r, morning: r.morning.map((s) => ({ ...s })), night: r.night.map((s) => ({ ...s })), gaps: r.gaps.map((g) => ({ ...g })) };
}
/** Add her own step at the end of a list; the product type picture follows its words unless she picked one. */
export function addStep(r, slot, text, product, diary) {
    const clean = text.replace(/\s+/g, " ").trim().slice(0, MAX_TEXT);
    if (!clean)
        throw new RoutineEditError("text_empty", "Write what the step is, for example Moisturiser.");
    if (r[slot].length >= MAX_STEPS)
        throw new RoutineEditError("too_many_steps", `A routine holds up to ${MAX_STEPS} steps.`);
    const out = copy(r);
    const step = make(out, clean, product === undefined ? {} : { product });
    if (diary)
        step.diary = diary;
    out[slot].push(step);
    return { routine: out, step };
}
export function findStep(r, id) {
    for (const slot of SLOTS) {
        const index = r[slot].findIndex((s) => s.id === id);
        if (index >= 0)
            return { slot, index, step: r[slot][index] };
    }
    return null;
}
export function removeStep(r, id) {
    const at = findStep(r, id);
    if (!at)
        throw new RoutineEditError("no_such_step", "That step is not in the routine.");
    const out = copy(r);
    out[at.slot].splice(at.index, 1);
    return out;
}
/** Move a step one place up (-1) or down (+1) within its list; at either end it stays. */
export function moveStep(r, id, by) {
    const at = findStep(r, id);
    if (!at)
        throw new RoutineEditError("no_such_step", "That step is not in the routine.");
    const to = at.index + by;
    const out = copy(r);
    if (to < 0 || to >= out[at.slot].length)
        return out;
    const list = out[at.slot];
    [list[at.index], list[to]] = [list[to], list[at.index]];
    return out;
}
export function linkDiary(r, id, diary) {
    const out = copy(r);
    const at = findStep(out, id);
    if (!at)
        throw new RoutineEditError("no_such_step", "That step is not in the routine.");
    at.step.diary = diary;
    return out;
}
export function setGapNights(r, nights) {
    const out = copy(r);
    for (const s of out.night)
        if (s.gapNights)
            s.gapNights = nights;
    return out;
}
export function stepsOn(r, slot, day) {
    const gapStep = r.night.find((s) => s.gapNights);
    const gapTonight = !!gapStep && gapNight(day, gapStep.gapNights);
    return r[slot].map((step) => {
        if (slot !== "night")
            return { step, off: null };
        if (step.gapNights && !gapNight(day, step.gapNights))
            return { step, off: `Only on its ${step.gapNights} nights a week. Not tonight.` };
        if (step.skipOnGapNights && gapTonight)
            return { step, off: `Skip tonight: it is a ${gapStep.text} night.` };
        return { step, off: null };
    });
}
export function progress(r, slot, day, ticks) {
    const due = stepsOn(r, slot, day).filter((d) => !d.off);
    const done = due.filter((d) => ticks[d.step.id]).length;
    return { slot, done, total: due.length, complete: due.length > 0 && done === due.length };
}
/** ASSUMED: morning 5:00 to 11:59, afternoon 12:00 to 16:59, evening 17:00 to 4:59. */
export function dayPart(hour) {
    return hour >= 5 && hour < 12 ? "morning" : hour >= 12 && hour < 17 ? "afternoon" : "evening";
}
const stepWord = (n) => (n === 1 ? "1 step" : `${n} steps`);
/** One plain line for the time of day, for the Skin Moment page and Home. */
export function timeLine(r, ticks, now, day) {
    const part = dayPart(now.getHours());
    if (!r) {
        return part === "evening"
            ? { part, title: "Tonight", line: "Set up a simple night routine to tick off. It stays on this device." }
            : { part, title: "This morning", line: "Set up a simple morning and night routine to tick off. It stays on this device." };
    }
    const am = progress(r, "morning", day, ticks), pm = progress(r, "night", day, ticks);
    const gap = r.night.find((s) => s.gapNights && gapNight(day, s.gapNights));
    const gapLine = gap ? ` Tonight is a ${gap.text} night${r.gaps.length ? `: not with ${r.gaps[0].notWith}` : ""}.` : "";
    if (part === "morning") {
        return am.complete
            ? { part, title: "This morning", line: `Morning routine done. Tonight: ${stepWord(pm.total)}.` }
            : { part, title: "This morning", line: `${am.done} of ${stepWord(am.total)} done.` };
    }
    if (part === "afternoon") {
        const spf = r.morning.some((s) => s.product === "sunscreen");
        return { part, title: "This afternoon", line: `${spf ? "Outdoors for long? Reapply sunscreen. " : ""}Tonight: ${stepWord(pm.total)}.${gapLine}` };
    }
    return pm.complete
        ? { part, title: "Tonight", line: "Night routine done." }
        : { part, title: "Tonight", line: `${pm.done} of ${stepWord(pm.total)} done.${gapLine}` };
}
export { PRODUCT_TYPES };
//# sourceMappingURL=routine.js.map