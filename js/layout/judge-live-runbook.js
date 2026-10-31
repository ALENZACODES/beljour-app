import { realDemoRoutes } from "./judge-live-routes.js";
export const REAL_DEMO_CUES = [
    { route: "photo", targetSeconds: 15,
        action: "Open the real product with an authorized source.",
        explanation: "This is a new source selection, not a transfer from the drawn Judge Mode sample.",
        stopCondition: "Stop if visit consent or source processing fails." },
    { route: "studio", targetSeconds: 25,
        action: "Show one supported local preview, Undo and the preserved original.",
        explanation: "Use a real supported effect and report any missing-region refusal.",
        stopCondition: "Do not substitute the mock Canvas overlay for actual Studio output." },
    { route: "hair", targetSeconds: 35,
        action: "Explain fresh hair consent, quote and any returned live task status.",
        explanation: "The optional cloud action must use only authorized free units.",
        stopCondition: "If provider units, consent or output are unavailable, report the refusal." },
    { route: "makeup", targetSeconds: 35,
        action: "Demonstrate separate makeup consent and the permitted try-on path.",
        explanation: "The result must come from the real provider flow if claiming API integration.",
        stopCondition: "Never present the prior illustrated mock as a successful YouCam task." },
    { route: "shade", targetSeconds: 30,
        action: "Show how the app links a current shade reading to a supported product choice.",
        explanation: "Distinguish measured catalogue entries from local examples and estimates.",
        stopCondition: "A product match without evidence must stay labelled as an estimate." },
    { route: "commerce", targetSeconds: 25,
        action: "Add an available example product to the non-billable demonstration bag.",
        explanation: "This is commerce value evidence, not payment completion or actual inventory.",
        stopCondition: "If the commerce page is missing, do not claim a functioning bag." },
    { route: "trust", targetSeconds: 15,
        action: "Show the actual privacy and deletion controls, then close.",
        explanation: "Photo retention, security, licences and release tests need separate evidence.",
        stopCondition: "Never claim the 100,000-face gate or a legal privacy review from this path." },
];
export function validateRealDemoCuePlan() {
    const problems = [];
    const known = realDemoRoutes().map((item) => item.id);
    const seen = new Set();
    let seconds = 0;
    for (const cue of REAL_DEMO_CUES) {
        if (seen.has(cue.route))
            problems.push(`Repeated cue for ${cue.route}`);
        seen.add(cue.route);
        if (!known.includes(cue.route))
            problems.push(`Unknown destination ${cue.route}`);
        if (!Number.isInteger(cue.targetSeconds) || cue.targetSeconds < 5) {
            problems.push(`Invalid time for ${cue.route}`);
        }
        if (!cue.action || !cue.explanation || !cue.stopCondition) {
            problems.push(`Incomplete instructions for ${cue.route}`);
        }
        seconds += cue.targetSeconds;
    }
    if (seconds !== 180)
        problems.push("Real product talk track must total 180 seconds");
    if (seen.size !== known.length)
        problems.push("Not every public page has a cue");
    return problems;
}
export function realDemoTimeline(snapshot) {
    if (validateRealDemoCuePlan().length)
        throw new TypeError("Real-product cue plan is inconsistent");
    let seconds = 0;
    const rows = REAL_DEMO_CUES.map((cue, index) => {
        seconds += cue.targetSeconds;
        const associated = snapshot.rows.filter((check) => check.route === cue.route);
        const statuses = new Set(associated.map((entry) => entry.status));
        const operatorStatus = statuses.size === 1
            ? [...statuses][0] ?? "not-run" : "mixed";
        return {
            ...cue,
            number: index + 1,
            deadlineSeconds: seconds,
            operatorStatus,
        };
    });
    return {
        rows,
        suggestedSeconds: 180,
        deliveryStatus: "planning-only",
        providerLatencyIncluded: false,
        liveApiVerified: false,
        fullFlowObserved: false,
    };
}
export function realDemoCueHeadline(timeline) {
    const unavailable = timeline.rows.filter((row) => row.operatorStatus === "blocked" || row.operatorStatus === "mixed").length;
    return `Suggested three-minute path across ${timeline.rows.length} real public pages; `
        + `${unavailable} stages have reported blockers or mixed observations. `
        + "Provider wait time and real-phone conditions are not measured.";
}
