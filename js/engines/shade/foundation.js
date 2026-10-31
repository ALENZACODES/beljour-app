/** Local Foundation step: her matched shade (feature #101, finder.ts) on her own skin, never
 * lighter. Mirrors api/plumb_api/engines/shade/foundation.py with the same operation order:
 * skin-only low-pass planes, target = her base + (shade - reading), L* moves only down, a*
 * and b* toward the shade (capped), the shared byte guard so no pixel's L* rises, and coded
 * refusals (mesh, no skin, shade lighter than her reading, shade too far, no match, guard).
 * Coverage, radius and caps are ASSUMED. Our own reference shades, not tested against real
 * products. Local simulation only. Author: John Khan.
 */
import { ciede2000 } from "../core/colour.js";
import { checkPhoto, checkStrength, encode, frame, labPlanes, maskedLowpass, median, MIN_SKIN_PIXELS, noLighten, radius, skinMask, xy } from "../skin/common.js";
import { meshProblems, REASONS } from "../skin/studio.js";
import { srgbToLab } from "./colourspace.js";
import { SHADE_DATA } from "./generated/data.js";
export const MODULE = "shade.foundation";
export const LABEL = "Foundation simulation in your matched shade, never lighter than your skin. Not tested against real products.";
export const COVERAGE_MAX = 0.75, SMOOTH_SHARE = 0.25, MAX_DARKEN = 12.0, MAX_SHIFT = 10.0, GUARD_MEAN_DELTA_E = 8.0;
export const MESSAGES = Object.freeze({
    no_visible_skin: "Too little skin is visible in this photo for a foundation preview; try a closer photo.",
    no_shade_match: "There is no matched shade to apply. Find your shade first.",
    shade_lighter_than_skin: "This shade is lighter than your skin reading, so it is not applied. We never lighten skin.",
    shade_too_far: "This shade is too far from your skin reading to be your match, so it is not applied.",
    identity_guard: "This change would alter the skin too much, so it was not applied.",
});
export function isFoundationRefusal(value) {
    return value.refused === true;
}
function lab(value, name) {
    if (!Array.isArray(value) || value.length !== 3 || !value.every(v => typeof v === "number" && Number.isFinite(v))) {
        throw new RangeError(`${name} must be three finite CIELAB numbers`);
    }
    if (value[0] < 0 || value[0] > 100)
        throw new RangeError(`${name} L* must be in 0..100`);
    return [value[0], value[1], value[2]];
}
const refuse = (code, message = MESSAGES[code] ?? REASONS[code]) => ({ refused: true, module: MODULE, code, message });
export function applyFoundation(image, points, shadeLab, measuredLab, strength = 60) {
    checkPhoto(image);
    const amount = checkStrength(strength);
    const shade = lab(shadeLab, "shade_lab"), measured = lab(measuredLab, "measured_lab");
    const { width: w, height: h } = image;
    const problems = meshProblems(points, w, h);
    if (problems.length)
        return refuse(problems[0]);
    const lighterBy = shade[0] - measured[0];
    if (lighterBy > SHADE_DATA.thresholds.never_lighter_allowance)
        return refuse("shade_lighter_than_skin");
    const distance = ciede2000(measured, shade);
    if (distance > SHADE_DATA.thresholds.confidence.refuse_delta_e_above)
        return refuse("shade_too_far");
    const pts = points.map(xy);
    const skin = skinMask(pts, w, h), n = w * h;
    let visible = 0;
    for (const v of skin)
        if (v >= 0.5)
            visible++;
    if (visible < MIN_SKIN_PIXELS)
        return refuse("no_visible_skin");
    const metrics = { shade_delta_e: Math.round(distance * 1e3) / 1e3,
        shade_lighter_by: Math.round(lighterBy * 1e3) / 1e3, strength };
    if (amount === 0)
        return { image: Uint8Array.from(image.data), weight: new Float64Array(n), label: LABEL, metrics: { ...metrics, unchanged: true } };
    const planes = labPlanes(image), before = labPlanes(image);
    const r = radius(frame(pts).iod, SMOOTH_SHARE, 2);
    const weight = new Float64Array(n);
    for (let i = 0; i < n; i++)
        weight[i] = skin[i] > 0 ? skin[i] : 0;
    const pull = amount * COVERAGE_MAX;
    const names = ["base_l", "base_a", "base_b"];
    for (const [c, plane] of [planes.L, planes.a, planes.b].entries()) {
        const smooth = maskedLowpass(plane, skin, w, h, r);
        const inside = [];
        for (let i = 0; i < n; i++)
            if (skin[i] >= 0.5)
                inside.push(smooth[i]);
        const base = median(inside), target = base + (shade[c] - measured[c]);
        for (let i = 0; i < n; i++) {
            const move = pull * (target - smooth[i]);
            const capped = c === 0 ? Math.min(Math.max(move, -MAX_DARKEN), 0) : Math.min(Math.max(move, -MAX_SHIFT), MAX_SHIFT);
            plane[i] += capped * weight[i];
        }
        metrics[names[c]] = Math.round(base * 1e3) / 1e3;
    }
    const out = encode(image, planes, weight);
    const guarded = noLighten(image, out, weight);
    let total = 0;
    const ch = image.channels;
    for (let i = 0; i < n; i++) {
        if (!(skin[i] >= 0.5))
            continue;
        const after = srgbToLab([out[i * ch], out[i * ch + 1], out[i * ch + 2]]);
        total += Math.sqrt((after[0] - before.L[i]) ** 2 + (after[1] - before.a[i]) ** 2 + (after[2] - before.b[i]) ** 2);
    }
    const change = total / visible;
    Object.assign(metrics, { guarded_pixels: guarded, mean_delta_e: Math.round(change * 1e3) / 1e3, never_lighter: true });
    if (change > GUARD_MEAN_DELTA_E)
        return refuse("identity_guard");
    return { image: out, weight, label: LABEL, metrics };
}
/** Apply the finder's best shade (or its alternative); a refused or empty result is refused. */
export function foundationFromMatch(image, points, match, strength = 60, choice = "best") {
    if (choice !== "best" && choice !== "alternative")
        throw new RangeError("choice must be best or alternative");
    const picked = match?.[choice];
    if (!match || match.refused || !picked || !match.measured_lab) {
        checkPhoto(image);
        checkStrength(strength);
        return refuse("no_shade_match");
    }
    return applyFoundation(image, points, picked.lab, match.measured_lab, strength);
}
