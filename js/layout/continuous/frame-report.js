/** Photo-free evidence about in-memory drawn frames, never provider results. Author: John Khan. */
import { FRAME_IDS, isFrameId } from "./frame-cache-contract.js";
export function frameEvidence(summary) {
    if (!Number.isSafeInteger(summary.available) || summary.available < 0
        || summary.available > FRAME_IDS.length || summary.liveVerified !== false
        || summary.unitsSpent !== 0 || summary.networkCalls !== 0
        || (summary.selected !== null && !isFrameId(summary.selected))) {
        throw new RangeError("Invalid local preview report");
    }
    return {
        format: "beljour-drawn-frame-review/1",
        input: "drawn-illustration-only",
        result: "not-a-provider-result",
        cachedFrames: summary.available,
        requestedFamily: summary.selected,
        sessionStatus: summary.phase === "ready" ? "available" : "unavailable",
        networkCalls: 0,
        unitsSpent: 0,
        liveVerified: false,
        realFaceVerified: false,
        frozenGatePassed: false,
    };
}
export function verifiedFrameReport(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new TypeError("Invalid local frame evidence");
    }
    const row = value;
    const exact = [
        "format", "input", "result", "cachedFrames", "requestedFamily", "sessionStatus",
        "networkCalls", "unitsSpent", "liveVerified", "realFaceVerified", "frozenGatePassed",
    ];
    if (Object.keys(row).length !== exact.length || exact.some((key) => !(key in row))
        || row.format !== "beljour-drawn-frame-review/1"
        || row.input !== "drawn-illustration-only" || row.result !== "not-a-provider-result"
        || !Number.isInteger(row.cachedFrames) || Number(row.cachedFrames) < 0
        || Number(row.cachedFrames) > FRAME_IDS.length
        || (row.requestedFamily !== null && !isFrameId(row.requestedFamily))
        || !["available", "unavailable"].includes(String(row.sessionStatus))
        || row.networkCalls !== 0 || row.unitsSpent !== 0
        || row.liveVerified !== false || row.realFaceVerified !== false
        || row.frozenGatePassed !== false) {
        throw new Error("Local frame evidence cannot assert external success");
    }
    return value;
}
export function frameReportBlob(summary) {
    const result = verifiedFrameReport(frameEvidence(summary));
    return new Blob([JSON.stringify(result, null, 2) + "\n"], {
        type: "application/json",
    });
}
/** Explicit operator action; no result pixels or session keys leave browser memory. */
export function downloadFrameReport(doc, summary) {
    const report = frameReportBlob(summary);
    if (report.size > 2048)
        throw new RangeError("Unexpected local report size");
    const url = URL.createObjectURL(report);
    try {
        const link = doc.createElement("a");
        link.href = url;
        link.download = "BELJOUR-FULL-BEAUTY-STUDIO-Drawn-Cache-Review.json";
        link.hidden = true;
        doc.body.append(link);
        link.click();
        link.remove();
    }
    finally {
        URL.revokeObjectURL(url);
    }
}
