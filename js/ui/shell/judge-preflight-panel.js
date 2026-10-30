import { demoCapabilitySummary } from "../../mobile/judge-demo-preflight.js";
import { judgeNode, judgeNotice, judgeParagraph } from "./judge-elements.js";
const LABELS = {
    supported: "Available",
    unavailable: "Unavailable",
    "not-tested": "Not tested",
};
export function renderJudgePreflightPanel(doc, host, report) {
    const details = judgeNode(doc, "details", "lg-judge-preflight");
    details.append(judgeNode(doc, "summary", "", "Browser and live-service readiness"));
    details.append(judgeParagraph(doc, demoCapabilitySummary(report), "lg-judge-small"));
    const list = judgeNode(doc, "ul", "lg-judge-preflight-list");
    for (const capability of report.checks) {
        const row = judgeNode(doc, "li", "lg-judge-preflight-check");
        row.dataset.judgeCapability = capability.status;
        row.append(judgeNode(doc, "strong", "", `${capability.title}: ${LABELS[capability.status]}`));
        row.append(judgeParagraph(doc, capability.explanation, "lg-judge-small"));
        list.append(row);
    }
    details.append(list);
    if (!report.canRunIllustration) {
        details.append(judgeNotice(doc, "Local illustration not available", "You can read or skip the guide. Do not claim a successful render."));
    }
    details.append(judgeNotice(doc, "Separate live demo required", "This panel does not test provider units, a Render proxy, hosted availability, "
        + "commercial model rights or real-face accuracy."));
    host.append(details);
}
//# sourceMappingURL=judge-preflight-panel.js.map