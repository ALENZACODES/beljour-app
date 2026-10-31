import { judgeWitnessHeadline, judgeWitnessLabel } from "../../layout/judge-proof-policy.js";
import { makeJudgeSafeReport, prepareJudgeReportDownload, requestJudgeReportDownload, } from "../../layout/judge-proof-report.js";
import { judgeButton, judgeNode, judgeNotice, judgeParagraph, judgeStatus } from "./judge-elements.js";
export function renderJudgeProofPanel(doc, host, witness, evidence, runbook, actions = {}) {
    const panel = judgeNode(doc, "section", "lg-judge-proof-panel");
    panel.setAttribute("aria-label", "Local walkthrough proof limits");
    panel.append(judgeNode(doc, "h3", "lg-judge-section-title", "Rehearsal evidence checklist"));
    panel.append(judgeParagraph(doc, judgeWitnessHeadline(witness)));
    const progress = judgeNode(doc, "progress", "lg-judge-proof-progress");
    progress.max = witness.rows.length;
    progress.value = witness.observed;
    progress.setAttribute("aria-label", "Observed local demonstration actions");
    panel.append(progress);
    panel.append(judgeParagraph(doc, `${witness.observed} of ${witness.rows.length} local actions observed; `
        + `${witness.visited} visited without action; ${witness.skipped} skipped.`, "lg-judge-small"));
    const list = judgeNode(doc, "ul", "lg-judge-proof-list");
    for (const row of witness.rows) {
        const item = judgeNode(doc, "li", "lg-judge-proof-row");
        item.dataset.judgeProof = row.status;
        item.append(judgeNode(doc, "strong", "", `${row.title}: ${judgeWitnessLabel(row.status)}`));
        item.append(judgeParagraph(doc, row.reason, "lg-judge-small"));
        list.append(item);
    }
    panel.append(list);
    const note = evidence.requestMade
        ? "A browser download was requested. Receipt and file integrity have not been checked."
        : "No labelled image download was requested during this rehearsal.";
    panel.append(judgeNotice(doc, "Export evidence", note));
    panel.append(judgeNotice(doc, "Not a provider test", "Zero YouCam API requests are made by this guided demonstration. "
        + "The real adapter, external faces and release gates must be verified separately."));
    const status = judgeStatus(doc, "The report remains on this device unless you choose to save it.");
    const download = judgeButton(doc, "Download photo-free rehearsal note", "proof-download", () => {
        download.disabled = true;
        try {
            const report = makeJudgeSafeReport(witness, evidence, runbook);
            const file = prepareJudgeReportDownload(report);
            requestJudgeReportDownload(doc, file, actions.urls ?? URL, actions.defer);
            status.textContent = "Text report download requested. No photograph was included.";
        }
        catch {
            status.textContent = "Text report could not be downloaded. The rehearsal is still in memory.";
        }
        finally {
            download.disabled = false;
        }
    });
    panel.append(download, status);
    panel.append(judgeParagraph(doc, "A completed screen is not automatically evidence that its action ran. "
        + "This checklist excludes any unobserved or skipped action from the observed count.", "lg-judge-small"));
    host.append(panel);
}
