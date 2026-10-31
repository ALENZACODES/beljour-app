/** Read a metadata-only rehearsal report without trusting its claims. Author: John Khan. */
import { validateSafeReleaseReport } from "./report.js";
const MAX_REPORT_BYTES = 32_768;
function refusal(status) {
    const note = status === "too-large"
        ? "The file exceeds the metadata report size limit. It was not read."
        : status === "stale"
            ? "The previous file check was cancelled because the review changed."
            : status === "unavailable"
                ? "The selected browser file cannot be read."
                : "The file is not a valid photo-free release rehearsal report.";
    return {
        status, reviewed: 0, rows: 0, independentAccepted: false,
        productionReady: false, note,
    };
}
/** Does not store, transmit or reflect arbitrary file content. */
export function inspectReleaseText(text) {
    if (typeof text !== "string" || text.length > MAX_REPORT_BYTES) {
        return refusal("too-large");
    }
    try {
        const parsed = JSON.parse(text);
        if (!validateSafeReleaseReport(parsed))
            return refusal("invalid");
        return {
            status: "schema-valid", reviewed: parsed.reviewed,
            rows: parsed.rows.length,
            independentAccepted: false,
            productionReady: false,
            note: "The local report format is valid. It remains self-reported and is not release evidence.",
        };
    }
    catch {
        return refusal("invalid");
    }
}
/** A caller's revision guards against stale async file reads after reset or exit. */
export async function inspectReleaseFile(file, currentRevision, requestedRevision) {
    if (!file)
        return refusal("unavailable");
    if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > MAX_REPORT_BYTES) {
        return refusal("too-large");
    }
    if (file.type !== "" && file.type !== "application/json" && file.type !== "text/json") {
        return refusal("invalid");
    }
    if (currentRevision() !== requestedRevision)
        return refusal("stale");
    try {
        const text = await file.text();
        if (currentRevision() !== requestedRevision)
            return refusal("stale");
        return inspectReleaseText(text);
    }
    catch {
        if (currentRevision() !== requestedRevision)
            return refusal("stale");
        return refusal("unavailable");
    }
}
