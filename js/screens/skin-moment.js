/** Skin Moment page (web/skin-moment.html): lays out the states from skin-moment-model.ts. The
 * photo is opened, checked and read on this device with the app's own code (screens/photo.ts
 * normalizePhoto, the shared face map from face/map-reader.ts, face/quality.ts, then
 * skin-moment-device.ts). Nothing is uploaded. Author: John Khan.
 */
import { ensureConsent } from "../ui/one-consent.js";
import { announce, h, loadImage } from "../dom.js";
import { toRGBA } from "../engines/core/buffer.js";
import { lighting, MIN_FACE_WIDTH, runChecks } from "../face/quality.js";
import { faceMapFor } from "../face/map-reader.js";
import { faceMapPanel } from "./face-map.js";
import { makeSample } from "../ui/shell/demo.js";
import { defaultVisionClient } from "../vision/client.js";
import { faceReaderReady } from "../vision/staged.js";
import { normalizePhoto } from "./photo.js";
import { photoPicker } from "../photos/picker.js";
import { AI_PERSON, ART_DIR, art, concernIcon, exampleFace, presentFiles, productPicture, uiIcon } from "./skin-moment-art.js";
import { buyExample, demoTryOn, examplePersonLook, examplePersonPreview, examplePersonSoftened, framingPoints, SAVED } from "./skin-moment-demo.js";
import { runOnDevice } from "./skin-moment-device.js";
import { loadFaces, MOMENT_FACE } from "./skin-moment-faces.js";
import { DEVICE_TEXT, DeviceHistory, MOMENTS, MomentController, PhotoNotReady, STEP_NAMES, errorArt, photoChecks, resultView, stepIndex, } from "./skin-moment-model.js";
import { addDays, localDay, whileUsed } from "../engines/skin-daily/index.js";
import { routineFromPlan, timeLine } from "../engines/skin-daily/routine.js";
import { checkinDays, DailyStore, diaryResult, entryName } from "../engines/skin-daily/store.js";
const momentInfo = (m) => MOMENTS.find((x) => x.id === m);
function localStore() {
    try {
        return typeof localStorage === "undefined" ? null : localStorage;
    }
    catch {
        return null;
    }
}
/** Example people the build listed (dist/assets/skin-moment/index.json): no request for a picture
 * that isn't there. */
