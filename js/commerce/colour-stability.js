/** Fibre colour from two to six corrected readings of the same hair (several lights or captures).
 * Mirrors api/plumb_api/engines/concealer/colour_stability.py: any uncorrected reading
 * refuses (uncorrected_lighting); a pairwise CIEDE2000 spread above the committed W6
 * zone-consistency bound refuses (mixed_lighting); the per-channel median is planned with
 * planFibreColour; every reading on its own must pick the consensus's best swatch, or the
 * result refuses (unstable_swatch). Only Lab values and counts are kept. Author: John Khan.
 */
import { quantile } from "../engines/core/filters.js";
import { delta_e, rankShades } from "../engines/shade/distance.js";
import { SHADE_DATA } from "../engines/shade/generated/data.js";
import { fibreReading, planFibreColour } from "./shade-support.js";
export const MIN_READINGS = 2;
export const MAX_READINGS = 6;
export function mixedLightLimit() {
    const conf = SHADE_DATA.thresholds.confidence;
    return conf.zone_delta_e_ok + conf.zone_delta_e_span;
}
function result(count, spread, code, picks, plan) {
    return Object.freeze({ readings: count, spread_delta_e: spread, limit_delta_e: mixedLightLimit(), code,
        refused: code !== null, stable: code === null, picks: Object.freeze([...picks]), plan });
}
/** Plan one fibre colour from 2..6 readings, or refuse with a code. */
export function assessColourStability(readings, options = {}) {
    if (!Array.isArray(readings) || readings.length < MIN_READINGS || readings.length > MAX_READINGS) {
        throw new RangeError(`Colour stability needs ${MIN_READINGS}..${MAX_READINGS} fibre colour readings`);
    }
    const rows = readings.map((r) => fibreReading(r.lab, r.white_mode, r.clamped, r.pixels));
    let spread = 0;
    rows.forEach((a, i) => rows.slice(i + 1).forEach((b) => { spread = Math.max(spread, delta_e(a.lab, b.lab)); }));
    if (rows.some((r) => r.white_mode === "none"))
        return result(rows.length, spread, "uncorrected_lighting", [], null);
    if (spread > mixedLightLimit())
        return result(rows.length, spread, "mixed_lighting", [], null);
    const consensus = fibreReading([0, 1, 2].map((c) => quantile(rows.map((r) => r.lab[c]), 0.5)), rows.every((r) => r.white_mode === "neutral") ? "neutral" : "grey_world", rows.some((r) => r.clamped), rows.reduce((sum, r) => sum + r.pixels, 0));
    const plan = planFibreColour(consensus, options);
    const best = plan.matches[0];
    if (best === undefined)
        return result(rows.length, spread, plan.code, [], plan);
    const picks = rows.map((r) => rankShades(r.lab, "hair", { allowLighter: options.approveLighter ?? false, limit: 1 })[0]?.record.id ?? null);
    const code = picks.every((p) => p === best.record.id) ? null : "unstable_swatch";
    return result(rows.length, spread, code, picks, code === null ? plan : null);
}
