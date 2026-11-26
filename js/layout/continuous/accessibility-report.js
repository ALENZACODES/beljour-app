const PERMITTED_FINDINGS = [
    "no-current-heading", "duplicate-id", "unnamed-button", "unnamed-input",
    "missing-slider-range", "invalid-strength-step", "invalid-pressed-state",
    "invalid-expanded-state", "undersized-button", "control-limit",
    "broken-aria-reference", "missing-canvas-description",
    "multiple-main-landmarks", "missing-status-region",
];
function checkedCount(value, limit) {
    if (!Number.isSafeInteger(value) || value < 0 || value > limit) {
        throw new RangeError("Invalid accessibility count");
    }
    return value;
}
export function checkedAuditReport(report) {
    if (!report || typeof report !== "object")
        throw new TypeError("Invalid audit report");
    if (report.format !== "beljour-tour-accessibility/1"
        || report.scope !== "single-local-tour-screen"
        || report.evidence !== "operator-local-observation"
        || report.screenReader !== "not-tested"
        || report.physicalDevice !== "not-tested"
        || report.realFace !== "not-tested"
        || report.provider !== "not-tested") {
        throw new Error("Unsupported or overstated audit evidence");
    }
    const inspected = checkedCount(report.inspected, 320);
    const controls = checkedCount(report.controls, 321);
    const measuredButtons = checkedCount(report.measuredButtons, 320);
    if (inspected > controls || measuredButtons > inspected) {
        throw new RangeError("Inconsistent audit counts");
    }
    if (!Array.isArray(report.findings) || report.findings.length > 14) {
        throw new RangeError("Invalid audit findings");
    }
    const findings = new Set();
    for (const finding of report.findings) {
        if (!PERMITTED_FINDINGS.includes(finding) || findings.has(finding)) {
            throw new Error("Unknown or duplicated finding");
        }
        findings.add(finding);
    }
    return Object.freeze({
        format: "beljour-tour-accessibility/1",
        scope: "single-local-tour-screen",
        evidence: "operator-local-observation",
        inspected, controls, measuredButtons,
        findings: PERMITTED_FINDINGS.filter((finding) => findings.has(finding)),
        screenReader: "not-tested",
        physicalDevice: "not-tested",
        realFace: "not-tested",
        provider: "not-tested",
    });
}
export function makeAuditReport(observation) {
    if (observation.format !== "beljour-tour-accessibility/1"
        || observation.note !== "local-observation-only") {
        throw new Error("Unknown local observation");
    }
    return checkedAuditReport({
        format: observation.format,
        scope: "single-local-tour-screen", evidence: "operator-local-observation",
        inspected: observation.inspected, controls: observation.controls,
        measuredButtons: observation.measuredButtons, findings: observation.findings,
        screenReader: "not-tested", physicalDevice: "not-tested",
        realFace: "not-tested", provider: "not-tested",
    });
}
/** Ignore all unexpected keys; no data from DOM nodes is ever exported. */
export function serializeAuditReport(report) {
    return JSON.stringify(checkedAuditReport(report), null, 2) + "\n";
}
export function parseAuditReport(raw) {
    if (typeof raw !== "string" || raw.length > 4096)
        throw new RangeError("Report too large");
    const unknown = JSON.parse(raw);
    if (!unknown || typeof unknown !== "object" || Array.isArray(unknown)) {
        throw new TypeError("Expected a report object");
    }
    const data = unknown;
    const keys = [
        "format", "scope", "evidence", "inspected", "controls", "measuredButtons",
        "findings", "screenReader", "physicalDevice", "realFace", "provider",
    ];
    if (Object.keys(data).length !== keys.length
        || Object.keys(data).some((key) => !keys.includes(key))) {
        throw new Error("Unexpected report fields");
    }
    return checkedAuditReport(data);
}
/** A download request does not establish that the browser saved a file. */
export function downloadAuditReport(doc, report) {
    const payload = new Blob([serializeAuditReport(report)], { type: "application/json" });
    const url = URL.createObjectURL(payload);
    const anchor = doc.createElement("a");
    anchor.href = url;
    anchor.download = "beljour-tour-accessibility.json";
    try {
        anchor.click();
    }
    finally {
        URL.revokeObjectURL(url);
    }
}
//# sourceMappingURL=accessibility-report.js.map