import { SIMULATION_MARK } from "../../layout/judge-contract.js";
import { judgeEvidencePlainText, summarizeJudgeEvidence } from "../../layout/judge-readiness.js";
import { judgeNode, judgeNotice, judgeParagraph } from "./judge-elements.js";
export function judgeReport(state, clock) {
    const summary = summarizeJudgeEvidence(state);
    return {
        stepsCompleted: summary.done,
        stepsSkipped: summary.skipped,
        elapsed: clock.display,
        hasImage: summary.hasSelectedImage,
        imageBytesTransferred: 0,
        realYouCamCalls: 0,
        label: SIMULATION_MARK,
    };
}
export function renderJudgeReport(doc, host, state, clock) {
    const report = judgeReport(state, clock);
    const panel = judgeNode(doc, "section", "lg-judge-report");
    panel.setAttribute("aria-label", "Walkthrough rehearsal result");
    panel.append(judgeNode(doc, "h3", "lg-judge-section-title", "What this rehearsal showed"));
    const facts = judgeNode(doc, "dl", "lg-judge-report-facts");
    const entries = [
        ["Completed steps", String(report.stepsCompleted)],
        ["Skipped steps", String(report.stepsSkipped)],
        ["Measured in-app time", report.elapsed],
        ["Real YouCam calls from this guide", "0 — mocked"],
        ["Image uploaded by this guide", "No"],
        ["Permanent export marking", report.label],
    ];
    for (const [heading, value] of entries) {
        facts.append(judgeNode(doc, "dt", "", heading), judgeNode(doc, "dd", "", value));
    }
    panel.append(facts);
    if (report.stepsSkipped > 0) {
        panel.append(judgeNotice(doc, "Incomplete walkthrough", "Skipped steps were not tested. Re-open Judge Mode to rehearse every screen."));
    }
    panel.append(judgeNotice(doc, "Proof boundary", "The elapsed time is one local rehearsal, not a mobile performance claim. "
        + "Live YouCam API integration must be shown separately."));
    panel.append(judgeParagraph(doc, "No personal image, timing, consent selection or report is stored by this screen.", "lg-judge-small"));
    const pre = judgeNode(doc, "details", "lg-judge-report-details");
    pre.append(judgeNode(doc, "summary", "", "Read a plain-text step record"));
    const record = judgeNode(doc, "pre", "lg-judge-report-text", judgeEvidencePlainText(state));
    pre.append(record);
    panel.append(pre);
    host.append(panel);
}
//# sourceMappingURL=judge-report.js.map