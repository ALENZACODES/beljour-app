import { labToXyz, rgbToHex, xyzToRgb } from "../engines/core/colour.js";
import { findReliableShade, matchShades } from "../engines/shade/finder.js";
import { compareSnapshots } from "../engines/skin-checkin/store.js";
import { MeasureRefusal, measureSkin } from "../engines/skin-measure/index.js";
import { band, buildPlan, profileOf, undertoneOf } from "../engines/skin-measure/plan.js";
import { applyFoundation, isFoundationRefusal } from "../engines/shade/foundation.js";
import { examplePersonLook, examplePersonSoftened, SHEER_COVERAGE } from "./skin-moment-demo.js";
export const DEVICE_LABEL = "On this device";
export const DISCLAIMER = "Not medical advice. Cosmetic information about how your skin looks in this photo; lighting, focus and makeup change it.";
/** The concerns each moment shows; a check-in shows all six so every change is visible. */
export const MOMENT_CONCERNS = {
    buy: ["moisture", "oiliness", "redness", "texture"],
    breakout: ["acne", "redness", "texture", "pore"],
    checkin: ["acne", "redness", "texture", "pore", "oiliness", "moisture"],
};
const CONCERN_LINE = 80;
const SIM_MIN = 0.2, SIM_MAX = 0.6, SIM_MAX_CONCERNS = 4;
const SIM_FOR = new Set(["acne", "redness", "texture", "pore", "oiliness"]);
const LIP_HUE = { cool: 5, neutral: 18, warm: 30, olive: 24 };
const BLUSH_HUE = { cool: 12, neutral: 28, warm: 42, olive: 36 };
const LIP_CHROMA = 40, BLUSH_CHROMA = 30, LIP_DEPTH = 18, BLUSH_DEPTH = 8;
export class DeviceRefusal extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}
function lchHex(l, c, hue) {
    const r = hue * Math.PI / 180;
    const rgb = xyzToRgb(labToXyz([Math.max(5, Math.min(95, l)), c * Math.cos(r), c * Math.sin(r)]), true);
    return rgbToHex(rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))))).toUpperCase();
}
const labHex = (lab) => rgbToHex(xyzToRgb(labToXyz(lab), true).map((v) => Math.max(0, Math.min(255, Math.round(v))))).toUpperCase();
/** A lip colour and a blush, both deeper than her skin, hues from her undertone (services/skin_looks.py). */
export function lookSwatches(skinLab, baseHex) {
    const tone = undertoneOf(skinLab[1], skinLab[2]);
    const out = [];
    if (baseHex)
        out.push({ category: "foundation", label: "Base, never lighter than measured", color: baseHex });
    out.push({ category: "lip_color", label: `Lip colour, from your ${tone} undertone`, color: lchHex(skinLab[0] - LIP_DEPTH, LIP_CHROMA, LIP_HUE[tone]) });
    out.push({ category: "blush", label: `Blush, from your ${tone} undertone`, color: lchHex(skinLab[0] - BLUSH_DEPTH, BLUSH_CHROMA, BLUSH_HUE[tone]) });
    return out;
}
/** The concerns the breakout preview softens: lowest under 80 first, strength (80 - score) / 80
 * kept between 0.2 and 0.6, at most four. */
export function previewStrengths(scores) {
    return [...scores].filter((s) => SIM_FOR.has(s.concern) && s.raw_score < CONCERN_LINE)
        .sort((a, b) => a.raw_score - b.raw_score || (a.concern < b.concern ? -1 : 1)).slice(0, SIM_MAX_CONCERNS)
        .map((s) => ({ concern: s.concern, label: s.label,
        strength: Math.round(Math.max(SIM_MIN, Math.min(SIM_MAX, (CONCERN_LINE - s.raw_score) / CONCERN_LINE)) * 10) / 10 }));
}
function checkinOf(previous, current) {
    const full = compareSnapshots(previous, current);
    return { previous_at: previous.taken_at, days_between: full.days_between, summary: full.summary,
        changes: full.changes.map((c) => ({ concern: c.concern, label: c.label, before: c.before, after: c.after,
            delta: Math.round(c.delta * 10) / 10, noise_band: c.noise_band, verdict: c.verdict, higher_is_better: c.higher_is_better })) };
}
/** Run one moment on her photo. `points` are pixel face-mesh points (478). `previous` is her
 * latest check-in kept on this device, for "Is it working?". Throws DeviceRefusal with a plain
 * message when the photo can't be read. */
