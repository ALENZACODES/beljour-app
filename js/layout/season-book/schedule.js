/** The Season Book's four editions a year and when to ask the reviewed source again.
 * Editions open on 1 March, 1 June, 1 September and 1 December (the meteorological seasons,
 * named for the northern hemisphere; ASSUMED until the editorial calendar fixes its own dates).
 * The book a source returns still carries its own validFrom/validUntil, and those stay the
 * contract for what is shown; this schedule only decides when Home looks for the next one:
 * on the first visit, when a new edition has opened since the last look, or when the book on
 * screen has run out. Nothing polls in the background: the check runs when Home opens or comes
 * back into view. Author: John Khan.
 */
import { checkDay } from "../holiday/calendar.js";
export const EDITION_STARTS = [
    { month: 3, name: "Spring" }, { month: 6, name: "Summer" }, { month: 9, name: "Autumn" }, { month: 12, name: "Winter" },
];
const pad = (n) => String(n).padStart(2, "0");
const first = (year, month) => `${year}-${pad(month)}-01`;
function dayBefore(day) {
    const d = new Date(`${day}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
}
/** The edition a day falls in. */
export function editionOn(day) {
    const value = checkDay(day);
    const year = Number(value.slice(0, 4)), month = Number(value.slice(5, 7));
    let i = EDITION_STARTS.length - 1;
    while (i >= 0 && EDITION_STARTS[i].month > month)
        i--;
    const openYear = i < 0 ? year - 1 : year;
    const index = i < 0 ? EDITION_STARTS.length - 1 : i;
    const start = EDITION_STARTS[index];
    const nextIndex = (index + 1) % EDITION_STARTS.length;
    const next = first(nextIndex === 0 ? openYear + 1 : openYear, EDITION_STARTS[nextIndex].month);
    const name = start.month === 12 ? `${start.name} ${openYear}–${String(openYear + 1).slice(2)}` : `${start.name} ${openYear}`;
    return { id: `${openYear}-${start.name.toLowerCase()}`, name, opens: first(openYear, start.month), closes: dayBefore(next), next };
}
/** The four refresh dates of a year, in order. */
export function refreshDates(year) {
    return EDITION_STARTS.map((e) => first(year, e.month));
}
/** True when Home should ask the reviewed source again. */
export function refreshDue(lastChecked, today, book) {
    const now = checkDay(today);
    if (lastChecked === null)
        return true;
    if (editionOn(lastChecked).id !== editionOn(now).id)
        return true;
    return book !== null && now > book.validUntil;
}
