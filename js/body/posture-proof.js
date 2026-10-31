/** Aggregate-only body evidence reader and status view for the posture studio.
 * Accepts one counts-only report (format `beljour-posture-body-evidence/1`) covering exactly
 * the 308 registered J10-J16 slice rows. It refuses unknown or private attributes (paths,
 * photo hashes, sources, per-person values), missing or duplicate rows, impossible counts,
 * row statuses that do not follow from their counts, and any report that claims a release
 * or human-review pass. Locally supplied reports are unverified; reading one never changes
 * the photo, the controls, head protection or export readiness. Text uses textContent only.
 * Author: John Khan.
 */
import { FIXES } from "../engines/local/posture.js";
export const EVIDENCE_FORMAT = "beljour-posture-body-evidence/1";
export const BODY_SIZES = ["small", "medium", "large"];
export const MONK_TONES = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];
export const SLICES = ["view", "body_size", "monk", "body_size_monk"];
export const MIN_GROUP_BODIES = 20;
export const MIN_GROUP_PASS_RATE = 0.95;
export const REGISTERED_ROWS = 308;
export const NOT_RUN_COPY = "Body-set evidence: NOT_RUN. No licensed, released adult body set has been measured.";
export class EvidenceRefused extends RangeError {
    code;
    constructor(code) {
        super(code);
        this.code = code;
        this.name = "EvidenceRefused";
    }
}
const SHA = /^[0-9a-f]{64}$/;
const REPORT_KEYS = ["format", "run", "definitions_sha256", "set_status", "numeric_status", "release_status",
    "human_review", "completion", "rows"];
const ROW_KEYS = ["fix", "view", "slice", "group", "bodies", "expected_jobs", "measured_jobs", "refused_jobs",
    "passed_jobs", "status"];
