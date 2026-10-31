import { FIVE_EDIT_STEPS, fiveEditSummary } from "../../layout/judge-five-edits.js";
import { judgeButton, judgeNode, judgeParagraph } from "./judge-elements.js";
export function renderJudgeFiveEditPanel(doc, host, state, options) {
    const summary = fiveEditSummary(state);
    const panel = judgeNode(doc, "section", "lg-judge-five-edit-panel");
    panel.setAttribute("aria-label", "Five-edit illustrated demonstration");
    const heading = judgeNode(doc, "h3", "lg-judge-section-title", "Five edit demonstration");
    panel.append(heading);
    const counter = judgeParagraph(doc, `${summary.appliedCount} of 5 local illustrative edits selected`, "lg-judge-five-edit-count");
    counter.setAttribute("aria-live", "polite");
    panel.append(counter);
    const list = judgeNode(doc, "ol", "lg-judge-five-edit-list");
    for (const step of FIVE_EDIT_STEPS) {
        const row = judgeNode(doc, "li", "lg-judge-five-edit-row");
        const applied = summary.rows.find((item) => item.id === step.id)?.applied ?? false;
        row.dataset.fiveEdit = applied ? "selected" : "not-selected";
        row.append(judgeNode(doc, "strong", "", step.title));
        row.append(judgeParagraph(doc, step.cue, "lg-judge-small"));
        row.append(judgeParagraph(doc, applied ? "Selected" : "Not selected", "lg-judge-small"));
        list.append(row);
    }
    panel.append(list);
    if (options.showApply) {
        const action = judgeButton(doc, "Apply five illustrated edits", "five-edit-apply", options.applyAll);
        action.disabled = !options.allowApply;
        panel.append(action);
    }
    const boundary = options.allowApply
        ? "Each illustrated edit uses the same on-device sample and adjustable 1.0–5.0 strength."
        : "Choose a valid subject and grant separate local, hair and face consent before applying.";
    panel.append(judgeParagraph(doc, boundary, "lg-judge-small"));
    panel.append(judgeParagraph(doc, "A count of five is not evidence of face tracking, identity preservation or a live YouCam result.", "lg-judge-small"));
    host.append(panel);
}
