/** W93: a real two-page consultation PDF plus its original/preview/text ZIP.
 * All composition is local. Downloading is explicit; health notes are opt-in and
 * never saved in look settings. Author: John Khan.
 */
import { h } from "../dom.js";
import { paint } from "../ui/shell/canvas.js";
import { buildSalonPack, packText, labText } from "../salon/pack.js";
import { renderPackPdf } from "../salon/pdf.js";
import { lookSlug, storeZip } from "../save/export.js";
import { downloadFile } from "../save/download.js";
import { hairDecision } from "../salon/spec.js";
import { decisionSection } from "./decision-sheet.js";
export function packArchive(pack, output) {
    return storeZip([{ name: "Salon-Decision-Pack.pdf", bytes: output.pdf },
        { name: "Read-me-and-plan.txt", bytes: new TextEncoder().encode(packText(pack)) }, ...output.photos]);
}
export function salonPackScreen(editor, initialName = "My look", deps = {}) {
    const name = h("input", { type: "text", maxlength: 80, "aria-label": "Pack look name" });
    name.value = initialName;
    const description = h("textarea", { maxlength: 240, rows: 3, "aria-label": "Target description" });
    const allergies = h("textarea", { maxlength: 360, rows: 2, "aria-label": "Allergy note for this pack" });
    allergies.disabled = true;
    const include = h("input", { type: "checkbox", "aria-label": "Include my allergy note in this pack" });
    include.addEventListener("change", () => { allergies.disabled = !include.checked; });
    const status = h("p", { role: "status", "aria-live": "polite", class: "fine" });
    const preview = h("div", { class: "salon-pack-preview" });
    const makePack = () => buildSalonPack(editor.source, editor.document.layers, {
        name: name.value, description: description.value, date: deps.date?.(),
        includeAllergies: include.checked, allergies: allergies.value,
    });
    const show = (pack) => {
        preview.replaceChildren(h("h3", {}, pack.name), h("p", { class: "fine" }, pack.label));
        for (const photo of pack.photos) {
            const canvas = h("canvas", { "aria-label": photo.caption, role: "img", style: { maxWidth: "100%", height: "auto" } });
            try {
                (deps.paint ?? paint)(canvas, photo.image, { simulate: photo.role === "preview", label: "Local simulation" });
            }
            catch {
                canvas.replaceChildren(photo.caption);
            }
            preview.append(h("figure", {}, canvas, h("figcaption", {}, photo.caption)));
        }
        preview.append(h("h4", {}, "Measured facts"), h("dl", {}, ...pack.facts.flatMap(fact => [h("dt", {}, fact.label), h("dd", {}, fact.value)])), h("h4", {}, "Target and plan"), h("p", {}, pack.target.description), h("p", {}, labText(pack.target.lab)), h("p", { class: "fine" }, pack.target.source), h("ul", {}, ...pack.plan.map(line => h("li", {}, line))));
        if (pack.allergies.length)
            preview.append(h("p", {}, "Allergies shared by your choice: " + pack.allergies.join(", ")));
        preview.append(h("ul", { class: "fine" }, ...pack.limitations.map(line => h("li", {}, line))), h("p", { class: "fine" }, pack.footer));
    };
    const refresh = h("button", { type: "button", class: "btn btn-quiet", onclick: () => {
            try {
                show(makePack());
                status.textContent = "Pack preview updated from your current edits. Nothing was uploaded or saved.";
            }
            catch (error) {
                status.textContent = error instanceof Error ? error.message : String(error);
            }
        } }, "Preview pack");
    const savePdf = h("button", { type: "button", class: "btn btn-primary" }, "Save PDF");
    const saveZip = h("button", { type: "button", class: "btn btn-quiet" }, "Save pack ZIP");
    const save = async (zip) => {
        if (savePdf.disabled)
            return;
        savePdf.disabled = saveZip.disabled = refresh.disabled = true;
        try {
            const pack = makePack();
            show(pack);
            status.textContent = "Preparing your pack on this device…";
            const output = await (deps.render ?? renderPackPdf)(pack);
            const slug = lookSlug(pack.name);
            (deps.download ?? downloadFile)(`Salon-${slug}.${zip ? "zip" : "pdf"}`, zip ? "application/zip" : "application/pdf", zip ? packArchive(pack, output) : output.pdf);
            status.textContent = zip ? "Pack ZIP prepared: two-page PDF, three photos and the complete text plan. Check your downloads."
                : "Two-page PDF prepared. Check your downloads. The ZIP also includes the full text plan and individual photos.";
        }
        catch (error) {
            status.textContent = error instanceof Error ? error.message : String(error);
        }
        finally {
            savePdf.disabled = saveZip.disabled = refresh.disabled = false;
        }
    };
    savePdf.addEventListener("click", () => save(false));
    saveZip.addEventListener("click", () => save(true));
    return h("section", { class: "salon-pack-screen", "aria-label": "Salon Decision Pack" }, h("h2", {}, "Salon Decision Pack"), h("label", {}, "Look name ", name), decisionSection("hair", options => hairDecision(editor.source, editor.document.layers, options), { name: () => name.value, photos: true, deps: deps.sheet }), h("h3", {}, "Photo pack"), h("p", {}, "Bring your original photo, a target look and an honest plan to your consultation. The photo pack always includes your unedited photo and two simulations."), h("p", { class: "fine" }, "Original first, followed by daylight and office simulations. Uses current editor resolution. No upload, account or purchase required."), h("label", {}, "Target in your words ", description), h("label", {}, include, " Include my allergy note in this pack"), allergies, h("p", { class: "fine" }, "Only include what you want to share. Allergy notes stay in this form and your downloaded file, not in saved look settings."), h("div", { class: "row" }, refresh, savePdf, saveZip), status, preview, h("p", { class: "fine" }, "View-only link and QR are unavailable: there is no hosted pack. Share the saved PDF or ZIP yourself."));
}
//# sourceMappingURL=salon-pack.js.map