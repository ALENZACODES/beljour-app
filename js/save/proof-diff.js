/** Cautious comparison between two count-only Save System proof ledgers.
 *
 * Only matching local recipe definitions can be compared. An observed drop is
 * a failure; equal aggregates are UNPROVEN as a paired, per-photo regression
 * because privacy-safe aggregate receipts do not contain subject identifiers.
 * Nothing here changes the frozen real-face quality thresholds or release gate.
 * Author: John Khan.
 */
import { bindReport } from "./proof-plan.js";
import { PROOF_CHECKS } from "./proof.js";
export const DIFF_FORMAT = "beljour-save-proof-comparison/1";
function direction(delta) {
    if (delta < 0)
        return "decreased";
    if (delta > 0)
        return "increased";
    return "unchanged";
}
/**
 * Independently validate both receipts before comparing. No per-person
 * identity can be reconstructed from these integer totals.
 */
export function compareProofBundles(rawBefore, rawAfter) {
    const before = bindReport(rawBefore.plan, rawBefore.report);
    const after = bindReport(rawAfter.plan, rawAfter.report);
    if (rawBefore.status !== before.status || rawAfter.status !== after.status) {
        throw new TypeError("a comparison source claims an unsupported status");
    }
    if (before.plan.recipeDigest !== after.plan.recipeDigest ||
        before.plan.method !== after.plan.method ||
        before.plan.declaredItems !== after.plan.declaredItems) {
        throw new TypeError("only identical proof definitions and denominators can be compared");
    }
    const checkDifferences = PROOF_CHECKS.map((check) => {
        const passedBefore = before.report.checks[check].passed;
        const passedAfter = after.report.checks[check].passed;
        const delta = passedAfter - passedBefore;
        return { check, passedBefore, passedAfter, delta, direction: direction(delta) };
    });
    const passedBefore = before.report.counts.passed;
    const passedAfter = after.report.counts.passed;
    const delta = passedAfter - passedBefore;
    const observedDrop = delta < 0 || checkDifferences.some((entry) => entry.delta < 0);
    return {
        format: DIFF_FORMAT,
        status: observedDrop ? "FAIL" : "UNPROVEN",
        reason: observedDrop ? "observed_decrease" : "unpaired_aggregates",
        total: before.plan.declaredItems,
        passedBefore,
        passedAfter,
        delta,
        checkDifferences,
    };
}
/** Stable summary without source photo names, hashes or transformed pixels. */
export function describeComparison(result) {
    const shift = result.delta > 0 ? `+${result.delta}` : String(result.delta);
    if (result.status === "FAIL") {
        return `FAIL: local Save System replay passes fell by ${Math.abs(result.delta)} or a check declined. ` +
            "No release acceptance is implied.";
    }
    return `UNPROVEN: aggregate mechanical replay change ${shift} of ${result.total}. ` +
        "Without paired frozen inputs, no per-face no-regression or identity claim is possible.";
}
