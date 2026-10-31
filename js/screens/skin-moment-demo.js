import { makeSample } from "../ui/shell/demo.js";
import { findReliableShade, matchShades } from "../engines/shade/finder.js";
import { applyFoundation, isFoundationRefusal } from "../engines/shade/foundation.js";
import { floatImage } from "../engines/core/buffer.js";
import { hexToRgb } from "../engines/core/colour.js";
import { boxMean } from "../engines/core/filters.js";
import { applyTint } from "../engines/makeup_w/colour.js";
import { regionMask } from "../data/regions/index.js";
import { isRefusal, renderSkinTool } from "../engines/skin/studio.js";
import { healBlemishes } from "../engines/skin/blemish.js";
import { compareSnapshots } from "../engines/skin-checkin/store.js";
import { SAVED_CHECKIN, SAVED_EXTRAS } from "./generated/skin-moment-saved.js";
import { framingPoints } from "./shape-art.js";
export { framingPoints };
export const DEMO_PHOTO_ID = "saved-example";
const DISCLAIMER = "Not medical advice. Cosmetic suggestions only; product types, not tested against real products.";
/** services/skin.py band(): 80 and over looks good, 60 to 79 has room to improve. */
const band = (raw) => (raw >= 80 ? "looking good" : raw >= 60 ? "some room to improve" : "worth focusing on");
const LABELS = { acne: "Breakouts", redness: "Redness", texture: "Texture", pore: "Pores", moisture: "Hydration", oiliness: "Oil" };
const RAW = { acne: [58, 74], redness: [61, 77], texture: [70, 82], pore: [72, 83], moisture: [76, 85], oiliness: [64, 79] };
const scores = (names) => names.map((c) => ({ concern: c, label: LABELS[c], raw_score: RAW[c][0], band: band(RAW[c][0]), ui_score: RAW[c][1] }));
// skin_planner.py concern sets.
const BUY = ["moisture", "oiliness", "redness", "texture"];
const BREAKOUT = ["acne", "redness", "texture", "pore"];
/* ------------------------------- planner steps ------------------------------- */
/** youcam/units.py _SKIN_SD: up to this many concerns cost this many units. */
const SKIN_UNITS = [[4, 9], [8, 12], [12, 14], [16, 16]];
export function skinAnalysisUnits(concerns) {
    const tier = SKIN_UNITS.find(([upTo]) => concerns <= upTo);
    if (!tier || concerns < 1)
        throw new RangeError("skin analysis takes 1 to 16 concerns");
    return tier[1];
}
export const NOT_LIVE = "not_live: a saved example runs here, so this live call is only planned, never sent.";
export const NO_CONSENT = "no_consent: you chose a local estimate, so nothing goes to YouCam.";
const SAVED_WHY = "Saved example: made-up scores stored with the app, so the whole flow runs with no key. Nothing was sent.";
const TONE_WHY = "Saved example: a skin tone reply in YouCam's documented shape, its colours measured on the AI-generated example person's picture by our own local engines. Nothing was sent.";
const PREVIEW_WHY = "Saved example: the concerns and strengths the live preview would ask for, drawn on the example picture on this device by our own skin engines. Nothing was sent.";
function steps(moment, mode, concerns) {
    const live = (action, units, why) => ({ action, why, status: "skipped", units: mode === "local" ? 0 : units, cached: false, reason: mode === "local" ? NO_CONSENT : NOT_LIVE });
    const done = (action, why) => ({ action, why, status: "done", units: 0, cached: false, reason: null });
    const analysis = live("skin-analysis", skinAnalysisUnits(concerns), moment === "buy" ? `Skin analysis to read moisture, oil, redness and texture: ${concerns} concerns for ${skinAnalysisUnits(concerns)} units.`
        : moment === "checkin" ? `Skin analysis on the same concerns as last time: ${concerns} concerns for ${skinAnalysisUnits(concerns)} units.`
            : `Skin analysis focused on acne, redness, texture and pores: ${concerns} concerns for ${skinAnalysisUnits(concerns)} units.`);
    const list = [analysis, done("saved-example", SAVED_WHY)];
    if (moment === "buy") {
        list.push(live("skin-tone-analysis", 20, "Skin tone reading: your skin and lip colour measured by YouCam, so the shade and the lip colour start from you, for 20 units."), ...(mode === "local" ? [] : [done("saved-example", TONE_WHY)]), done("local-shade-match", "Shade and coverage matched on this device from the colour of the face shown, without YouCam. Never lighter than measured."), live("makeup-vto", 1, "Makeup try-on of the matched shade and coverage on your photo for 1 unit."), done("local-foundation-preview", "Foundation preview drawn on this device instead of the YouCam try-on."), live("makeup-vto", 1, "Full-look try-on: the same base plus a lip colour and blush picked from your measured colouring, on your photo for 1 unit."), done("local-look-swatches", "The lip colour and blush for the full look, drawn on the example picture on this device and shown as colour swatches, instead of the YouCam try-on."));
    }
    else if (moment === "breakout") {
        list.push(live("skin-simulation", 4, "Skin preview: your photo with the concerns this plan works on softened, not erased, so you can see what it aims for. A simulation, not a promise. Up to 4 concerns for 4 units."), ...(mode === "local" ? [] : [done("saved-example", PREVIEW_WHY)]));
    }
    else if (moment === "checkin") {
        list.push(done("local-compare", "Today against the earlier check-in, per concern, with a noise band so a small change reads as no real change."));
    }
    return list.map((s, i) => ({ n: i + 1, ...s }));
}
/* ------------------------------ before I buy ------------------------------ */
/** skin_match_catalogue.json depth_bands: the first band whose minimum lightness she reaches. */
const DEPTHS = [
    [72, "very-light", "very light"], [62, "light", "light"], [52, "medium", "medium"],
    [42, "tan", "tan"], [32, "deep", "deep"], [0, "very-deep", "very deep"]
];
/** skin_match_catalogue.json undertones: label and the word used in a shade name. */
const UNDERTONES = {
    warm: ["warm (golden)", "golden"], cool: ["cool (pink)", "rosy"], neutral: ["neutral", "neutral"], olive: ["olive", "olive"]
};
/** services/skin_match.py undertone_of: hue-angle cut points, olive per the catalogue's rule. */
export function undertoneOf(a, b) {
    const angle = Math.atan2(b, a) * 180 / Math.PI;
    if (angle >= 62)
        return a < 9 && b > 13 ? "olive" : "warm";
    return angle <= 48 ? "cool" : "neutral";
}
/** The demo's sheer base: the low end of the planner's ASSUMED 30-80 coverage range. */
export const SHEER_COVERAGE = 30;
export function profileOf(lab) {
    const [lightness, a, b] = lab;
    const [, depth, depthLabel] = DEPTHS.find(([min]) => lightness >= min) ?? DEPTHS[DEPTHS.length - 1];
    const tone = undertoneOf(a, b);
    return { lightness, a, b, hue_angle: Math.atan2(b, a) * 180 / Math.PI, chroma: Math.hypot(a, b), depth, depth_label: depthLabel,
        undertone: tone, undertone_label: UNDERTONES[tone][0], pixels: 0, source: "Saved example",
        note: "Depth and undertone measured on this device from the face shown; the scores are the saved example." };
}
const PRODUCT_LABEL = "not tested against real products";
/** The product types for a measured depth and undertone, as services/skin_match.py map_products
 * words them: the skin tint first, then the redness and oil product types the scores point to. */