const listedProbe = async (url) => url.startsWith(`${ART_DIR}/`) && (await presentFiles()).has(url.slice(ART_DIR.length + 1));
/** The face model is only asked for when the build staged it (vision/staged.ts). */
const faceModelReady = faceReaderReady;
function canvasOf(img, label) {
    const c = h("canvas", { width: img.width, height: img.height, role: "img", "aria-label": label });
    c.getContext("2d")?.putImageData(new ImageData(toRGBA(img), img.width, img.height), 0, 0);
    return c;
}
async function checkPhoto(file) {
    let blob, width, height;
    try {
        ({ blob, width, height } = await normalizePhoto(file));
    }
    catch (err) {
        return { photo: null, checks: [{ id: "open", level: "block", message: err instanceof Error ? err.message : "This photo could not be opened." }] };
    }
    const url = URL.createObjectURL(blob);
    let face = null;
    let points = null;
    let shown = null;
    const vision = defaultVisionClient();
    if (await faceModelReady(vision)) {
        try {
            const image = await loadImage(url);
            // The shared face map (face/map-reader.ts): one reading of this photo, reused by the Face
            // map panel below and the foundation preview. "unavailable" means the reader couldn't run
            // here: the check is unavailable, not failed. A mapped photo with no face is "no face found".
            const map = await faceMapFor(image, { key: url });
            if (map.status !== "unavailable") {
                shown = image;
                let light = null;
                if (map.points) {
                    const xs = map.points.map((p) => p[0]), ys = map.points.map((p) => p[1]);
                    const c = document.createElement("canvas");
                    c.width = c.height = 96;
                    const g = c.getContext("2d");
                    if (g) {
                        const x = Math.max(0, Math.min(...xs)), y = Math.max(0, Math.min(...ys));
                        g.drawImage(image, x, y, Math.max(1, Math.max(...xs) - x), Math.max(1, Math.max(...ys) - y), 0, 0, 96, 96);
                        light = lighting(g.getImageData(0, 0, 96, 96).data);
                    }
                    points = map.points.map(([x, y]) => [x, y]);
                }
                face = runChecks(map.normalized, width, height, light, true);
            }
        }
        catch {
            face = null;
        }
    }
    return { photo: { blob, url, width, height, points, image: shown }, checks: photoChecks({ width, height, bytes: blob.size, face }) };
}
/** The checked photo decoded for the skin reading: its pixels at the size the face points were read. */
async function devicePhoto(p) {
    const image = await loadImage(p.url);
    const c = document.createElement("canvas");
    c.width = p.width;
    c.height = p.height;
    const g = c.getContext("2d", { willReadFrequently: true });
    if (!g)
        throw new PhotoNotReady("This browser can't read the photo's pixels.");
    g.drawImage(image, 0, 0, p.width, p.height);
    return { image: { width: p.width, height: p.height, channels: 4, data: g.getImageData(0, 0, p.width, p.height).data }, points: p.points };
}
/* ------------------------------- small pieces ------------------------------- */
function progress(state) {
    const at = stepIndex(state);
    const done = state.kind === "result";
    return h("ol", { class: "sm-progress", "aria-label": "Progress" }, ...STEP_NAMES.map((name, i) => h("li", { class: i < at || done ? "done" : i === at ? "now" : "", "aria-current": i === at && !done ? "step" : undefined }, h("span", { class: "sm-progress-n", "aria-hidden": "true" }, String(i + 1)), h("span", {}, name, i < at || done ? h("span", { class: "visually-hidden" }, " (done)") : null))));
}
function heading(text, eyebrow) {
    const title = h("h1", { tabindex: "-1", class: "sm-h1" }, text);
    return eyebrow ? [h("p", { class: "sm-eyebrow" }, eyebrow), title] : [title];
}
function badge(text, tone) {
    return h("span", { class: `badge ${tone === "live" ? "badge-live" : tone === "sample" ? "badge-sample" : "badge-local"}` }, text);
}
function checkList(checks) {
    const word = { pass: "Passed", warn: "Look at this", block: "Can't use", info: "Note" };
    return h("ul", { class: "sm-checks" }, ...checks.map((c) => h("li", { class: `sm-check sm-check-${c.level}` }, h("span", { class: "sm-check-icon", "aria-hidden": "true" }, c.level === "pass" ? "✓" : c.level === "block" ? "✕" : c.level === "warn" ? "!" : "i"), h("span", {}, h("span", { class: "visually-hidden" }, `${word[c.level]}: `), c.message))));
}
/** Before/after with a slider; works with images or canvases. */
function compare(before, after, beforeLabel, afterLabel) {
    const top = h("div", { class: "sm-compare-before" }, before);
    const range = h("input", { type: "range", min: "0", max: "100", value: "50", class: "sm-compare-range",
        "aria-label": `Compare ${beforeLabel.toLowerCase()} and ${afterLabel.toLowerCase()}`, "aria-valuetext": `Half ${beforeLabel.toLowerCase()}, half ${afterLabel.toLowerCase()}` });
    const box = h("div", { class: "sm-compare", style: { "--pos": "50%" } }, h("div", { class: "sm-compare-after" }, after), top, h("span", { class: "sm-compare-tag sm-compare-tag-l", "aria-hidden": "true" }, beforeLabel), h("span", { class: "sm-compare-tag sm-compare-tag-r", "aria-hidden": "true" }, afterLabel), h("span", { class: "sm-compare-handle", "aria-hidden": "true" }), range);
    box.style.setProperty("--pos", "50%");
    range.addEventListener("input", () => {
        const v = Number(range.value);
        box.style.setProperty("--pos", `${v}%`);
        range.setAttribute("aria-valuetext", `${v}% ${beforeLabel.toLowerCase()}, ${100 - v}% ${afterLabel.toLowerCase()}`);
    });
    return box;
}
function figure(media, caption) {
    return h("figure", { class: "sm-figure" }, media, h("figcaption", {}, caption));
}
function imgEl(src, alt) {
    return h("img", { src, alt, decoding: "async" });
}
const PLAN_ICON = { today: "today", this_week: "this-week", stop: "stop" };
/** The icon for a planner step: what kind of call it is, or "reused" when it cost nothing. */
function stepIcon(action) {
    if (/shade|tone/.test(action))
        return "shade-match";
    if (/preview|look/.test(action))
        return "coverage";
    if (/vto|tryon|foundation/.test(action))
        return "slider";
    if (/compare/.test(action))
        return "checkin-calendar";
    return "planner-step";
}
/** Colour chips with their words; the hex is shown too, so colour is never the only signal. */
function swatchList(items) {
    return h("ul", { class: "sm-swatches" }, ...items.map((x) => h("li", {}, h("span", { class: "sm-swatch", style: { background: x.color }, "aria-hidden": "true" }), h("span", {}, x.label), h("code", { class: "lg-small" }, x.color))));
}
/* --------------------------------- the page --------------------------------- */
/** Samples listed first in this page's picker: the one sample that passes every photo check here
 * (face fills the frame). Measured 2026-11-02 by driving this page with each sample. */
