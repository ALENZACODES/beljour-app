/** Honest judge-facing walkthrough notes and local coverage; no hidden provider route. */
import { judgeDeviceAudit } from "../../mobile/judge-device-audit.js";
import { JUDGE_STEPS } from "../../layout/judge-contract.js";
import { safeEvidenceNote, summarizeJudgeEvidence } from "../../layout/judge-readiness.js";
import { renderJudgeDevicePanel } from "./judge-device-panel.js";
import { judgeButton, judgeNode, judgeNotice, judgeParagraph } from "./judge-elements.js";
export const JUDGE_SCRIPT = [
    "Source: select the drawn sample, or explicitly choose a local photo.",
    "Consent: enable each local illustrative action separately, with a visible explanation.",
    "Hair: apply one simple overlay to the selected image.",
    "Face: apply one decorative colour detail without making a skin-health claim.",
    "Mock: show the labelled stand-in for a provider try-on. There is no API request.",
    "Compare: move the keyboard-operated slider to see the starting image.",
    "Export: choose size and format, then save a visibly labelled file locally.",
    "Plans: read demo prices, then exit without payment or a trial.",
];
export const JUDGE_EVIDENCE_LIMITS = [
    "The generated drawing is a placeholder, not a person or a measured result.",
    "All illustration edits are local and deliberately simple.",
    "The mock try-on is not evidence of YouCam API connectivity or performance.",
    "The real provider integration must be shown separately using the existing application route.",
    "No 10,000-face fairness, 100,000-face release or mobile speed claim is made here.",
    "An in-app clock is a single user's rehearsal time, not a performance benchmark.",
];
export function judgeGuideTitle(state) {
    const index = JUDGE_STEPS.findIndex((step) => step.id === state.step);
    if (index < 0)
        return "Walkthrough guide";
    return `What to show: ${JUDGE_STEPS[index].short}`;
}
export function renderJudgeGuide(doc, host, state, actions) {
    const area = judgeNode(doc, "section", "lg-judge-guide");
    area.setAttribute("aria-label", "Walkthrough notes and evidence");
    const toggle = judgeButton(doc, actions.isOpen ? "Hide judge notes" : "Show judge notes", "guide", actions.toggle);
    toggle.setAttribute("aria-expanded", actions.isOpen ? "true" : "false");
    toggle.setAttribute("aria-controls", "lg-judge-guide-content");
    area.append(toggle);
    if (!actions.isOpen) {
        host.replaceChildren(area);
        return;
    }
    const contents = judgeNode(doc, "div", "lg-judge-guide-content");
    contents.id = "lg-judge-guide-content";
    contents.append(judgeNode(doc, "h3", "lg-judge-section-title", judgeGuideTitle(state)));
    const position = JUDGE_STEPS.findIndex((step) => step.id === state.step);
    contents.append(judgeParagraph(doc, JUDGE_SCRIPT[position] ?? "No script for this step."));
    const summary = summarizeJudgeEvidence(state);
    contents.append(judgeParagraph(doc, `${summary.done} completed, ${summary.skipped} skipped, ${summary.total} total steps.`, "lg-judge-small"));
    const list = judgeNode(doc, "ol", "lg-judge-evidence");
    for (const item of summary.rows) {
        const row = judgeNode(doc, "li", "lg-judge-evidence-row");
        row.dataset.judgeEvidence = item.status;
        const label = judgeNode(doc, "strong", "", `${item.label}: ${item.status}`);
        row.append(label, judgeParagraph(doc, item.note, "lg-judge-small"));
        list.append(row);
    }
    contents.append(list);
    contents.append(judgeNotice(doc, "What this proves", safeEvidenceNote(state)));
    const limits = judgeNode(doc, "ul", "lg-judge-limits");
    for (const text of JUDGE_EVIDENCE_LIMITS)
        limits.append(judgeNode(doc, "li", "", text));
    contents.append(limits);
    contents.append(judgeParagraph(doc, "To demonstrate actual supported processing, exit this guide and use the application's real tool screens.", "lg-judge-small"));
    const link = judgeNode(doc, "a", "lg-judge-inline-link", "Open main application in a new page");
    link.href = "index.html#/photo";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    contents.append(link);
    const capabilities = judgeDeviceAudit(doc, doc.defaultView ?? null);
    renderJudgeDevicePanel(doc, contents, capabilities);
    area.append(contents);
    host.replaceChildren(area);
}