export function buyProducts(profile) {
    const shade = `${profile.depth_label}, ${UNDERTONES[profile.undertone][1]}`;
    return [
        { id: `base-skin-tint:${profile.depth}:${profile.undertone}`, type: "Skin tint", name: `Skin tint, ${shade}`, shade, coverage: "sheer",
            why: "Evens tone while your own skin still shows through.", for: "Redness, Oil", label: PRODUCT_LABEL },
        { id: "correct-green-primer", type: "Green colour-correcting primer", name: "Green colour-correcting primer", shade: null, coverage: null,
            why: "A thin layer softens the look of visible redness before base.", for: "Redness", label: PRODUCT_LABEL },
        { id: "prep-mattifying-primer", type: "Mattifying primer", name: "Mattifying primer", shade: null, coverage: null,
            why: "Controls shine on the T-zone through the day.", for: "Oil", label: PRODUCT_LABEL },
    ];
}
let drawnLab;
/** The colour measured on the drawn example face (the subject until a picture loads). */
export function drawnFaceLab() {
    if (drawnLab !== undefined)
        return drawnLab;
    const sample = makeSample("portrait");
    const lab = sample.face ? findReliableShade(sample.image, sample.face.map(([x, y]) => [x, y, 0])).result.measured_lab : null;
    drawnLab = lab ? [lab[0], lab[1], lab[2]] : null;
    return drawnLab;
}
/** "Before I buy" for the face shown: its measured depth and undertone name the skin tint, and the
 * try-on words repeat that product's shade and coverage. */
