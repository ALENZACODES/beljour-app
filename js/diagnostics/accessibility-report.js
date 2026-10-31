/** Downloadable, photo-free accessibility REVIEW notes, not a compliance certificate. */
import { ACCESS_REVIEW_VERSION, REVIEW_TASKS, } from "../mobile/a11y-review.js";
import { REVIEW_PAGES, AccessibilityPageReview } from "../mobile/accessibility-pages.js";
const ALLOWED_WARNINGS = new Set([
    "Viewport overflow was not measurable.",
    "The inspected layout exceeds the viewport.",
    "Some measured controls are under the 44px project target.",
    "Some visible text is below the 12px functional minimum.",
    "The bounded scan did not inspect every visible element.",
    "Test 320px/390px, zoom and landscape physically; this scan cannot emulate them.",
]);
function finiteCount(value) {
    return Number.isSafeInteger(value) && value >= 0 ? Math.min(value, 100000) : 0;
}
function safeKeyboard(record) {
    if (!record || record.proof !== "manual-hint-only")
        return null;
    return {
        recordedFocus: finiteCount(record.recordedFocus),
        tabRequests: finiteCount(record.tabRequests),
        namedControls: finiteCount(record.namedControls),
        unnamedControls: finiteCount(record.unnamedControls),
        visibleRingHints: finiteCount(record.visibleRingHints),
        ringUnknown: finiteCount(record.ringUnknown),
        notInTabOrder: finiteCount(record.notInTabOrder),
        active: Boolean(record.active),
        proof: "manual-hint-only",
    };
}
function safeResponsive(record) {
    if (!record || record.label !== "measurement-not-certification")
        return null;
    const finiteOrNull = (value) => {
        if (value === null)
            return null;
        return Number.isFinite(value) && value >= 0 ? finiteCount(value) : null;
    };
    return {
        viewportWidth: finiteOrNull(record.viewportWidth),
        contentWidth: finiteOrNull(record.contentWidth),
        controlsSeen: finiteCount(record.controlsSeen),
        smallTouchControls: finiteCount(record.smallTouchControls),
        smallTextElements: finiteCount(record.smallTextElements),
        overflowPixels: finiteOrNull(record.overflowPixels),
        sampled: Boolean(record.sampled),
        label: "measurement-not-certification",
        warnings: record.warnings.filter((warning) => ALLOWED_WARNINGS.has(warning)),
    };
}
const LIMITATIONS = [
    "This is not a WCAG 2.2 AA audit or a screen-reader certification.",
    "DOM geometry and computed styles vary by device, zoom and browser.",
    "No automatic colour, reading order or keyboard checks can replace a person.",
    "No personal pictures, typed content or identifying inputs were captured.",
];
/** Copies a strict known-field schema, without serializing DOM nodes or raw key presses. */
export function buildAccessibilityEvidence(probe, review, focus, pages = new AccessibilityPageReview().snapshot, keyboard = null, responsive = null) {
    const clean = probe?.findings ?? [];
    return {
        schema: ACCESS_REVIEW_VERSION,
        method: "manual-and-dom-hints",
        certified: false,
        countedElements: probe?.inspected ?? 0,
        omittedElements: probe?.omitted ?? 0,
        truncated: probe?.incomplete ?? true,
        findingCount: clean.length,
        findings: clean.map((row) => ({
            rule: row.rule,
            severity: row.severity,
            element: row.element,
            message: row.message,
        })),
        manual: REVIEW_TASKS.map((task) => ({
            id: task.id,
            decision: review.rows.find((row) => row.id === task.id)?.decision ?? "not-reviewed",
        })),
        reviewedTasks: review.reviewed,
        issuesFound: review.issues,
        completedManualReview: review.manualComplete,
        pages: REVIEW_PAGES.map((page) => ({
            id: page.id,
            decision: pages.rows.find((row) => row.id === page.id)?.decision ?? "not-reviewed",
        })),
        allPagesReviewed: pages.complete,
        keyboard: safeKeyboard(keyboard),
        responsive: safeResponsive(responsive),
        focus: {
            events: focus.total,
            kinds: [...focus.distinctKinds],
            repeatedFocusHint: focus.trappedCandidate,
        },
        limitations: [...LIMITATIONS],
    };
}
export function validAccessibilityEvidence(value) {
    if (!value || typeof value !== "object")
        return false;
    const report = value;
    if (report.schema !== ACCESS_REVIEW_VERSION || report.method !== "manual-and-dom-hints"
        || report.certified !== false || !Array.isArray(report.findings)
        || !Array.isArray(report.manual) || report.manual.length !== REVIEW_TASKS.length
        || !Array.isArray(report.pages) || report.pages.length !== REVIEW_PAGES.length
        || !Array.isArray(report.limitations) || !report.focus)
        return false;
    for (const value of [report.countedElements, report.omittedElements, report.findingCount,
        report.reviewedTasks, report.issuesFound, report.focus.events]) {
        if (!Number.isSafeInteger(value) || value < 0)
            return false;
    }
    if (report.findingCount !== report.findings.length || typeof report.truncated !== "boolean"
        || typeof report.completedManualReview !== "boolean" || !Array.isArray(report.focus.kinds))
        return false;
    const decisions = new Set(["not-reviewed", "confirmed", "issue-found", "not-applicable"]);
    const pageValues = new Set(["not-reviewed", "checked-manually", "issue-observed", "unable-to-check"]);
    if (typeof report.allPagesReviewed !== "boolean" || !report.pages.every((row, index) => {
        return row.id === REVIEW_PAGES[index].id && pageValues.has(row.decision);
    }))
        return false;
    if (report.keyboard !== null && report.keyboard !== undefined) {
        if (report.keyboard.proof !== "manual-hint-only" || !Number.isSafeInteger(report.keyboard.recordedFocus))
            return false;
    }
    if (report.responsive !== null && report.responsive !== undefined) {
        if (report.responsive.label !== "measurement-not-certification")
            return false;
    }
    return report.manual.every((row, index) => {
        const task = REVIEW_TASKS[index];
        return row?.id === task.id && decisions.has(row.decision);
    });
}
export function serializeAccessibilityEvidence(report) {
    if (!validAccessibilityEvidence(report))
        throw new RangeError("Invalid accessibility evidence");
    return JSON.stringify(report, null, 2) + "\n";
}
export function accessibilityEvidenceText(report) {
    if (!validAccessibilityEvidence(report))
        throw new RangeError("Invalid accessibility evidence");
    const state = report.completedManualReview ? "All manual tasks answered" : "Manual review incomplete";
    return `${report.findingCount} DOM hints. ${state}. ${report.pages.filter((row) => row.decision !== "not-reviewed").length} routes reviewed. ${report.issuesFound} reported issues. Not certified.`;
}
