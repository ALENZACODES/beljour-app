/** Reminders she sets, all off by default, each with its own switch:
 *   spf      reapply sunscreen every two hours after she ticks sunscreen in her morning routine,
 *            until 5 pm;
 *   gap      on an exfoliant night (the plan's "not on the same night" rule), in the evening;
 *   checkin  on the first date a new check-in can say more than "too soon" (skin-checkin min_days).
 * Times are ASSUMED (daily.json "reminders"). Browser notifications are used only after she taps
 * to allow them; otherwise, and whenever they are refused or missing, the same reminders show in
 * the page. There is no server and no push service, so a reminder can only show while a Beljour
 * page is open, and the page says so. Author: John Khan.
 */
import { gapNight, localDay, nextCheckin, REMINDER_TIMES } from "./index.js";
export const REMINDER_TITLES = {
    spf: "Reapply sunscreen", gap: "Exfoliant night", checkin: "Time for a check-in",
};
export const PAGE_ONLY = "Reminders show while a Beljour page is open in this browser. There is no server sending them.";
const atHour = (day, hour) => { const d = new Date(day); d.setHours(hour, 0, 0, 0); return d; };
const sameDay = (a, b) => localDay(a) === localDay(b);
const clock = (d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
/** The sunscreen tick of the day, if her morning routine has sunscreen and she ticked it. */
function sunscreenAt(routine, ticks) {
    const step = routine?.morning.find((s) => s.product === "sunscreen");
    const at = step ? ticks[step.id] : undefined;
    return at ? new Date(at) : null;
}
export function spfReminder(on, routine, ticks, now) {
    const why = `Every ${REMINDER_TIMES.spf_every_hours} hours after you tick sunscreen in your morning routine, until ${REMINDER_TIMES.spf_until_hour}:00.`;
    const base = { id: "spf", on, why };
    if (!routine?.morning.some((s) => s.product === "sunscreen"))
        return { ...base, at: null, due: false, key: null, line: "Add sunscreen to your morning routine to use this." };
    const first = sunscreenAt(routine, ticks);
    if (!first || !sameDay(first, now))
        return { ...base, at: null, due: false, key: null, line: "Starts when you tick sunscreen in your morning routine today." };
    const until = atHour(now, REMINDER_TIMES.spf_until_hour);
    const step = REMINDER_TIMES.spf_every_hours * 3_600_000;
    let next = null, lastDue = null;
    for (let t = first.getTime() + step; t <= until.getTime(); t += step) {
        if (t <= now.getTime())
            lastDue = new Date(t);
        else {
            next = new Date(t);
            break;
        }
    }
    if (lastDue)
        return { ...base, at: lastDue, due: true, key: `spf-${clock(lastDue)}`, line: `Reapply sunscreen if you are outdoors (due ${clock(lastDue)}).` };
    if (next)
        return { ...base, at: next, due: false, key: `spf-${clock(next)}`, line: `Next: reapply sunscreen at ${clock(next)}.` };
    return { ...base, at: null, due: false, key: null, line: `No more reapply reminders after ${REMINDER_TIMES.spf_until_hour}:00 today.` };
}
export function gapReminder(on, routine, now) {
    const step = routine?.night.find((s) => s.gapNights);
    const notWith = routine?.gaps[0]?.notWith ?? null;
    const base = { id: "gap", on, why: "From your plan: an exfoliant goes on two or three nights a week, never on the same night as a retinoid." };
    if (!step || !step.gapNights)
        return { ...base, at: null, due: false, key: null, line: "Your routine has no exfoliant kept to its own nights, so there is nothing to remind." };
    for (let k = 0; k < 8; k++) {
        const day = new Date(now);
        day.setDate(day.getDate() + k);
        if (!gapNight(localDay(day), step.gapNights))
            continue;
        const at = atHour(day, REMINDER_TIMES.evening_hour);
        const what = `${step.text}${notWith ? `, not ${notWith}` : ""}`;
        if (k === 0)
            return { ...base, at, due: now >= at, key: now >= at ? `gap-${localDay(day)}` : null, line: `Tonight: ${what}.` };
        return { ...base, at, due: false, key: null, line: `Next exfoliant night: ${day.toLocaleDateString(undefined, { weekday: "long" })}, ${what}.` };
    }
    return { ...base, at: null, due: false, key: null, line: "" };
}
/** From the latest check-in kept on this device (her local date and its measured concerns). */
export function checkinReminder(on, latest, now) {
    const base = { id: "checkin", on, why: "The first day a new check-in can say more than too soon to tell for what you measured." };
    if (!latest)
        return { ...base, at: null, due: false, key: null, line: "Starts after your first Is it working? check-in." };
    const day = nextCheckin(latest.date, [...latest.concerns]);
    const [y, m, d] = day.split("-").map(Number);
    const at = new Date(y, m - 1, d, REMINDER_TIMES.checkin_hour, 0, 0, 0);
    const due = now >= at;
    return { ...base, at, due, key: due ? `checkin-${day}` : null, line: due ? "A new check-in can now show a real change. Same light, same angle as last time." : `Next check-in from ${day}.` };
}
export function reminderStates(settings, routine, ticks, latest, now) {
    return [spfReminder(settings.spf, routine, ticks, now), gapReminder(settings.gap, routine, now), checkinReminder(settings.checkin, latest, now)];
}
export function permission(host = globalThis) {
    try {
        const N = host.Notification;
        if (!N)
            return "unsupported";
        return N.permission === "granted" || N.permission === "denied" ? N.permission : "default";
    }
    catch {
        return "unsupported";
    }
}
/** Ask the browser, and only from her tap. Resolves to what the browser said. */
export async function askPermission(host = globalThis) {
    const N = host.Notification;
    if (!N)
        return "unsupported";
    try {
        await N.requestPermission();
    }
    catch {
        return permission(host);
    }
    return permission(host);
}
/** Show one reminder as a browser notification when allowed; false means show it in the page. */
export function notify(state, host = globalThis) {
    if (permission(host) !== "granted" || !host.Notification)
        return false;
    try {
        new host.Notification(REMINDER_TITLES[state.id], { body: state.line, tag: state.key ?? state.id });
        return true;
    }
    catch {
        return false;
    }
}