export function buyExample(lab = drawnFaceLab(), mode = "youcam") {
    const profile = profileOf(lab ?? [55, 12, 18]);
    const products = buyProducts(profile);
    const tint = products[0];
    return { moment: "buy", photo_id: DEMO_PHOTO_ID, source: "saved_example", fallback: null, message: null,
        steps: steps("buy", mode, BUY.length), units: { spent: 0, left: null, cap: null }, disclaimer: DISCLAIMER,
        analysis: { concerns: scores(BUY), concerns_source: "Saved example", profile },
        plan: {
            today: [{ text: "Start with a sheer skin tint at your measured depth, not lighter", because: "redness 61 and oil 64 show; a sheer layer evens them without a heavy base" }],
            this_week: [{ text: "Add a green colour-correcting primer only where redness shows", because: "redness is your lowest score, 61 of 100" },
                { text: "Keep moisturising, even on oily days", because: "stripping oil can make skin produce more" }],
            stop: [{ text: "Skip full-coverage foundation for now", because: "texture 70: a heavy base tends to sit in uneven texture" }],
            see_dermatologist_if: [DERM.redness], products, label: "Cosmetic steps from your measured concerns."
        },
        tryon: { image_url: "", product_id: tint.id, shade: tint.shade, coverage: tint.coverage,
            label: `Saved example: ${tint.name.toLowerCase()}, ${tint.coverage} coverage, drawn on this device, not a YouCam render.` },
        tone: mode === "local" ? null : SAVED_EXTRAS.tone, look: mode === "local" ? null : SAVED_EXTRAS.look };
}
const DERM = {
    acne: "Painful, deep or scarring breakouts deserve a visit to a doctor or dermatologist.",
    redness: "Persistent redness, flushing or bumps can be rosacea; a doctor can confirm.",
};
/* ------------------------------ is it working? ------------------------------ */
const todaySnapshot = () => ({ taken_at: SAVED_CHECKIN.taken_at, source: "youcam",
    concerns: SAVED_CHECKIN.reply.analysis.concerns.map((c) => ({ concern: c.concern, raw_score: c.raw_score })) });
/** The earlier check-in and today's, as the example's own history. */
export const SAVED_HISTORY = [SAVED_CHECKIN.previous, todaySnapshot()];
/** The comparison, by the browser check-in engine, in the wire form the server sends (delta to
 * one decimal, as services/skin_moment.checkin_block). */
