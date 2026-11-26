/**
 * The Holiday Engine's calendar in the browser: dated occasions read from the generated copy of
 * the Python seasonal calendar (scripts/sync_holidays.py). Nothing here computes a date, so the
 * browser and Python can't disagree; a year the data doesn't cover has no date, and the
 * engine says "not known" instead of guessing. Unverified table dates stay marked unverified.
 * Days are plain YYYY-MM-DD strings in the person's own local calendar: no time zone maths,
 * no clock beyond the day she is on.
 * Author: John Khan.
 */
import { HOLIDAY_CALENDAR } from "./generated/calendar.js";
export const CALENDAR_FORMAT = "beljour-holiday-calendar/1";
export const REGIONS = ["CA", "US", "UK", "GLOBAL"];
export class CalendarError extends RangeError {
}
const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** A real calendar day as YYYY-MM-DD, or a CalendarError. */
export function checkDay(value) {
    if (typeof value !== "string" || !DAY.test(value))
        throw new CalendarError("A day is written YYYY-MM-DD");
    const parsed = new Date(`${value}T12:00:00Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value)
        throw new CalendarError(`${value} is not a calendar day`);
    return value;
}
/** Whole days from a to b (both YYYY-MM-DD); negative when b is earlier. */
export function daysBetween(a, b) {
    return Math.round((Date.parse(`${checkDay(b)}T12:00:00Z`) - Date.parse(`${checkDay(a)}T12:00:00Z`)) / 86_400_000);
}
/** The person's own calendar day (local, not UTC), as YYYY-MM-DD. */
export function localToday(now = new Date()) {
    const pad = (n) => String(n).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
export function calendarData() {
    if (HOLIDAY_CALENDAR.format !== CALENDAR_FORMAT)
        throw new CalendarError(`holiday calendar: format must be ${CALENDAR_FORMAT}`);
    return HOLIDAY_CALENDAR;
}
export function occasions() {
    return calendarData().occasions;
}
export function occasion(id) {
    return occasions().find((o) => o.id === id) ?? null;
}
export function isRegion(value) {
    return typeof value === "string" && REGIONS.includes(value);
}
function chosenVariant(info, variants) {
    const wanted = variants[info.id];
    if (wanted === undefined)
        return info.defaultVariant;
    if (!info.variants.includes(wanted))
        throw new CalendarError(`${info.name} has no variant ${wanted}`);
    return wanted;
}
/** Every dated occurrence for a region, with one variant per occasion (its default unless chosen). */
export function occurrencesFor(region, variants = {}) {
    if (!isRegion(region))
        throw new CalendarError(`unknown region ${String(region)}`);
    const data = calendarData();
    const picked = new Map(data.occasions.map((o) => [o.id, chosenVariant(o, variants)]));
    const names = new Map(data.occasions.map((o) => [o.id, o.name]));
    return data.regions[region].filter((r) => picked.get(r[0]) === r[1]).map((r) => ({
        occasion: r[0], name: names.get(r[0]) ?? r[0], variant: r[1], start: r[2], end: r[3],
        verified: r[4], rule: r[5], source: r[6], note: r[7]
    }));
}
/** The first occurrence of an occasion that hasn't ended by `today` (one under way counts), or
 * null when the data has no date for it (outside the covered years, or not kept in that region).
 * Like the Python calendar, a missing year is never skipped over to a later one. */
export function nextOccurrence(occasionId, today, region, variants = {}) {
    const day = checkDay(today);
    if (!occasion(occasionId))
        throw new CalendarError(`unknown occasion ${occasionId}`);
    const year = Number(day.slice(0, 4));
    for (const o of occurrencesFor(region, variants)) {
        if (o.occasion !== occasionId || o.end < day)
            continue;
        return Number(o.start.slice(0, 4)) <= year + 1 ? o : null;
    }
    return null;
}
/** Occasions from `wanted` under way or starting within `windowDays`, soonest first. */
export function upcoming(today, region, wanted, windowDays = 45, variants = {}) {
    if (!(Number.isInteger(windowDays) && windowDays >= 0 && windowDays <= 400))
        throw new CalendarError("The window is 0 to 400 days");
    const order = occasions().map((o) => o.id);
    const found = [];
    for (const id of wanted) {
        const o = nextOccurrence(id, today, region, variants);
        if (!o)
            continue;
        const daysUntil = Math.max(0, daysBetween(today, o.start));
        if (daysUntil <= windowDays)
            found.push({ occurrence: o, daysUntil, underWay: o.start <= today });
    }
    return found.sort((a, b) => a.daysUntil - b.daysUntil || order.indexOf(a.occurrence.occasion) - order.indexOf(b.occurrence.occasion));
}
//# sourceMappingURL=calendar.js.map