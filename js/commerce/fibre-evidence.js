import { pixelLab } from "../engines/core/colour.js";
import { validateAnchors } from "../engines/menshair/render.js";
export const MIN_HAIR_PIXELS = 64;
export const DARK_LIGHTNESS = 8;
export const MIN_DETAIL = 0.25;
export const STATUSES = ["not_applicable", "rendered", "unchanged", "refused"];
/** Plain guidance shown for each coded outcome. */
export const COPY = Object.freeze({
    no_mesh: "We could not find the head outline in this photo, so no preview was made.",
    insufficient_hair: "Mark more of your existing hair so the fibre colour can be read.",
    too_dark: "This photo is too dark to tell hair from scalp. Try brighter, even light.",
    low_detail: "The marked hair shows no strand detail. Try a sharper photo.",
});
const outcome = (status, code, hair, result = null) => Object.freeze({ status, code, hair_pixels: hair, result });
function median(values) {
    const s = [...values].sort((a, b) => a - b), n = s.length, mid = n >> 1;
    return n % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
/** "eligible" or a coded "not_applicable"; never renders. */
export function triageCover(img, region, scalp, landmarks) {
    if (!landmarks)
        return outcome("not_applicable", "no_mesh", 0);
    try {
        validateAnchors(landmarks);
    }
    catch {
        return outcome("not_applicable", "no_mesh", 0);
    }
    const n = img.width * img.height;
    if ((img.channels !== 3 && img.channels !== 4) || img.data.length !== n * img.channels ||
        region.data.length !== n || scalp.data.length !== n) {
        throw new RangeError("Photo and masks must match");
    }
    const regionL = [], hairL = [];
    const lab = [0, 0, 0];
    for (let i = 0; i < n; i++) {
        if (!(region.data[i] >= 0.5))
            continue;
        const k = i * img.channels;
        pixelLab(img.data[k], img.data[k + 1], img.data[k + 2], lab);
        regionL.push(lab[0]);
        if (!(scalp.data[i] >= 0.5))
            hairL.push(lab[0]);
    }
    if (hairL.length < MIN_HAIR_PIXELS)
        return outcome("not_applicable", "insufficient_hair", hairL.length);
    if (median(regionL) < DARK_LIGHTNESS)
        return outcome("not_applicable", "too_dark", hairL.length);
    const mean = hairL.reduce((s, v) => s + v, 0) / hairL.length;
    const spread = Math.sqrt(hairL.reduce((s, v) => s + (v - mean) ** 2, 0) / hairL.length);
    if (spread < MIN_DETAIL)
        return outcome("not_applicable", "low_detail", hairL.length);
    return outcome("eligible", null, hairL.length);
}
/** Triage, then the existing guarded renderer for eligible inputs only. */
export function coverWithTriage(session, img, region, scalp, options) {
    const found = triageCover(img, region, scalp, options.landmarks);
    if (found.status !== "eligible")
        return found;
    const result = session.render(img, region, scalp, options);
    if (!result.rendered)
        return outcome("refused", result.code, found.hair_pixels);
    return outcome(result.changedPixels ? "rendered" : "unchanged", null, found.hair_pixels, result);
}
/** Counts by status and code; not_applicable and refused cases stay in the total. */
export function summarizeTriage(outcomes) {
    if (outcomes.some((o) => o.status === "eligible"))
        throw new RangeError("Summaries take finished triage outcomes");
    const statuses = {}, codes = {};
    for (const s of STATUSES)
        statuses[s] = outcomes.filter((o) => o.status === s).length;
    for (const o of outcomes)
        if (o.code !== null)
            codes[o.code] = (codes[o.code] ?? 0) + 1;
    const sorted = {};
    for (const key of Object.keys(codes).sort())
        sorted[key] = codes[key];
    return { format: "beljour-fibre-triage/1", total: outcomes.length, statuses, codes: sorted,
        kind: "synthetic_or_user_inputs", provider_calls: 0 };
}
//# sourceMappingURL=fibre-evidence.js.map