export function savedCheckin() {
    const previous = SAVED_CHECKIN.previous;
    const full = compareSnapshots(previous, todaySnapshot());
    return { previous_at: previous.taken_at, days_between: full.days_between, summary: full.summary,
        changes: full.changes.map((c) => ({ concern: c.concern, label: c.label, before: c.before, after: c.after,
            delta: Math.round(c.delta * 10) / 10, noise_band: c.noise_band, verdict: c.verdict, higher_is_better: c.higher_is_better })) };
}
export function savedExample(moment, mode = "youcam") {
    if (moment === "buy")
        return buyExample(drawnFaceLab(), mode);
    if (moment === "checkin") {
        const r = SAVED_CHECKIN.reply;
        // The page has no server here, so the server's "not_live" fallback and note don't apply; the
        // page's own Saved example note says what this is.
        return { ...r, fallback: null, message: null, steps: steps("checkin", mode, r.analysis.concerns.length), checkin: savedCheckin() };
    }
    return { moment, photo_id: DEMO_PHOTO_ID, source: "saved_example", fallback: null, message: null,
        steps: steps(moment, mode, BREAKOUT.length), units: { spent: 0, left: null, cap: null }, disclaimer: DISCLAIMER,
        preview: mode === "local" ? null : SAVED_EXTRAS.preview,
        analysis: { concerns: scores(BREAKOUT), concerns_source: "Saved example", profile: profileOf(drawnFaceLab() ?? [55, 12, 18]) },
        plan: {
            today: [{ text: "Wash with a gentle cleanser, then a light moisturiser", because: "keeps the skin calm without stripping it" },
                { text: "Leave the spots alone", because: "picking leaves marks that last longer than the spot" }],
            this_week: [{ text: "Introduce one spot-care product only, every other evening", because: "breakouts are your lowest score, 58 of 100" },
                { text: "Change pillowcases twice a week", because: null },
                { text: "Notice triggers such as heat, spicy food or harsh scrubs", because: "redness 61 of 100" }],
            stop: [{ text: "Stop harsh scrubs", because: "they can worsen redness and texture" },
                { text: "Stop layering several new products at once", because: "if something irritates, you won't know which one" }],
            see_dermatologist_if: [DERM.acne, DERM.redness], label: "Cosmetic steps from your measured concerns."
        } };
}
export const SAVED = {
    reply: savedExample,
    history: (moment) => (moment === "checkin" ? SAVED_HISTORY : []),
};
/** A foundation preview drawn on this device with the local shade engine (our own code, never
 * a YouCam render): the best match at the measured depth, never lighter. `points` are pixel face
 * points. Null when the engine declines (no reliable skin reading). */
export function foundationPreview(image, points, coverage = SHEER_COVERAGE) {
    const pts = points.map(([x, y]) => [x, y, 0]);
    const reading = findReliableShade(image, pts).result;
    if (reading.refused || !reading.measured_lab)
        return null;
    const best = matchShades(reading.measured_lab)[0];
    if (!best)
        return null;
    const out = applyFoundation(image, pts, best.lab, reading.measured_lab, coverage);
    if (isFoundationRefusal(out))
        return null;
    return { width: image.width, height: image.height, channels: image.channels, data: out.image };
}
/** The saved example's try-on: the drawn portrait before, and with the matched sheer base. */
export function demoTryOn() {
    const sample = makeSample("portrait");
    const after = foundationPreview(sample.image, sample.face.map(([x, y]) => [x, y]));
    return after ? { before: sample.image, after } : null;
}
/** The saved example's preview on an AI-generated example person. Unlike foundationPreview it
 * does not stop when the shade finder calls the reading unreliable (it does on these pictures
 * with framing points: the zones disagree), because nothing here is named or measured for
 * anyone: the shade is the nearest sample shade to the picture's measured colour so the
 * base is never lighter, and the caption says it is an illustration. Null without a reading. */
export function examplePersonPreview(image, points, coverage = SHEER_COVERAGE) {
    const pts = points.map(([x, y]) => [x, y, 0]);
    const lab = findReliableShade(image, pts).result.measured_lab;
    if (!lab)
        return null;
    const best = matchShades(lab)[0];
    if (!best)
        return null;
    const out = applyFoundation(image, pts, best.lab, lab, coverage);
    return isFoundationRefusal(out) ? null
        : { image: { width: image.width, height: image.height, channels: image.channels, data: out.image }, shade: best.name, lab: [lab[0], lab[1], lab[2]] };
}
/* ----------------------- saved looks drawn on the face shown ----------------------- */
const LOOK_LIP = 0.45, LOOK_BLUSH = 0.22;
const toByte = (image, data) => ({ width: image.width, height: image.height, channels: image.channels, data: Uint8ClampedArray.from(data) });
/** A soft mask: the region blurred a little so the colour has no hard edge. */
function softRegion(name, points, w, hgt, blur) {
    const m = regionMask(name, points, w, hgt, { normalized: false });
    return Float32Array.from(blur > 0 ? boxMean(m, blur).data : m.data);
}
/** Blush on the cheeks: two soft ovals at the mesh's cheek points (205 and 425), inside the skin. */
function cheekMask(points, w, hgt) {
    const skin = softRegion("skin", points, w, hgt, 0);
    const faceW = Math.hypot(points[454][0] - points[234][0], points[454][1] - points[234][1]);
    const rx = faceW * 0.13, ry = faceW * 0.085;
    const out = new Float32Array(w * hgt);
    for (const [cx, cy] of [points[205], points[425]]) {
        const x0 = Math.max(0, Math.floor(cx - 3 * rx)), x1 = Math.min(w - 1, Math.ceil(cx + 3 * rx));
        const y0 = Math.max(0, Math.floor(cy - 3 * ry)), y1 = Math.min(hgt - 1, Math.ceil(cy + 3 * ry));
        for (let y = y0; y <= y1; y++)
            for (let x = x0; x <= x1; x++) {
                const dx = (x - cx) / rx, dy = (y - cy) / ry, i = y * w + x;
                out[i] = Math.max(out[i], Math.exp(-(dx * dx + dy * dy) / 2) * skin[i]);
            }
    }
    return out;
}
/** The saved full look on the face shown, drawn with our own local engines: the base (as
 * examplePersonPreview), then the saved lip colour and blush, each tinted with the makeup
 * engine's never-lighten rule. `base` is the picture with the base already on. Null when the
 * face points can't make a lip or skin area. Skin is never lightened. */
