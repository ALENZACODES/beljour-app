/** Nearby in-house references for a W6 reading, for a manual side-by-side comparison.
 * Mirrors api/plumb_api/engines/shade/reference_ambiguity.py: alternatives pass the 1.0 L*
 * no-lightening allowance and lie within match_delta_e_ok (2.5 CIEDE2000) of the reading;
 * a refused reading stays refused; the W6 selection must be the nearest allowed reference
 * (else incompatible_baseline); confidence is carried unchanged, never raised.
 * Digital comparisons, not product recommendations. Author: John Khan.
 */
import { rankShades } from "./distance.js";
import { SHADE_DATA } from "./generated/data.js";
const round = (v, d) => { const s = 10 ** d; return Math.round(v * s) / s; };
export function nearbyLimit() { return SHADE_DATA.thresholds.confidence.match_delta_e_ok; }
/** Alternatives within the existing match tolerance, or a refusal; never a new winner. */
export function inspectReferenceAmbiguity(result, kind = "reference") {
    const confidence = result.confidence.overall ?? 0;
    const refuse = (code, selected) => Object.freeze({
        status: "refused", code, selected_id: selected, selected_delta_e: null, alternatives: Object.freeze([]), confidence
    });
    if (result.refused || result.measured_lab === null || result.best === null)
        return refuse("reading_refused", null);
    const ranked = rankShades(result.measured_lab, kind);
    if (ranked.length === 0 || ranked[0].record.id !== result.best.id)
        return refuse("incompatible_baseline", result.best.id);
    const limit = nearbyLimit();
    const alternatives = Object.freeze(ranked.slice(1).filter((m) => m.delta_e <= limit));
    return Object.freeze({ status: alternatives.length ? "ambiguous" : "clear", code: null, selected_id: ranked[0].record.id,
        selected_delta_e: ranked[0].delta_e, alternatives, confidence });
}
/** The same JSON as AmbiguityDecision.public() in Python. */
export function publicAmbiguity(found) {
    return {
        format: "beljour-reference-ambiguity/1", status: found.status, code: found.code, selected: found.selected_id,
        selected_delta_e: found.selected_delta_e === null ? null : round(found.selected_delta_e, 4),
        alternatives: found.alternatives.map((m) => ({ id: m.record.id, name: m.record.name, delta_e: round(m.delta_e, 4),
            lighter_by: round(m.lighter_by, 4) })),
        limit_delta_e: nearbyLimit(), confidence: round(found.confidence, 4),
        note: "Compare these in-house swatches by hand; not product recommendations.",
    };
}
//# sourceMappingURL=reference-ambiguity.js.map