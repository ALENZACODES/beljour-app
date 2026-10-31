/** Sourced readiness checks. Never convert a local rehearsal into release proof. */
import { TOUR_EFFECTS, TOUR_STEPS } from "./contract.js";
import { operatorGaps } from "./operator-script.js";
function make(id, title, category, observed, source, note) {
    return Object.freeze({ id, title, category, observed, source, note });
}
export function operatorPreflight(demo, operator, preview) {
    const items = [];
    const validDemoSource = demo.sourceLoaded && demo.sourceRevision > 0
        && demo.faceCount > 0 && demo.selectedId !== null;
    items.push(make("drawn-source", "Drawn example and subject selection", "client", validDemoSource, validDemoSource ? "drawn" : "missing", "Known authored subject positions; not actual face detection evidence"));
    const consent = demo.permissions.local && demo.permissions.hair && demo.permissions.face;
    items.push(make("local-consent", "Local illustrative permissions", "client", consent, consent ? "operator" : "missing", "Rehearsal-only selections; not transferred to a real session"));
    items.push(make("identity-request", "Identity-lock selection", "client", demo.identityLock, demo.identityLock ? "operator" : "missing", "UI requested lock; owner engine quality not validated"));
    for (const effect of TOUR_EFFECTS) {
        const used = demo.applied[effect] && validDemoSource && consent && demo.identityLock;
        items.push(make(`local-${effect}`, `${effect} illustration`, "client", used, used ? "drawn" : "missing", "Synthetic placement only; no real image-quality result"));
    }
    const allCommands = new Set(demo.proCommandsReviewed);
    const proReviewed = allCommands.size === 5;
    items.push(make("commands", "Five Pro Command names reviewed", "client", proReviewed, proReviewed ? "operator" : "missing", "Names reviewed only; owner execution remains separate"));
    const mock = demo.mockResult === "mock-applied" || demo.mockResult === "provider-disabled";
    items.push(make("tryon", "Mock or disabled provider path", "client", mock, mock ? "mock" : "missing", "Zero live provider calls and zero units in this tour"));
    const compared = demo.comparePercent !== 50 && validDemoSource;
    items.push(make("compare", "Before-and-after action", "client", compared, compared ? "drawn" : "missing", "Synthetic comparison is not real-photo evidence"));
    items.push(make("export", "Browser export request", "client", demo.requestedDownload, demo.requestedDownload ? "operator" : "missing", "Request only; browser save and final image are not independently verified"));
    const gaps = operatorGaps(operator);
    items.push(make("real-pages", "Seven real application screens", "operations", gaps.completeHumanChecklist, gaps.completeHumanChecklist ? "operator" : "missing", "Operator checkmarks are self-reported, never independently validated"));
    items.push(make("phone-budget", "Preview timing on physical phone", "operations", false, "missing", preview.count
        ? "Local Canvas timing observed; physical phone performance unmeasured"
        : "No local timing measured; physical phone performance unmeasured"));
    items.push(make("youcam-live", "YouCam API end-to-end", "provider", false, "missing", "Requires separate authorized provider logs and explicit image consent"));
    items.push(make("realface", "Independent real-face acceptance", "quality", false, "missing", "Requires authorized external test faces and released quality report"));
    items.push(make("frozen", "Frozen 100,000-face release pass", "quality", false, "missing", "Must come from the separately verified frozen runner"));
    const observedStages = TOUR_STEPS.every((step) => step.id === "save"
        || (demo.completed.includes(step.id) && !demo.skipped.includes(step.id)));
    const clientChecks = items.filter((item) => item.category === "client");
    const syntheticRehearsalComplete = observedStages && clientChecks.every((item) => item.observed);
    return Object.freeze({
        format: "beljour-demo-preflight/1",
        rows: Object.freeze(items),
        syntheticRehearsalComplete,
        realProductManuallyReviewed: gaps.completeHumanChecklist,
        previewReferenceExceeded: preview.budgetExceeded,
        liveProviderVerified: false,
        realFaceGatePassed: false,
        frozen100000Passed: false,
        releaseReady: false,
    });
}
export function preflightCaption(report) {
    const checks = report.rows.filter((row) => row.observed).length;
    const missing = report.rows.length - checks;
    return `${checks} local/manual checks recorded; ${missing} still missing or unverified. `
        + "This rehearsal never approves live processing, real faces or public release.";
}
