/** Your skin today (web/skin-day.html): the reasons to open Beljour on an ordinary day, with no
 * face scan. Skin does not change measurably from one day to the next, and the check-in already
 * says "too soon to tell" before two weeks, so this page never measures anything. It holds:
 *   * the morning and night routine, ticked one step at a time (engines/skin-daily/routine.ts);
 *   * the product diary, tied to the Is it working? check-ins she already keeps here;
 *   * the ten-second skin log and its plain weekly counts;
 *   * the reminders she switches on.
 * Everything stays on this device (engines/skin-daily/store.ts); no server, no units, no photo.
 * A missed day is shown as missed, nothing more. Cosmetic tracking, not medical advice.
 * Author: John Khan.
 */
import { announce, h } from "../dom.js";
import { FEELINGS, addDays, patchCheck, usage, week, weekday } from "../engines/skin-daily/index.js";
import { askPermission, notify, PAGE_ONLY, permission, reminderStates, REMINDER_TITLES } from "../engines/skin-daily/reminders.js";
import { addStep, moveStep, progress, removeStep, setGapNights, SLOT_TITLES, starterRoutine, stepsOn, timeLine, dayPart, RoutineEditError, } from "../engines/skin-daily/routine.js";
import { checkinDays, DailyStore, DailyStoreError, deviceCheckins, diaryResult, entryName, usualSlot } from "../engines/skin-daily/store.js";
import { browserStorage } from "../engines/skin-checkin/store.js";
import { art, productPicture, uiIcon } from "./skin-moment-art.js";
import { PRODUCT_IDS, PRODUCT_TYPES } from "./skin-moment-products.js";
import { migrateOldTrials } from "../news/trial.js";
/** Skincare first in the picker and the diary; then makeup (PRODUCT_TYPES order). */
const MAKEUP = new Set(PRODUCT_IDS.slice(0, PRODUCT_IDS.indexOf("gentle-cleanser")));
const SKINCARE_IDS = PRODUCT_IDS.filter((id) => !MAKEUP.has(id));
const MAKEUP_IDS = PRODUCT_IDS.filter((id) => MAKEUP.has(id));
const GREETING = { morning: "Good morning", afternoon: "Good afternoon", evening: "Good evening" };
function shortDate(day) {
    const [y, m, d] = day.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
export function mountSkinDay(root, store = new DailyStore(), storage = browserStorage()) {
    // Tries saved by the news page's earlier separate store join this diary once.
    migrateOldTrials(store, storage);
    const checkins = () => deviceCheckins(storage);
    const keep = (r) => store.setRoutine(r);
    let editing = false;
    let picking = false;
    const status = h("p", { class: "sd-status lg-small", role: "status" });
    const say = (text) => { status.textContent = text; announce(text); };
    const sections = {
        due: h("div", { class: "sd-due", "aria-live": "polite" }),
        head: h("section", { class: "sd-head", "aria-labelledby": "sd-h1" }),
        routine: h("section", { class: "sm-section", id: "routine", "aria-labelledby": "sd-routine-h" }),
        diary: h("section", { class: "sm-section", id: "diary", "aria-labelledby": "sd-diary-h" }),
        log: h("section", { class: "sm-section", id: "log", "aria-labelledby": "sd-log-h" }),
        reminders: h("section", { class: "sm-section", id: "reminders", "aria-labelledby": "sd-rem-h" }),
        data: h("section", { class: "sm-section sd-data", "aria-labelledby": "sd-data-h" }),
    };
    root.replaceChildren(sections.due, sections.head, sections.routine, sections.diary, sections.log, sections.reminders, sections.data, status);
    /** Redraw one section and put focus back on the control that was used (data-key). */
    function redraw(which, build) {
        const key = document.activeElement?.dataset?.key;
        sections[which].replaceChildren(...build().filter((x) => !!x));
        if (key)
            sections[which].querySelector(`[data-key="${CSS.escape(key)}"]`)?.focus();
    }
    /* ------------------------------ head ------------------------------ */
    function head() {
        const now = store.now(), today = store.today();
        const t = timeLine(store.routine() ?? starterRoutine(), store.ticks(today), now, today);
        return [
            h("p", { class: "sm-eyebrow" }, "Every day · no face scan needed"),
            h("h1", { class: "sm-h1", id: "sd-h1", tabindex: "-1" }, GREETING[t.part]),
            h("p", { class: "sm-lede" }, "Your routine, your products and how your skin feels, kept on this device. Skin doesn't change measurably from one day to the next, so the face check-in stays every two to four weeks; this page needs no photo and no units."),
            h("div", { class: "sm-callout sd-now" }, uiIcon(t.part === "evening" ? "this-week" : "today", art("plan-today"), 40), h("div", {}, h("p", { class: "sd-now-title" }, t.title), h("p", {}, t.line))),
            h("nav", { class: "sd-jump", "aria-label": "On this page" }, ...[["#routine", "Routine"], ["#diary", "Product diary"], ["#log", "Skin log"], ["#reminders", "Reminders"]].map(([href, text]) => h("a", { href }, text))),
        ];
    }
    /* ------------------------------ routine ------------------------------ */
    function routineSection() {
        const mine = store.routine();
        const r = mine ?? starterRoutine();
        const today = store.today();
        const ticks = store.ticks(today);
        const part = dayPart(store.now().getHours());
        const now = part === "evening" ? "night" : "morning";
        const from = mine?.source === "plan"
            ? `From your Skin Moment plan${mine.from ? ` (${mine.from})` : ""}. Change it as you like.`
            : "A simple starter routine. Make it yours, or build one from your Skin Moment plan.";
        const cards = ["morning", "night"].map((slot) => {
            const p = progress(r, slot, today, ticks);
            const list = h("ul", { class: "sd-steps" }, ...stepsOn(r, slot, today).map(({ step, off }, i, all) => {
                const done = !!ticks[step.id];
                const tick = h("button", { type: "button", class: `sd-tick${done ? " is-done" : ""}`, role: "checkbox", "aria-checked": String(done),
                    "data-key": `tick-${step.id}`, disabled: !!off, onclick: () => {
                        if (!store.routine())
                            keep(r);
                        const on = store.toggle(today, step.id);
                        say(`${step.text}: ${on ? "done" : "not done"}.`);
                        redrawAll();
                    } }, h("span", { class: "sd-box", "aria-hidden": "true" }, done ? "✓" : ""), productPicture(step.product, 40), h("span", { class: "sd-step-text" }, step.text, off ? h("span", { class: "sd-off" }, off) : step.because ? h("span", { class: "sd-why" }, step.because) : null));
                const tools = editing ? h("span", { class: "sd-tools" }, h("button", { type: "button", class: "sd-icon-btn", "data-key": `up-${step.id}`, disabled: i === 0, "aria-label": `Move ${step.text} up`,
                    onclick: () => { keep(moveStep(r, step.id, -1)); redrawAll(); } }, "↑"), h("button", { type: "button", class: "sd-icon-btn", "data-key": `down-${step.id}`, disabled: i === all.length - 1, "aria-label": `Move ${step.text} down`,
                    onclick: () => { keep(moveStep(r, step.id, 1)); redrawAll(); } }, "↓"), h("button", { type: "button", class: "sd-icon-btn sd-remove", "data-key": `rm-${step.id}`, "aria-label": `Remove ${step.text}`,
                    onclick: () => { keep(removeStep(r, step.id)); say(`${step.text} removed from ${SLOT_TITLES[slot].toLowerCase()}.`); redrawAll(); } }, "✕")) : null;
                return h("li", { class: "sd-step" }, tick, tools);
            }));
            const empty = r[slot].length ? null : h("p", { class: "lg-small" }, "No steps yet. Add one below.");
            return h("section", { class: `sd-card${slot === now ? " is-now" : ""}`, "aria-labelledby": `sd-${slot}-h` }, h("div", { class: "sd-card-top" }, h("h3", { id: `sd-${slot}-h` }, SLOT_TITLES[slot]), slot === now ? h("span", { class: "sm-chip sd-now-chip" }, "Now") : null, h("span", { class: "sd-count" }, p.total ? `${p.done} of ${p.total} done` : "")), list, empty, editing ? addForm(r, slot) : null);
        });
        const gapStep = r.night.find((s) => s.gapNights);
        const gap = gapStep ? h("p", { class: "lg-small sd-gap" }, `${gapStep.text} goes on ${gapStep.gapNights} nights a week, never on the same night as ${r.gaps[0]?.notWith ?? "a retinoid"}. `, h("button", { type: "button", class: "lg-link", "data-key": "gap-nights", onclick: () => { keep(setGapNights(r, gapStep.gapNights === 2 ? 3 : 2)); redrawAll(); } }, gapStep.gapNights === 2 ? "Use 3 nights a week" : "Use 2 nights a week")) : null;
        return [
            h("h2", { id: "sd-routine-h" }, uiIcon("today", undefined, 24), "Morning and night routine"),
            h("p", { class: "lg-small" }, from, " ", h("a", { href: "skin-moment.html" }, "Get a plan from Skin Moment")),
            h("div", { class: "sd-cards" }, ...cards),
            gap,
            h("div", { class: "sm-actions" }, h("button", { type: "button", class: "lg-button", "data-key": "edit", "aria-pressed": String(editing),
                onclick: () => { editing = !editing; redraw("routine", routineSection); } }, editing ? "Done editing" : "Edit steps"), mine ? h("button", { type: "button", class: "lg-link", "data-key": "reset", onclick: () => {
                    store.setRoutine(starterRoutine());
                    say("Back to the starter routine. Your ticks for earlier days stay.");
                    redrawAll();
                } }, "Start again from the starter routine") : null),
            weekStrip(r),
        ];
    }
    function addForm(r, slot) {
        const id = `sd-add-${slot}`;
        const input = h("input", { id, type: "text", maxlength: "80", class: "sm-input", placeholder: slot === "morning" ? "For example, Vitamin C serum" : "For example, Eye cream", "data-key": `add-in-${slot}` });
        const problem = h("p", { class: "sm-problem", role: "alert", hidden: true });
        return h("form", { class: "sd-add", onsubmit: (e) => {
                e.preventDefault();
                try {
                    keep(addStep(r, slot, input.value).routine);
                    say(`Added to ${SLOT_TITLES[slot].toLowerCase()}.`);
                    redrawAll();
                    document.getElementById(id)?.focus();
                }
                catch (err) {
                    if (err instanceof RoutineEditError) {
                        problem.textContent = err.message;
                        problem.hidden = false;
                    }
                    else
                        throw err;
                }
            } }, h("label", { for: id }, `Add a step to ${SLOT_TITLES[slot].toLowerCase()}`), h("div", { class: "sm-row" }, input, h("button", { type: "submit", class: "lg-button", "data-key": `add-${slot}` }, "Add")), problem);
    }
    /** The last seven days, morning and night: done, part done or missed. Plain marks, no streak. */
    function weekStrip(r) {
        const today = store.today();
        const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
        const first = store.firstDay();
        const mark = (day, slot) => {
            const p = progress(r, slot, day, store.ticks(day));
            if (day < first)
                return h("span", { class: "sd-mark" }, "–", h("span", { class: "visually-hidden" }, " before you started"));
            if (day === today && !p.done)
                return h("span", { class: "sd-mark" }, "·", h("span", { class: "visually-hidden" }, " not yet"));
            if (p.complete)
                return h("span", { class: "sd-mark is-done" }, "✓", h("span", { class: "visually-hidden" }, " done"));
            if (p.done)
                return h("span", { class: "sd-mark is-part" }, `${p.done}/${p.total}`);
            return h("span", { class: "sd-mark is-missed" }, "missed");
        };
        const names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
        return h("div", { class: "sd-week" }, h("h3", {}, "The last seven days"), h("table", { class: "sd-week-table" }, h("thead", {}, h("tr", {}, h("th", { scope: "col" }, h("span", { class: "visually-hidden" }, "Routine")), ...days.map((d) => h("th", { scope: "col" }, d === today ? "Today" : names[weekday(d)])))), h("tbody", {}, ...["morning", "night"].map((slot) => h("tr", {}, h("th", { scope: "row" }, slot === "morning" ? "Morning" : "Night"), ...days.map((d) => h("td", {}, mark(d, slot))))))), h("p", { class: "lg-small" }, "A missed day is just missed. There is no streak to lose."));
    }
    /* ------------------------------ product diary ------------------------------ */
    function diarySection() {
        const entries = store.diary().sort((a, b) => (a.end ? 1 : 0) - (b.end ? 1 : 0) || (a.start < b.start ? 1 : -1));
        const snaps = checkins();
        const list = entries.length ? h("ul", { class: "sd-diary" }, ...entries.map((e) => diaryItem(e, snaps))) :
            h("div", { class: "sm-callout" }, art("empty-history"), h("p", {}, "No products yet. When you start something new, add it here and tick it in your routine. Your next check-ins then say what changed while you used it."));
        return [
            h("h2", { id: "sd-diary-h" }, uiIcon("checkin-calendar", undefined, 24), "Product diary"),
            h("p", { class: "lg-small" }, `Ties into Is it working?: ${snaps.length ? `${snaps.length} check-in${snaps.length === 1 ? "" : "s"} kept on this device.` : "no check-ins on this device yet."} `, h("a", { href: "skin-moment.html#checkin" }, snaps.length ? "Check in again" : "Do a first check-in")),
            picking ? picker() : h("div", { class: "sm-actions" }, h("button", { type: "button", class: "lg-button lg-primary", "data-key": "start-product",
                onclick: () => { picking = true; redraw("diary", diarySection); sections.diary.querySelector("input[name=sd-product]")?.focus(); } }, "I started a new product")),
            list,
        ];
    }
    function diaryItem(e, snaps) {
        const result = diaryResult(e, snaps);
        const today = store.today();
        // Up to and including today (or the stop date): "used 12 of 14 nights so far".
        const so = usage(e.start, addDays((e.end ?? today) < e.start ? e.start : e.end ?? today, 1), e.used, e.unit);
        const tone = (v) => (v === "better" ? "better" : v === "worse" ? "worse" : "same");
        return h("li", { class: "sd-product" }, h("div", { class: "sd-product-top" }, productPicture(e.product, 56), h("div", {}, h("h3", {}, entryName(e)), e.label ? h("p", { class: "lg-small sd-product-type" }, PRODUCT_TYPES[e.product], e.news ? " · " : "", e.news ? h("a", { href: `news.html#nw-${e.news}` }, "From What's new in beauty") : null) : null, h("p", { class: "lg-small" }, `Started ${shortDate(e.start)}${e.end ? `, stopped ${shortDate(e.end)}` : ""} · ${e.unit === "morning" ? "Morning" : "Night"} routine · used ${so.words}${e.end ? "" : " so far"}`, e.step || e.end ? "" : ". Not in your routine: add it there to count the nights."))), result.status === "compared"
            ? h("ul", { class: "sd-result" }, ...result.changes.map((c) => h("li", { class: `sm-change-${tone(c.verdict)}` }, h("span", { class: "sm-chip" }, c.verdict === "better" ? "Better" : c.verdict === "worse" ? "Worse" : c.too_soon ? "Too soon" : "No real change"), " ", c.line)))
            : h("p", { class: "sd-result-wait" }, result.lines[0]), result.status === "compared" ? h("p", { class: "lg-small" }, `Check-ins ${shortDate(result.baseline)} and ${shortDate(result.follow_up)}. ${result.widened ? "Lighting or angle differed, so only bigger changes count. " : ""}${result.note}`) : null, h("div", { class: "sm-row" }, e.end ? null : h("button", { type: "button", class: "lg-link", "data-key": `stop-${e.id}`, onclick: () => { store.stopProduct(e.id); say(`${entryName(e)}: stopped today. Its dates stay in the diary.`); redrawAll(); } }, "I stopped using it"), h("button", { type: "button", class: "lg-link", "data-key": `del-${e.id}`, onclick: () => { store.removeProduct(e.id); say(`${entryName(e)} removed from the diary.`); redrawAll(); } }, "Remove from the diary")));
    }
    function picker() {
        const today = store.today();
        const problem = h("p", { class: "sm-problem", role: "alert", hidden: true });
        const date = h("input", { type: "date", id: "sd-start", value: today, max: today, class: "sm-input" });
        const slotIn = (slot) => h("input", { type: "radio", name: "sd-slot", id: `sd-slot-${slot}`, value: slot });
        const am = slotIn("morning"), pm = slotIn("night");
        pm.checked = true;
        const group = (title, ids) => h("fieldset", { class: "sd-types" }, h("legend", {}, title), ...ids.map((id) => h("label", { class: "sd-type" }, h("input", { type: "radio", name: "sd-product", value: id, onchange: () => { (usualSlot(id) === "morning" ? am : pm).checked = true; } }), productPicture(id, 48), h("span", {}, PRODUCT_TYPES[id]))));
        return h("form", { class: "sm-card sd-picker", "aria-labelledby": "sd-picker-h", onsubmit: (ev) => {
                ev.preventDefault();
                const chosen = sections.diary.querySelector("input[name=sd-product]:checked")?.value;
                if (!chosen) {
                    problem.textContent = "Pick the product type you started.";
                    problem.hidden = false;
                    return;
                }
                try {
                    if (!store.routine())
                        keep(starterRoutine());
                    const e = store.startProduct(chosen, date.value || today, am.checked ? "morning" : "night");
                    picking = false;
                    say(`${PRODUCT_TYPES[e.product]} added to the diary${e.step ? ` and to ${am.checked ? "this morning" : "tonight"}'s routine` : ""}.`);
                    redrawAll();
                }
                catch (err) {
                    if (err instanceof DailyStoreError) {
                        problem.textContent = err.message;
                        problem.hidden = false;
                    }
                    else
                        throw err;
                }
            } }, h("h3", { id: "sd-picker-h" }, "What did you start?"), h("p", { class: "lg-small" }, "Product types only, no brands. Your routine ticks count the nights you used it."), group("Skincare", SKINCARE_IDS), group("Makeup", MAKEUP_IDS), h("div", { class: "sd-picker-row" }, h("label", { for: "sd-start" }, "Started on"), date), h("fieldset", { class: "sd-slot" }, h("legend", {}, "Used in"), h("label", {}, am, " This morning's routine"), h("label", {}, pm, " Tonight's routine")), problem, h("div", { class: "sm-actions" }, h("button", { type: "submit", class: "lg-button lg-primary" }, "Add to my diary"), h("button", { type: "button", class: "lg-link", onclick: () => { picking = false; redraw("diary", diarySection); } }, "Cancel")));
    }
    /* ------------------------------ skin log ------------------------------ */
    function logSection() {
        const today = store.today();
        const mine = store.logFor(today);
        const feel = new Set(mine?.feel ?? []);
        const save = (next) => {
            try {
                store.log({ date: today, feel: next.feel ?? [...feel], patch: next.patch ?? mine?.patch ?? false, note: next.note ?? mine?.note ?? "" });
            }
            catch (err) {
                if (err instanceof DailyStoreError)
                    say(err.message);
                else
                    throw err;
            }
            redraw("log", logSection);
        };
        const chips = h("div", { class: "sd-chips", role: "group", "aria-labelledby": "sd-log-q" }, ...FEELINGS.map((f) => h("button", {
            type: "button", class: `sd-feel${feel.has(f.id) ? " is-on" : ""}`, "aria-pressed": String(feel.has(f.id)), "data-key": `feel-${f.id}`,
            onclick: () => { if (feel.has(f.id))
                feel.delete(f.id);
            else
                feel.add(f.id); save({ feel: [...feel] }); say(`Logged: ${[...feel].map((x) => FEELINGS.find((y) => y.id === x).label.toLowerCase()).join(", ") || "nothing"}.`); },
        }, f.label)));
        const patch = h("input", { type: "checkbox", id: "sd-patch", "data-key": "patch", checked: !!mine?.patch, onchange: () => save({ patch: patch.checked }) });
        const note = h("input", { type: "text", id: "sd-note", maxlength: "140", class: "sm-input", value: mine?.note ?? "", "data-key": "note",
            placeholder: "Which product, where on your skin", onchange: () => save({ note: note.value }) });
        const warning = mine ? patchCheck({ date: mine.date, feel: mine.feel, patch: mine.patch }) : null;
        const w = week(store.logs().map((l) => ({ date: l.date, feel: l.feel, patch: l.patch })), today);
        return [
            h("h2", { id: "sd-log-h" }, uiIcon("good-light", undefined, 24), "Ten-second skin log"),
            h("p", { class: "sd-q", id: "sd-log-q" }, "How does your skin feel today?"),
            chips,
            h("p", { class: "sm-tick sd-patch" }, patch, h("label", { for: "sd-patch" }, "I'm patch testing a product")),
            patch.checked ? h("p", { class: "sd-picker-row" }, h("label", { for: "sd-note" }, "Patch-test note (optional)"), note) : null,
            warning ? h("aside", { class: "sm-derm sd-warn", role: "alert", "aria-labelledby": "sd-warn-h" }, uiIcon("dermatologist", art("plan-dermatologist"), 48), h("div", {}, h("h3", { id: "sd-warn-h" }, "Stop and see a dermatologist if"), h("p", {}, h("strong", {}, warning.stop)), h("ul", {}, ...warning.see_dermatologist_if.map((x) => h("li", {}, x))), h("p", { class: "lg-small" }, "Not medical advice."))) : null,
            h("div", { class: "sd-pattern" }, h("h3", {}, "This week"), h("ol", { class: "sd-pattern-days" }, ...w.days.map((d) => h("li", { class: d.logged ? "is-logged" : "is-missed" }, h("span", { class: "sd-pattern-day" }, d.date === today ? "Today" : d.weekday), d.logged ? h("span", {}, d.feel.length ? d.feel.map((x) => FEELINGS.find((f) => f.id === x).label).join(", ") : "Logged") : h("span", { class: "sd-missed" }, "Not logged"), d.patch ? h("span", { class: "sm-chip" }, "Patch test") : null))), h("p", {}, w.words)),
        ];
    }
    /* ------------------------------ reminders ------------------------------ */
    function latestCheckin() {
        const days = checkinDays(checkins());
        const last = days[days.length - 1];
        return last ? { date: last.date, concerns: Object.keys(last.scores) } : null;
    }
    function states() {
        const r = store.routine() ?? starterRoutine();
        return reminderStates(store.reminders(), r, store.ticks(store.today()), latestCheckin(), store.now());
    }
    function remindersSection() {
        const perm = permission();
        const on = store.reminders();
        const anyOn = on.spf || on.gap || on.checkin;
        const permLine = perm === "granted" ? "Browser notifications are allowed for this site." : perm === "denied"
            ? "This browser blocks notifications for this site, so reminders show on this page instead." : perm === "unsupported"
            ? "This browser has no notifications here, so reminders show on this page instead." : "Reminders show on this page. You can also allow browser notifications.";
        return [
            h("h2", { id: "sd-rem-h" }, uiIcon("checkin-calendar", undefined, 24), "Reminders"),
            h("p", { class: "lg-small" }, "All off until you switch one on. ", PAGE_ONLY),
            h("ul", { class: "sd-rems" }, ...states().map((s) => {
                const id = `sd-rem-${s.id}`;
                const box = h("input", { type: "checkbox", role: "switch", id, "data-key": id, checked: s.on, onchange: () => {
                        store.setReminders({ [s.id]: box.checked });
                        say(`${REMINDER_TITLES[s.id]} reminder ${box.checked ? "on" : "off"}.`);
                        redraw("reminders", remindersSection);
                        tick();
                    } });
                return h("li", { class: `sd-rem${s.on ? " is-on" : ""}` }, h("p", { class: "sd-rem-top" }, box, h("label", { for: id }, REMINDER_TITLES[s.id])), h("p", { class: "lg-small" }, s.on ? s.line : s.why));
            })),
            h("p", { class: "lg-small sd-perm" }, permLine, " ", anyOn && perm === "default" ? h("button", { type: "button", class: "lg-button", "data-key": "allow", onclick: async () => {
                    const got = await askPermission();
                    say(got === "granted" ? "Browser notifications allowed." : "Notifications not allowed; reminders stay on this page.");
                    redraw("reminders", remindersSection);
                } }, "Allow browser notifications") : null),
        ];
    }
    /** Due reminders: a browser notification when allowed, and always a line at the top of the page. */
    function tick() {
        const today = store.today();
        const due = states().filter((s) => s.on && s.due && s.key);
        for (const s of due)
            if (!store.wasShown(today, s.key)) {
                notify(s);
                store.markShown(today, s.key);
            }
        sections.due.replaceChildren(...due.map((s) => h("div", { class: "sm-callout sm-callout-warn sd-due-item", role: "note" }, uiIcon("checkin-calendar", undefined, 32), h("p", {}, h("strong", {}, `${REMINDER_TITLES[s.id]}. `), s.line))));
    }
    /* ------------------------------ your data ------------------------------ */
    function dataSection() {
        return [
            h("h2", { id: "sd-data-h" }, uiIcon("privacy-lock", undefined, 24), "Kept on this device"),
            h("p", { class: "lg-small" }, "Your routine, ticks, product diary, skin log and reminder switches are saved in this browser only. Nothing is uploaded, and no unit is spent. Cosmetic tracking, not medical advice."),
            store.note ? h("p", { class: "lg-small" }, store.note) : null,
            h("div", { class: "sm-row" }, h("button", { type: "button", class: "lg-link", onclick: () => {
                    const url = URL.createObjectURL(new Blob([store.exportText()], { type: "application/json" }));
                    const a = h("a", { href: url, download: "beljour-skin-day.json" });
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                } }, "Export as a file"), h("button", { type: "button", class: "lg-link sm-delete", onclick: () => { const out = store.deleteAll(); editing = false; picking = false; say(out.note); redrawAll(); } }, uiIcon("delete-photo", undefined, 20), "Delete all of it from this device")),
        ];
    }
    function redrawAll() {
        redraw("head", head);
        redraw("routine", routineSection);
        redraw("diary", diarySection);
        redraw("log", logSection);
        redraw("reminders", remindersSection);
        redraw("data", dataSection);
        tick();
    }
    redrawAll();
    root.dataset.ready = "1";
    // Due reminders are checked once a minute while the page is open, and when it comes back into view.
    setInterval(tick, 60_000);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible")
        redrawAll(); });
}
const root = typeof document !== "undefined" ? document.getElementById("sd-root") : null;
if (root)
    mountSkinDay(root);
//# sourceMappingURL=skin-day.js.map