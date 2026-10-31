/** Downloadable rehearsal facts, with no photos, identifiers or free-text fields. */
import { OPERATOR_FORMAT, OPERATOR_ROUTE_IDS, validOperatorResult, validRefusal, } from "./operator-contract.js";
function checkedDuration(value) {
    if (!Number.isInteger(value) || typeof value !== "number" || value < 0 || value > 86_400_000) {
        throw new RangeError("Invalid rehearsal duration");
    }
    return value;
}
function checkedRow(id, state, refusal, elapsedMs) {
    if (!OPERATOR_ROUTE_IDS.includes(id) || !validOperatorResult(state)) {
        throw new RangeError("Invalid operator result");
    }
    if (state === "refused" && !validRefusal(refusal)) {
        throw new RangeError("Refusal requires a fixed reason");
    }
    if (state !== "refused" && refusal !== null) {
        throw new RangeError("Non-refusal cannot have a reason");
    }
    if (state === "not-started" && elapsedMs !== null) {
        throw new RangeError("Unstarted route cannot have a timestamp");
    }
    if (state !== "not-started" && elapsedMs === null) {
        throw new RangeError("Route observation requires a timestamp");
    }
    if (elapsedMs !== null)
        checkedDuration(elapsedMs);
    return Object.freeze({ id, state, refusal, elapsedMs });
}
/** Deliberately drops every title, URL and arbitrary field from input snapshots. */
export function safeOperatorReport(snapshot) {
    if (snapshot.rows.length !== OPERATOR_ROUTE_IDS.length)
        throw new RangeError("Wrong route count");
    const rows = OPERATOR_ROUTE_IDS.map((id, index) => {
        const row = snapshot.rows[index];
        if (!row || row.id !== id || row.liveVerified !== false) {
            throw new Error("Operator routes must remain ordered and unverified");
        }
        return checkedRow(id, row.result, row.refusal, row.elapsedMs);
    });
    if (snapshot.counts.providerProved || snapshot.counts.realFaceProved
        || snapshot.counts.releaseProved) {
        throw new Error("Operator checks cannot certify external gates");
    }
    const activeMs = checkedDuration(snapshot.clock.activeMs);
    if (rows.some((entry) => entry.elapsedMs !== null && entry.elapsedMs > activeMs)) {
        throw new Error("A manual observation cannot be later than the rehearsal");
    }
    const wallMs = checkedDuration(snapshot.clock.wallMs);
    if (activeMs > wallMs || snapshot.clock.targetMs !== 180_000
        || snapshot.clock.exceeded !== (activeMs > 180_000)) {
        throw new Error("Inconsistent rehearsal clock");
    }
    return Object.freeze({
        format: OPERATOR_FORMAT,
        source: "operator-self-report",
        dataPolicy: "fixed-metadata-only",
        rows: Object.freeze(rows),
        clock: Object.freeze({
            activeMs,
            wallMs,
            targetMs: 180_000,
            exceeded: activeMs > 180_000,
        }),
        providerVerified: false,
        realFaceVerified: false,
        frozenReleaseVerified: false,
        completeForSubmission: false,
    });
}
/** Reject imported or forged reports; no imported document is used as release proof. */
export function validateOperatorReport(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        return false;
    const row = value;
    if (row.format !== OPERATOR_FORMAT || row.source !== "operator-self-report"
        || row.dataPolicy !== "fixed-metadata-only"
        || row.providerVerified !== false || row.realFaceVerified !== false
        || row.frozenReleaseVerified !== false || row.completeForSubmission !== false)
        return false;
    const allowed = ["format", "source", "dataPolicy", "rows", "clock", "providerVerified",
        "realFaceVerified", "frozenReleaseVerified", "completeForSubmission"];
    if (Object.keys(value).some((key) => !allowed.includes(key)))
        return false;
    if (!Array.isArray(row.rows) || row.rows.length !== OPERATOR_ROUTE_IDS.length)
        return false;
    for (const [index, entry] of row.rows.entries()) {
        if (!entry || typeof entry !== "object" || Array.isArray(entry))
            return false;
        if (Object.keys(entry).some((key) => !["id", "state", "refusal", "elapsedMs"].includes(key))) {
            return false;
        }
        try {
            if (entry.id !== OPERATOR_ROUTE_IDS[index])
                return false;
            checkedRow(entry.id, entry.state, entry.refusal, entry.elapsedMs);
        }
        catch {
            return false;
        }
    }
    const clock = row.clock;
    if (!clock || typeof clock !== "object" || Array.isArray(clock))
        return false;
    if (Object.keys(clock).some((key) => !["activeMs", "wallMs", "targetMs", "exceeded"].includes(key))) {
        return false;
    }
    try {
        checkedDuration(clock.activeMs);
        checkedDuration(clock.wallMs);
    }
    catch {
        return false;
    }
    if (clock.targetMs !== 180_000 || clock.activeMs > clock.wallMs
        || clock.exceeded !== (clock.activeMs > 180_000))
        return false;
    if (row.rows.some((entry) => entry.elapsedMs !== null && entry.elapsedMs > clock.activeMs)) {
        return false;
    }
    return true;
}
export function serializeOperatorReport(report) {
    if (!validateOperatorReport(report))
        throw new Error("Invalid operator report");
    const body = JSON.stringify(report, null, 2) + "\n";
    if (body.length > 4_096)
        throw new RangeError("Operator report exceeds privacy size bound");
    return body;
}
/** Browser download starts only from a visible user click; no remote endpoint. */
export function saveOperatorReport(doc, data) {
    if (data.length > 4_096 || !validateOperatorReport(JSON.parse(data))) {
        throw new Error("Invalid operator report export");
    }
    const file = new Blob([data], { type: "application/json" });
    const href = URL.createObjectURL(file);
    try {
        const anchor = doc.createElement("a");
        anchor.href = href;
        anchor.download = "BELJOUR-FULL-BEAUTY-STUDIO-operator-rehearsal.json";
        anchor.setAttribute("aria-label", "Download fixed-data operator rehearsal report");
        anchor.click();
        return true;
    }
    finally {
        URL.revokeObjectURL(href);
    }
}