export const SKIN_FIRST_SAMPLES = { files: ["sample-portrait-under-eye.jpg"], note: "Passes every photo check on this page" };
/** How long the health check may take before the page says the demo server is waking. */
/** Mount the page; `start` may name a moment (skin-moment.html#buy) to open at its consent step. */
export function mountSkinMoment(root, start = "") {
    const device = new DeviceHistory(localStore());
    const controller = new MomentController({ run: (moment, p, previous) => runOnDevice(moment, p.image, p.points, previous) }, device, SAVED);
    const daily = new DailyStore(localStore());
    let photo = null;
    let first = true;
    let lastKind = "";
    let deleted = false;
    const setPhoto = (next) => { if (photo && photo !== next)
        URL.revokeObjectURL(photo.url); photo = next; };
    const go = (fn) => {
        try {
            const r = fn();
            if (r instanceof Promise)
                r.catch(() => undefined);
        }
        catch { /* the model has set a visible state */ }
    };
    /* choose */
    function choose() {
        // Each card's title is a real heading; its button stretches over the whole card.
        const cards = MOMENTS.map((m) => h("li", { class: "sm-moment" }, h("div", { class: "sm-moment-main", onclick: () => go(() => controller.choose(m.id)) }, art(m.art), h("div", { class: "sm-moment-text" }, h("h2", { class: "sm-moment-title" }, h("button", { type: "button", class: "sm-moment-pick", "aria-describedby": `sm-moment-${m.id}-q sm-moment-${m.id}-d`,
            onclick: (e) => { e.stopPropagation(); go(() => controller.choose(m.id)); } }, m.title)), h("p", { class: "sm-moment-q", id: `sm-moment-${m.id}-q` }, m.question), h("p", { class: "sm-moment-d", id: `sm-moment-${m.id}-d` }, m.detail))), h("button", { type: "button", class: "lg-link sm-moment-example", onclick: () => go(() => controller.example(m.id)) }, "See a saved example", h("span", { class: "visually-hidden" }, ` for ${m.title}`))));
        return [
            todayStrip(),
            h("div", { class: "sm-hero" }, h("div", { class: "sm-hero-text" }, ...heading("What's your skin moment?", "Skin Moment"), h("p", { class: "sm-lede" }, "Pick the one you're in right now. You get your skin scores and one plan: what to do today, this week, and what to stop."), h("p", { class: "sm-notice", role: "note" }, uiIcon("privacy-lock", undefined, 20), DEVICE_TEXT)), art("welcome-hero", { className: "sm-hero-art" })),
            h("ul", { class: "sm-moments", "aria-label": "Choose your moment" }, ...cards),
            h("section", { class: "sm-how", "aria-labelledby": "sm-how-h" }, h("h2", { id: "sm-how-h" }, "How it works"), h("ol", { class: "sm-how-steps" }, h("li", {}, h("strong", {}, "Pick your moment. "), "Each one asks a different question of your skin."), h("li", {}, h("strong", {}, "Add one photo. "), "It is checked and read on this device. It never leaves it."), h("li", {}, h("strong", {}, "Get one plan. "), "Today, this week, what to stop, and when to see a dermatologist, each with its reason.")), h("p", { class: "lg-small" }, "Cosmetic guidance, not medical advice. No brand pays to appear. ", h("a", { href: "trust.html" }, "How your photo is handled"), ".")),
        ].filter((x) => !!x);
    }
    /* every day: a time-aware line about her routine, linking to skin-day.html (no scan, no units) */
    function todayStrip() {
        const now = daily.now(), day = daily.today();
        const t = timeLine(daily.routine(), daily.ticks(day), now, day);
        return h("aside", { class: "sd-strip", "aria-label": "Your skin today" }, uiIcon(t.part === "evening" ? "this-week" : "today", undefined, 32), h("div", {}, h("p", { class: "sd-strip-title" }, t.title), h("p", {}, t.line)), h("a", { class: "lg-button", href: "skin-day.html#routine" }, daily.routine() ? "Open my routine" : "Set up my routine"));
    }
    /** "Use this plan for my routine": the plan's Morning and Evening steps become her routine. */
    function usePlan(reply, moment) {
        const label = `${momentInfo(moment).title}, ${new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" })}${reply.source === "saved_example" ? ", saved example" : ""}`;
        const routine = routineFromPlan(reply.plan, label);
        if (!routine)
            return null;
        const done = h("p", { class: "lg-small", role: "status" });
        return h("div", { class: "sd-use-plan sm-row" }, h("button", { type: "button", class: "lg-button", onclick: () => {
                daily.setRoutine(routine);
                done.replaceChildren(`Saved as your morning and night routine on this device: ${routine.morning.length} morning and ${routine.night.length} night steps. `, h("a", { href: "skin-day.html#routine" }, "Open my routine"));
            } }, uiIcon("today", undefined, 22), "Use this plan for my morning and night routine"), done);
    }
    /** The product diary, tied to this check-in: what changed while she used each product. In a saved
     * example the product and its ticks are the example's own, and say so. */
    function diarySection(reply, history) {
        if (reply.moment !== "checkin" || history.length < 2)
            return null;
        const sec = h("section", { class: "sm-section", "aria-labelledby": "sm-diary-h" }, h("h2", { id: "sm-diary-h" }, uiIcon("checkin-calendar"), "While you used it"));
        if (reply.source === "saved_example") {
            const days = checkinDays(history);
            const start = days[0].date, end = days[days.length - 1].date;
            const used = [];
            for (let d = start, i = 0; d < end; d = addDays(d, 1), i++)
                if (i % 7 !== 3)
                    used.push(d);
            const r = whileUsed({ start, used, unit: "night" }, days);
            sec.append(h("p", { class: "lg-small" }, `Saved example: an azelaic acid cream started on the day of the earlier check-in and ticked in the night routine ${r.usage?.words ?? ""}. The product and ticks are part of the example, not yours.`), h("ul", { class: "sd-result" }, ...r.lines.map((x) => h("li", {}, x))), h("p", { class: "lg-small" }, r.note));
            return sec;
        }
        const entries = daily.diary().filter((e) => !e.end || e.end >= localDay(new Date(Date.parse(history[0].taken_at))));
        if (!entries.length) {
            sec.append(h("p", {}, "Started a new product? Add it to your product diary and tick it in your routine; each check-in then says what changed while you used it. ", h("a", { href: "skin-day.html#diary" }, "Open the product diary")));
            return sec;
        }
        for (const e of entries) {
            const r = diaryResult(e, history);
            sec.append(h("h3", {}, entryName(e)), h("ul", { class: "sd-result" }, ...r.lines.map((x) => h("li", {}, x))));
        }
        sec.append(h("p", { class: "lg-small" }, entries.length ? diaryResult(entries[0], history).note : ""));
        return sec;
    }
    /* photo */
    function photoStep(s) {
        const info = momentInfo(s.moment);
        const tips = [["tip-good-light", "Soft, even light"], ["tip-face-camera", "Face the camera"],
            ["tip-hair-back", "Hair off your face"], ["tip-no-filter", "No filters"], ["tip-fill-frame", `Face fills over ${Math.round(MIN_FACE_WIDTH * 100)}% of the width`]];
        const working = h("p", { class: "lg-small", role: "status" });
        // The shared "Add photos" control: her phone's photo library (or camera), plus My photos.
        const picker = photoPicker({ id: "sm-file", takes: "one", firstSamples: SKIN_FIRST_SAMPLES, label: photo && s.photo ? "Choose a different photo" : "Add photos",
            onPhotos: async ([chosen]) => {
                if (!chosen)
                    return;
                if (!(await ensureConsent())) {
                    working.textContent = "No photo opened.";
                    return;
                }
                working.textContent = "Checking the photo on this device.";
                const { photo: next, checks } = await checkPhoto(chosen);
                setPhoto(next);
                controller.checked(checks);
            } });
        const p = s.photo;
        const ready = !!p && p.verdict !== "blocked" && !!photo;
        const sendLabel = "Read my skin";
        const sendNote = h("p", { class: "sm-problem", role: "alert" });
        sendNote.hidden = true;
        const send = h("button", { type: "button", class: "lg-button lg-primary sm-send", disabled: !ready,
            onclick: async () => {
                try {
                    await controller.send(photo ? await devicePhoto(photo) : null);
                }
                catch (err) {
                    if (err instanceof PhotoNotReady) {
                        sendNote.textContent = err.message;
                        sendNote.hidden = false;
                    }
                }
            } }, sendLabel);
        return [
            ...heading("Add one clear photo", `${info.title} · ${info.question}`),
            h("p", { class: "lg-small sm-send-line" }, DEVICE_TEXT),
            h("ul", { class: "sm-tips", "aria-label": "Tips for a good photo" }, ...tips.map(([name, text]) => h("li", {}, art(name), h("span", {}, text)))),
            h("div", { class: "sm-card sm-photo" }, h("div", { class: "sm-photo-pick" }, photo && p ? h("img", { class: "sm-photo-preview", src: photo.url, alt: "Your photo, ready on this device" })
                : h("div", { class: "sm-photo-empty", "aria-hidden": "true" }, art("tip-fill-frame")), picker.element, h("p", { class: "lg-small" }, "JPEG, PNG or WEBP. It's turned upright and its file details are removed on this device.")), h("div", { class: "sm-photo-checks" }, h("h2", {}, uiIcon("selfie-frame"), "Photo checks"), p ? h("p", { class: `sm-verdict sm-verdict-${p.verdict}` }, p.note) : working.textContent ? working : h("p", { class: "lg-small" }, "Add a photo and it's checked here first."), p ? checkList(p.checks) : null, h("div", { class: "sm-actions" }, send, h("button", { type: "button", class: "lg-link", onclick: () => go(() => controller.example(s.moment)) }, "See a saved example instead")), sendNote)),
            // The Face map: the first step for her photo, from the same reading as the checks above.
            ...(photo?.image && p ? [faceMapPanel({ source: photo.image, key: photo.url, label: "Your photo", level: 2 })] : []),
            h("div", { class: "sm-actions sm-actions-back" }, h("button", { type: "button", class: "lg-link", onclick: () => go(() => controller.back()) }, "← Choose a different moment")),
        ];
    }
    /* loading */
    function loading(s) {
        return [h("div", { class: "sm-loading", role: "status", "aria-busy": "true" }, art("scanning"), ...heading("Reading your skin…", momentInfo(s.moment).title), h("p", {}, "Reading redness, spots, texture, pores, shine and hydration on this device. This takes a second or two."))];
    }
    /* error */
    function error(s) {
        return [h("div", { class: "sm-error" }, art(errorArt(s.code)), h("div", {}, ...heading("That didn't work", s.moment ? momentInfo(s.moment).title : undefined), h("p", { role: "alert" }, s.message), 
            // A photo the reader turned down: say which sample passes here, by name.
            /error-(too-dark|no-face)/.test(errorArt(s.code)) ? h("p", { class: "lg-small" }, "The reason above is the one we were given. The sample \u201cClose-up, under-eye\u201d (Add photos, then Try a sample photo) passes every photo check on this page.") : null, h("div", { class: "sm-actions" }, h("button", { type: "button", class: "lg-button lg-primary", onclick: () => go(() => controller.retry()) }, "Try again"), s.moment ? h("button", { type: "button", class: "lg-button", onclick: () => go(() => controller.example(s.moment)) }, "See a saved example instead") : null, h("button", { type: "button", class: "lg-link", onclick: () => go(() => controller.restart()) }, "Start over"))))];
    }
    /* result */
    function subject(reply) {
        const box = h("div", { class: "sm-subject" });
        if (reply.source !== "saved_example") {
            if (photo)
                box.append(figure(imgEl(photo.url, "Your photo"), "Your photo, on this device"));
            else
                box.hidden = true;
            return box;
        }
        const sample = makeSample("portrait");
        box.append(figure(canvasOf(sample.image, "Drawn example face, not a real person"), "Drawn example face, not a real person"));
        void (async () => {
            // MOMENT_FACE: breakout person 02 (breakout spots); Is it working? person 03, whose six-week
            // picture shows hydration back, as the saved check-in measures (Hydration better).
            const who = Number(MOMENT_FACE[reply.moment]);
            const day0 = await exampleFace(who, "day0");
            if (!day0)
                return;
            const day42 = reply.moment === "checkin" ? await exampleFace(who, "day42") : null;
            box.replaceChildren(day42
                ? figure(compare(imgEl(day0, `${AI_PERSON}, earlier check-in`), imgEl(day42, `${AI_PERSON}, today`), "Earlier", "Today"), `${AI_PERSON}. Picture only: the scores are the saved example, not a measurement of anyone.`)
                : figure(imgEl(day0, AI_PERSON), `${AI_PERSON}. Picture only: the scores are the saved example, not a measurement of anyone.`));
        })();
        return box;
    }
    function scoresSection(v) {
        return h("section", { class: "sm-section", "aria-labelledby": "sm-scores-h" }, h("h2", { id: "sm-scores-h" }, "Your measured scores"), h("ul", { class: "sm-scores" }, ...v.scores.map((s) => h("li", { class: `sm-score sm-score-${s.tone}` }, h("span", { class: "sm-score-label" }, concernIcon(s.concern), s.label), h("span", { class: "sm-score-raw" }, h("strong", {}, String(s.raw)), h("span", {}, " / 100")), h("span", { class: "sm-meter", "aria-hidden": "true" }, h("span", { style: { width: `${s.raw}%` } })), h("span", { class: "sm-score-band" }, s.band), s.ui ? h("span", { class: "sm-score-ui" }, s.ui) : null))), h("p", { class: "lg-small" }, v.scoresNote));
    }
    function checkinSection(v, live_) {
        const c = v.checkin;
        if (!c && !v.firstCheckin)
            return null;
        const sec = h("section", { class: "sm-section", "aria-labelledby": "sm-checkin-h" }, h("h2", { id: "sm-checkin-h" }, "Is it working?"));
        if (!c) {
            sec.append(h("div", { class: "sm-callout" }, art("empty-history"), h("p", {}, v.firstCheckin)));
            return sec;
        }
        sec.append(h("div", { class: "sm-callout" }, art(c.art), h("div", {}, h("p", { class: "sm-big" }, c.summary), h("p", { class: "lg-small" }, c.since))), h("ul", { class: "sm-changes" }, ...c.rows.map((r) => h("li", { class: `sm-change sm-change-${r.tone}` }, h("div", { class: "sm-change-top" }, h("strong", {}, concernIcon(r.concern), r.label), h("span", { class: "sm-chip" }, r.tone === "better" ? uiIcon("trend-up", undefined, 18) : r.tone === "same" ? uiIcon("no-real-change", undefined, 18) : null, r.verdict)), h("div", { class: "sm-track", "aria-hidden": "true" }, h("span", { class: "sm-band", style: { left: `${r.bandFrom}%`, width: `${r.bandTo - r.bandFrom}%` } }), h("span", { class: "sm-dot sm-dot-before", style: { left: `${r.before}%` } }), h("span", { class: "sm-dot sm-dot-after", style: { left: `${r.after}%` } })), h("p", { class: "sm-change-nums" }, `${r.before} → ${r.after} (${r.delta}, noise ±${r.noise})`), h("p", { class: "lg-small" }, r.sentence)))), h("p", { class: "lg-small sm-legend" }, h("span", { class: "sm-key sm-key-band", "aria-hidden": "true" }), "shaded: the noise band around last time  ", h("span", { class: "sm-key sm-key-before", "aria-hidden": "true" }), "last time  ", h("span", { class: "sm-key sm-key-after", "aria-hidden": "true" }), "today"));
        if (v.history.length) {
            const del = live_ && !deleted ? h("button", { type: "button", class: "lg-link sm-delete", onclick: () => { deleted = true; go(() => controller.forgetHistory()); } }, uiIcon("delete-photo", undefined, 20), "Delete my check-ins from this device") : null;
            sec.append(h("h3", {}, uiIcon("checkin-calendar"), live_ ? "Your check-ins on this device" : "Check-ins in this example"), h("ol", { class: "sm-history" }, ...v.history.map((x) => h("li", {}, h("strong", {}, x.when), h("span", { class: "lg-small" }, ` ${x.source}`), h("br", {}), x.scores))));
            if (del) {
                const exp = h("button", { type: "button", class: "lg-link", onclick: () => {
                        const url = URL.createObjectURL(new Blob([device.exportText()], { type: "application/json" }));
                        const a = h("a", { href: url, download: "beljour-check-ins.json" });
                        a.click();
                        setTimeout(() => URL.revokeObjectURL(url), 1000);
                    } }, "Export my check-ins");
                sec.append(h("div", { class: "sm-row" }, exp, del));
            }
        }
        return sec;
    }
    function tryonSection(v, reply, images) {
        if (reply.moment !== "buy")
            return null;
        const sec = h("section", { class: "sm-section", "aria-labelledby": "sm-tryon-h" }, h("h2", { id: "sm-tryon-h" }, uiIcon("coverage"), "On your face"));
        const slot = h("div", { class: "sm-tryon" });
        const lookSlot = h("div", { class: "sm-tryon" });
        // In a saved example the tone reading and the full look belong to the example person, so they
        // stay hidden while the drawn face is shown and appear once her picture is drawn.
        const personOnly = [];
        const hold = (el) => {
            if (reply.source === "saved_example") {
                el.hidden = true;
                personOnly.push(el);
            }
            return el;
        };
        const t = v.tryon;
        const detail = t ? [t.shade ? `Shade: ${t.shade}` : null, t.coverage ? `Coverage: ${t.coverage}` : null].filter(Boolean).join(" · ") : "";
        if (reply.source === "saved_example") {
            const pair = demoTryOn();
            slot.append(pair ? figure(compare(canvasOf(pair.before, "Drawn example face, before"), canvasOf(pair.after, "Drawn example face with the matched sheer base"), "Before", "After"), `${t?.label ?? "Saved example"} Drawn example face, not a real person.`) : art("tryon-intro"));
            // With the synthetic example people in the folder, the same local preview is drawn on
            // person MOMENT_FACE.buy instead of the drawn face, and the product types and caption follow
            // the colour measured on that picture, so they name the shade shown. The saved skin tone
            // reading and full look were measured on that same picture
            // (api/plumb_api/services/skin_example_faces.py), so they appear only beside it.
            void (async () => {
                const person = (await loadFaces(listedProbe)).find((f) => f.id === MOMENT_FACE.buy);
                if (!person)
                    return;
                const drawn = await examplePreview(person.day0);
                if (!drawn)
                    return;
                const forPerson = buyExample(drawn.lab);
                const tt = forPerson.tryon;
                slot.replaceChildren(figure(compare(canvasOf(drawn.before, `${AI_PERSON}, before`), canvasOf(drawn.after, `${AI_PERSON} with the matched sheer base`), "Before", "After"), `${tt.label} ${AI_PERSON}. The base is drawn in the nearest of our sample shades to this picture's measured colour, never lighter.${drawn.framed ? " Face area from the picture's fixed framing, not a face reading." : ""}`));
                products(resultView(forPerson).products);
                // The saved full look, drawn on the same picture by our own engines: base, lip colour, blush.
                const lookImage = reply.look ? examplePersonLook(drawn.after, drawn.points, reply.look.swatches) : null;
                if (lookImage)
                    lookSlot.replaceChildren(figure(compare(canvasOf(drawn.before, `${AI_PERSON}, before`), canvasOf(lookImage, `${AI_PERSON} with the saved full look`), "Before", "Full look"), `Saved example, drawn on this device. ${AI_PERSON}. The base, lip colour and blush are the saved look's colours. Skin is never lightened.`));
                for (const block of personOnly)
                    block.hidden = false;
            })();
        }
        else if (images?.tryon && photo) {
            slot.append(figure(compare(imgEl(photo.url, "Your photo"), canvasOf(images.tryon, "Your photo with the matched shade drawn on"), "Before", "After"), `${t?.label ?? ""} ${detail}`));
        }
        else {
            slot.append(h("div", { class: "sm-callout" }, art("tryon-intro"), h("p", {}, "The foundation preview couldn't be drawn on this photo. The shade and product types below still apply.")));
        }
        const side = h("div", {});
        sec.append(h("div", { class: "sm-tryon-wrap" }, slot, side));
        if (v.tone)
            sec.append(hold(h("div", { class: "sm-tone" }, h("h3", {}, uiIcon("shade-match"), "Skin tone reading"), swatchList(v.tone.chips), h("p", {}, v.tone.line), h("p", { class: "lg-small" }, v.tone.label))));
        if (v.look) {
            const look = v.look;
            const media = images?.look && photo && reply.source !== "saved_example"
                ? figure(compare(imgEl(photo.url, "Your photo"), canvasOf(images.look, "Your photo with the full look drawn on"), "Before", "Full look"), look.label)
                : null;
            lookSlot.append(media ?? h("div", { class: "sm-callout" }, art("tryon-intro"), h("p", {}, look.label)));
            sec.append(hold(h("div", { class: "sm-look" }, h("h3", {}, uiIcon("coverage"), "The full look"), h("div", { class: "sm-tryon-wrap" }, lookSlot, h("div", {}, h("p", { class: "lg-small" }, "Picked from your measured colouring, each deeper than your skin."), swatchList(look.swatches))))));
        }
        function products(list) {
            side.replaceChildren(...(list.length ? [h("h3", {}, uiIcon("shade-match"), "Product types, best match first"),
                h("ol", { class: "sm-products" }, ...list.map((p) => h("li", {}, h("div", { class: "sm-product-item" }, productPicture(p.picture, 48), h("div", {}, h("strong", {}, p.name), p.detail ? h("span", { class: "lg-small" }, ` ${p.detail}`) : null, h("p", {}, p.why), h("p", { class: "lg-small" }, `For: ${p.forWhat}`)))))),
                h("p", { class: "lg-small" }, v.productsNote)] : []));
        }
        products(v.products);
        return sec;
    }
    /** The local foundation preview on an example-person picture, at most 480 px wide. Face points
     * from the face model when it runs here, else from the pictures' fixed framing. */
    async function examplePreview(url) {
        const read = await examplePicture(url);
        if (!read)
            return null;
        const drawn = examplePersonPreview(read.before, read.points);
        return drawn ? { before: read.before, after: drawn.image, framed: read.framed, shade: drawn.shade, lab: drawn.lab, points: read.points } : null;
    }
    /** An example-person picture at most 480 px wide, with its face points: from the shared face map
     * when the face reader runs here, else from the pictures' fixed framing (labelled examples only). */
    async function examplePicture(url) {
        try {
            const image = await loadImage(url);
            const w = Math.min(480, image.naturalWidth), hgt = Math.round(image.naturalHeight * w / image.naturalWidth);
            const c = document.createElement("canvas");
            c.width = w;
            c.height = hgt;
            const g = c.getContext("2d");
            if (!g)
                return null;
            g.drawImage(image, 0, 0, w, hgt);
            const before = { width: w, height: hgt, channels: 4, data: g.getImageData(0, 0, w, hgt).data };
            let points = null;
            if (await faceModelReady(defaultVisionClient())) {
                try {
                    const map = await faceMapFor(c, { key: `sm-example:${url}:${w}x${hgt}` });
                    if (map.points)
                        points = map.points.map(([x, y]) => [x, y]);
                }
                catch {
                    points = null;
                }
            }
            return { before, points: points ?? framingPoints(w, hgt), framed: points === null };
        }
        catch {
            return null;
        }
    }
    /** "After a breakout": what the plan aims for, drawn on her own photo. */
    function previewSection(v, reply, images) {
        const pv = v.preview;
        if (reply.moment !== "breakout" || !pv)
            return null;
        let media = null;
        if (images?.preview && photo && reply.source !== "saved_example") {
            media = figure(compare(imgEl(photo.url, "Your photo"), canvasOf(images.preview, "Your photo with the plan's concerns softened"), "Today", "Preview"), pv.label);
        }
        const slot = h("div", { class: "sm-tryon" }, media ?? h("div", { class: "sm-callout" }, art("tryon-intro"), h("p", {}, pv.label)));
        if (!media && reply.source === "saved_example") {
            // The saved preview's concerns, softened on the example person shown above by our own skin
            // engines at the strengths listed: a picture of what the plan aims for, never a promise.
            void (async () => {
                const day0 = await exampleFace(Number(MOMENT_FACE.breakout), "day0");
                const read = day0 ? await examplePicture(day0) : null;
                const after = read ? examplePersonSoftened(read.before, read.points, pv.rows.map((r) => ({ concern: r.concern, strength: r.percent / 100 }))) : null;
                if (!read || !after)
                    return;
                slot.replaceChildren(figure(compare(canvasOf(read.before, `${AI_PERSON}, today`), canvasOf(after, `${AI_PERSON} with the plan's concerns softened`), "Today", "Preview"), `Saved example, drawn on this device. ${AI_PERSON}. Redness, breakouts and texture softened at the strengths listed. Skin colour is never lightened.${read.framed ? " Face area from the picture's fixed framing, not a face reading." : ""}`));
            })();
        }
        return h("section", { class: "sm-section", "aria-labelledby": "sm-preview-h" }, h("h2", { id: "sm-preview-h" }, uiIcon("coverage"), "What this plan aims for"), h("div", { class: "sm-tryon-wrap" }, slot, h("div", {}, h("h3", {}, "Softened, not erased"), h("ul", { class: "sm-preview-rows" }, ...pv.rows.map((r) => h("li", {}, h("span", { class: "sm-score-label" }, concernIcon(r.concern), r.label), h("span", { class: "sm-meter", "aria-hidden": "true" }, h("span", { style: { width: `${r.percent}%` } })), h("span", { class: "lg-small" }, r.strength)))), h("p", { class: "lg-small" }, "A simulation of how the concerns this plan works on could look, never a promise. Skin colour is never lightened. Not medical advice."))));
    }
    function planSection(v) {
        return h("section", { class: "sm-section", "aria-labelledby": "sm-plan-h" }, h("h2", { id: "sm-plan-h" }, "Your plan"), h("p", { class: "lg-small" }, v.planLabel), h("div", { class: "sm-plan" }, ...v.plan.map((s) => h("section", { class: `sm-plan-card sm-plan-${s.id}`, "aria-labelledby": `sm-plan-${s.id}` }, uiIcon(PLAN_ICON[s.id], art(s.art, { className: "sm-plan-art" }), 56), h("h3", { id: `sm-plan-${s.id}` }, s.title), h("ul", {}, ...s.lines.map((l) => h("li", { class: "sm-plan-item" }, productPicture(l.picture), h("div", {}, h("span", { class: "sm-plan-line" }, l.text), l.because ? h("span", { class: "sm-because" }, h("span", { class: "sm-because-k" }, "Why: "), l.because) : null))))))), v.derm.length ? h("aside", { class: "sm-derm", "aria-labelledby": "sm-derm-h" }, uiIcon("dermatologist", art("plan-dermatologist"), 56), h("div", {}, h("h3", { id: "sm-derm-h" }, "See a dermatologist if"), h("ul", {}, ...v.derm.map((d) => h("li", {}, d))))) : null);
    }
    function stepsSection(v) {
        return h("section", { class: "sm-section", "aria-labelledby": "sm-steps-h" }, h("h2", { id: "sm-steps-h" }, "What was done"), h("p", { class: "lg-small" }, "Every step ran in your browser. Same photo, same result; nothing is sent anywhere."), h("ol", { class: "sm-steps" }, ...v.steps.map((s) => h("li", { class: `sm-step sm-step-${s.tone}` }, h("span", { class: "sm-step-n", "aria-hidden": "true" }, String(s.n)), h("div", { class: "sm-step-body" }, h("div", { class: "sm-step-top" }, uiIcon(stepIcon(s.action), undefined, 22), h("span", { class: "sm-chip" }, s.status)), h("p", {}, s.line), s.reason ? h("p", { class: "lg-small sm-step-why", "data-code": s.reasonCode ?? undefined }, s.reason) : null)))));
    }
    function result(s) {
        const v = resultView(s.reply, s.history);
        const info = momentInfo(s.moment);
        // "Before I buy" shows her face in the try-on, so the header doesn't repeat it.
        const showSubject = s.moment !== "buy";
        const head = h("div", { class: `sm-result-head${showSubject ? "" : " sm-result-head-solo"}` }, h("div", {}, ...heading("Your result", `${info.title} · ${info.question}`), h("p", { class: "sm-badges" }, badge(v.sourceBadge, v.badgeTone), h("span", { class: "badge badge-local" }, "Not medical advice")), v.message ? h("p", { class: "lg-small" }, v.message) : null), showSubject ? subject(s.reply) : null);
        const notice = v.notice ? h("div", { class: "sm-callout sm-callout-warn", role: "note" }, art("error-offline"), h("p", {}, v.notice)) : null;
        const delDone = deleted && s.reply.source !== "saved_example" && !s.history.length
            ? h("div", { class: "sm-callout", role: "status" }, art("delete-done"), h("p", {}, "Deleted. No check-ins are stored on this device now.")) : null;
        return [head, notice, scoresSection(v), checkinSection(v, s.reply.source !== "saved_example"), diarySection(s.reply, s.history), delDone, tryonSection(v, s.reply, s.images), previewSection(v, s.reply, s.images), planSection(v), usePlan(s.reply, s.moment), stepsSection(v),
            h("p", { class: "sm-disclaimer", role: "note" }, h("strong", {}, "Not medical advice. "), v.disclaimer.replace(/^Not medical advice\.\s*/, "")),
            h("div", { class: "sm-actions sm-actions-end" }, h("button", { type: "button", class: "lg-button lg-primary", onclick: () => go(() => controller.restart()) }, "Choose another moment"), s.reply.source === "saved_example" ? null : h("button", { type: "button", class: "lg-button", onclick: () => go(() => controller.choose(s.moment)) }, "Run it again with a new photo")),
        ].filter((x) => !!x);
    }
    const screen = h("div", { class: "sm-screen" });
    const bar = h("div", { class: "sm-progress-wrap" });
    root.replaceChildren(bar, screen);
    controller.subscribe((s) => {
        if (s.kind === "choose") {
            setPhoto(null);
            deleted = false;
        }
        bar.replaceChildren(progress(s));
        const parts = s.kind === "choose" ? choose() : s.kind === "photo" ? photoStep(s)
            : s.kind === "loading" ? loading(s) : s.kind === "error" ? error(s) : result(s);
        screen.dataset.state = s.kind;
        syncHash(s.kind === "choose" ? null : s.moment);
        screen.replaceChildren(...parts);
        if (!first && s.kind !== lastKind) {
            window.scrollTo({ top: 0 });
            screen.querySelector("h1")?.focus({ preventScroll: true });
        }
        first = false;
        lastKind = s.kind;
        if (s.kind === "result")
            announce(resultView(s.reply, s.history).announce);
        else if (s.kind === "error")
            announce(s.message);
        else if (s.kind === "loading")
            announce("Reading your skin.");
    });
    if (MOMENTS.some((m) => m.id === start)) {
        first = true;
        controller.choose(start);
    }
}
/** Keep the address on the moment shown, so a reload or a copied link opens that moment. */
function syncHash(moment) {
    if (typeof history === "undefined" || typeof location === "undefined")
        return;
    const want = moment ? `#${moment}` : "";
    if (location.hash === want)
        return;
    try {
        history.replaceState(history.state, "", want || location.pathname + location.search);
    }
    catch { /* sandboxed frame */ }
}
const root = typeof document !== "undefined" ? document.getElementById("sm-root") : null;
if (root)
    mountSkinMoment(root, location.hash.slice(1));
//# sourceMappingURL=skin-moment.js.map