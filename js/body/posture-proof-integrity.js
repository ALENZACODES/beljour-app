/** Cross-row integrity of an aggregate body evidence report (beyond per-row validity).
 * Checks that each fix's view, size and tone rows equal the sums of their size x tone
 * intersections for every count; that all fixes of one view see the same population;
 * that completion equals the per-fix totals; and that the set status follows from the
 * committed 20-per-intersection, 600-per-view and 1,200-total minimums. A report that
 * passes is internally consistent. It is still locally supplied and unverified.
 * Author: John Khan.
 */
import { BODY_SIZES, EvidenceRefused, MIN_GROUP_BODIES, MONK_TONES, checkedEvidenceReport, fixIdsFor } from "./posture-proof.js";
export const MIN_VIEW_BODIES = 600;
export const MIN_TOTAL_BODIES = 1200;
const COUNTS = ["bodies", "expected_jobs", "measured_jobs", "refused_jobs", "passed_jobs"];
function index(rows) {
    return new Map(rows.map((row) => [`${row.fix}|${row.slice}|${row.group}`, row]));
}
function sumOf(rows, field) {
    return rows.reduce((total, row) => total + row[field], 0);
}
export function evidenceIntegrity(report) {
    const problems = new Set();
    const byKey = index(report.rows);
    const get = (fix, slice, group) => byKey.get(`${fix}|${slice}|${group}`);
    const population = new Map();
    let expected = 0, measured = 0, refused = 0, passed = 0;
    for (const view of ["front", "side"]) {
        for (const fix of fixIdsFor(view)) {
            const cells = (size, tone) => BODY_SIZES.flatMap((s) => MONK_TONES.filter((t) => (size === null || s === size) && (tone === null || t === tone))
                .map((t) => get(fix, "body_size_monk", `${s}/${t}`)));
            const parents = [
                [get(fix, "view", view), cells(null, null)],
                ...BODY_SIZES.map((size) => [get(fix, "body_size", size), cells(size, null)]),
                ...MONK_TONES.map((tone) => [get(fix, "monk", tone), cells(null, tone)]),
            ];
            for (const [parent, children] of parents) {
                for (const field of COUNTS) {
                    if (parent[field] !== sumOf(children, field))
                        problems.add("parent_totals_differ_from_intersections");
                }
            }
            const bodies = cells(null, null).map((row) => row.bodies);
            const prior = population.get(view);
            if (prior && prior.some((value, i) => value !== bodies[i]))
                problems.add("fix_populations_differ_within_view");
            population.set(view, bodies);
            const top = get(fix, "view", view);
            expected += top.expected_jobs;
            measured += top.measured_jobs;
            refused += top.refused_jobs;
            passed += top.passed_jobs;
        }
    }
    const c = report.completion;
    if (c.expected_jobs !== expected || c.recorded_jobs !== measured || c.refused_jobs !== refused ||
        c.passed_jobs !== passed) {
        problems.add("completion_differs_from_rows");
    }
    const front = population.get("front") ?? [], side = population.get("side") ?? [];
    const perView = [front, side].map((cells) => cells.reduce((total, value) => total + value, 0));
    const thin = perView[0] + perView[1] < MIN_TOTAL_BODIES || perView.some((total) => total < MIN_VIEW_BODIES) ||
        [...front, ...side].some((value) => value < MIN_GROUP_BODIES);
    const bodiesSeen = perView[0] + perView[1] > 0;
    if (bodiesSeen && report.set_status !== (thin ? "UNPROVEN" : "NOT_RUN"))
        problems.add("set_status_differs_from_counts");
    return { consistent: problems.size === 0, problems: [...problems].sort() };
}
/** The full browser gate: per-row validation, then cross-row integrity. */
export function verifiedEvidenceReport(value) {
    const report = checkedEvidenceReport(value);
    const integrity = evidenceIntegrity(report);
    if (!integrity.consistent)
        throw new EvidenceRefused(integrity.problems[0]);
    return report;
}
