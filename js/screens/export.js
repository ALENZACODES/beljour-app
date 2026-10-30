/** Export screen (round 2 plan §5.2): before saving, she sees exactly what the file will be.
 * The preview shows the Simulation corner label (from her Trust Centre setting) and the file
 * name, says location data is removed, and never shows Pro over the preview.
 * Author: John Khan.
 */
import { ALBUM, fileName, labelText } from "../save/export.js";
export function exportPlan(input) {
    if (!Number.isInteger(input.count) || input.count < 1 || input.count > 50)
        throw new RangeError("export 1 to 50 photos");
    const label = labelText(input);
    const files = Array.from({ length: input.count }, (_, i) => fileName(input.lookName, i + 1));
    const labelNote = label ? "Each photo gets a small \"Simulation\" label in the bottom-left corner. You can turn this off in the Trust Centre."
        : input.isSimulation ? "No Simulation label: it is turned off in your Trust Centre." : "No label: these edits are photo fixes, not simulations.";
    return {
        files, label, labelNote,
        metadata: "Location and camera details are removed from every file.",
        destination: input.count > 1 ? `One download, "${ALBUM}", with ${input.count} photos. Your originals are not changed.` : "One photo download. Your original is not changed.",
        confirm: input.count > 1 ? `Save ${input.count} photos` : "Save photo",
    };
}
/** Render the preview card: label overlay text, file names and the plain notes. */
export function renderExport(doc, host, plan, onSave) {
    const card = doc.createElement("section");
    card.className = "lg-export";
    card.setAttribute("aria-labelledby", "lg-export-title");
    const title = doc.createElement("h2");
    title.id = "lg-export-title";
    title.textContent = "Before you save";
    const preview = doc.createElement("div");
    preview.className = "lg-export-preview";
    if (plan.label) {
        const tag = doc.createElement("span");
        tag.className = "lg-tag lg-export-label";
        tag.textContent = plan.label;
        preview.append(tag);
    }
    const notes = doc.createElement("ul");
    for (const text of [plan.labelNote, plan.metadata, plan.destination]) {
        const li = doc.createElement("li");
        li.textContent = text;
        notes.append(li);
    }
    const names = doc.createElement("ol");
    names.className = "lg-export-files";
    for (const f of plan.files.slice(0, 6)) {
        const li = doc.createElement("li");
        li.textContent = f;
        names.append(li);
    }
    if (plan.files.length > 6) {
        const li = doc.createElement("li");
        li.textContent = `… and ${plan.files.length - 6} more`;
        names.append(li);
    }
    const save = doc.createElement("button");
    save.type = "button";
    save.className = "shell-button shell-primary";
    save.textContent = plan.confirm;
    save.addEventListener("click", onSave);
    card.append(title, preview, notes, names, save);
    host.replaceChildren(card);
    return card;
}
//# sourceMappingURL=export.js.map