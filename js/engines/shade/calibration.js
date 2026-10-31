/** SKN-03 source calibration: reference probes, synthetic boundary vectors and the open gap.
 * Mirrors api/plumb_api/engines/shade/calibration.py over the same 96 skin references
 * (the C18 "skin" snapshot is that catalogue; it is read here synchronously through the
 * loaders). Probes use the unchanged W6 rules (1.0 L* no-lightening, refuse beyond the
 * committed 6.0 CIEDE2000); an exact tie names no shade. 288 boundary vectors move each
 * reference 10/25/40% toward its nearest different-undertone neighbour (at most 0.8 L*
 * darker, inside the 1.0 allowance); negative
 * controls check no-lightening (1.5 L* darker) and ties (a duplicate under a second id).
 * Synthetic vectors never close the released-person gap (93.9% against 95%).
 * Author: John Khan.
 */
import { delta_e, rankShades } from "./distance.js";
import { SHADE_DATA } from "./generated/data.js";
import { checkedLab, loadReferenceShades } from "./loaders.js";
export const BOUNDARY_FRACTIONS = [0.1, 0.25, 0.4];
export const LIGHTENING_STEP = 1.5;
export const TIE_EPSILON = 1e-9;
export const REPORTED_PERCENT = 93.9;
const TARGET_NUMERATOR = 95, TARGET_DENOMINATOR = 100;
const round = (v, d) => { const s = 10 ** d; return Math.round(v * s) / s; };
/** The W6 refusal distance (thresholds.json refuse_delta_e_above), unchanged. */
export function committedDistanceLimit() { return SHADE_DATA.thresholds.confidence.refuse_delta_e_above; }
/** Nearest skin reference (or of `records`) with its runner-up margin. */
export function probeReference(lab, records) {
    const reading = checkedLab(lab);
    const ranked = rankShades(reading, records ?? loadReferenceShades(), { limit: 2 });
    if (ranked.length === 0) {
        return Object.freeze({ lab: reading, status: "too_deep", best_id: null, best_delta_e: null, runner_up_id: null,
            margin: null, named: null });
    }
    const [best, runner] = ranked;
    const margin = runner === undefined ? null : runner.delta_e - best.delta_e;
    const status = best.delta_e > committedDistanceLimit() ? "too_far"
        : margin !== null && margin <= TIE_EPSILON ? "tie" : "matched";
    return Object.freeze({ lab: reading, status, best_id: best.record.id, best_delta_e: best.delta_e,
        runner_up_id: runner?.record.id ?? null, margin, named: status === "matched" ? best.record.id : null });
}
/** Probe each [Lab, expected reference id]; every case stays in the denominator. */
export function auditProbes(cases, records) {
    if (!Array.isArray(cases) || cases.length === 0)
        throw new RangeError("Expected a non-empty list of [Lab, expected id] cases");
    let exact = 0, wrong = 0, refused = 0;
    for (const c of cases) {
        if (!Array.isArray(c) || c.length !== 2 || typeof c[1] !== "string")
            throw new RangeError("Each case is [Lab, expected reference id]");
        const named = probeReference(c[0], records).named;
        if (named === null)
            refused += 1;
        else if (named === c[1])
            exact += 1;
        else
            wrong += 1;
    }
    const total = cases.length;
    const minimum = Math.floor((TARGET_NUMERATOR * total + TARGET_DENOMINATOR - 1) / TARGET_DENOMINATOR);
    return Object.freeze({ total, exact, wrong_accepted: wrong, refused, rate: round(exact / total, 6),
        minimum_exact: minimum, additional_required: Math.max(0, minimum - exact), kind: "synthetic_source_vectors" });
}
function neighbour(record, records) {
    let best = null;
    for (const r of records) {
        if (r.undertone === record.undertone)
            continue;
        const d = delta_e(record.lab, r.lab);
        if (best === null || d < best.d || (d === best.d && r.id < best.r.id))
            best = { d, r };
    }
    if (best === null)
        throw new RangeError("No reference of a different undertone");
    return best.r;
}
let boundary = null;
export function syntheticBoundaryVectors() {
    if (boundary === null) {
        const records = loadReferenceShades();
        const out = [];
        for (const record of records) {
            const toward = neighbour(record, records);
            for (const f of BOUNDARY_FRACTIONS) {
                const lab = [0, 1, 2].map((i) => record.lab[i] + f * (toward.lab[i] - record.lab[i]));
                out.push(Object.freeze({ source_id: record.id, toward_id: toward.id, fraction: f, lab: Object.freeze(lab) }));
            }
        }
        boundary = Object.freeze(out);
    }
    return boundary;
}
export function auditSyntheticBoundaryVectors() {
    return auditProbes(syntheticBoundaryVectors().map((v) => [v.lab, v.source_id]));
}
export function negativeControls() {
    const records = loadReferenceShades();
    const out = [];
    for (const record of records) {
        const probe = probeReference([record.lab[0] - LIGHTENING_STEP, record.lab[1], record.lab[2]]);
        out.push(Object.freeze({ kind: "no_lightening", reference_id: record.id, probe,
            passed: probe.best_id !== record.id }));
    }
    for (const record of records) {
        const twin = Object.freeze({ ...record, id: `${record.id}-TWIN` });
        const probe = probeReference(record.lab, [...records, twin]);
        out.push(Object.freeze({ kind: "tie", reference_id: record.id, probe,
            passed: probe.status === "tie" && probe.named === null }));
    }
    return Object.freeze(out);
}
/** The synthetic audit and controls beside the last box-reported released-person rate. */
export function assessCalibrationGap(reportedPercent = REPORTED_PERCENT) {
    if (typeof reportedPercent !== "number" || !Number.isFinite(reportedPercent) || reportedPercent < 0 || reportedPercent > 100) {
        throw new RangeError("Reported percentage must be a finite number in 0..100");
    }
    const controls = negativeControls();
    return Object.freeze({ format: "beljour-skn03-calibration/1", synthetic: auditSyntheticBoundaryVectors(),
        negative_controls: Object.freeze({ passed: controls.filter((c) => c.passed).length, total: controls.length }),
        reported_percent: reportedPercent, target_percent: 95,
        percentage_point_gap: round(Math.max(0, 95 - reportedPercent), 4),
        status: "UNPROVEN", synthetic_closes_real_gap: false, release_pass: false });
}
