/** Review-only checklist. No synthetic observation can certify release quality. */
import { TOUR_STEPS } from "./contract.js";
import { commandCoverage } from "./pro-commands.js";
/** Explicitly distinguish viewing a route from exercising its controls. */
export function reviewContinuousDemo(state, evidence, commands, seasonal, preview) {
    const rows = [];
    for (const stage of TOUR_STEPS) {
        const seen = state.completed.includes(stage.id);
        const skipped = state.skipped.includes(stage.id);
        rows.push({
            id: stage.id,
            title: stage.title,
            status: seen && !skipped ? "observed" : "missing",
            explanation: skipped ? "Skipped: no execution evidence"
                : seen ? "Client action observed; functional quality not scored"
                    : "Not completed",
        });
    }
    const commandState = commandCoverage(commands);
    rows.push({
        id: "pro-owner",
        title: "Production Pro Command adapter",
        status: commandState.full ? "observed" : "unverified",
        explanation: commandState.full
            ? "Public catalogue reports all five available; execution not evaluated"
            : "Owner command availability or execution is incomplete",
    });
    rows.push({
        id: "seasonal-api",
        title: "Public seasonal catalogue",
        status: seasonal.status === "ready" ? "observed" : "unverified",
        explanation: seasonal.status === "ready"
            ? "Metadata returned from the public port; effects not executed"
            : "Seasonal API not confirmed",
    });
    rows.push({
        id: "preview-timing",
        title: "Local preview timing",
        status: preview.count ? "observed" : "unverified",
        explanation: preview.count
            ? `Synthetic Canvas median ${preview.medianMs}ms / p95 ${preview.p95Ms}ms; not phone latency`
            : "No local preview timing observation",
    });
    rows.push({
        id: "youcam-live", title: "Live YouCam request", status: "unverified",
        explanation: "Never invoked by this mock-only demonstration",
    });
    rows.push({
        id: "real-face", title: "Real-face acceptance", status: "unverified",
        explanation: "External authorized face sets and human scores are not part of this tour",
    });
    rows.push({
        id: "release", title: "Frozen 100,000-face release gate", status: "unverified",
        explanation: "Requires the separate frozen runner's verified result",
    });
    return {
        kind: "beljour-tour-review/1",
        rows,
        observationalCount: Math.min(evidence.completed, TOUR_STEPS.length),
        verifiedProvider: false,
        verifiedRealFace: false,
        releaseApproved: false,
    };
}
/** Safe, bounded fixed vocabulary: never serializes a person, image or user input. */
export function serializeContinuousReview(review) {
    if (review.kind !== "beljour-tour-review/1" || review.rows.length !== TOUR_STEPS.length + 6) {
        throw new RangeError("Unknown review format");
    }
    if (review.verifiedProvider || review.verifiedRealFace || review.releaseApproved) {
        throw new Error("The local walkthrough cannot authorize production release");
    }
    const expected = [...TOUR_STEPS.map((stage) => stage.id),
        "pro-owner", "seasonal-api", "preview-timing", "youcam-live", "real-face", "release"];
    for (const [index, row] of review.rows.entries()) {
        if (row.id !== expected[index])
            throw new RangeError("Review step mismatch");
        if (row.status !== "observed" && row.status !== "missing" && row.status !== "unverified") {
            throw new RangeError("Invalid observational status");
        }
        if (row.title.length > 100 || row.explanation.length > 180) {
            throw new RangeError("Review contains unchecked text");
        }
    }
    const lines = [
        "BELJOUR — FULL BEAUTY STUDIO · Your best day. Still you. — Synthetic Judge Mode checklist",
        "Production provider: UNVERIFIED",
        "Real-face verification: UNVERIFIED",
        "Release authorization: NOT GRANTED",
        ...review.rows.map((row) => `${row.id} | ${row.status}`),
    ];
    return lines.join("\n");
}
//# sourceMappingURL=release-review.js.map