import { publicSensitivity } from "./illumination-sensitivity.js";
import { publicAmbiguity } from "./reference-ambiguity.js";
export const LABEL = "BELJOUR shade check. A digital estimate from your photo, not tested against real products.";
/** One receipt for one W6 reading; refusals are kept, never smoothed over. */
export function assessShadeSafety(result, sensitivity, ambiguity) {
    const selected = !result.refused && result.best !== null ? result.best.id : null;
    for (const review of [sensitivity, ambiguity]) {
        if (review.status !== "refused" && review.selected_id !== selected) {
            throw new RangeError("The reviews describe a different shade selection");
        }
    }
    const reasons = [];
    if (selected === null)
        reasons.push("reading_refused");
    if (sensitivity.status === "refused")
        reasons.push(`lighting:${sensitivity.code}`);
    if (ambiguity.status === "refused")
        reasons.push(`references:${ambiguity.code}`);
    if (reasons.length) {
        return Object.freeze({ status: "refused", selected_id: null, reasons: Object.freeze(reasons), sensitivity, ambiguity });
    }
    if (sensitivity.status === "sensitive")
        reasons.push("lighting_sensitive");
    if (ambiguity.status === "ambiguous")
        reasons.push("nearby_references");
    return Object.freeze({ status: reasons.length ? "review" : "consistent", selected_id: selected,
        reasons: Object.freeze(reasons), sensitivity, ambiguity });
}
/** The same JSON as ShadeSafetyReport.public() in Python. */
export function publicShadeSafety(report) {
    return {
        format: "beljour-shade-safety/1", label: LABEL, status: report.status, selected: report.selected_id,
        reasons: [...report.reasons], sensitivity: publicSensitivity(report.sensitivity),
        ambiguity: publicAmbiguity(report.ambiguity), intent: "manual_only", provider_calls: 0,
        real_product_match: false, real_face_gate: "UNPROVEN", release_pass: false,
    };
}
