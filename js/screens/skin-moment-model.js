import { CONCERNS as CHECKIN_CONCERNS } from "../engines/skin-checkin/index.js";
import { CheckinStore } from "../engines/skin-checkin/store.js";
import { productForCatalogue, productForLine } from "./skin-moment-products.js";
export const CONSENT_VERSION = "beljour-consent/1";
export const MOMENTS = [
    { id: "buy", title: "Before I buy", question: "Will this product suit my skin?", art: "moment-buy",
        detail: "Your skin is measured, product types are ranked by what it shows, and the best match is tried on your face." },
    { id: "breakout", title: "After a breakout", question: "What do I do now?", art: "moment-breakout",
        detail: "What to do today, this week, and what to stop, from the redness, spots and texture measured in your photo." },
    { id: "checkin", title: "Is it working?", question: "Has my skin changed since last time?", art: "moment-checkin",
        detail: "Today's measurement next to your last one, kept on this device only. Small changes are called no real change." },
];
export const CONSENT_TEXT = [
    "I am 18 or older.",
    "Send this photo to YouCam for one skin analysis. YouCam deletes the photo after the result.",
];
/** The agreement line for a moment: the one consent names every YouCam call the moment can make
 * with this photo (the server checks it again before each one). */
export function consentText(moment) {
    if (moment === "buy")
        return "Send this photo to YouCam for one skin analysis, one skin tone reading and two makeup try-ons on the same photo (the matched shade, then the full look with lip colour and blush). YouCam deletes the photo after each result.";
    if (moment === "breakout")
        return "Send this photo to YouCam for one skin analysis and one skin preview of the plan on the same photo. YouCam deletes the photo after each result.";
    return CONSENT_TEXT[1];
}
/** The plain list of what leaves this device, per moment. */
export function whatIsSent(moment) {
    const sent = ["This photo, to the Beljour server and from there to YouCam for one skin analysis."];
    if (moment === "buy")
        sent.push("The same photo for one skin tone reading (skin and lip colour) and two makeup try-ons: the matched shade, then the full look.");
    if (moment === "breakout")
        sent.push("The same photo for one skin preview: the concerns the plan works on, softened, not erased.");
    if (moment === "checkin")
        sent.push("The scores from your last check-in (numbers only, never a photo), so the server can compare.");
    return { sent, kept: [
            "Your earlier check-ins stay on this device. You can delete them at any time.",
            "No name, email or account. Uploads to the Beljour server are deleted within an hour.",
            "Units come from this app's allowance; you never pay for a call.",
        ] };
}
export const LOCAL_TEXT = "Local estimate only: nothing is sent to YouCam and no units are used. The photo still goes to the Beljour server, which measures fewer things.";
export const DEMO_LABEL = "Saved example";
export const DEMO_NOTE = "Saved example: a stored result, not a measurement of your photo. No server is used and no units are spent.";
/** A server is connected but has no YouCam key (GET /api/health says live: false). */
export const DEMO_SERVER_NOTE = "Demo mode: saved examples, no YouCam calls. This server has no YouCam key, so every moment shows a saved example, clearly labelled.";
export const NO_SERVER_NOTE = "This copy has no server connected, so each moment runs from a saved example, clearly labelled. Your photo, if you add one, is only checked on this device.";
export const PHOTO_MIN_SIDE = 480;
export const PHOTO_MAX_BYTES = 8_000_000;
/** The app's own photo checks (face/quality.ts) plus the server's size limits, as one list. */
export function photoChecks(f) {
    const out = [];
    const short = Math.min(f.width, f.height);
    out.push(short >= PHOTO_MIN_SIDE
        ? { id: "size", level: "pass", message: `Big enough (${f.width} × ${f.height}).` }
        : { id: "size", level: "block", message: `Too small: the short side is ${short} pixels and skin analysis needs at least ${PHOTO_MIN_SIDE}.` });
    if (f.bytes > PHOTO_MAX_BYTES)
        out.push({ id: "bytes", level: "block", message: "Over 8 MB after preparing. Choose a smaller photo." });
    if (f.face === null) {
        out.push({ id: "face", level: "info", message: "The face check isn't available on this device; the server checks the face before any unit is spent." });
    }
    else {
        for (const c of f.face) {
            out.push({ id: c.id, level: c.ok ? "pass" : c.id === "face" ? "block" : "warn", message: c.message });
        }
    }
    return out;
}
export function photoVerdict(checks) {
    return checks.some((c) => c.level === "block") ? "blocked" : checks.some((c) => c.level === "warn") ? "warn" : "ready";
}
export class ConsentMissing extends Error {
}
export class PhotoNotReady extends Error {
}
export function attestation(photoId, givenAt) {
    return { version: CONSENT_VERSION, adult: true, scope: "skin", photo_id: photoId, given_at: givenAt };
}
/** The scores worth keeping for a later check-in: measured raw scores only, never a photo. */
export function snapshotOf(reply, takenAt) {
    if (reply.source === "saved_example" || !reply.analysis.concerns.length)
        return null;
    return { taken_at: takenAt, source: reply.source === "youcam" ? "youcam" : "local",
        concerns: reply.analysis.concerns.map((c) => ({ concern: c.concern, raw_score: c.raw_score })) };
}
function errorFields(err) {
    const e = err;
    return { code: e && typeof e.code === "string" ? e.code : "error",
        message: e && typeof e.message === "string" && e.message ? e.message : "Something went wrong. Your choices are kept; try again." };
}
export class MomentController {
    transport;
    history;
    demo;
    now;
    state = { kind: "choose" };
    listeners = new Set();
    consentGiven = false;
    constructor(transport, history, demo, now = Date.now) {
        this.transport = transport;
        this.history = history;
        this.demo = demo;
        this.now = now;
    }
    get demoMode() { return this.transport === null; }
    get busy() { return this.state.kind === "loading"; }
    subscribe(fn) {
        this.listeners.add(fn);
        fn(this.state);
        return () => { this.listeners.delete(fn); };
    }
    set(next) {
        this.state = next;
        for (const fn of this.listeners)
            fn(next);
        return next;
    }
    moment() {
        const s = this.state;
        const m = s.kind === "choose" ? null : s.moment;
        if (!m)
            throw new RangeError("pick a moment first");
        return m;
    }
    choose(moment) {
        if (!MOMENTS.some((m) => m.id === moment))
            throw new RangeError("unknown moment");
        this.consentGiven = false;
        return this.set({ kind: "consent", moment, problem: null });
    }
    /** Agree to send. Both answers are required; without them nothing is sent. */
    agree(answers) {
        const moment = this.moment();
        if (answers.adult !== true || answers.agreed !== true) {
            const problem = answers.adult !== true
                ? "Skin Moment is for adults only. Tick \"I am 18 or older\" to continue. Nothing was sent."
                : "Tick both boxes to send your photo, or choose the local estimate. Nothing was sent.";
            this.set({ kind: "consent", moment, problem });
            throw new ConsentMissing(problem);
        }
        this.consentGiven = true;
        return this.set({ kind: "photo", moment, mode: "youcam", photo: null });
    }
    /** Local estimate: no YouCam call, so only the adult answer is needed. */
    localOnly(answers) {
        const moment = this.moment();
        if (answers.adult !== true) {
            const problem = "Skin Moment is for adults only. Tick \"I am 18 or older\" to continue. Nothing was sent.";
            this.set({ kind: "consent", moment, problem });
            throw new ConsentMissing(problem);
        }
        this.consentGiven = false;
        return this.set({ kind: "photo", moment, mode: "local", photo: null });
    }
    /** The app's own photo checks on the chosen photo; a blocked photo can't be sent. */
    checked(checks) {
        const s = this.state;
        if (s.kind !== "photo")
            return s;
        const verdict = photoVerdict(checks);
        const note = verdict === "blocked" ? "This photo can't be used. Choose another one; nothing was sent."
            : verdict === "warn" ? "Usable, but the result may be less reliable. A clearer photo helps."
                : "The photo checks passed.";
        return this.set({ ...s, photo: { checks, verdict, note } });
    }
    clearPhoto() {
        const s = this.state;
        return s.kind === "photo" ? this.set({ ...s, photo: null }) : s;
    }
    /** "Try a saved example": a complete, labelled result without a photo, a server or units. */
    example(moment, mode = "youcam") {
        if (this.busy)
            return this.state;
        if (!MOMENTS.some((m) => m.id === moment))
            throw new RangeError("unknown moment");
        this.consentGiven = false;
        return this.set({ kind: "result", moment, reply: this.demo.reply(moment, mode), history: this.demo.history(moment) });
    }
    /** Send the checked photo (or show the saved example in demo mode). */
    async send(photo) {
        if (this.busy)
            return this.state;
        const moment = this.moment();
        const s = this.state;
        if (this.demoMode) {
            if (s.kind === "photo" && s.photo?.verdict === "blocked")
                throw new PhotoNotReady(s.photo.note);
            return this.example(moment, s.kind === "photo" ? s.mode : "youcam");
        }
        if (s.kind !== "photo")
            throw new PhotoNotReady("Add a photo first.");
        if (!photo || !s.photo)
            throw new PhotoNotReady("Add a photo first; it is checked before anything is sent.");
        if (s.photo.verdict === "blocked")
            throw new PhotoNotReady(s.photo.note);
        const mode = s.mode;
        if (mode === "youcam" && !this.consentGiven)
            return this.set({ kind: "consent", moment, problem: null });
        this.set({ kind: "loading", moment, mode });
        try {
            const { photo_id } = await this.transport.uploadPhoto(photo);
            const previous = moment === "checkin" ? this.history.latest() : null;
            const body = { moment, photo_id,
                ...(mode === "local" ? { local_only: true } : { consent: attestation(photo_id, this.now()) }),
                ...(previous ? { previous } : {}) };
            const reply = await this.transport.skinMoment(body);
            // Every measured result is kept on the device so a later "Is it working?" has something to compare with.
            const snap = snapshotOf(reply, new Date(this.now()).toISOString());
            if (snap) {
                try {
                    this.history.add(snap);
                }
                catch { /* storage blocked: the result still shows */ }
            }
            return this.set({ kind: "result", moment, reply, history: this.history.list() });
        }
        catch (err) {
            const { code, message } = errorFields(err);
            if (code.startsWith("consent")) {
                this.consentGiven = false;
                return this.set({ kind: "consent", moment, problem: message || "The server asked for your consent again before sending. Nothing was sent." });
            }
            return this.set({ kind: "error", moment, code, message });
        }
    }
    /** Forget her check-ins on this device. */
    forgetHistory() {
        this.history.clear();
        const s = this.state;
        return s.kind === "result" && s.reply.source !== "saved_example" ? this.set({ ...s, history: [] }) : s;
    }
    back() {
        const s = this.state;
        if (s.kind === "choose")
            return s;
        if (s.kind === "consent" || s.kind === "result" || s.moment === null)
            return this.set({ kind: "choose" });
        if (s.kind === "loading")
            return s;
        return this.set({ kind: "consent", moment: s.moment, problem: null });
    }
    /** After an error: back to the photo step, with the same moment and mode. */
    retry() {
        const s = this.state;
        if (s.kind !== "error" || !s.moment)
            return this.restart();
        return this.consentGiven ? this.set({ kind: "photo", moment: s.moment, mode: "youcam", photo: null })
            : this.set({ kind: "consent", moment: s.moment, problem: null });
    }
    restart() { this.consentGiven = false; return this.set({ kind: "choose" }); }
}
/* ---------------------------------- steps ---------------------------------- */
export const STEP_NAMES = ["Moment", "Consent", "Photo", "Result"];
/** Which of the four steps a state belongs to (0-based), for the progress line. */
export function stepIndex(s) {
    switch (s.kind) {
        case "choose": return 0;
        case "consent": return 1;
        case "photo": return 2;
        case "loading":
        case "result":
        case "error": return 3;
    }
}
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
/** A live call a saved example only plans: skipped because no key is set ("not_live"), never sent. */
const livePlanned = (s) => s.status === "skipped" && /^not_live\b/.test(s.reason ?? "");
const VERDICT = { better: "Better", worse: "Worse", no_real_change: "No real change" };
const FALLBACK_NOTICE = {
    session_cap: "This visit's YouCam allowance is used up, so this is a local estimate.",
    daily_cap: "Today's YouCam allowance is used up, so this is a local estimate.",
    balance_floor: "The app's YouCam units are kept in reserve, so this is a local estimate.",
    kill_switch: "Live YouCam calls are switched off right now, so this is a local estimate.",
    not_live: "Live YouCam calls aren't set up on this server, so this is a local estimate.",
    provider_error: "YouCam didn't answer properly, so this is a local estimate. No units were charged for the failed call.",
    timeout: "YouCam took too long, so this is a local estimate.",
    out_of_scope: "That call isn't allowed for this flow, so this is a local estimate.",
    pending: "YouCam is still working; this is a local estimate for now.",
    local_only: "Local estimate, as you chose: nothing was sent to YouCam.",
};
/** The planner's reason codes (skin_planner.py, skin_moment.py, skin_match.py fallback_reason) as plain sentences. */
export const REASON_TEXT = {
    not_live: "This is a saved example, so this live call is only planned and never sent.",
    no_consent: "You chose a local estimate, so nothing goes to YouCam.",
    local_only: "You chose a local estimate, so nothing goes to YouCam.",
    no_key: "Live YouCam calls aren't set up on this server, so the local version is used.",
    skin_off: "Live skin analysis is switched off on this server, so the local version is used.",
    kill_switch: "Live YouCam calls are switched off right now, so the local version is used.",
    session_cap: "This visit's YouCam allowance is used up, so the local version is used.",
    daily_cap: "Today's YouCam allowance is used up, so the local version is used.",
    balance_floor: "The app's YouCam units are kept in reserve, so the local version is used.",
    provider_error: "YouCam didn't answer properly, so the local version is used. No units were charged for it.",
    timeout: "YouCam took too long, so the local version is used.",
    out_of_scope: "This call isn't allowed for this flow, so it was not sent.",
    pending: "YouCam was still working, so the local version is shown for now.",
    earlier_step_refused: "An earlier step didn't go ahead, so this one was not sent either.",
    no_shade: "No sample shade matched this reading, so there was nothing to try on.",
    nothing_to_soften: "Every measured concern is at 80 or above, so there is nothing to soften.",
};
/** A step reason ("code: detail", a bare code, or a plain sentence) as a sentence plus its code. */
export function stepReason(reason) {
    if (!reason)
        return { text: null, code: null };
    const m = /^([a-z][a-z0-9_]*)(?::\s*(.*))?$/s.exec(reason.trim());
    if (!m || (m[2] === undefined && !(m[1] in REASON_TEXT) && !m[1].includes("_")))
        return { text: reason, code: null };
    const code = m[1];
    const detail = m[2] ? m[2].charAt(0).toUpperCase() + m[2].slice(1) : "";
    return { text: REASON_TEXT[code] ?? (detail || "This step was not sent."), code };
}
/** Fallbacks that mean "no units left": the page shows the units-out art for these. */
export const UNITS_OUT = new Set(["session_cap", "daily_cap", "balance_floor"]);
export function sourceBadge(reply) {
    if (reply.source === "saved_example")
        return DEMO_LABEL;
    if (reply.source === "youcam")
        return reply.analysis.concerns_source ?? "YouCam Skin Analysis";
    return "Local estimate";
}
const clamp = (v) => Math.max(0, Math.min(100, v));
function changeRow(x, days) {
    const tone = x.verdict === "better" ? "better" : x.verdict === "worse" ? "worse" : "same";
    const d = Math.round(x.delta), n = Math.round(x.noise_band);
    const moved = d === 0 ? "did not move" : `moved ${d > 0 ? "up" : "down"} ${Math.abs(d)}`;
    // The engine's too-soon rule (engines/skin-checkin: min_days per concern): before it, a rise is
    // not credited, so an unchanged verdict there means "too soon to tell", not "no real change".
    const minDays = CHECKIN_CONCERNS.find((c) => c.concern === x.concern)?.min_days ?? 0;
    const soon = tone === "same" && days < minDays;
    const sentence = soon
        ? `${x.label} ${moved}. Too soon to tell: ${x.label.toLowerCase()} needs ${minDays} days between check-ins and this was ${days}.`
        : tone === "same"
            ? `${x.label} ${moved}, inside the ±${n} that photos vary by on their own: no real change.`
            : `${x.label} ${moved}, more than the ±${n} noise band: ${tone}.`;
    return { concern: x.concern, label: x.label, before: Math.round(x.before), after: Math.round(x.after),
        delta: `${d > 0 ? "+" : ""}${d}`, verdict: soon ? "Too soon to tell" : VERDICT[x.verdict] ?? x.verdict, tone,
        bandFrom: clamp(x.before - x.noise_band), bandTo: clamp(x.before + x.noise_band), noise: n, sentence };
}
export function checkinArt(changes, daysBetween) {
    if (daysBetween < 7)
        return "checkin-too-soon";
    if (changes.some((c) => c.verdict === "worse"))
        return changes.some((c) => c.verdict === "better") ? "checkin-same" : "checkin-worse";
    return changes.some((c) => c.verdict === "better") ? "checkin-better" : "checkin-same";
}
export function resultView(reply, history = []) {
    const m = MOMENTS.find((x) => x.id === reply.moment);
    const p = reply.plan;
    const sections = [
        { id: "today", title: "Today", art: "plan-today", lines: p.today },
        { id: "this_week", title: "This week", art: "plan-this-week", lines: p.this_week },
        { id: "stop", title: "Stop", art: "plan-stop", lines: p.stop },
    ].filter((s) => s.lines.length)
        .map((s) => ({ ...s, lines: s.lines.map((l) => ({ text: l.text, because: l.because ?? null, picture: productForLine(l.text) })) }));
    const u = reply.units;
    const sample = reply.source === "saved_example";
    const planned = reply.steps.reduce((t, s) => t + ((s.status === "done" && !s.cached) || livePlanned(s) ? s.units : 0), 0);
    const unitsLine = sample ? (planned ? `No units used: this is a saved example. A live run of this plan costs ${plural(planned, "unit")}.`
        : "No units used: this is a saved example, and a local estimate sends nothing to YouCam.")
        : `${plural(u.spent, "unit")} used this time${u.left != null ? `, ${u.left} left for this visit` : ""}${u.cap != null ? ` (cap ${u.cap})` : ""}.`;
    const c = reply.checkin;
    const scores = reply.analysis.concerns.map((x) => {
        const raw = Math.round(x.raw_score);
        return { concern: x.concern, label: x.label, raw, band: x.band,
            ui: typeof x.ui_score === "number" ? `Display score ${Math.round(x.ui_score)}, not used` : null,
            tone: raw >= 80 ? "good" : raw >= 60 ? "mid" : "focus" };
    });
    const lowest = [...scores].sort((a, b) => a.raw - b.raw)[0];
    const checkin = c ? { summary: c.summary, since: `Compared with your check-in ${plural(c.days_between, "day")} ago.`,
        art: checkinArt(c.changes, c.days_between), rows: c.changes.map((x) => changeRow(x, c.days_between)) } : null;
    const firstCheckin = reply.moment === "checkin" && !c
        ? sample ? null : "This is your first check-in, so there is nothing to compare yet. Your scores are kept on this device; check in again in two to six weeks, in similar light."
        : null;
    const products = (p.products ?? []).map((x) => ({ name: x.name, why: x.why, forWhat: x.for,
        picture: productForCatalogue(x.id) ?? productForLine(x.type),
        detail: [x.shade ? `Shade: ${x.shade}` : null, x.coverage ? `Coverage: ${x.coverage}` : null].filter(Boolean).join(" · ") }));
    const announce = [`${m.title}: result ready.`, sample ? "Saved example." : "",
        lowest ? `Lowest score: ${lowest.label}, ${lowest.raw} of 100.` : "",
        checkin ? checkin.summary : "", sections[0] ? `Today: ${sections[0].lines[0]?.text ?? ""}.` : ""].filter(Boolean).join(" ");
    return {
        heading: `${m.title}: your result`,
        sourceBadge: sourceBadge(reply),
        badgeTone: sample ? "sample" : reply.source === "youcam" ? "live" : "local",
        message: sample ? DEMO_NOTE : reply.message,
        notice: reply.fallback ? FALLBACK_NOTICE[reply.fallback] ?? null : null,
        scores,
        scoresNote: "Measured score out of 100; higher looks healthier. This is the number every decision uses. A display score, when YouCam gives one, is shown smaller and never used.",
        plan: sections, planLabel: p.label, derm: p.see_dermatologist_if,
        products, productsNote: products.length ? "Product types from our own catalogue, ranked by your measured concerns. Not tested against real products; no brand pays to appear." : null,
        steps: reply.steps.map((s) => ({ n: s.n, action: s.action, line: s.why,
            status: s.status === "done" ? (s.cached ? "Reused" : "Done") : livePlanned(s) ? "Planned (live)" : s.status === "skipped" ? "Skipped" : "Refused",
            tone: s.status, reason: stepReason(s.reason).text, reasonCode: stepReason(s.reason).code,
            units: s.cached ? "0 units (reused)" : livePlanned(s) && s.units ? `${plural(s.units, "unit")} live · none now`
                : s.status !== "done" ? "0 units" : sample && s.units ? `${plural(s.units, "unit")} live · none now` : plural(s.units, "unit") })),
        unitsLine,
        checkin, firstCheckin,
        tryon: reply.tryon ? { label: reply.tryon.label, imageUrl: reply.tryon.image_url, shade: reply.tryon.shade, coverage: reply.tryon.coverage } : null,
        tone: reply.tone ? { label: reply.tone.label,
            line: `Skin ${reply.tone.skin_color}${reply.tone.lip_color ? `, lips ${reply.tone.lip_color}` : ""}${reply.tone.shade ? `. Shade matched: ${reply.tone.shade}` : ""}.`,
            chips: [{ label: "Skin", color: reply.tone.skin_color }, ...(reply.tone.lip_color ? [{ label: "Lips", color: reply.tone.lip_color }] : [])] } : null,
        look: reply.look ? { imageUrl: reply.look.image_url, label: reply.look.label,
            swatches: reply.look.swatches.map((x) => ({ label: x.label, color: x.color })) } : null,
        preview: reply.preview ? { imageUrl: reply.preview.image_url, label: reply.preview.label,
            rows: reply.preview.concerns.map((c) => ({ concern: c.concern, label: c.label, strength: `softened ${Math.round(c.strength * 100)}%`,
                percent: Math.round(Math.max(0, Math.min(1, c.strength)) * 100) })) } : null,
        history: [...history].reverse().map((h) => ({ when: h.taken_at.slice(0, 10), source: sample ? DEMO_LABEL : h.source === "youcam" ? "YouCam" : "Local estimate",
            scores: h.concerns.map((x) => `${labelOf(reply, x.concern)} ${Math.round(x.raw_score)}`).join(" · ") })),
        announce,
        disclaimer: reply.disclaimer || "Not medical advice.",
    };
}
function labelOf(reply, concern) {
    return reply.analysis.concerns.find((c) => c.concern === concern)?.label ?? concern;
}
/** Error art for a failed request, by its code. */
export function errorArt(code) {
    if (code === "offline" || code === "no_api" || code === "connection")
        return "error-offline";
    if (/dark|light|exposure/.test(code))
        return "error-too-dark";
    if (/face/.test(code))
        return "error-no-face";
    if (UNITS_OUT.has(code) || /unit|quota|cap/.test(code))
        return "units-out";
    return "error-offline";
}
/* -------------------------------- history -------------------------------- */
/** Check-ins kept on this device only (web/src/engines/skin-checkin/store.ts): dates and raw
 * scores, never a photo. A broken or blocked store reads as empty and never stops a result. */
export class DeviceHistory {
    store;
    constructor(storage) { this.store = new CheckinStore(storage); }
    list() { return this.store.list(); }
    latest() { return this.store.latest(); }
    add(snapshot) { this.store.add(snapshot); }
    clear() { this.store.deleteAll(); }
    exportText() { return this.store.exportText(); }
}
/** One plain line about this visit's units, for the quiet "Have a judge code?" panel. */
export function unitsStatusLine(s) {
    if (s.kill_switch)
        return "Live YouCam calls are switched off right now; every moment shows a local estimate.";
    const left = s.remaining == null ? "no visit cap" : `${plural(s.remaining, "unit")} left for this visit${s.cap != null ? ` (cap ${s.cap})` : ""}`;
    return s.judge ? `Judge code accepted: live skin analysis is on. ${left[0].toUpperCase()}${left.slice(1)}.`
        : `Public visit: ${left}. A skin analysis costs at least 9, so a public visit gets the local estimate plus the two 1-unit makeup try-ons.`;
}
//# sourceMappingURL=skin-moment-model.js.map