/** Per-fix summary of a verified aggregate body evidence report, for the studio.
 * Names the groups that need attention (failing, incomplete, underpowered or not run) by
 * slice label only. It never upgrades a status: the headline is the report's own numeric
 * status, release and human review stay NOT_RUN. Text uses textContent only. Author: John Khan.
 */
import { FIXES, POSTURE_NAMES } from "../engines/local/posture.js";
import { NOT_RUN_COPY } from "./posture-proof.js";
const ORDER = ["NUMERIC_FAIL", "INCOMPLETE", "UNDERPOWERED", "NOT_RUN", "CHECKS_OK"];
/** ASSUMED: listing more than this many groups per fix stops being readable. */
export const MAX_ATTENTION = 6;
function nameFor(fixId) {
    const fix = Object.keys(FIXES).find((name) => FIXES[name].id === fixId);
    return fix ? POSTURE_NAMES[fix] : fixId;
}
function label(row) {
    const slice = row.slice === "body_size_monk" ? "size/tone" : row.slice === "monk" ? "tone" : row.slice.replace("_", " ");
    return `${slice} ${row.group}: ${row.status}`;
}
export function summarizeEvidence(report) {
    const byFix = new Map();
    for (const row of report.rows)
        byFix.set(row.fix, [...(byFix.get(row.fix) ?? []), row]);
    const fixes = [...byFix.entries()].map(([fix, rows]) => {
        const counts = {};
        for (const row of rows)
            counts[row.status] = (counts[row.status] ?? 0) + 1;
        const attention = rows.filter((row) => row.status !== "CHECKS_OK")
            .sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status))
            .slice(0, MAX_ATTENTION).map(label);
        return { fix, name: nameFor(fix), rows: rows.length, counts, attention };
    });
    const headline = report.numeric_status === "CHECKS_OK"
        ? "All 308 groups are within the committed numeric limits on the supplied evidence. Release: NOT_RUN."
        : `Numeric status ${report.numeric_status}. Release: NOT_RUN.`;
    return { headline, numericStatus: report.numeric_status, release: "NOT_RUN", fixes };
}
export function summaryLines(summary) {
    if (!summary)
        return [NOT_RUN_COPY];
    return [summary.headline, ...summary.fixes.map((item) => {
            const counts = ORDER.filter((status) => item.counts[status]).map((status) => `${item.counts[status]} ${status}`);
            const attention = item.attention.length ? ` Needs attention: ${item.attention.join("; ")}.` : "";
            return `${item.fix} ${item.name}: ${counts.join(", ")}.${attention}`;
        })];
}
export function mountProofSummary(parent) {
    const root = document.createElement("section");
    root.className = "posture-proof-summary";
    root.setAttribute("aria-label", "Body evidence by fix");
    parent.append(root);
    const show = (report) => {
        const summary = report ? summarizeEvidence(report) : null;
        root.replaceChildren(...summaryLines(summary).map((line) => {
            const item = document.createElement("p");
            item.textContent = line;
            return item;
        }));
        return summary;
    };
    show(null);
    return { element: root, show, dispose: () => root.remove() };
}
//# sourceMappingURL=posture-proof-summary.js.map