export const FACES_DIR = "assets/skin-moment/faces/";
export const FACE_LABEL = "AI-generated example person";
export const SCORE_LABEL = "Saved example";
export const SCORE_NOTE = "Saved example: made-up scores for an AI-generated example person, not a measurement.";
export const REFERENCE_LABEL = "AI-generated picture of this example person in a matched foundation, not a try-on result.";
export const FACE_COUNT = 60;
export const DAY42_COUNT = 60;
export const FOUNDATION_COUNT = 60;
export const DAYS_BETWEEN = 42;
/** The person each moment's saved example shows (the day-42 picture for a check-in). The saved
 * skin tone reading and full look were measured on person `buy`'s picture, and the saved replies'
 * depth and undertone on each moment's person (api/plumb_api/services/skin_example_faces.py
 * MOMENT_FACE, kept equal by api/tests/test_skin_example_faces.py). */
export const MOMENT_FACE = { buy: "01", breakout: "02", checkin: "03" };
/** Concern ids and their words, as in api/plumb_api/data/skin_guide.json. */
const LABELS = {
    acne: "Breakouts", moisture: "Hydration", oiliness: "Oil", pore: "Pores",
    redness: "Redness", texture: "Texture", wrinkle: "Lines", age_spot: "Spots",
};
/** The concerns each moment shows: buy and breakout as the planner asks for them
 * (services/skin_planner.py); a check-in shows all eight so every six-week change is visible. */
export const MOMENT_CONCERNS = {
    buy: ["moisture", "oiliness", "redness", "texture"],
    breakout: ["acne", "redness", "texture", "pore"],
    checkin: ["acne", "moisture", "oiliness", "pore", "redness", "texture", "wrinkle", "age_spot"],
};
// The picture prompts repeat a 7-person cycle and an 8-skin cycle (beljour image prompts, Part 2 A).
const PEOPLE = ["24-year-old woman", "38-year-old woman", "31-year-old man", "55-year-old woman",
    "47-year-old man", "63-year-old woman", "29-year-old non-binary person"];
const SKINS = [
    ["very fair skin with cool undertone", "redness", "mild redness across the cheeks"],
    ["fair skin with warm undertone", "acne", "a few small breakout spots on the chin"],
    ["light olive skin", "moisture", "dry flaky patches near the nose"],
    ["medium skin with golden undertone", "oiliness", "an oily T-zone with visible shine"],
    ["medium-tan skin with neutral undertone", "pore", "enlarged pores on the nose and cheeks"],
    ["brown skin with warm undertone", "wrinkle", "fine lines around the eyes"],
    ["deep brown skin with red undertone", "age_spot", "uneven dark spots on the cheeks"],
    ["very deep skin with neutral undertone", null, "clear calm skin as a baseline"],
];
// Six-week changes for every person, in order, repeating (Part 2 B for faces 01..24, Part 5
// section 2 for 25..60). [concern, raw points]
const CHANGES = [
    ["redness noticeably calmer", "redness", 12],
    ["breakout spots mostly healed, faint marks left", "acne", 14],
    ["dry patches gone, skin looks hydrated", "moisture", 15],
    ["shine reduced on the T-zone", "oiliness", 10],
    ["no visible change at all", null, 0],
    ["slightly more redness than before", "redness", -9],
];
// Made-up resting scores; the person's own concern sits in the low 50s. ASSUMED values.
const BASE = {
    acne: 82, moisture: 74, oiliness: 72, pore: 70, redness: 76, texture: 78, wrinkle: 80, age_spot: 81,
};
const pad = (n) => String(n).padStart(2, "0");
function faceNumber(id) {
    const n = /^\d{2}$/.test(id) ? Number(id) : NaN;
    if (!(n >= 1 && n <= FACE_COUNT))
        throw new RangeError(`no example person ${id}`);
    return n;
}
/** All 60 people as the prompts describe them, with every picture URL filled in. */
export function faceCatalogue(dir = FACES_DIR) {
    const out = [];
    for (let n = 1; n <= FACE_COUNT; n++) {
        const [skin, focus, shows] = SKINS[(n - 1) % SKINS.length];
        const id = pad(n);
        out.push({
            id, label: FACE_LABEL, description: `${PEOPLE[(n - 1) % PEOPLE.length]}, ${skin}`, shows, focus,
            day0: `${dir}face-${id}-day0.png`,
            day42: n <= DAY42_COUNT ? `${dir}face-${id}-day42.png` : null,
            foundation: n <= FOUNDATION_COUNT ? `${dir}face-${id}-foundation.png` : null,
            change: n <= DAY42_COUNT ? CHANGES[(n - 1) % CHANGES.length][0] : null,
        });
    }
    return out;
}
/** True when the URL answers with an image. A static host that answers every unknown path
 * with the app page (status 200, text/html) counts as missing. */
