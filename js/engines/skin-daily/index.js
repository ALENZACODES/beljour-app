/** Daily skin pages: the product diary, the ten-second skin log, gap nights and today's pick.
 * Mirrors api/plumb_api/engines/skin_daily/__init__.py; shared vectors in
 * api/tests/goldens/skin_daily.json, constants in generated/daily.ts (from daily.json and the
 * skin guide's patch-test lines). Nothing here measures skin or spends a YouCam unit: it reads
 * what she keeps on this device (ticked routine dates, skin log chips, check-ins). The diary
 * judges check-ins with the skin check-in engine's own noise bands and says "while you used it",
 * never that a product caused a change. Dates are her local calendar dates, YYYY-MM-DD.
 * Cosmetic tracking only, not medical advice. Author: John Khan.
 */
import { CheckinRefusal, checkScores, compare, CONCERNS } from "../skin-checkin/index.js";
import { DAILY } from "./generated/daily.js";
export const FORMAT = DAILY.format;
export const VERSION = DAILY.version;
export const NOTE = DAILY.diary.note;
export const FEELINGS = DAILY.feelings;
const FEELING_IDS = FEELINGS.map((f) => f.id);
export const PATCH_SEE_PRO = DAILY.patch_see_pro;
export const PATCH_STOP = DAILY.patch.stop_line;
export const WAIT_DAYS = DAILY.wait_days;
export const REMINDER_TIMES = DAILY.reminders;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SPECS = new Map(CONCERNS.map((c) => [c.concern, c]));
/** Input the daily engine will not use; `code` and the message match the Python engine. */
export class DailyRefusal extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = "DailyRefusal";
    }
}
const isObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const mod = (a, m) => ((a % m) + m) % m;
/* ---- calendar dates as whole days since 1970-01-01, the proleptic Gregorian calendar Python uses ---- */
function daysFromCivil(y, m, d) {
    const yy = m <= 2 ? y - 1 : y;
    const era = Math.floor(yy / 400);
    const yoe = yy - era * 400;
    const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
    const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
    return era * 146097 + doe - 719468;
}
/** YYYY-MM-DD for a day number. */
export function isoDay(n) {
    const z = n + 719468;
    const era = Math.floor(z / 146097);
    const doe = z - era * 146097;
    const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
    const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
    const mp = Math.floor((5 * doy + 2) / 153);
    const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
    const m = mp + (mp < 10 ? 3 : -9);
    const y = yoe + era * 400 + (m <= 2 ? 1 : 0);
    return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
/** The day number of a YYYY-MM-DD date, or a coded refusal. */
export function parseDay(value, where = "date") {
    const bad = () => new DailyRefusal("date_invalid", `${where} must be a date written YYYY-MM-DD`);
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
        throw bad();
    const [y, m, d] = value.split("-").map(Number);
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    const last = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
    if (y < 1 || m < 1 || m > 12 || d < 1 || d > last)
        throw bad();
    return daysFromCivil(y, m, d);
}
/** Her local calendar date (not UTC) for a moment in time. */
export function localDay(when) {
    return isoDay(daysFromCivil(when.getFullYear(), when.getMonth() + 1, when.getDate()));
}
export function addDays(day, n) { return isoDay(parseDay(day) + n); }
export function daysBetween(from, to) { return parseDay(to) - parseDay(from); }
/** Monday = 0, as Python's date.weekday(). */
export function weekday(day) { return mod(parseDay(day) + 3, 7); }
function plural(n, one, many) { return `${n} ${n === 1 ? one : many}`; }
/** "8 points", "1 point", "6.5 points": the size of a change, rounded half up to one decimal. */
export function points(value) {
    const r = Math.floor(Math.abs(value) * 10 + 0.5) / 10;
    const text = Number.isInteger(r) ? String(r) : r.toFixed(1);
    return r === 1 ? `${text} point` : `${text} points`;
}
function unitWords(unit) {
    if (typeof unit !== "string" || !has(DAILY.diary.units, unit))
        throw new DailyRefusal("unit_invalid", "unit must be night, morning or day");
    const [one, many] = DAILY.diary.units[unit];
    return [one, many];
}
function dates(used, where = "used") {
    if (!Array.isArray(used))
        throw new DailyRefusal("used_not_list", `${where} must be a list of dates`);
    return used.map((d) => parseDay(d, `${where} date`));
}
/** Ticked uses on the days from `start` up to, not including, `until`: "26 of 30 nights". */
export function usage(start, until, used, unit = "night") {
    const first = parseDay(start, "start"), last = parseDay(until, "until");
    if (last < first)
        throw new DailyRefusal("until_before_start", "until must be on or after the start date");
    const [one, many] = unitWords(unit);
    const days = last - first;
    const ticked = new Set(dates(used).filter((d) => first <= d && d < last)).size;
    return { days, used: ticked, unit: unit, words: `${ticked} of ${plural(days, one, many)}` };
}
function checkinRows(checkins) {
    if (!Array.isArray(checkins))
        throw new DailyRefusal("checkins_not_list", "checkins must be a list");
    const byDay = new Map();
    checkins.forEach((row, i) => {
        if (!isObject(row))
            throw new DailyRefusal("checkin_not_object", `check-in ${i} must be an object`);
        const day = parseDay(row.date, `check-in ${i} date`);
        try {
            byDay.set(day, checkScores(row.scores, `check-in ${i}`));
        }
        catch (err) {
            if (err instanceof CheckinRefusal)
                throw new DailyRefusal(err.code, err.message);
            throw err;
        }
    });
    return [...byDay.entries()].sort((a, b) => a[0] - b[0]);
}
function diaryLine(c, days, words) {
    const gain = c.higher_is_better ? c.delta : -c.delta;
    const span = `over the ${plural(days, "day", "days")} you used it (${words})`;
    if (c.verdict === "better")
        return `${c.label} ${points(gain)} better ${span}.`;
    if (c.verdict === "worse")
        return `${c.label} ${points(gain)} worse ${span}.`;
    if (c.too_soon)
        return `${c.label}: too soon to tell after ${plural(days, "day", "days")} of use (${words}).`;
    return `${c.label}: no real change ${span}; the difference is within normal photo-to-photo variation.`;
}
/** What her check-ins say about the time she used one product, in plain lines (see Python). */
export function whileUsed(entry, checkins) {
    if (!isObject(entry))
        throw new DailyRefusal("entry_not_object", "the product entry must be an object");
    const start = parseDay(entry.start, "start");
    const end = entry.end === undefined || entry.end === null ? null : parseDay(entry.end, "end");
    if (end !== null && end < start)
        throw new DailyRefusal("end_before_start", "end must be on or after the start date");
    const unit = has(entry, "unit") ? entry.unit : "night";
    unitWords(unit);
    const used = has(entry, "used") ? entry.used : [];
    dates(used);
    const rows = checkinRows(checkins);
    const before = start - DAILY.diary.baseline_before_days, after = start + DAILY.diary.baseline_after_days;
    const out = { format: FORMAT, version: VERSION, status: "no_baseline", start: isoDay(start), end: end === null ? null : isoDay(end),
        baseline: null, follow_up: null, days: null, usage: null, changes: [], lines: [], next_checkin: null, widened: false, note: NOTE };
    const base = rows.filter(([d]) => before <= d && d <= after);
    if (!base.length) {
        out.lines = [`No check-in from the ${DAILY.diary.baseline_before_days} days before you started or the ${DAILY.diary.baseline_after_days} days after, `
                + "so there is no starting point to compare with for this product."];
        return out;
    }
    const [baseDay, baseScores] = base[base.length - 1];
    out.baseline = isoDay(baseDay);
    const later = rows.filter(([d]) => d > after && (end === null || d <= end));
    if (!later.length) {
        const waitFrom = Math.max(parseDay(nextCheckin(isoDay(baseDay), Object.keys(baseScores))), after + 1);
        out.status = "waiting";
        out.next_checkin = isoDay(waitFrom);
        out.lines = [`Starting point: your check-in on ${isoDay(baseDay)}. Check in again from ${isoDay(waitFrom)} to see what changed while you used it.`];
        return out;
    }
    const [followDay, followScores] = later[later.length - 1];
    const days = followDay - start;
    const use = usage(isoDay(start), isoDay(followDay), used, unit);
    const compared = compare(baseScores, followScores, { days: followDay - baseDay, previousAt: isoDay(baseDay) });
    const changes = compared.changes.map((c) => ({ ...c, line: diaryLine(c, days, use.words) }));
    return { ...out, status: "compared", follow_up: isoDay(followDay), days, usage: use, changes,
        lines: changes.length ? changes.map((c) => c.line) : ["These two check-ins share no measured concerns."],
        widened: compared.lighting_differs || compared.pose_differs };
}
function readLog(row, i) {
    if (!isObject(row))
        throw new DailyRefusal("log_not_object", `log ${i} must be an object`);
    const day = parseDay(row.date, `log ${i} date`);
    const feel = has(row, "feel") ? row.feel : [];
    if (!Array.isArray(feel))
        throw new DailyRefusal("feel_not_list", `log ${i} feel must be a list`);
    if (!feel.every((f) => typeof f === "string" && FEELING_IDS.includes(f))) {
        throw new DailyRefusal("feel_unknown", `log ${i}: every feeling must be one of the skin log chips`);
    }
    const patch = has(row, "patch") ? row.patch : false;
    if (typeof patch !== "boolean")
        throw new DailyRefusal("patch_not_bool", `log ${i} patch must be true or false`);
    return [day, FEELINGS.map((f) => f.id).filter((id) => feel.includes(id)), patch];
}
/** The seven days up to `end` as plain counts: no score, no streak. Later logs of a day win. */
export function week(logs, end) {
    const last = parseDay(end, "end");
    if (!Array.isArray(logs))
        throw new DailyRefusal("logs_not_list", "logs must be a list");
    const byDay = new Map();
    logs.forEach((row, i) => { const [day, feel, patch] = readLog(row, i); byDay.set(day, [feel, patch]); });
    const span = DAILY.week.days;
    const days = [];
    for (let k = span - 1; k >= 0; k--) {
        const day = last - k;
        const [feel, patch] = byDay.get(day) ?? [[], false];
        days.push({ date: isoDay(day), weekday: WEEKDAYS[mod(day + 3, 7)], logged: byDay.has(day), feel, patch });
    }
    const logged = days.filter((d) => d.logged).length;
    const counts = FEELINGS.map((f) => ({ id: f.id, label: f.label, count: days.filter((d) => d.feel.includes(f.id)).length }));
    let words;
    if (!logged)
        words = `Nothing logged in the last ${span} days.`;
    else {
        const said = counts.filter((c) => c.count).map((c) => `${c.label} ${plural(c.count, "day", "days")}`).join(", ");
        words = `Logged ${logged} of the last ${span} days.` + (said ? ` ${said}.` : "");
    }
    return { format: FORMAT, version: VERSION, end: isoDay(last), days, logged, missed: span - logged, counts, words };
}
/** The stop and see-a-doctor lines when a patch test is logged with a reaction; else null. */
export function patchCheck(log) {
    const [, feel, patch] = readLog(log, 0);
    const reactions = DAILY.patch.reaction_feelings;
    const hit = feel.filter((f) => reactions.includes(f));
    if (!patch || !hit.length)
        return null;
    return { stop: PATCH_STOP, see_dermatologist_if: [...PATCH_SEE_PRO], feelings: hit };
}
/** Whether this date is an exfoliant night (never a retinoid night) at `nights` a week. */
export function gapNight(day, nights) {
    const when = parseDay(day);
    if (typeof nights !== "number" || !Number.isInteger(nights) || !has(DAILY.gap_nights, String(nights)) || String(nights) === "about") {
        throw new DailyRefusal("nights_invalid", "nights must be 2 or 3 a week");
    }
    const list = DAILY.gap_nights[String(nights)];
    return list.includes(mod(when + 3, 7));
}
/** The first date a new check-in can say more than "too soon" for what was measured. */
export function nextCheckin(last, concerns = []) {
    const when = parseDay(last, "last");
    if (!Array.isArray(concerns))
        throw new DailyRefusal("concerns_not_list", "concerns must be a list");
    const waits = concerns.filter((c) => typeof c === "string" && SPECS.has(c)).map((c) => SPECS.get(c).min_days);
    return isoDay(when + (waits.length ? Math.min(...waits) : WAIT_DAYS));
}
function gcd(a, b) { while (b)
    [a, b] = [b, a % b]; return Math.abs(a); }
/** One lens or story template for the date, the same for everyone on that date. */
export function pick(day, lenses, stories) {
    const when = parseDay(day);
    const items = [];
    for (const [kind, ids] of [["lens", lenses], ["story", stories]]) {
        if (!Array.isArray(ids) || !ids.every((i) => typeof i === "string"))
            throw new DailyRefusal("ids_not_list", `${kind} ids must be a list of strings`);
        for (const id of ids)
            items.push([kind, id]);
    }
    if (!items.length)
        throw new DailyRefusal("nothing_to_pick", "there must be at least one lens or story template");
    let step = DAILY.pick.step;
    while (gcd(step, items.length) !== 1)
        step += 1;
    const index = mod(when * step, items.length);
    const [kind, id] = items[index];
    return { kind, id, index };
}
//# sourceMappingURL=index.js.map