const COMPLETION_KEYS = ["expected_jobs", "recorded_jobs", "missing_jobs", "refused_jobs", "passed_jobs", "failed_jobs"];
export function fixIdsFor(view) {
    return Object.keys(FIXES).filter((fix) => FIXES[fix].view === view).map((fix) => FIXES[fix].id);
}
/** Every registered (fix, slice, group) in canonical order: 44 rows per fix, 308 in all. */
export function registeredRows() {
    const rows = [];
    for (const view of ["front", "side"]) {
        for (const fix of fixIdsFor(view)) {
            rows.push({ fix, view, slice: "view", group: view });
            for (const size of BODY_SIZES)
                rows.push({ fix, view, slice: "body_size", group: size });
            for (const tone of MONK_TONES)
                rows.push({ fix, view, slice: "monk", group: tone });
            for (const size of BODY_SIZES) {
                for (const tone of MONK_TONES)
                    rows.push({ fix, view, slice: "body_size_monk", group: `${size}/${tone}` });
            }
        }
    }
    return rows;
}
export function rowKey(row) {
    return `${row.fix}|${row.slice}|${row.group}`;
}
/** The status a row must carry, from its counts alone (refusals are non-passes). */
export function expectedRowStatus(row) {
    if (row.measured_jobs === 0)
        return "NOT_RUN";
    if (row.bodies < MIN_GROUP_BODIES)
        return "UNDERPOWERED";
    if (row.measured_jobs < row.expected_jobs)
        return "INCOMPLETE";
    return row.passed_jobs / row.expected_jobs >= MIN_GROUP_PASS_RATE ? "CHECKS_OK" : "NUMERIC_FAIL";
}
export function expectedNumericStatus(rows, setStatus) {
    if (rows.some((row) => row.status === "NUMERIC_FAIL"))
        return "NUMERIC_FAIL";
    if (rows.every((row) => row.status === "NOT_RUN"))
        return "NOT_RUN";
    if (setStatus === "NOT_RUN" && rows.every((row) => row.status === "CHECKS_OK"))
        return "CHECKS_OK";
    return "UNPROVEN";
}
function exactKeys(value, keys, code) {
    if (typeof value !== "object" || value === null || Array.isArray(value))
        throw new EvidenceRefused(code);
    const found = Object.keys(value).sort();
    const wanted = [...keys].sort();
    if (found.length !== wanted.length || found.some((key, i) => key !== wanted[i]))
        throw new EvidenceRefused(code);
    return value;
}
function count(value) {
    if (!Number.isSafeInteger(value) || value < 0)
        throw new EvidenceRefused("invalid_evidence_count");
    return value;
}
/** Validate a parsed JSON value and return an owned, typed copy. */
export function checkedEvidenceReport(value) {
    const raw = exactKeys(value, REPORT_KEYS, "unexpected_evidence_attributes");
    if (raw.format !== EVIDENCE_FORMAT)
        throw new EvidenceRefused("unsupported_evidence_format");
    if (typeof raw.run !== "string" || !SHA.test(raw.run) || typeof raw.definitions_sha256 !== "string" ||
        !SHA.test(raw.definitions_sha256)) {
        throw new EvidenceRefused("invalid_evidence_binding");
    }
    if (raw.release_status !== "NOT_RUN" || raw.human_review !== "NOT_RUN") {
        throw new EvidenceRefused("unsupported_release_claim");
    }
    if (raw.set_status !== "NOT_RUN" && raw.set_status !== "UNPROVEN")
        throw new EvidenceRefused("invalid_set_status");
    const completionRaw = exactKeys(raw.completion, COMPLETION_KEYS, "unexpected_evidence_attributes");
    const completion = Object.fromEntries(COMPLETION_KEYS.map((key) => [key, count(completionRaw[key])]));
    if (completion.recorded_jobs + completion.missing_jobs !== completion.expected_jobs ||
        completion.passed_jobs + completion.refused_jobs + completion.failed_jobs !== completion.recorded_jobs) {
        throw new EvidenceRefused("inconsistent_completion");
    }
    if (!Array.isArray(raw.rows) || raw.rows.length !== REGISTERED_ROWS)
        throw new EvidenceRefused("missing_group_rows");
    const registered = new Map(registeredRows().map((row) => [rowKey(row), row]));
    const seen = new Set();
    const rows = raw.rows.map((item) => {
        const entry = exactKeys(item, ROW_KEYS, "unexpected_evidence_attributes");
        const key = rowKey({ fix: String(entry.fix), slice: String(entry.slice), group: String(entry.group) });
        const expected = registered.get(key);
        if (!expected || entry.view !== expected.view)
            throw new EvidenceRefused("unregistered_group_row");
        if (seen.has(key))
            throw new EvidenceRefused("duplicate_group_row");
        seen.add(key);
        const row = { ...expected, bodies: count(entry.bodies), expected_jobs: count(entry.expected_jobs),
            measured_jobs: count(entry.measured_jobs), refused_jobs: count(entry.refused_jobs),
            passed_jobs: count(entry.passed_jobs), status: entry.status };
        if (row.expected_jobs !== row.bodies || row.measured_jobs > row.expected_jobs ||
            row.passed_jobs + row.refused_jobs > row.measured_jobs) {
            throw new EvidenceRefused("impossible_group_counts");
        }
        if (row.status !== expectedRowStatus(row))
            throw new EvidenceRefused("inconsistent_group_status");
        return row;
    });
    if (raw.numeric_status !== expectedNumericStatus(rows, raw.set_status)) {
        throw new EvidenceRefused("inconsistent_numeric_status");
    }
    return { format: EVIDENCE_FORMAT, run: raw.run, definitions_sha256: raw.definitions_sha256,
        set_status: raw.set_status, numeric_status: raw.numeric_status, release_status: "NOT_RUN",
        human_review: "NOT_RUN", completion, rows };
}
/** Plain-language status lines; a missing report is shown as NOT_RUN. */
export function proofStatusLines(report) {
    if (!report)
        return [NOT_RUN_COPY, "Release: NOT_RUN. Human review: NOT_RUN."];
    const counts = new Map();
    for (const row of report.rows)
        counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
    const parts = ["CHECKS_OK", "NUMERIC_FAIL", "INCOMPLETE", "UNDERPOWERED", "NOT_RUN"]
        .filter((status) => counts.get(status)).map((status) => `${counts.get(status)} ${status}`);
    const c = report.completion;
    return [
        `Locally supplied, unverified body evidence: numeric status ${report.numeric_status}, set ${report.set_status}.`,
        `${REGISTERED_ROWS} registered groups: ${parts.join(", ")}.`,
        `Jobs: ${c.recorded_jobs} of ${c.expected_jobs} recorded, ${c.passed_jobs} within limits, ` +
            `${c.refused_jobs} refused, ${c.failed_jobs} outside limits, ${c.missing_jobs} missing.`,
        "Release: NOT_RUN. Human review: NOT_RUN. Numeric checks are not a quality or identity pass.",
    ];
}
export function mountProofStatus(parent) {
    const root = document.createElement("section");
    root.className = "posture-proof";
    root.setAttribute("aria-label", "Body-set evidence");
    const list = document.createElement("ul");
    const status = document.createElement("p");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    root.append(list, status);
    parent.append(root);
    let current = null;
    const render = () => {
        list.replaceChildren(...proofStatusLines(current).map((line) => {
            const item = document.createElement("li");
            item.textContent = line;
            return item;
        }));
    };
    render();
    return {
        element: root,
        get report() { return current; },
        show(value) {
            try {
                current = checkedEvidenceReport(value);
                status.textContent = "";
                return current;
            }
            catch (error) {
                current = null;
                status.textContent = "That evidence report was refused.";
                throw error;
            }
            finally {
                render();
            }
        },
        reset() {
            current = null;
            status.textContent = "";
            render();
        },
        dispose() { root.remove(); },
    };
}
