/** Small DOM primitives so Judge Mode uses semantic, testable native controls. */
export function judgeNode(doc, tag, className, text) {
    const element = doc.createElement(tag);
    if (className)
        element.className = className;
    if (text !== undefined)
        element.textContent = text;
    return element;
}
export function judgeParagraph(doc, text, className = "lg-judge-copy") {
    return judgeNode(doc, "p", className, text);
}
export function judgeHeading(doc, text) {
    return judgeNode(doc, "h3", "lg-judge-section-title", text);
}
export function judgeButton(doc, label, action, onClick, primary = false) {
    const button = judgeNode(doc, "button", primary ? "lg-judge-button lg-judge-primary" : "lg-judge-button", label);
    button.type = "button";
    button.dataset.judgeAction = action;
    button.addEventListener("click", onClick);
    return button;
}
export function judgeStatus(doc, text = "") {
    const status = judgeParagraph(doc, text, "lg-judge-status");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.setAttribute("aria-atomic", "true");
    return status;
}
export function judgeNotice(doc, heading, message) {
    const panel = judgeNode(doc, "aside", "lg-judge-note");
    panel.append(judgeNode(doc, "strong", "", heading), judgeParagraph(doc, message));
    return panel;
}
export function judgeChoice(doc, name, value, text, selected, callback, enabled = true) {
    const control = judgeButton(doc, text, name + "-" + value, callback);
    control.setAttribute("aria-pressed", selected ? "true" : "false");
    control.disabled = !enabled;
    return control;
}
export function judgeTick(doc, action, title, description, checked, onChange, enabled = true) {
    const row = judgeNode(doc, "label", "lg-judge-check");
    const input = judgeNode(doc, "input", "");
    input.type = "checkbox";
    input.checked = checked;
    input.disabled = !enabled;
    input.dataset.judgeAction = action;
    input.addEventListener("change", () => onChange(input.checked));
    const detail = judgeNode(doc, "span", "lg-judge-check-copy");
    detail.append(judgeNode(doc, "strong", "", title), judgeParagraph(doc, description, "lg-judge-small"));
    row.append(input, detail);
    return row;
}
export function judgePreview(doc, name) {
    const canvas = judgeNode(doc, "canvas", "lg-judge-preview");
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", name);
    canvas.width = 512;
    canvas.height = 640;
    return canvas;
}
//# sourceMappingURL=judge-elements.js.map