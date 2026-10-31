/** Fixed text runbook from observed local drawings; never stores photos or identity. */
/** Author: John Khan. */
import { LOCAL_EDIT_SEQUENCE, } from "./sequence-contract.js";
const MAX_SHOTLIST_BYTES = 8 * 1024;
/** Reject forged/partial observations rather than turn them into a video claim. */
export function checkedShotList(snapshot) {
    if (snapshot.phase !== "complete" || snapshot.completed.length !== LOCAL_EDIT_SEQUENCE.length) {
        throw new Error("The seven local stages have not completed");
    }
    if (!Number.isFinite(snapshot.elapsedMs) || snapshot.elapsedMs < 0
        || snapshot.elapsedMs > 300_000 || snapshot.providerCalls !== 0
        || snapshot.imageSent || snapshot.downloadRequested || snapshot.liveEvidence) {
        throw new Error("The local observation cannot be used as a rehearsal shot list");
    }
    const ordered = LOCAL_EDIT_SEQUENCE.map((step, index) => {
        const actual = snapshot.completed[index];
        if (!actual || actual.effect !== step.effect || actual.kind !== "drawn") {
            throw new Error("A local edit is missing or out of order");
        }
        if (!Number.isFinite(actual.durationMs) || actual.durationMs < 0
            || actual.durationMs > 300_000) {
            throw new Error("The local edit has an invalid duration");
        }
        if (!Number.isFinite(actual.level) || actual.level < 1 || actual.level > 5
            || Math.abs(actual.level * 10 - Math.round(actual.level * 10)) > 0.000001) {
            throw new Error("The local edit level is invalid");
        }
        return `${index + 1}. ${step.title} — ${step.caption} `
            + `Level ${actual.level.toFixed(1)}/5.0. Measured state-transition duration: `
            + `${actual.durationMs.toFixed(1)} ms.`;
    });
    return Object.freeze({
        format: "beljour-drawn-rehearsal/1",
        steps: ordered.length,
        elapsedMs: snapshot.elapsedMs,
        labels: Object.freeze(ordered),
        liveProviderEvidence: false,
        realFaceEvidence: false,
        releaseApproved: false,
    });
}
export function shotListText(report) {
    if (report.format !== "beljour-drawn-rehearsal/1" || report.steps !== 7
        || report.labels.length !== 7 || report.liveProviderEvidence
        || report.realFaceEvidence || report.releaseApproved) {
        throw new Error("Invalid rehearsal shot-list report");
    }
    if (!Number.isFinite(report.elapsedMs) || report.elapsedMs < 0
        || report.elapsedMs > 300_000) {
        throw new Error("Invalid rehearsal duration");
    }
    for (const [index, row] of LOCAL_EDIT_SEQUENCE.entries()) {
        const label = report.labels[index];
        const prefix = `${index + 1}. ${row.title} — ${row.caption} Level `;
        if (typeof label !== "string" || !label.startsWith(prefix) || label.length > 260
            || label.includes("\n") || label.includes("\r") || label.includes("<")) {
            throw new Error("Invalid fixed local illustration caption");
        }
        const suffix = label.slice(prefix.length);
        if (!/^[1-5]\.[0-9]\/5\.0\. Measured state-transition duration: \d+(?:\.\d)? ms\.$/.test(suffix)) {
            throw new Error("Invalid fixed local timing caption");
        }
    }
    const body = [
        "BELJOUR — FULL BEAUTY STUDIO · Your best day. Still you. | drawn-only seven-edit video rehearsal",
        "Author: John Khan",
        "Output: rehearsal cue sheet, not a performance or provider report",
        "Use this section only to rehearse the on-device illustration sequence.",
        "",
        ...report.labels,
        "",
        "NEXT SCREEN: Five Pro Commands — manual review only unless the owner adapter executes.",
        "NEXT SCREEN: Seasonal catalogue — source availability required; do not invent packs.",
        "NEXT SCREEN: Mock or disabled provider — no YouCam API request in this tour.",
        "NEXT SCREEN: Before/after — compare the original and marked simulation.",
        "NEXT SCREEN: Save — labelled PNG, user-initiated only; optional local reopen.",
        "",
        `Observed local sequence time: ${report.elapsedMs.toFixed(1)} ms.`,
        "This is not the duration of a complete 1–3 minute judge video.",
        "Live YouCam: NOT VERIFIED by this observation.",
        "Pro Command production execution: NOT VERIFIED by this observation.",
        "Authorized real-face quality: NOT VERIFIED by this observation.",
        "Frozen 100,000-face release gate: NOT VERIFIED by this observation.",
        "No image, person identifier, provider key or internet service was used.",
        "",
    ].join("\n");
    if (new TextEncoder().encode(body).length > MAX_SHOTLIST_BYTES) {
        throw new Error("Rehearsal shot list exceeds the local text limit");
    }
    return body;
}
/** User click only: no automatic download and no telemetry. */
export function downloadShotList(doc, report) {
    const content = shotListText(report);
    const bytes = new TextEncoder().encode(content);
    if (bytes.byteLength > MAX_SHOTLIST_BYTES)
        throw new Error("Shot list is too large");
    const blob = new Blob([bytes], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    try {
        const link = doc.createElement("a");
        link.href = url;
        link.download = "BELJOUR-FULL-BEAUTY-STUDIO-Local-Rehearsal.txt";
        link.hidden = true;
        doc.body.append(link);
        link.click();
        link.remove();
    }
    finally {
        URL.revokeObjectURL(url);
    }
}
