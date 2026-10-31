import { judgeReadinessLabel } from "../../layout/judge-demo-readiness.js";
import { judgeNode, judgeNotice, judgeParagraph } from "./judge-elements.js";
export function renderJudgeReadinessPanel(doc, host, report) {
    const details = judgeNode(doc, "details", "lg-judge-readiness-panel");
    details.append(judgeNode(doc, "summary", "", "What a real judge demo still needs"));
    details.append(judgeParagraph(doc, `${report.localObserved} local checks observed; `
        + `${report.externalChecksPending} external checks remain unverified.`, "lg-judge-small"));
    const list = judgeNode(doc, "dl", "lg-judge-readiness-list");
    for (const item of report.rows) {
        const entry = judgeNode(doc, "div", "lg-judge-readiness-row");
        entry.dataset.judgeReadiness = item.status;
        const title = judgeNode(doc, "dt", "", item.title);
        const result = judgeNode(doc, "dd", "", judgeReadinessLabel(item.status));
        const evidence = judgeParagraph(doc, item.evidence, "lg-judge-small");
        const next = judgeParagraph(doc, `Next check: ${item.nextCheck}`, "lg-judge-small");
        entry.append(title, result, evidence, next);
        list.append(entry);
    }
    details.append(list);
    details.append(judgeNotice(doc, "Release decision not made", "The local demonstration alone does not pass the required live YouCam API, "
        + "real-face quality, device or licensing gates."));
    host.append(details);
}
