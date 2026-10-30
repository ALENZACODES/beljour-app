import { judgeDeviceSummaryText } from "../../mobile/judge-device-audit.js";
import { judgeNode, judgeParagraph } from "./judge-elements.js";
export function renderJudgeDevicePanel(doc, host, report) {
    const section = judgeNode(doc, "section", "lg-judge-device");
    section.setAttribute("aria-label", "This browser capability check");
    section.append(judgeNode(doc, "h4", "", "This browser — local capability check"));
    section.append(judgeParagraph(doc, judgeDeviceSummaryText(report), "lg-judge-small"));
    const list = judgeNode(doc, "dl", "lg-judge-device-list");
    for (const row of report.rows) {
        const label = judgeNode(doc, "dt", "", row.label);
        const value = judgeNode(doc, "dd", "", `${row.result}. ${row.detail}`);
        value.dataset.judgeCapability = row.result;
        list.append(label, value);
    }
    section.append(list);
    section.append(judgeParagraph(doc, "No diagnostic data is uploaded. A supported browser API does not prove a fast or accurate result.", "lg-judge-small"));
    host.append(section);
}
//# sourceMappingURL=judge-device-panel.js.map