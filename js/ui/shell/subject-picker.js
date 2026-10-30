import { judgeNode, judgeParagraph } from "./judge-elements.js";
function faceName(box, index, current) {
    const label = box.origin === "drawn" ? "Drawn person" : "Detected face";
    return `${label} ${index + 1}${current ? ", selected" : ", unchanged by current edit"}`;
}
export function renderSubjectButtons(doc, snapshot, actions) {
    const overlay = judgeNode(doc, "div", "lg-subject-overlay");
    overlay.setAttribute("role", "group");
    overlay.setAttribute("aria-label", "Choose which face receives illustrative edits");
    for (const [index, box] of snapshot.boxes.entries()) {
        const current = box.id === snapshot.selectedId;
        const button = judgeNode(doc, "button", "lg-subject-box", String(index + 1));
        button.type = "button";
        button.dataset.subjectId = box.id;
        button.dataset.subjectSelected = current ? "true" : "false";
        button.dataset.subjectOrigin = box.origin;
        button.setAttribute("aria-label", faceName(box, index, current));
        button.setAttribute("aria-pressed", String(current));
        button.style.left = `${box.x * 100}%`;
        button.style.top = `${box.y * 100}%`;
        button.style.width = `${box.width * 100}%`;
        button.style.height = `${box.height * 100}%`;
        button.addEventListener("click", () => actions.choose(box.id));
        overlay.append(button);
    }
    return overlay;
}
export function attachSubjectPicker(doc, host, snapshot, actions) {
    const preview = host.querySelector(".lg-judge-visual");
    if (preview && snapshot.boxes.length)
        preview.append(renderSubjectButtons(doc, snapshot, actions));
    const panel = judgeNode(doc, "section", "lg-subject-summary");
    panel.setAttribute("aria-label", "Multi-person photo selection");
    panel.append(judgeNode(doc, "h3", "lg-judge-section-title", "Which person receives the edit?"));
    if (!snapshot.boxes.length) {
        panel.append(judgeParagraph(doc, "No face boxes supplied. Detection from uploaded photos is pending Workstream A's public subject API. "
            + "Do not assume a main face. Existing fixed-position edits remain illustrative only."));
        host.append(panel);
        return;
    }
    panel.append(judgeParagraph(doc, `${snapshot.boxes.length} ${snapshot.source === "drawn" ? "drawn" : "detected"} face boxes. `
        + "Main subject is selected by default. Select another face to change the target."));
    const list = judgeNode(doc, "div", "lg-subject-choices");
    for (const [index, box] of snapshot.boxes.entries()) {
        const current = box.id === snapshot.selectedId;
        const choice = judgeNode(doc, "button", "lg-judge-button", faceName(box, index, current));
        choice.type = "button";
        choice.dataset.subjectChoice = box.id;
        choice.setAttribute("aria-pressed", String(current));
        choice.addEventListener("click", () => actions.choose(box.id));
        list.append(choice);
    }
    panel.append(list);
    panel.append(judgeParagraph(doc, "Bystanders are not edited. Boxes are visual UI guides and never prove identity. "
        + "No age, gender, ethnicity or attractiveness is inferred.", "lg-judge-small"));
    host.append(panel);
}
//# sourceMappingURL=subject-picker.js.map