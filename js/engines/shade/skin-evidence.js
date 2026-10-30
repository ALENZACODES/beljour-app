/** Checked acceptance accounting for W6 skin-reference readings.
 * Mirrors api/plumb_api/engines/shade/skin_evidence.py. A successful reading and a
 * correct reference identity are counted apart; refusals and unlabelled records stay
 * in the denominator. Synthetic records give synthetic evidence only: realFacePass
 * needs every record to be a labelled released-person case with a met target, and
 * product validation is always false. Records hold reference identifiers only.
 * Author: John Khan.
 */
export const KINDS = ["synthetic", "released_person"];
export const MAX_RECORDS = 1_000_000;
const MAX_ID_LENGTH = 64;
function identifier(value, field) {
    if (value === null || value === undefined)
        return null;
    if (typeof value !== "string" || value === "" || value.length > MAX_ID_LENGTH) {
        throw new RangeError(`${field} must be null or a short non-empty string`);
    }
    return value;
}
const round6 = (v) => Math.round(v * 1e6) / 1e6;
/** Count reference identity outcomes; `target` is a share in (0, 1], such as 0.95. */
export function summarizeAccuracy(records, options = {}) {
    const target = options.target ?? null;
    if (target !== null && (typeof target !== "number" || !Number.isFinite(target) || target <= 0 || target > 1)) {
        throw new RangeError("target must be a share in (0, 1]");
    }
    const kinds = { synthetic: 0, released_person: 0 };
    let total = 0, labelled = 0, accepted = 0, exact = 0, wrong = 0, acceptedUnlabelled = 0;
    for (const record of records) {
        if (record === null || typeof record !== "object")
            throw new RangeError("each accuracy record must be an object");
        const kind = record.kind ?? "synthetic";
        if (!KINDS.includes(kind))
            throw new RangeError("record kind must be synthetic or released_person");
        const expected = identifier(record.expected_id, "expected_id");
        const predicted = identifier(record.predicted_id, "predicted_id");
        total++;
        if (total > MAX_RECORDS)
            throw new RangeError("too many accuracy records");
        kinds[kind]++;
        if (expected !== null)
            labelled++;
        if (predicted === null)
            continue;
        accepted++;
        if (expected === null)
            acceptedUnlabelled++;
        else if (predicted === expected)
            exact++;
        else
            wrong++;
    }
    const exactRate = total ? exact / total : 0;
    const meetsTarget = target !== null && total > 0 && labelled === total && exactRate >= target;
    return {
        format: "beljour-skin-accuracy-summary/1", total, labelled, missing_labels: total - labelled, accepted,
        refused: total - accepted, exact, wrong_accepted: wrong, accepted_unlabelled: acceptedUnlabelled,
        exact_rate: round6(exactRate), acceptance_rate: round6(total ? accepted / total : 0), kinds, target,
        meets_target: meetsTarget, evidence: kinds.released_person === 0 ? "synthetic" : "released_person",
        real_face_pass: meetsTarget && kinds.synthetic === 0, product_validation: false,
    };
}
//# sourceMappingURL=skin-evidence.js.map