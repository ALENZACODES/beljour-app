import { CONCERNS as CHECKIN_CONCERNS } from "../engines/skin-checkin/index.js";
import { CheckinStore } from "../engines/skin-checkin/store.js";
import { productForCatalogue, productForLine } from "./skin-moment-products.js";
export const MOMENTS = [
    { id: "buy", title: "Before I buy", question: "Will this product suit my skin?", art: "moment-buy",
        detail: "Your skin is read, product types are ranked by what it shows, and the best match is drawn on your face." },
    { id: "breakout", title: "After a breakout", question: "What do I do now?", art: "moment-breakout",
        detail: "What to do today, this week, and what to stop, from the redness, spots and texture in your photo." },
    { id: "checkin", title: "Is it working?", question: "Has my skin changed since last time?", art: "moment-checkin",
        detail: "Today's reading next to your last one, kept on this device only. Small changes are called no real change." },
];
/** The one line about where her photo goes: nowhere. */
export const DEVICE_TEXT = "Read on this device. Your photo is never uploaded, and your check-ins stay in this browser.";
export const DEMO_LABEL = "Saved example";
export const DEMO_NOTE = "Saved example: a stored result for an example person, not a reading of your photo.";
export const PHOTO_MIN_SIDE = 480;
export const PHOTO_MAX_BYTES = 8_000_000;
/** The app's own photo checks (face/quality.ts) plus the size limits, as one list. */
export function photoChecks(f) {
    const out = [];
    const short = Math.min(f.width, f.height);
    out.push(short >= PHOTO_MIN_SIDE
        ? { id: "size", level: "pass", message: `Big enough (${f.width} × ${f.height}).` }
        : { id: "size", level: "block", message: `Too small: the short side is ${short} pixels and a skin reading needs at least ${PHOTO_MIN_SIDE}.` });
    if (f.bytes > PHOTO_MAX_BYTES)
        out.push({ id: "bytes", level: "block", message: "Over 8 MB after preparing. Choose a smaller photo." });
    if (f.face === null) {
        out.push({ id: "face", level: "block", message: "The face reader isn't available in this browser, so the skin can't be read. A saved example still works." });
    }
    else {
        for (const c of f.face)
            out.push({ id: c.id, level: c.ok ? "pass" : c.id === "face" ? "block" : "warn", message: c.message });
    }
    return out;
}
export function photoVerdict(checks) {
    return checks.some((c) => c.level === "block") ? "blocked" : checks.some((c) => c.level === "warn") ? "warn" : "ready";
}
export class PhotoNotReady extends Error {
}
/** The scores worth keeping for a later check-in: raw scores only, never a photo. */
export function snapshotOf(reply, takenAt) {
    if (reply.source === "saved_example" || !reply.analysis.concerns.length)
        return null;
    return { taken_at: takenAt, source: "local", concerns: reply.analysis.concerns.map((c) => ({ concern: c.concern, raw_score: c.raw_score })) };
}
function errorFields(err) {
    const e = err;
    return { code: e && typeof e.code === "string" ? e.code : "error",
        message: e && typeof e.message === "string" && e.message ? e.message : "Something went wrong. Your choices are kept; try again." };
}
export class MomentController {
    runner;
    history;
    demo;
    now;
    state = { kind: "choose" };
    listeners = new Set();
    constructor(runner, history, demo, now = Date.now) {
        this.runner = runner;
        this.history = history;
        this.demo = demo;
        this.now = now;
    }
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
        return this.set({ kind: "photo", moment, photo: null });
    }
    /** The app's own photo checks on the chosen photo; a blocked photo can't be read. */
    checked(checks) {
        const s = this.state;
        if (s.kind !== "photo")
            return s;
        const verdict = photoVerdict(checks);
        const note = verdict === "blocked" ? "This photo can't be read. Choose another one."
            : verdict === "warn" ? "Usable, but the reading may be less certain. A clearer photo helps."
                : "The photo checks passed.";
        return this.set({ ...s, photo: { checks, verdict, note } });
    }
    clearPhoto() {
        const s = this.state;
        return s.kind === "photo" ? this.set({ ...s, photo: null }) : s;
    }
    /** "See a saved example": a complete, labelled result without a photo. */
    example(moment) {
        if (this.busy)
            return this.state;
        if (!MOMENTS.some((m) => m.id === moment))
            throw new RangeError("unknown moment");
        return this.set({ kind: "result", moment, reply: this.demo.reply(moment), history: this.demo.history(moment), images: null });
    }
    /** Read the checked photo on this device. */
    async send(photo) {
        if (this.busy)
            return this.state;
        const moment = this.moment();
        const s = this.state;
        if (s.kind !== "photo")
            throw new PhotoNotReady("Add a photo first.");
        if (!photo || !s.photo)
            throw new PhotoNotReady("Add a photo first; it is checked before it is read.");
        if (s.photo.verdict === "blocked")
            throw new PhotoNotReady(s.photo.note);
        if (!photo.points)
            throw new PhotoNotReady("No face was read in this photo. Use a clear, front-facing photo.");
        this.set({ kind: "loading", moment });
        // Let the "reading" screen paint before the work starts.
        await new Promise((r) => setTimeout(r, 0));
        try {
            const previous = moment === "checkin" ? this.history.latest() : null;
            const { reply, images } = await this.runner.run(moment, photo, previous);
            // Every reading is kept on the device so a later "Is it working?" has something to compare with.
            const snap = snapshotOf(reply, new Date(this.now()).toISOString());
            if (snap) {
                try {
                    this.history.add(snap);
                }
                catch { /* storage blocked: the result still shows */ }
            }
            return this.set({ kind: "result", moment, reply, history: this.history.list(), images });
        }
        catch (err) {
            const { code, message } = errorFields(err);
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
        if (s.kind === "choose" || s.kind === "loading")
            return s;
        return this.set({ kind: "choose" });
    }
    /** After an error: back to the photo step, with the same moment. */
    retry() {
        const s = this.state;
        if (s.kind !== "error" || !s.moment)
            return this.restart();
        return this.set({ kind: "photo", moment: s.moment, photo: null });
    }
    restart() { return this.set({ kind: "choose" }); }
}
/* ---------------------------------- steps ---------------------------------- */
export const STEP_NAMES = ["Moment", "Photo", "Result"];
/** Which of the three steps a state belongs to (0-based), for the progress line. */
export function stepIndex(s) {
    switch (s.kind) {
        case "choose": return 0;
        case "photo": return 1;
        case "loading":
        case "result":
        case "error": return 2;
    }
}
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const VERDICT = { better: "Better", worse: "Worse", no_real_change: "No real change" };
/** Step reason codes as plain sentences. */
export const REASON_TEXT = {
    no_shade: "No reference shade matched this reading, so there was nothing to draw.",
    no_preview: "The face points didn't leave enough skin to draw on, so the picture was left out.",
    nothing_to_soften: "Every concern reads 80 or above, so there is nothing to soften.",
    bad_previous: "Your last check-in couldn't be read, so there was nothing to compare.",
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
    return { text: REASON_TEXT[code] ?? (detail || "This step was left out."), code };
}
export function sourceBadge(reply) {
    return reply.source === "saved_example" ? DEMO_LABEL : "Read on this device";
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
    const sample = reply.source === "saved_example";
    const c = reply.checkin;
    const scores = reply.analysis.concerns.map((x) => {
        const raw = Math.round(x.raw_score);
        return { concern: x.concern, label: x.label, raw, band: x.band,
            ui: null,
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
        badgeTone: sample ? "sample" : "local",
        message: sample ? DEMO_NOTE : reply.message,
        notice: null,
        scores,
        scoresNote: "Score out of 100 for how this photo looks; higher looks smoother, calmer and more even. Light, focus and makeup move it, so compare photos taken the same way.",
        plan: sections, planLabel: p.label, derm: p.see_dermatologist_if,
        products, productsNote: products.length ? "Product types from our own catalogue, ranked by your measured concerns. Not tested against real products; no brand pays to appear." : null,
        steps: reply.steps.map((s) => ({ n: s.n, action: s.action, line: s.why,
            status: s.status === "done" ? "Done" : s.status === "skipped" ? "Left out" : "Not done",
            tone: s.status, reason: stepReason(s.reason).text, reasonCode: stepReason(s.reason).code })),
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
        history: [...history].reverse().map((h) => ({ when: h.taken_at.slice(0, 10), source: sample ? DEMO_LABEL : h.source === "youcam" ? "earlier app version" : "on this device",
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
//# sourceMappingURL=skin-moment-model.js.map