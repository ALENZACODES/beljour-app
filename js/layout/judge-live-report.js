/** Fixed-vocabulary operator notes for an optional real-product visit.
 * Does not accept photos, URLs, personal notes, raw provider output or keys.
 */
import { REAL_DEMO_CHECKS, validateManualChecks } from "./judge-live-checks.js";
import { realDemoRoute, validateRealDemoRoutes } from "./judge-live-routes.js";
const FIXED_NOTES = [
    "The visitor manually marked these tasks; the software did not verify them.",
    "No provider request, returned payload, saved photograph or uploaded face was inspected here.",
    "A status marked observed is not a quality, commercial-licence or frozen-set PASS.",
];
/** Uses canonical labels, never arbitrary visitor input or unchecked report objects. */
export function makeRealProductVisitReport(snapshot) {
    const problems = [...validateManualChecks(snapshot), ...validateRealDemoRoutes()];
    if (problems.length)
        throw new TypeError("Unsafe real-product operator checklist");
    return {
        schema: "beljour-real-product-operator-visit/1",
        kind: "operator-reported-uncertified",
        checks: REAL_DEMO_CHECKS.map((template) => {
            const entry = snapshot.rows.find((candidate) => candidate.id === template.id);
            if (!entry)
                throw new TypeError("Missing operator check");
            return { id: entry.id, title: template.title, route: template.route, status: entry.status };
        }),
        observed: snapshot.observed,
        blocked: snapshot.blocked,
        notRun: snapshot.notRun,
        verifiedProviderBySoftware: false,
        completedFaceGate: false,
        photoBytes: 0,
        personalDataBytes: 0,
        notes: FIXED_NOTES,
    };
}
export function formatRealProductVisitReport(report) {
    if (report.kind !== "operator-reported-uncertified" || report.completedFaceGate !== false) {
        throw new TypeError("Unsupported operator-report claims");
    }
    if (report.schema !== "beljour-real-product-operator-visit/1") {
        throw new TypeError("Unknown operator-report schema");
    }
    if (report.verifiedProviderBySoftware !== false || report.photoBytes !== 0
        || report.personalDataBytes !== 0) {
        throw new TypeError("Invalid operator-report content");
    }
    if (report.notes.length !== FIXED_NOTES.length
        || report.notes.some((note, index) => note !== FIXED_NOTES[index])) {
        throw new TypeError("Unsupported operator-report notes");
    }
    if (report.checks.length !== REAL_DEMO_CHECKS.length) {
        throw new TypeError("Incomplete operator-report rows");
    }
    const allowed = new Set(["not-run", "operator-observed", "blocked"]);
    for (const entry of report.checks) {
        if (!allowed.has(entry.status))
            throw new TypeError("Unsupported operator-check status");
    }
    const total = report.observed + report.blocked + report.notRun;
    if (total !== REAL_DEMO_CHECKS.length
        || report.observed !== report.checks.filter((row) => row.status === "operator-observed").length
        || report.blocked !== report.checks.filter((row) => row.status === "blocked").length
        || report.notRun !== report.checks.filter((row) => row.status === "not-run").length) {
        throw new TypeError("Incorrect operator-report totals");
    }
    const lines = [
        "BELJOUR — FULL BEAUTY STUDIO · Your best day. Still you. — separate real-product operator checklist",
        "Schema: beljour-real-product-operator-visit/1",
        "Operator-reported only. Nothing here certifies a live API, product, phone or release gate.",
        "Source: fixed, photo-free labels selected in this browser during one visit.",
        "",
        `Operator reported observations: ${report.observed}`,
        `Blocked or unavailable: ${report.blocked}`,
        `Not checked: ${report.notRun}`,
        "Verified YouCam calls by this checklist: NONE",
        "Actual provider units measured: NOT MEASURED",
        "Saved image output and identity preservation: NOT MEASURED",
        "100,000-face release gate: NOT TESTED",
        "",
        "REAL-PRODUCT NAVIGATION (no photo transfer)",
    ];
    for (const entry of report.checks) {
        const template = REAL_DEMO_CHECKS.find((candidate) => candidate.id === entry.id);
        if (!template || template.title !== entry.title || template.route !== entry.route) {
            throw new TypeError("Unrecognized report entry");
        }
        const route = realDemoRoute(template.route);
        lines.push(`${template.title}: ${entry.status}`);
        lines.push(`  Local destination: ${route.href}`);
        lines.push(`  Operator task: ${template.question}`);
        lines.push(`  Limitation: ${template.limitation}`);
    }
    lines.push("", "Evidence and privacy boundaries");
    lines.push(...report.notes);
    lines.push("No personal source image, filename, face, consent choice or provider reply is included.");
    lines.push("External verification must use the deployed build, a released source and approved units.");
    return lines.join("\n") + "\n";
}
export function prepareRealProductDownload(report) {
    const blob = new Blob([formatRealProductVisitReport(report)], { type: "text/plain;charset=utf-8" });
    if (blob.size > 32_768)
        throw new RangeError("Operator checklist is unexpectedly large");
    return {
        blob,
        filename: "BELJOUR-FULL-BEAUTY-STUDIO-operator-checklist.txt",
        bytes: blob.size,
    };
}
/** A user-triggered download; no file API or network path is used. */
export function requestRealProductDownload(doc, report, urls = URL, defer = (task) => { setTimeout(task, 2000); }) {
    const url = urls.createObjectURL(report.blob);
    const link = doc.createElement("a");
    link.href = url;
    link.download = report.filename;
    link.hidden = true;
    doc.body.append(link);
    try {
        link.click();
    }
    finally {
        link.remove();
        defer(() => urls.revokeObjectURL(url));
    }
}
