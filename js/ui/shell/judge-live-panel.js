/** Optional real-product transfer and manual operator checklist.
 * Every link is a fixed public entry point; no demo photo follows it.
 */
import { REAL_DEMO_CHECKS, } from "../../layout/judge-live-checks.js";
import { makeRealProductVisitReport, prepareRealProductDownload, requestRealProductDownload, } from "../../layout/judge-live-report.js";
import { realDemoRoute, realDemoRoutes } from "../../layout/judge-live-routes.js";
import { realDemoCueHeadline, realDemoTimeline } from "../../layout/judge-live-runbook.js";
import { judgeButton, judgeNode, judgeNotice, judgeParagraph, judgeStatus } from "./judge-elements.js";
const STATUS_LABELS = {
    "not-run": "Not checked",
    "operator-observed": "I observed this manually",
    blocked: "Blocked or unavailable",
};
function option(doc, status) {
    const element = judgeNode(doc, "option", "", STATUS_LABELS[status]);
    element.value = status;
    return element;
}
function checkRow(doc, id, checks, onChange) {
    const template = REAL_DEMO_CHECKS.find((entry) => entry.id === id);
    if (!template)
        throw new RangeError("Unknown manual check");
    const node = judgeNode(doc, "li", "lg-judge-live-check");
    const label = judgeNode(doc, "label", "lg-judge-live-label");
    const heading = judgeNode(doc, "strong", "", template.title);
    const select = judgeNode(doc, "select", "lg-judge-live-select");
    select.dataset.judgeAction = `live-check-${id}`;
    select.setAttribute("aria-label", `Operator-reported status: ${template.title}`);
    select.append(option(doc, "not-run"), option(doc, "operator-observed"), option(doc, "blocked"));
    select.value = checks.status(id);
    select.addEventListener("change", () => {
        const next = select.value;
        checks.set(id, next);
        node.dataset.liveStatus = checks.status(id);
        onChange();
    });
    label.append(heading, select);
    const question = judgeParagraph(doc, template.question, "lg-judge-small");
    const caveat = judgeParagraph(doc, template.limitation, "lg-judge-small");
    node.dataset.liveStatus = select.value;
    node.append(label, question, caveat);
    return node;
}
function manualPanel(doc, checks, options) {
    const section = judgeNode(doc, "section", "lg-judge-live-manual");
    section.setAttribute("aria-label", "Optional real-product operator checklist");
    section.append(judgeNode(doc, "h4", "", "Operator checklist — not a certification"));
    section.append(judgeParagraph(doc, "Use these controls only after personally visiting the real application. "
        + "Marks are in memory and do not run a provider call or approve a release.", "lg-judge-small"));
    const summary = judgeStatus(doc);
    const update = () => {
        const value = checks.snapshot();
        summary.textContent = `${value.observed} reported observations, `
            + `${value.blocked} blocked, ${value.notRun} not checked. None are externally certified.`;
    };
    const list = judgeNode(doc, "ol", "lg-judge-live-checks");
    for (const check of REAL_DEMO_CHECKS)
        list.append(checkRow(doc, check.id, checks, update));
    const actions = judgeNode(doc, "div", "lg-judge-live-actions");
    const downloadStatus = judgeStatus(doc, "Nothing is saved until the button is pressed.");
    const save = judgeButton(doc, "Download photo-free operator checklist", "live-report", () => {
        save.disabled = true;
        try {
            const report = makeRealProductVisitReport(checks.snapshot());
            const file = prepareRealProductDownload(report);
            requestRealProductDownload(doc, file, options.urls ?? URL, options.defer);
            downloadStatus.textContent = "Operator checklist download requested; no photo or provider response included.";
        }
        catch {
            downloadStatus.textContent = "The operator checklist could not be downloaded.";
        }
        finally {
            save.disabled = false;
        }
    });
    const clear = judgeButton(doc, "Clear manual marks", "live-reset", () => {
        checks.reset();
        for (const select of list.querySelectorAll("select")) {
            select.value = "not-run";
        }
        for (const item of list.querySelectorAll("li")) {
            item.dataset.liveStatus = "not-run";
        }
        downloadStatus.textContent = "Manual marks cleared. No saved data was changed.";
        update();
    });
    actions.append(save, clear);
    update();
    section.append(summary, list, actions, downloadStatus);
    return section;
}
/** No navigation occurs except by activating one of these real public links. */
export function renderJudgeLivePanel(doc, host, checks, options = {}) {
    const section = judgeNode(doc, "section", "lg-judge-live-panel");
    section.setAttribute("aria-label", "Separate real application routes");
    section.append(judgeNode(doc, "h3", "lg-judge-section-title", "Continue in the real application"));
    section.append(judgeNotice(doc, "Leave this illustrative rehearsal", "These links open the existing public pages. No sample, uploaded photo, consent, "
        + "provider result or checklist status is transferred. Live availability is not verified here."));
    const details = judgeNode(doc, "details", "lg-judge-live-details");
    details.append(judgeNode(doc, "summary", "", "Open separate real-product checklist (optional)"));
    const timeline = realDemoTimeline(checks.snapshot());
    const cues = judgeNode(doc, "details", "lg-judge-live-timeline");
    cues.append(judgeNode(doc, "summary", "", "Read the optional three-minute real-product talk track"));
    cues.append(judgeParagraph(doc, realDemoCueHeadline(timeline), "lg-judge-small"));
    const ordered = judgeNode(doc, "ol", "lg-judge-live-cues");
    for (const cue of timeline.rows) {
        const item = judgeNode(doc, "li", "lg-judge-live-cue");
        item.append(judgeNode(doc, "strong", "", `${cue.number}. ${cue.route} · by ${cue.deadlineSeconds}s (suggested)`));
        item.append(judgeParagraph(doc, cue.action, "lg-judge-small"));
        item.append(judgeParagraph(doc, cue.stopCondition, "lg-judge-small"));
        ordered.append(item);
    }
    cues.append(ordered);
    details.append(cues);
    const routes = judgeNode(doc, "ul", "lg-judge-live-routes");
    for (const route of realDemoRoutes()) {
        const item = judgeNode(doc, "li", "lg-judge-live-route");
        const link = judgeNode(doc, "a", "lg-judge-live-link", route.title);
        link.href = route.href;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.dataset.judgeRoute = route.id;
        const description = judgeParagraph(doc, route.purpose, "lg-judge-small");
        const prerequisite = judgeParagraph(doc, `Before: ${route.prerequisite}`, "lg-judge-small");
        const confirm = judgeParagraph(doc, `Confirm: ${route.confirmation}`, "lg-judge-small");
        item.append(link, description, prerequisite, confirm);
        if (route.boundary === "requires-consent") {
            item.append(judgeNotice(doc, "Fresh provider consent required", "This Judge Mode's local approval never authorizes a real YouCam request."));
        }
        routes.append(item);
    }
    details.append(routes);
    details.append(manualPanel(doc, checks, options));
    details.append(judgeParagraph(doc, "An operator's own observations are not equivalent to independent security checks, "
        + "human quality votes, licensed assets or a 100,000-face release gate.", "lg-judge-small"));
    section.append(details);
    host.append(section);
}
export function linkForRealDemo(id) {
    return realDemoRoute(id).href;
}
//# sourceMappingURL=judge-live-panel.js.map