export const headProbe = async (url) => {
    try {
        const res = await fetch(url, { method: "HEAD", cache: "no-store" });
        return res.ok && (res.headers.get("content-type") ?? "").startsWith("image/");
    }
    catch {
        return false;
    }
};
/** The people whose day-0 picture is present, with missing later pictures set to null. */
export async function loadFaces(probe = headProbe, dir = FACES_DIR) {
    const all = faceCatalogue(dir);
    const present = await Promise.all(all.map((f) => probe(f.day0)));
    const kept = all.filter((_, i) => present[i]);
    return Promise.all(kept.map(async (f) => {
        const [later, found] = await Promise.all([f.day42 ? probe(f.day42) : false, f.foundation ? probe(f.foundation) : false]);
        return { ...f, day42: later ? f.day42 : null, foundation: found ? f.foundation : null };
    }));
}
function band(raw) {
    // services/skin.py band(): higher scores look healthier
    return raw >= 80 ? "looking good" : raw >= 60 ? "some room to improve" : "worth focusing on";
}
const clamp = (v) => Math.round(Math.min(100, Math.max(1, v)) * 10) / 10;
/** Made-up day-0 raw scores for one person: fixed, so the same person always shows the same. */
export function dayZeroScores(id) {
    const n = faceNumber(id);
    const focus = SKINS[(n - 1) % SKINS.length][1];
    const out = {};
    MOMENT_CONCERNS.checkin.forEach((c, i) => {
        const wobble = ((n * 37 + i * 11) % 9) - 4 + ((n * 3 + i) % 10) / 10;
        out[c] = clamp(c === focus ? 52 + (n % 5) + ((n + i) % 10) / 10 : BASE[c] + wobble + (focus === null ? 4 : 0));
    });
    return out;
}
/** Made-up raw scores six weeks later (faces 01..60): the picture's change, plus at most one
 * raw point of drift elsewhere, which every check-in noise band treats as no real change. */
export function dayFortyTwoScores(id) {
    const n = faceNumber(id);
    if (n > DAY42_COUNT)
        throw new RangeError(`example person ${id} has no six-week picture`);
    const [, changed, points] = CHANGES[(n - 1) % CHANGES.length];
    const before = dayZeroScores(id);
    const out = {};
    MOMENT_CONCERNS.checkin.forEach((c, i) => {
        out[c] = clamp(before[c] + (c === changed ? points : ((n * 7 + i * 3) % 3) - 1));
    });
    return out;
}
function rows(scores, concerns) {
    return concerns.map((c) => ({ concern: c, label: LABELS[c], raw_score: scores[c], band: band(scores[c]), ui_score: null }))
        .sort((a, b) => a.raw_score - b.raw_score || a.concern.localeCompare(b.concern));
}
/** What the demo shows for one person and one moment. A check-in uses the day-42 picture as
 * "today" and day 0 as the earlier check-in; without a day-42 picture `previous` is null and
 * the page should offer another person. */
export function savedResult(face, moment, now = new Date()) {
    if (!(moment in MOMENT_CONCERNS))
        throw new RangeError(`unknown moment ${String(moment)}`);
    const first = dayZeroScores(face.id);
    const concerns = MOMENT_CONCERNS[moment];
    const base = { face, moment, label: SCORE_LABEL, note: SCORE_NOTE, previous: null, reference: null };
    if (moment === "checkin" && face.day42) {
        const takenAt = new Date(now.getTime() - DAYS_BETWEEN * 86_400_000).toISOString();
        return { ...base, photo: face.day42, concerns: rows(dayFortyTwoScores(face.id), concerns),
            previous: { taken_at: takenAt, photo: face.day0, concerns: concerns.map((c) => ({ concern: c, raw_score: first[c] })) } };
    }
    return { ...base, photo: face.day0, concerns: rows(first, concerns),
        reference: moment === "buy" && face.foundation ? { url: face.foundation, label: REFERENCE_LABEL } : null };
}
