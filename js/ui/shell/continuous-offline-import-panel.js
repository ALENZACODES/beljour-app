/** Accessible, local-only PNG integrity panel. Author: John Khan. */
import { OFFLINE_IMPORT_LABEL, } from "../../layout/continuous/offline-import-contract.js";
import { OFFLINE_IMPORT_GUIDE, offlineImportHelp, offlineImportReadiness, offlineImportSummary, } from "../../layout/continuous/offline-import-guide.js";
import { judgeNode, judgeParagraph } from "./judge-elements.js";
function selectedFile(input) {
    return input.files?.[0] ?? null;
}
function fileControl(doc, label, accept, type) {
    const wrapper = judgeNode(doc, "label", "lg-local-import-file");
    const caption = judgeNode(doc, "span", "lg-local-import-label", label);
    const input = judgeNode(doc, "input", "lg-local-import-input");
    input.type = "file";
    input.accept = accept;
    input.dataset.importType = type;
    input.setAttribute("aria-label", label);
    input.setAttribute("autocomplete", "off");
    wrapper.append(caption, input);
    return { control: wrapper, input };
}
function clickAction(doc, title, key, action) {
    const button = judgeNode(doc, "button", "lg-local-import-button", title);
    button.type = "button";
    button.dataset.offlineImportAction = key;
    button.addEventListener("click", action);
    return button;
}
/** Importing here never changes the active editing image or calls a provider. */
export function renderOfflineImportPanel(doc, status, imageUrl, actions) {
    const section = judgeNode(doc, "section", "lg-local-import");
    section.setAttribute("aria-label", "Read-only local PNG replay");
    const title = judgeNode(doc, "h3", "lg-local-import-title", "Review a local PNG replay");
    const lead = judgeParagraph(doc, "Optional local file inspection. PNG integrity is not proof of its provider, product fit or face accuracy.", "lg-local-import-intro");
    const mark = judgeNode(doc, "strong", "lg-local-import-provenance", OFFLINE_IMPORT_LABEL);
    section.append(title, lead, mark);
    const controls = judgeNode(doc, "div", "lg-local-import-controls");
    const manifest = fileControl(doc, "Local replay JSON (8 KiB maximum)", ".json,application/json", "manifest");
    const image = fileControl(doc, "Matching PNG from this device", ".png,image/png", "image");
    const read = clickAction(doc, "Check local PNG", "check", () => {
        if (read.disabled)
            return;
        const source = selectedFile(manifest.input);
        const png = selectedFile(image.input);
        if (!source || !png)
            return;
        void actions.load(source, png);
    });
    read.disabled = status.phase === "checking" || status.phase === "disposed";
    controls.append(manifest.control, image.control, read);
    const clear = clickAction(doc, "Clear temporary preview", "clear", actions.clear);
    clear.disabled = status.phase === "disposed";
    controls.append(clear);
    section.append(controls);
    const preparation = judgeNode(doc, "section", "lg-local-import-prepare");
    preparation.setAttribute("aria-label", "Prepare a local companion manifest");
    preparation.append(judgeNode(doc, "h4", "", "Prepare a matching JSON file"));
    preparation.append(judgeParagraph(doc, "Only with your click: create a local SHA-256 manifest for a PNG. "
        + "The JSON stores a file fingerprint, not pixels, and never proves its origin."));
    const source = fileControl(doc, "PNG for companion JSON", ".png,image/png", "image");
    source.input.dataset.offlineImportPrep = "png";
    const familyLabel = judgeNode(doc, "label", "lg-local-import-file");
    familyLabel.append(judgeNode(doc, "span", "lg-local-import-label", "Illustration category"));
    const family = judgeNode(doc, "select", "lg-local-import-input");
    family.setAttribute("aria-label", "Illustration category");
    family.value = "hair";
    for (const [key, text] of [["hair", "Hair"], ["makeup", "Makeup"], ["skin", "Skin category"]]) {
        const option = judgeNode(doc, "option", "", text);
        option.value = key;
        family.append(option);
    }
    familyLabel.append(family);
    const create = clickAction(doc, "Create companion JSON", "prepare", () => {
        if (create.disabled)
            return;
        const png = selectedFile(source.input);
        if (!png || (family.value !== "hair" && family.value !== "makeup" && family.value !== "skin"))
            return;
        void actions.prepare(png, family.value);
    });
    create.disabled = status.phase === "checking" || status.phase === "disposed";
    preparation.append(source.control, familyLabel, create);
    section.append(preparation);
    const guidance = judgeParagraph(doc, offlineImportHelp(status), "lg-local-import-status");
    guidance.dataset.localImportPhase = status.phase;
    guidance.setAttribute("role", "status");
    guidance.setAttribute("aria-live", "polite");
    section.append(guidance);
    const result = offlineImportReadiness(status);
    if (result.safeToDisplay && imageUrl?.startsWith("blob:")) {
        const figure = judgeNode(doc, "figure", "lg-local-import-figure");
        const view = judgeNode(doc, "img", "lg-local-import-preview");
        view.src = imageUrl;
        view.alt = "Operator-selected local PNG; origin and subject accuracy are not verified";
        view.loading = "lazy";
        view.decoding = "async";
        figure.append(view);
        figure.append(judgeNode(doc, "figcaption", "lg-local-import-caption", `Local ${status.family} file, ${status.width} by ${status.height} pixels. Not a verified provider result.`));
        section.append(figure);
    }
    section.append(judgeParagraph(doc, offlineImportSummary(status), "lg-local-import-evidence"));
    const details = judgeNode(doc, "details", "lg-local-import-details");
    const summary = judgeNode(doc, "summary", "", "How to prepare and safely review a local replay");
    const steps = judgeNode(doc, "ol", "lg-local-import-steps");
    for (const item of OFFLINE_IMPORT_GUIDE) {
        const entry = judgeNode(doc, "li", "lg-local-import-step");
        entry.append(judgeNode(doc, "strong", "", item.title));
        entry.append(judgeParagraph(doc, item.instruction));
        steps.append(entry);
    }
    details.append(summary, steps);
    section.append(details);
    return section;
}
