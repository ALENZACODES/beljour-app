/** In-place keyboard guidance with native controls and no intrusive modal. */
import { judgeNode, judgeParagraph } from "./judge-elements.js";
const HELP_ITEMS = [
    "Tab and Shift+Tab move between native controls in document order.",
    "Arrow keys adjust the selected strength or comparison slider in its own steps.",
    "Enter or Space activates the focused button, checkbox or subject choice.",
    "F1 shows or hides these instructions when focus is not inside a form field.",
    "Escape closes this help first; a second Escape exits the local tour.",
    "The named Exit button is always available. This tour never requests a provider task.",
];
function helpButton(doc, label, action, callback) {
    const button = judgeNode(doc, "button", "lg-cont-button", label);
    button.type = "button";
    button.dataset.tourAction = action;
    button.addEventListener("click", callback);
    return button;
}
export function renderContinuousKeyboardPanel(doc, display, actions) {
    const section = judgeNode(doc, "section", "lg-cont-keyboard");
    section.setAttribute("aria-label", "Keyboard and accessibility guidance");
    const toggle = helpButton(doc, display.open ? "Hide keyboard guidance" : "Keyboard guidance", "keyboard-help", actions.toggleHelp);
    toggle.setAttribute("aria-controls", "lg-cont-keyboard-instructions");
    toggle.setAttribute("aria-expanded", String(display.open));
    section.append(toggle);
    const skip = helpButton(doc, "Skip to current controls", "keyboard-jump", actions.focusStep);
    section.append(skip);
    if (!display.open) {
        const controlled = judgeNode(doc, "div", "lg-cont-keyboard-instructions");
        controlled.id = "lg-cont-keyboard-instructions";
        controlled.hidden = true;
        section.append(controlled);
        return section;
    }
    const instructions = judgeNode(doc, "div", "lg-cont-keyboard-instructions");
    instructions.id = "lg-cont-keyboard-instructions";
    instructions.setAttribute("role", "group");
    instructions.setAttribute("aria-label", "Keyboard instructions and optional audit");
    const heading = judgeNode(doc, "h3", "lg-cont-keyboard-heading", "Using this demonstration without a pointer");
    const list = judgeNode(doc, "ol", "lg-cont-keyboard-list");
    for (const instruction of HELP_ITEMS) {
        list.append(judgeNode(doc, "li", "", instruction));
    }
    instructions.append(heading, list);
    instructions.append(judgeParagraph(doc, "The local control check inspects the current tour screen. It is not a "
        + "screen-reader certification or real-device accessibility pass.", "lg-cont-caption"));
    const actionsRow = judgeNode(doc, "div", "lg-cont-keyboard-actions");
    actionsRow.append(helpButton(doc, "Check current controls", "keyboard-audit", actions.runCheck));
    const exportButton = helpButton(doc, "Download check summary", "keyboard-audit-download", actions.saveCheck);
    exportButton.disabled = !display.hasReport;
    actionsRow.append(exportButton);
    instructions.append(actionsRow);
    const result = judgeParagraph(doc, display.auditStatus, "lg-cont-keyboard-result");
    result.setAttribute("role", "status");
    result.setAttribute("aria-live", "polite");
    result.setAttribute("aria-atomic", "true");
    instructions.append(result);
    section.append(instructions);
    return section;
}