export function examplePersonLook(base, points, swatches) {
    const lip = swatches.find((x) => x.category === "lip_color"), blush = swatches.find((x) => x.category === "blush");
    if (!lip && !blush)
        return null;
    const { width: w, height: hgt } = base;
    try {
        let photo = { width: w, height: hgt, channels: base.channels, data: Uint8ClampedArray.from(base.data) };
        if (blush)
            photo = { ...photo, data: applyTint(photo, cheekMask(points, w, hgt), hexToRgb(blush.color), LOOK_BLUSH, true) };
        if (lip)
            photo = { ...photo, data: applyTint(photo, softRegion("lips", points, w, hgt, 1), hexToRgb(lip.color), LOOK_LIP, true) };
        return toByte(base, photo.data);
    }
    catch {
        return null;
    }
}
/** The saved breakout preview on the face shown, drawn with our own local skin engines: even
 * tone for redness (a* and b* only, lightness never rises), the blemish engine for breakouts,
 * and a light smoothing for texture and pores, each at the strength the saved preview asks for.
 * Softened, not erased. Null when the skin engines refuse the face points. */
export function examplePersonSoftened(image, points, concerns) {
    const strength = (c) => Math.max(0, Math.min(1, concerns.find((x) => x.concern === c)?.strength ?? 0));
    const mesh = points.map(([x, y]) => [x, y, 0]);
    let out = image;
    const red = strength("redness");
    if (red > 0) {
        const r = renderSkinTool("tone", out, mesh, Math.round(red * 100), { redness: 100 });
        if (isRefusal(r))
            return null;
        out = toByte(image, r.image);
    }
    const acne = strength("acne");
    if (acne > 0) {
        const r = healBlemishes(out, mesh, { strength: Math.round(acne * 100), method: "fast-marching" });
        if (r.status === "edited")
            out = toByte(image, r.image.data);
    }
    const tex = Math.max(strength("texture"), strength("pore"));
    if (tex > 0) {
        const skin = softRegion("skin", points, image.width, image.height, 2);
        const data = Uint8ClampedArray.from(out.data);
        const ch = out.channels;
        for (let c = 0; c < 3; c++) {
            const plane = floatImage(out.width, out.height);
            for (let i = 0; i < plane.data.length; i++)
                plane.data[i] = out.data[i * ch + c];
            const smooth = boxMean(plane, 2);
            for (let i = 0; i < plane.data.length; i++)
                data[i * ch + c] = Math.round(plane.data[i] + (smooth.data[i] - plane.data[i]) * skin[i] * tex * 0.6);
        }
        // A blur can brighten a dark pore by a little; keep every pixel's lightness at or under before.
        for (let i = 0; i < image.width * image.height; i++) {
            const o = i * ch;
            const before = out.data[o] * 0.2126 + out.data[o + 1] * 0.7152 + out.data[o + 2] * 0.0722;
            const after = data[o] * 0.2126 + data[o + 1] * 0.7152 + data[o + 2] * 0.0722;
            if (after > before)
                for (let c = 0; c < 3; c++)
                    data[o + c] = out.data[o + c];
        }
        out = toByte(image, data);
    }
    return out;
}
