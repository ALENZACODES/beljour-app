/** Local, manual accessibility review; never presented as WCAG certification.
 * No user names, photographs, filenames, face geometry or key sequences are retained.
 */
export const ACCESS_REVIEW_VERSION = "beljour-accessibility-review/1";
export const REVIEW_TASKS = [
    {
        id: "keyboard",
        title: "Keyboard-only navigation",
        instruction: "Use Tab, Shift+Tab, Enter and Escape. Confirm focus is visible and nothing traps you.",
    },
    {
        id: "reader",
        title: "Screen-reader announcement",
        instruction: "Read landmarks and the current step with your screen reader; check labels and changes.",
    },
    {
        id: "mobile",
        title: "Phone and touch access",
        instruction: "Inspect the page at 320px and 390px; try zoom at 200% and landscape orientation.",
    },
    {
        id: "photo",
        title: "Local image and export",
        instruction: "Use only a photo you may edit. Verify the local picker, cancel path and labelled export.",
    },
    {
        id: "motion",
        title: "Reduced motion and contrast",
        instruction: "Check reduced motion, forced colours or high contrast, and visible focus states.",
    },
];
const DECISIONS = [
    "not-reviewed", "confirmed", "issue-found", "not-applicable",
];
export function isReviewTask(value) {
    return REVIEW_TASKS.some((task) => task.id === value);
}
export function isReviewDecision(value) {
    return DECISIONS.some((decision) => decision === value);
}
/** A bounded in-memory ledger. No storage, implicit completion or remote logging. */
export class AccessibilityReview {
    answers = new Map();
    listeners = new Set();
    constructor() {
        for (const task of REVIEW_TASKS)
            this.answers.set(task.id, "not-reviewed");
    }
    get snapshot() {
        const rows = REVIEW_TASKS.map((task) => ({
            id: task.id,
            decision: this.answers.get(task.id) ?? "not-reviewed",
        }));
        const reviewed = rows.filter((row) => row.decision !== "not-reviewed").length;
        return {
            rows,
            reviewed,
            issues: rows.filter((row) => row.decision === "issue-found").length,
            confirmed: rows.filter((row) => row.decision === "confirmed").length,
            manualComplete: reviewed === REVIEW_TASKS.length,
            certified: false,
        };
    }
    answer(id, decision) {
        if (!isReviewTask(id) || !isReviewDecision(decision))
            throw new RangeError("Unknown accessibility review choice");
        this.answers.set(id, decision);
        const snapshot = this.snapshot;
        for (const listener of this.listeners)
            listener(snapshot);
        return snapshot;
    }
    subscribe(listener) {
        this.listeners.add(listener);
        listener(this.snapshot);
        return () => this.listeners.delete(listener);
    }
    reset() {
        for (const task of REVIEW_TASKS)
            this.answers.set(task.id, "not-reviewed");
        const snapshot = this.snapshot;
        for (const listener of this.listeners)
            listener(snapshot);
        return snapshot;
    }
    dispose() {
        this.listeners.clear();
        this.answers.clear();
    }
}
