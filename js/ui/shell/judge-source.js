import { paintJudgeLook } from "./judge-canvas.js";
import { judgeButton, judgeHeading, judgeNode, judgeNotice, judgeParagraph, judgePreview } from "./judge-elements.js";
export function renderJudgeSource(doc, host, state, image, actions) {
    const layout = judgeNode(doc, "div", "lg-judge-columns");
    const controls = judgeNode(doc, "div", "lg-judge-controls");
    controls.append(judgeHeading(doc, "Start with a synthetic illustration"));
    controls.append(judgeParagraph(doc, "The drawn person is a graphic placeholder, not a real face or a test result."));
    controls.append(judgeButton(doc, "Use drawn sample", "sample", actions.sample, true));
    if (actions.samplePair) {
        controls.append(judgeButton(doc, "Use two-person drawing", "sample-pair", actions.samplePair));
    }
    const field = judgeNode(doc, "div", "lg-judge-upload");
    const label = judgeNode(doc, "label", "lg-judge-file-label", "Or choose a local image (optional)");
    label.htmlFor = "lg-judge-file";
    const input = judgeNode(doc, "input", "lg-judge-file");
    input.type = "file";
    input.id = "lg-judge-file";
    input.accept = "image/jpeg,image/png,image/webp";
    input.setAttribute("aria-describedby", "lg-judge-file-note");
    input.addEventListener("change", () => {
        const file = input.files?.[0];
        input.value = "";
        if (file)
            actions.upload(file);
    });
    const note = judgeParagraph(doc, "JPEG, PNG or WebP, 10 MB maximum. The selected photo stays in this browser.", "lg-judge-small");
    note.id = "lg-judge-file-note";
    field.append(label, input, note);
    controls.append(field);
    controls.append(judgeNotice(doc, "No demo images are uploaded", "All following edits are illustrative overlays. For actual photo editing, use the Studio tools."));
    const preview = judgeNode(doc, "div", "lg-judge-visual");
    if (state.source && image.hasImage) {
        const canvas = judgePreview(doc, "Original selected image before illustrative edits");
        try {
            paintJudgeLook(image.original, canvas, state, "standard", true, image.activeSubject, image.allowUntrackedDrawing);
        }
        catch {
            preview.append(judgeParagraph(doc, "Canvas preview is unavailable. Your selected image was not uploaded."));
        }
        preview.append(canvas);
        preview.append(judgeParagraph(doc, state.source === "sample"
            ? "Drawn sample selected."
            : "Local photo selected. No facial tracking is performed.", "lg-judge-small"));
    }
    else {
        preview.append(judgeNode(doc, "div", "lg-judge-empty", "Image preview will appear here."));
    }
    layout.append(controls, preview);
    host.replaceChildren(layout);
}
//# sourceMappingURL=judge-source.js.map