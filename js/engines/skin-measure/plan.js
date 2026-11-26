/** Skin Moment's plan, built on the device from the on-device reading (index.ts): the morning and
 * evening routine, what to do this week, what to stop, when to see a dermatologist, and, before
 * buying, the product types ranked by her lowest scores. The rules are the skin guide's
 * (api/plumb_api/data/skin_guide.json, embedded by scripts/build-skin-data.mjs): up to three focus
 * concerns (lowest scores under 80), the first listed ingredient for each, at most one retinoid,
 * exfoliants on other nights than a retinoid, sunscreen every morning. Product types come from our
 * own catalogue (skin_match_catalogue.json): generic types, no brands, never tested against real
 * products. Cosmetic information, not medical advice. Author: John Khan.
 */
import { CATALOGUE, GUIDE } from "./generated/guide.js";
export const PLAN_LABEL = "General cosmetic information, not medical advice.";
export const NOT_TESTED = "not tested against real products";
export const BREAKOUT_CONCERNS = ["acne", "redness"];
const STOP_WORDS = ["Avoid", "Don't", "Do not", "Stop", "Skip"];
const G = GUIDE;
const C = CATALOGUE;
/** 80 and over looks good, 60 to 79 has room to improve, under 60 is worth focusing on. */
export function band(raw) {
    return raw >= 80 ? "looking good" : raw >= 60 ? "some room to improve" : "worth focusing on";
}
/** Hue-angle cut points of the shade engine; olive per the catalogue's rule. */
export function undertoneOf(a, b) {
    const angle = Math.atan2(b, a) * 180 / Math.PI;
    if (angle >= 62)
        return a < 9 && b > 13 ? "olive" : "warm";
    return angle <= 48 ? "cool" : "neutral";
}
export function profileOf(lab, pixels, source) {
    const [lightness, a, b] = lab;
    const depth = C.depth_bands.find((d) => lightness >= d.min_lightness) ?? C.depth_bands[C.depth_bands.length - 1];
    const tone = undertoneOf(a, b);
    return { lightness, a, b, hue_angle: Math.atan2(b, a) * 180 / Math.PI, chroma: Math.hypot(a, b), depth: depth.id,
        depth_label: depth.label, undertone: tone, undertone_label: C.undertones[tone].label, pixels, source,
        note: "Measured on this device from your photo. Lighting and camera white balance move it." };
}
/** The routine for her scores (services/skin.py routine()). */
export function routine(scores, maxFocus = 3) {
    const focus = scores.filter((s) => s.raw_score < 80 && G.concerns[s.concern]).slice(0, maxFocus);
    const chosen = new Map();
    for (const s of focus) {
        for (const id of G.concerns[s.concern].ingredients) {
            const ing = G.ingredients[id];
            if (ing.group === "retinoid" && [...chosen.keys()].some((c) => c !== id && G.ingredients[c].group === "retinoid"))
                continue;
            if (!chosen.has(id))
                chosen.set(id, ing);
            break; // the first listed ingredient is the best first step
        }
    }
    const step = (id) => ({ id, name: G.ingredients[id].name, why: G.ingredients[id].why, caution: G.ingredients[id].caution });
    const morning = [{ id: "cleanser", name: "Gentle cleanser", why: "a clean, calm base", caution: "" }];
    const evening = [{ id: "cleanser", name: "Gentle cleanser", why: "removes sunscreen and the day", caution: "" }];
    const alternate = [];
    const hasRetinoid = [...chosen.values()].some((i) => i.group === "retinoid");
    for (const [id, ing] of chosen) {
        if ((ing.slot === "am" || ing.slot === "both") && id !== "sunscreen")
            morning.push(step(id));
        if (ing.slot === "pm" || ing.slot === "both")
            (ing.group === "exfoliant" && hasRetinoid ? alternate : evening).push(step(id));
    }
    morning.push({ id: "moisturiser", name: "Moisturiser", why: "keeps water in", caution: "" });
    evening.push({ id: "moisturiser", name: "Moisturiser", why: "supports overnight repair", caution: "" });
    morning.push(step("sunscreen"));
    return { morning, evening, alternate,
        note: "Add one new product at a time, two weeks apart, so you can tell what helps. General information, not medical advice." };
}
/** Catalogue product types for her depth, undertone and lowest scores (skin_match.map_products). */
export function products(profile, scores, shadeName = null) {
    const shade = `${profile.depth_label}, ${C.undertones[profile.undertone].base_word}`;
    const out = C.base_products.map((base) => ({
        id: `${base.id}:${profile.depth}:${profile.undertone}`, type: base.type, name: `${base.type}, ${shade}`,
        shade: base.type === "Liquid foundation" && shadeName ? `${shadeName} (${shade})` : shade, coverage: base.coverage,
        why: base.type === "Liquid foundation" && shadeName ? `${base.why} Nearest of our reference shades, never lighter than measured.` : base.why,
        for: "your measured depth and undertone", label: NOT_TESTED
    }));
    const focus = [...scores].filter((s) => C.concerns[s.concern] && s.raw_score < 80)
        .sort((a, b) => a.raw_score - b.raw_score || (a.concern < b.concern ? -1 : 1)).slice(0, 3);
    for (const s of focus) {
        const entry = C.concerns[s.concern];
        for (const p of entry.products) {
            const name = p.uses === "corrector" ? `${p.type}, ${C.corrector_by_depth[profile.depth]}`
                : p.uses === "highlighter" ? `${p.type}, ${C.highlighter_by_depth[profile.depth]}` : p.type;
            out.push({ id: p.id, type: p.type, name, shade: null, coverage: null, why: p.why, for: entry.label, label: NOT_TESTED });
        }
    }
    return out;
}
const line = (text, because = null) => ({ text, because });
/** today / this week / stop / see-a-dermatologist-if (services/skin_moment.build_plan). `scores`
 * are sorted lowest first. */
