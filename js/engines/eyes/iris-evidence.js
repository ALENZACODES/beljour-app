function maskChecked(values, length) {
    if (values.length !== length) {
        throw new RangeError("iris audit requires image-sized observed masks");
    }
    for (let index = 0; index < length; index++) {
        const alpha = values[index];
        if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) {
            throw new RangeError("iris audit masks must contain finite alpha in 0..1");
        }
    }
}
function boxChecked(box) {
    if (box.length !== 4 || box.some(value => !Number.isFinite(value))
        || !(0 <= box[0] && box[0] < box[2] && box[2] <= 1)
        || !(0 <= box[1] && box[1] < box[3] && box[3] <= 1)) {
        throw new RangeError("iris audit requires normalized primary-face geometry");
    }
}
/** Measure exact uint8 differences independently from the render engine. */
export function auditIrisTrial(before, result, masks, box) {
    if (result.width !== before.width || result.height !== before.height
        || result.image.length !== before.data.length
        || before.data.length !== before.width * before.height * before.channels) {
        throw new RangeError("iris audit requires the full-resolution frame");
    }
    boxChecked(box);
    const length = before.width * before.height;
    maskChecked(masks.right_iris, length);
    maskChecked(masks.left_iris, length);
    let changedInside = 0;
    let changedOutside = 0;
    let offMaskMaxRgb = 0;
    let changedAlpha = 0;
    let changedCatchlights = 0;
    let rightVisible = false;
    let leftVisible = false;
    let changedAnywhere = false;
    for (let y = 0; y < before.height; y++) {
        for (let x = 0; x < before.width; x++) {
            const i = y * before.width + x;
            if (masks.right_iris[i] >= 0.5)
                rightVisible = true;
            if (masks.left_iris[i] >= 0.5)
                leftVisible = true;
            const primary = x >= box[0] * before.width && x < box[2] * before.width
                && y >= box[1] * before.height && y < box[3] * before.height;
            const selected = primary && (masks.right_iris[i] >= 0.5 || masks.left_iris[i] >= 0.5);
            const offset = i * before.channels;
            let maxDelta = 0;
            let catchlight = true;
            for (let channel = 0; channel < 3; channel++) {
                const old = before.data[offset + channel];
                const value = result.image[offset + channel];
                maxDelta = Math.max(maxDelta, Math.abs(old - value));
                if (old < 245)
                    catchlight = false;
            }
            if (maxDelta !== 0) {
                changedAnywhere = true;
                if (selected) {
                    changedInside++;
                    if (catchlight)
                        changedCatchlights++;
                }
                else {
                    changedOutside++;
                    offMaskMaxRgb = Math.max(offMaskMaxRgb, maxDelta);
                }
            }
            if (before.channels === 4 && before.data[offset + 3] !== result.image[offset + 3]) {
                changedAlpha++;
            }
        }
    }
    let visibilityViolations = Number(result.status === "rendered"
        && result.visibleIrises > Number(rightVisible) + Number(leftVisible));
    if (["refused", "no_mesh", "no_observation", "neutral"].includes(result.status)
        && changedAnywhere) {
        visibilityViolations++;
    }
    const missingGuard = (result.status === "rendered" || result.status === "neutral")
        && !result.guardCalled;
    const violated = changedOutside > 0 || changedAlpha > 0 || changedCatchlights > 0
        || missingGuard || visibilityViolations > 0;
    return {
        status: result.status, pixels: length, changedInside, changedOutside,
        offMaskMaxRgb, changedAlpha, changedCatchlights, missingGuard,
        visibilityViolations, verdict: violated ? "FAIL" : "UNPROVEN",
    };
}
function safeSlug(value) {
    if (typeof value !== "string" || !/^[a-z0-9_-]{1,32}$/.test(value)) {
        throw new RangeError("group must be a short externally supplied aggregate slug");
    }
    return value;
}
export function aggregateIrisAudits(rows, groups) {
    if (groups !== undefined && groups.length !== rows.length) {
        throw new RangeError("group/observation count differs");
    }
    const statuses = {};
    const reasons = {};
    const buckets = {};
    let failures = 0;
    let unproven = 0;
    for (let index = 0; index < rows.length; index++) {
        const row = rows[index];
        if (row.verdict === "FAIL")
            failures++;
        else if (row.verdict === "UNPROVEN")
            unproven++;
        else
            throw new RangeError("invalid iris quality verdict");
        statuses[row.status] = (statuses[row.status] ?? 0) + 1;
        const causes = {
            outside_mask: row.changedOutside, alpha: row.changedAlpha,
            catchlight: row.changedCatchlights, identity_guard: Number(row.missingGuard),
            visibility: row.visibilityViolations,
        };
        for (const [name, value] of Object.entries(causes)) {
            if (value)
                reasons[name] = (reasons[name] ?? 0) + 1;
        }
        const group = safeSlug(groups?.[index] ?? "all");
        const counts = buckets[group] ?? { observations: 0, fail: 0, unproven: 0 };
        counts.observations = (counts.observations ?? 0) + 1;
        const state = row.verdict.toLowerCase();
        counts[state] = (counts[state] ?? 0) + 1;
        buckets[group] = counts;
    }
    return { observations: rows.length, failures, unproven, statuses, reasons, groups: buckets };
}
export function safeIrisAuditReport(counts) {
    return {
        format: "beljour-iris-counts/1", observations: counts.observations,
        failures: counts.failures, unproven: counts.unproven,
        statuses: counts.statuses, reasons: counts.reasons, groups: counts.groups,
        quality_verdict: counts.failures === 0 ? "UNPROVEN" : "FAIL",
    };
}
//# sourceMappingURL=iris-evidence.js.map