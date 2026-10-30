/** Photo-free evidence and C18 source binding for the SKN-03 gate.
 * This reports operator-supplied counts; it never certifies the release gate.
 * Author: John Khan.
 */
import { loadC18Shades } from "./c18.js";
function count(value, label) {
    if (!Number.isSafeInteger(value) || value < 0 || value > 100000) {
        throw RangeError(`${label} must be a bounded nonnegative integer`);
    }
    return value;
}
export function summarizeSKN03Transitions(transitions, independentLabels, compatibleBaseline, humanReviewComplete) {
    const still = count(transitions.still_correct, "still_correct");
    const fixed = count(transitions.corrected, "corrected");
    const lost = count(transitions.regressed, "regressed");
    const failed = count(transitions.still_incorrect, "still_incorrect");
    const total = still + fixed + lost + failed;
    if (total < 1 || total > 100000)
        throw RangeError("Invalid frozen denominator");
    const labelled = count(independentLabels, "independentLabels");
    if (labelled > total)
        throw RangeError("Independent label count exceeds denominator");
    if (typeof compatibleBaseline !== "boolean" || typeof humanReviewComplete !== "boolean") {
        throw RangeError("Evidence flags must be booleans");
    }
    const after = still + fixed;
    const minimum = Math.ceil((95 * total) / 100);
    const remaining = Math.max(0, minimum - after);
    const status = remaining > 0 ? "BELOW_TARGET" :
        labelled !== total || !compatibleBaseline || !humanReviewComplete ?
            "EVIDENCE_INCOMPLETE" : "BOX_REVIEW_REQUIRED";
    return Object.freeze({
        total, baseline_correct: still + lost, candidate_correct: after,
        corrected: fixed, regressed: lost, candidate_incorrect: total - after,
        minimum_correct: minimum, additional_required: remaining,
        target: 0.95, status, release_pass: false,
    });
}
export async function loadSKN03C18Binding() {
    const reference = await loadC18Shades("skin");
    if (reference.count !== 96 || reference.shades.length !== 96) {
        throw RangeError("Unexpected C18 reference inventory");
    }
    return Object.freeze({ format: "beljour-skn03-c18-binding/1",
        count: 96, digest: reference.digest, source: reference.source,
        release_pass: false });
}
//# sourceMappingURL=skn03-checkpoint.js.map