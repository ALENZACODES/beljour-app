/** A completed navigation step is not necessarily observed feature evidence. */
import { JUDGE_STEPS } from "./judge-contract.js";
const OBSERVATIONS = {
    source: {
        milestone: "source-selected",
        ready: (state) => state.source !== null,
        explanation: "A drawn illustration or locally chosen image was opened.",
    },
    consent: {
        milestone: "local-consent",
        ready: (state) => state.permissions.local,
        explanation: "The separate local illustration checkbox was used.",
    },
    hair: {
        milestone: "hair-applied",
        ready: (state) => state.permissions.hair && state.hair !== "none",
        explanation: "An illustrative hair overlay was selected.",
    },
    face: {
        milestone: "face-applied",
        ready: (state) => state.permissions.face && state.face !== "none",
        explanation: "An illustrative face overlay was selected.",
    },
    tryon: {
        milestone: "mock-opened",
        ready: (state) => state.permissions.mock && state.mock,
        explanation: "A mock try-on preview was opened without an API call.",
    },
    compare: {
        milestone: "comparison-moved",
        ready: (state) => state.source !== null,
        explanation: "The comparison divider was moved on an actual preview.",
    },
    export: {
        milestone: "download-requested",
        ready: (state) => state.source !== null,
        explanation: "The browser download action was requested. File arrival is not verified.",
    },
    plans: {
        milestone: "plans-visited",
        ready: () => true,
        explanation: "The illustrative prices were shown without billing.",
    },
};
const UNOBSERVED_REASONS = {
    source: "No selected illustration was observed.",
    consent: "No local permission was observed.",
    hair: "No hair overlay was observed with permission.",
    face: "No face overlay was observed with permission.",
    tryon: "No mock try-on was observed with permission.",
    compare: "No comparison divider movement was observed.",
    export: "No browser download request was observed.",
    plans: "The demo pricing panel has not been visited.",
};
function statusFor(state, milestone, ready, id, observed) {
    if (state.skipped.includes(id))
        return "skipped";
    if (ready && observed.has(milestone))
        return "observed";
    if (state.complete.includes(id))
        return "visited";
    return "not-observed";
}
/** Policy separates mock workflow observation from real provider or device evidence. */
export function evaluateJudgeWitness(state, snapshot) {
    const observed = new Set(snapshot.entries.map((entry) => entry.code));
    const rows = JUDGE_STEPS.map((step) => {
        const spec = OBSERVATIONS[step.id];
        const status = statusFor(state, spec.milestone, spec.ready(state), step.id, observed);
        let reason = UNOBSERVED_REASONS[step.id];
        if (status === "observed")
            reason = spec.explanation;
        if (status === "visited")
            reason = "Screen visited; required action was not observed.";
        if (status === "skipped")
            reason = "Step skipped; not counted as evidence.";
        return {
            id: step.id,
            title: step.short,
            status,
            observation: spec.milestone,
            reason,
        };
    });
    const count = (status) => rows.filter((row) => row.status === status).length;
    const observedCount = count("observed");
    return {
        rows,
        observed: observedCount,
        visited: count("visited"),
        skipped: count("skipped"),
        notObserved: count("not-observed"),
        allDemoActionsObserved: observedCount === JUDGE_STEPS.length,
        canProveLiveProvider: false,
        canProveImageDownload: false,
        evidenceVersion: "beljour-judge-rehearsal/1",
    };
}
export function judgeWitnessLabel(status) {
    switch (status) {
        case "observed": return "Observed locally";
        case "visited": return "Screen visited only";
        case "skipped": return "Skipped";
        case "not-observed": return "Not observed";
    }
}
/** Never upgrade an incomplete workflow to a proof by merely visiting the final page. */
export function judgeWitnessHeadline(summary) {
    if (summary.allDemoActionsObserved) {
        return "All local demonstration actions were observed; live APIs are not verified.";
    }
    if (summary.skipped)
        return "Rehearsal incomplete: at least one step was skipped.";
    if (summary.visited)
        return "Rehearsal incomplete: a required action was not observed.";
    return "Rehearsal is in progress; no live-provider result is asserted.";
}
//# sourceMappingURL=judge-proof-policy.js.map