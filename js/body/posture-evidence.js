/** Scalar 2D posture-result audit. Synthetic success never means a real-person PASS.
 * This cannot diagnose a spine or validate identity. Author: John Khan.
 */
import { SIMULATION_LABEL, checkedPostureLevel, postureLevelPlan, requirePostureView } from "../engines/local/posture.js";
export const MIN_REDUCTION_AT_FULL = 0.1;
const TOLERANCE = 1e-7;
const MOVEMENT_TOLERANCE = 1e-6;
export function auditPosturePlan(p, level) {
    const entry = requirePostureView(p.before, p.fix);
    const checked = checkedPostureLevel(level);
    const reasons = [];
    const original = p.measureBefore;
    const current = p.measureAfter;
    const reduction = p.reduction;
    const move = Math.max(...p.moves.map((name) => {
        const a = p.before.points[name], b = p.after.points[name];
        return Math.hypot(b[0] - a[0], b[1] - a[1]);
    }));
    const cap = p.capPx;
    if (![original, current, reduction, move, cap].every(Number.isFinite))
        reasons.push("non_finite");
    if (move > cap + MOVEMENT_TOLERANCE)
        reasons.push("movement_over_cap");
    const torso = Math.hypot(p.before.view === "front"
        ? (p.before.points.right_hip[0] + p.before.points.left_hip[0] -
            p.before.points.right_shoulder[0] - p.before.points.left_shoulder[0]) / 2
        : p.before.points.hip[0] - p.before.points.shoulder[0], p.before.view === "front"
        ? (p.before.points.right_hip[1] + p.before.points.left_hip[1] -
            p.before.points.right_shoulder[1] - p.before.points.left_shoulder[1]) / 2
        : p.before.points.hip[1] - p.before.points.shoulder[1]);
    if (cap > 0.06 * torso + MOVEMENT_TOLERANCE)
        reasons.push("cap_raised");
    if (p.pins.some((name) => {
        const a = p.before.points[name], b = p.after.points[name];
        return a[0] !== b[0] || a[1] !== b[1];
    }))
        reasons.push("pinned_landmark_moved");
    if (checked === 1) {
        if (move > TOLERANCE)
            reasons.push("neutral_level_changed");
    }
    else if (Math.abs(original) > TOLERANCE) {
        if (original * current < -TOLERANCE)
            reasons.push("overshot_neutral");
        if (Math.abs(current) > Math.abs(original) + TOLERANCE)
            reasons.push("deviation_increased");
        if (checked === 5 && reduction + TOLERANCE < MIN_REDUCTION_AT_FULL) {
            reasons.push("insufficient_full_level_reduction");
        }
    }
    return {
        fix: p.fix, id: entry.id, level: checked,
        original_deviation: Math.round(original * 1e6) / 1e6,
        new_deviation: Math.round(current * 1e6) / 1e6,
        reduction: Math.round(reduction * 1e6) / 1e6,
        move_px: Math.round(move * 1e6) / 1e6,
        cap_px: Math.round(cap * 1e6) / 1e6,
        checks_ok: reasons.length === 0, reasons,
        evidence_class: "synthetic_or_unrated", release_status: "NOT_RUN",
    };
}
export function auditLevel(c, fix, level) {
    return auditPosturePlan(postureLevelPlan(c, fix, level), level);
}
export function postureEvidenceExportLabel() {
    return SIMULATION_LABEL;
}
//# sourceMappingURL=posture-evidence.js.map