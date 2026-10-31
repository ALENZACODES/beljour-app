/** W74 numerical hypothetical scenarios and local diary validation. Author: John Khan. */
import { choice, finish, number, options } from "./contracts.js";
import { evidenceSummary } from "./evidence.js";
import { union } from "./geometry.js";
export const SAFETY_NOTE = "Some prostaglandin analogue products can cause eyelid darkening and iris pigmentation changes. Ask a qualified professional about ingredients and risks.";
export const SAFETY_SOURCE = "https://www.accessdata.fda.gov/drugsatfda_docs/label/2021/022369s014lbl.pdf";
export const SCENARIO_NOTE = "Hypothetical changes chosen by you. There is no product efficacy estimate here; your result may differ. This is not medical advice.";
export function progressSeries(settings) {
    const opts = options(settings, ["amount", "months", "lengthChange", "densityChange", "site", "baselineLength", "baselineDensity"]);
    const months = number(opts.months ?? 6, "months", 0, 12);
    if (!Number.isInteger(months))
        throw new RangeError("months must be an integer");
    const length = number(opts.lengthChange ?? 0, "lengthChange", -20, 30);
    const density = number(opts.densityChange ?? 0, "densityChange", -20, 30);
    const site = choice(opts.site ?? "brows", "site", ["brows", "lashes"]);
    const baselineLength = number(opts.baselineLength ?? 1, "baselineLength", 0.1, 30);
    const baselineDensity = number(opts.baselineDensity ?? 1, "baselineDensity", 0, 1000);
    const rows = [];
    for (let month = 0; month <= months; month++) {
        const t = month / Math.max(1, months), fraction = t * t * (3 - 2 * t);
        const lengthScale = 1 + length / 100 * fraction, densityScale = 1 + density / 100 * fraction;
        rows.push({ month, length_scale: lengthScale, density_scale: densityScale,
            length_from_user_baseline: baselineLength * lengthScale, density_from_user_baseline: baselineDensity * densityScale });
    }
    return { site, assumed: true, empirical: false, rows, endpoint_length_change_pct: length,
        endpoint_density_change_pct: density, baseline_units: "user supplied; unit consistency required",
        note: SCENARIO_NOTE, safety_note: SAFETY_NOTE, safety_source: SAFETY_SOURCE };
}
function dateValue(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
        throw new RangeError("diary date must be YYYY-MM-DD");
    const parsed = new Date(`${value}T00:00:00Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value || value.slice(0, 4) === "0000") {
        throw new RangeError("diary date must be YYYY-MM-DD");
    }
    return value;
}
export function validateDiary(entries) {
    if (!Array.isArray(entries) || entries.length > 120)
        throw new RangeError("diary must contain at most 120 observations");
    const result = [], dates = new Set();
    for (const entry of entries) {
        const opts = options(entry, ["date", "site", "length", "density", "confidence"]);
        const date = dateValue(opts.date), site = choice(opts.site, "site", ["brows", "lashes"]);
        const key = `${date}:${site}`;
        if (dates.has(key))
            throw new RangeError("duplicate diary date and site");
        dates.add(key);
        result.push({ date, site, length: number(opts.length, "length", 0, 30),
            density: number(opts.density, "density", 0, 1000), confidence: number(opts.confidence ?? 1, "confidence", 0, 1) });
    }
    return result.sort((a, b) => a.date.localeCompare(b.date) || a.site.localeCompare(b.site));
}
export function diaryTrend(entries, site = "brows") {
    choice(site, "site", ["brows", "lashes"]);
    const selected = validateDiary(entries).filter(entry => entry.site === site);
    if (selected.length < 2)
        return { status: "insufficient", observations: selected.length, attribution: false };
    const first = selected[0], last = selected[selected.length - 1];
    const days = (new Date(last.date).getTime() - new Date(first.date).getTime()) / 86400000;
    return { status: "observed", observations: selected.length, days, length_change: last.length - first.length,
        density_change: last.density - first.density, minimum_confidence: Math.min(...selected.map(entry => entry.confidence)),
        attribution: false, note: "Measurement changes can reflect angle, lighting or technique. They do not establish a product effect." };
}
export function renderProgress(image, evidence, frames, settings) {
    const series = progressSeries(settings);
    number(settings?.amount ?? 0.5, "amount", 0, 1);
    const final = series.rows[series.rows.length - 1];
    const metrics = { ...evidenceSummary(evidence, union(frames)), feature: "W74", efficacy_claim: false,
        hypothetical: true, length_scale: final.length_scale, density_scale: final.density_scale,
        photo_prediction: false, diary_local_only: true };
    return finish(image, Uint8ClampedArray.from(image.data), new Float64Array(image.width * image.height), metrics, [SCENARIO_NOTE, SAFETY_NOTE, "The photo stays unchanged. The trajectory is a numerical scenario, not a simulated treatment outcome."], "simulation", series);
}
export function compareMeasurement(a, b, relativeTolerance = 0.05) {
    const first = number(a, "first measurement", 0, 1000), second = number(b, "second measurement", 0, 1000);
    const tolerance = number(relativeTolerance, "relativeTolerance", 0, 1);
    return Math.abs(first - second) <= Math.max(tolerance * Math.max(first, second), 1e-12);
}
