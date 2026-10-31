import { SIMULATION_MARK } from "../../layout/judge-contract.js";
import { paintJudgeLook } from "./judge-canvas.js";
import { judgeHeading, judgeNode, judgeNotice, judgeParagraph, judgePreview, judgeStatus } from "./judge-elements.js";
import { judgeExportDescription } from "./judge-export.js";
function option(doc, value, text) {
    const item = judgeNode(doc, "option", "", text);
    item.value = value;
    return item;
}
export function renderJudgeExport(doc, host, state, image, actions) {
    const columns = judgeNode(doc, "div", "lg-judge-columns");
    const controls = judgeNode(doc, "section", "lg-judge-controls");
    controls.append(judgeHeading(doc, "Export a clearly labelled demonstration"));
    controls.append(judgeParagraph(doc, "This screen saves locally. No account, server, provider or billing call is involved."));
    const formatLabel = judgeNode(doc, "label", "lg-judge-field", "File format");
    const format = judgeNode(doc, "select", "lg-judge-select");
    format.dataset.judgeAction = "export-format";
    format.append(option(doc, "image/png", "PNG (lossless)"), option(doc, "image/jpeg", "JPEG (smaller file)"));
    format.value = state.format;
    format.addEventListener("change", () => {
        if (format.value !== "image/png" && format.value !== "image/jpeg")
            return;
        actions.change(format.value, state.size, "export-format");
    });
    formatLabel.append(format);
    const sizeLabel = judgeNode(doc, "label", "lg-judge-field", "Image size");
    const size = judgeNode(doc, "select", "lg-judge-select");
    size.dataset.judgeAction = "export-size";
    size.append(option(doc, "standard", "Standard · 512 × 640"), option(doc, "large", "Large · 768 × 960"));
    size.value = state.size;
    size.addEventListener("change", () => {
        if (size.value !== "standard" && size.value !== "large")
            return;
        actions.change(state.format, size.value, "export-size");
    });
    sizeLabel.append(size);
    controls.append(formatLabel, sizeLabel);
    const description = judgeParagraph(doc, judgeExportDescription(state.format, state.size), "lg-judge-small");
    controls.append(description);
    controls.append(judgeNotice(doc, "Permanent simulation label", `${SIMULATION_MARK} is burned into the saved image pixels. It cannot be turned off here.`));
    const save = judgeNode(doc, "button", "lg-judge-button lg-judge-primary", "Save labelled image");
    save.type = "button";
    save.dataset.judgeAction = "export-save";
    save.disabled = !state.source || !image.hasImage;
    const status = judgeStatus(doc, save.disabled
        ? "Choose an image on step 1 to enable export."
        : "Nothing is saved until you press Save.");
    save.addEventListener("click", async () => {
        if (save.disabled)
            return;
        save.disabled = true;
        status.textContent = "Preparing an on-device download…";
        try {
            await actions.save();
            status.textContent = "Download requested. Your original stays in this browser.";
        }
        catch {
            status.textContent = "The image could not be saved. Try another format or size.";
        }
        finally {
            save.disabled = false;
        }
    });
    controls.append(save, status);
    const preview = judgeNode(doc, "div", "lg-judge-visual");
    if (state.source && image.hasImage) {
        const canvas = judgePreview(doc, "Labelled image preview with a permanent simulation mark");
        try {
            paintJudgeLook(image.original, canvas, state, "standard", true);
        }
        catch {
            preview.append(judgeParagraph(doc, "Image preview is unavailable."));
        }
        preview.append(canvas);
    }
    else {
        preview.append(judgeNode(doc, "div", "lg-judge-empty", "No image available for export."));
    }
    columns.append(controls, preview);
    host.replaceChildren(columns);
}