export function buildPlan(moment, scores, profile, checkin, firstCheckin, shadeName = null) {
    const r = routine(scores);
    let focus = scores.filter((s) => s.raw_score < 80 && G.concerns[s.concern]).slice(0, 3).map((s) => [s.concern, s.label]);
    if (moment === "breakout" && !focus.length)
        focus = BREAKOUT_CONCERNS.map((c) => [c, "Common after a breakout (not seen strongly in this photo)"]);
    const today = [...r.morning.map((s) => line(`Morning: ${s.name}`, s.why)), ...r.evening.map((s) => line(`Evening: ${s.name}`, s.why))];
    const week = r.alternate.map((s) => line(`Two or three nights this week: ${s.name}`, s.caution));
    const stop = [];
    const retinoid = r.evening.find((s) => G.ingredients[s.id]?.group === "retinoid")?.name ?? "a retinoid";
    for (const s of r.alternate)
        stop.push(line(`${s.name} on the same night as ${retinoid}`, s.caution));
    for (const [concern, because] of focus) {
        for (const habit of G.concerns[concern].habits)
            (STOP_WORDS.some((w) => habit.startsWith(w)) ? stop : week).push(line(habit, because));
    }
    week.push(line(r.note));
    if (checkin) {
        for (const c of checkin.changes) {
            if (c.verdict === "better")
                week.push(line(`Keep going with what you use for ${c.label.toLowerCase()}.`, `Looks better by more than normal photo-to-photo variation over ${checkin.days_between} days.`));
            else if (c.verdict === "worse")
                stop.push(line(`The newest product you added for ${c.label.toLowerCase()}, until you can tell what changed.`, `Looks worse by more than normal photo-to-photo variation over ${checkin.days_between} days.`));
        }
        if (checkin.changes.length && checkin.changes.every((c) => c.verdict === "no_real_change"))
            week.push(line("Give it more time before judging it.", "Nothing moved beyond normal photo-to-photo variation yet."));
    }
    else if (moment === "checkin" && firstCheckin) {
        week.push(line("Check in again in two to four weeks, in the same light and at the same angle.", "This is the first check-in kept on this device, so there is nothing to compare yet."));
    }
    const pro = [...focus.map(([c]) => c), ...(moment === "breakout" ? BREAKOUT_CONCERNS : [])];
    const derm = [...new Set(pro.map((c) => G.concerns[c]?.see_pro).filter((x) => !!x))];
    const plan = { today, this_week: week, stop, see_dermatologist_if: derm, label: PLAN_LABEL };
    if (moment === "buy")
        plan.products = products(profile, scores, shadeName);
    return plan;
}
//# sourceMappingURL=plan.js.map