export function runOnDevice(moment, image, points, previous, now = new Date()) {
    let reading;
    try {
        reading = measureSkin(image, points);
    }
    catch (err) {
        if (err instanceof MeasureRefusal)
            throw new DeviceRefusal(err.code, err.message);
        throw err;
    }
    const steps = [];
    const step = (action, why, status = "done", reason = null) => steps.push({ n: steps.length + 1, action, why, status, units: 0, cached: false, reason });
    // A check-in reads the same concerns as last time where it can, so every row compares.
    const asked = moment === "checkin" && previous
        ? [...new Set([...previous.concerns.map((c) => c.concern), ...MOMENT_CONCERNS.checkin])].filter((c) => MOMENT_CONCERNS.checkin.includes(c))
        : MOMENT_CONCERNS[moment];
    const byConcern = new Map(reading.readings.map((r) => [r.concern, r]));
    const concerns = asked.map((c) => byConcern.get(c)).filter((r) => !!r)
        .map((r) => ({ concern: r.concern, label: r.label, raw_score: r.raw_score, band: band(r.raw_score), ui_score: null }))
        .sort((a, b) => a.raw_score - b.raw_score || (a.concern < b.concern ? -1 : 1));
    step("skin-reading", `Your skin read on this device: ${concerns.map((c) => c.label.toLowerCase()).join(", ")}. Nothing was sent.`);
    const low = reading.readings.filter((r) => r.confidence === "low" && asked.includes(r.concern)).map((r) => r.label.toLowerCase());
    // Depth, undertone and shade: the shade engine's reading of her skin colour when it is sure,
    // else the skin reading's own (balanced on the whites of her eyes).
    const mesh = points.map(([x, y]) => [x, y, 0]);
    const shadeReading = findReliableShade(image, mesh).result;
    const lab = !shadeReading.refused && shadeReading.measured_lab
        ? [shadeReading.measured_lab[0], shadeReading.measured_lab[1], shadeReading.measured_lab[2]] : reading.skin_lab;
    const profile = profileOf(lab, reading.pixels, DEVICE_LABEL);
    const best = matchShades(lab)[0] ?? null;
    if (best)
        step("shade-match", `Shade matched on this device: ${best.name}, the nearest of our reference shades, never lighter than measured.`);
    else
        step("shade-match", "No reference shade matched this reading closely enough.", "skipped", "no_shade");
    // "Is it working?": compare with her last check-in on this device.
    let checkin = null;
    const current = { taken_at: now.toISOString(), source: "local",
        concerns: concerns.map((c) => ({ concern: c.concern, raw_score: c.raw_score })) };
    if (moment === "checkin" && previous) {
        try {
            checkin = checkinOf(previous, current);
            step("compare", "Today against your last check-in, concern by concern, with a noise band so a small change reads as no real change.");
        }
        catch {
            step("compare", "Your last check-in could not be read, so there is nothing to compare this time.", "skipped", "bad_previous");
        }
    }
    const plan = buildPlan(moment, concerns, profile, checkin, moment === "checkin" && !previous, best?.name ?? null);
    step("plan", "One plan from your lowest scores, by the skin guide's rules: one new product at a time, sunscreen every morning.");
    const images = { tryon: null, look: null, preview: null };
    const reply = {
        moment, photo_id: "device", source: "local", fallback: null,
        message: [low.length ? `Less certain in this photo: ${low.join(", ")}.` : "", ...reading.notes].filter(Boolean).join(" ") || null,
        analysis: { concerns, concerns_source: DEVICE_LABEL, profile },
        plan, steps, units: { spent: 0, left: null, cap: null }, checkin, disclaimer: DISCLAIMER,
    };
    if (moment === "buy") {
        const tint = plan.products?.[0] ?? null;
        if (best) {
            const out = applyFoundation(image, mesh, best.lab, lab, SHEER_COVERAGE);
            images.tryon = isFoundationRefusal(out) ? null : { width: image.width, height: image.height, channels: image.channels, data: out.image };
        }
        reply.tryon = { image_url: "", product_id: tint?.id ?? "base-skin-tint", shade: best?.name ?? tint?.shade ?? null, coverage: tint?.coverage ?? "sheer",
            label: `Drawn on this device: a sheer base in ${best?.name ?? "the nearest shade"}, never lighter than your skin.` };
        step("foundation-preview", images.tryon ? "The matched shade drawn on your photo at sheer coverage." : "The foundation preview could not be drawn on this photo.", images.tryon ? "done" : "skipped", images.tryon ? null : "no_preview");
        const swatches = lookSwatches(lab, best ? labHex(best.lab) : null);
        images.look = images.tryon ? examplePersonLook(images.tryon, points.map(([x, y]) => [x, y]), swatches) : null;
        reply.look = { image_url: images.look ? "device" : null, swatches,
            label: images.look ? "The full look drawn on your photo on this device: base, lip colour and blush. Skin is never lightened."
                : "The full look's colours, picked from your measured colouring." };
        step("full-look", "A lip colour and blush picked from your undertone, each deeper than your skin, drawn with the base.", images.look ? "done" : "skipped", images.look ? null : "no_preview");
    }
    if (moment === "breakout") {
        const rows = previewStrengths(concerns);
        if (rows.length) {
            images.preview = examplePersonSoftened(image, points.map(([x, y]) => [x, y]), rows);
            const names = rows.map((r) => r.label.toLowerCase()).join(", ");
            reply.preview = { image_url: images.preview ? "device" : null, concerns: rows,
                label: images.preview ? `Preview drawn on this device: ${names} softened, not erased. A simulation, not a promise.`
                    : `What the preview would soften: ${names}.` };
            step("skin-preview", `Your photo with ${names} softened, not erased, so you can see what the plan aims for.`, images.preview ? "done" : "skipped", images.preview ? null : "no_preview");
        }
        else {
            step("skin-preview", "Every concern reads 80 or above, so there is nothing to soften.", "skipped", "nothing_to_soften");
        }
    }
    return { reply, images };
}
//# sourceMappingURL=skin-moment-device.js.map