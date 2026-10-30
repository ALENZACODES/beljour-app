/** Foundation decision spec sheet section: choose the service, replace any ASSUMED price or
 * duration with her own figures, preview, and save a settings-only PDF or text file. It never
 * includes a photo. Local only: no upload, link or provider call. Author: John Khan.
 */
import { clear, h } from "../dom.js";
import { downloadFile } from "../save/download.js";
import { lookSlug } from "../save/export.js";
import { service } from "../engines/workflow_w/decision.js";
import { servicesFor, sheetText } from "../decision/spec.js";
import { renderSheetPdf } from "../decision/spec-pdf.js";
function pairInput(label) {
    const low = h("input", { type: "number", min: "0", step: "1", inputmode: "decimal", "aria-label": `${label}, low` });
    const high = h("input", { type: "number", min: "0", step: "1", inputmode: "decimal", "aria-label": `${label}, high` });
    return {
        row: h("label", { class: "decision-pair" }, `${label} `, low, " to ", high),
        read: () => {
            if (!low.value.trim() && !high.value.trim())
                return undefined;
            if (!low.value.trim() || !high.value.trim())
                throw new RangeError(`${label}: enter both a low and a high value, or leave both blank.`);
            return [Number(low.value), Number(high.value)];
        },
        hint: (v) => { low.placeholder = String(v[0]); high.placeholder = String(v[1]); },
    };
}
export function decisionSection(build, options) {
    const deps = options.deps ?? {};
    const choice = h("select", { "aria-label": "Service to estimate" }, h("option", { value: "" }, "Suggested for this look"), ...servicesFor("makeup").map((id) => h("option", { value: id }, service(id).label)));
    const price = pairInput("Price per session, CAD"), lasts = pairInput("Lasts, weeks or hours"), upkeep = pairInput("Upkeep per visit, CAD");
    const status = h("p", { role: "status", "aria-live": "polite", class: "fine" });
    const out = h("div", { class: "decision-sheet-preview" });
    const hints = (sheet) => {
        const row = service(sheet.cost.service);
        price.hint(row.price);
        lasts.hint(row.lasts);
        if (row.upkeep)
            upkeep.hint(service(row.upkeep).price);
    };
    const make = () => {
        const figures = { price: price.read(), lasts: lasts.read(), upkeepPrice: upkeep.read() };
        return build({ name: options.name(), date: deps.date?.(), service: choice.value || undefined, figures });
    };
    const show = (sheet) => {
        hints(sheet);
        clear(out);
        out.append(h("h4", {}, "Shade"), h("ul", {}, ...sheet.specLines.map((t) => h("li", {}, t))), h("h4", {}, "Where it goes"), h("ul", {}, ...sheet.placementLines.map((t) => h("li", {}, t))), h("h4", {}, "Cost and how long it lasts"), h("ul", {}, ...sheet.costLines.map((t) => h("li", {}, t))));
        out.append(h("p", { class: "fine" }, "No photo is included. Settings only."), h("ul", { class: "fine" }, ...sheet.limitations.map((t) => h("li", {}, t))), h("p", { class: "fine" }, sheet.footer));
    };
    const fail = (error) => { status.textContent = error instanceof Error ? error.message : String(error); };
    const preview = h("button", { type: "button", class: "btn btn-quiet", onclick: () => {
            try {
                show(make());
                status.textContent = "Spec sheet updated from your current choices. Nothing was uploaded or saved.";
            }
            catch (error) {
                fail(error);
            }
        } }, "Preview spec sheet");
    const savePdf = h("button", { type: "button", class: "btn btn-primary" }, "Save spec sheet");
    const saveText = h("button", { type: "button", class: "btn btn-quiet" }, "Save spec sheet as text");
    savePdf.addEventListener("click", async () => {
        if (savePdf.disabled)
            return;
        savePdf.disabled = true;
        try {
            const sheet = make();
            show(sheet);
            status.textContent = "Preparing your spec sheet on this device…";
            const document = await (deps.render ?? renderSheetPdf)(sheet);
            (deps.download ?? downloadFile)(`Spec-${lookSlug(sheet.name)}.pdf`, "application/pdf", document.pdf);
            status.textContent = `Spec sheet prepared: ${document.pages} page${document.pages > 1 ? "s" : ""}. Check your downloads.`;
        }
        catch (error) {
            fail(error);
        }
        finally {
            savePdf.disabled = false;
        }
    });
    saveText.addEventListener("click", () => {
        try {
            const sheet = make();
            show(sheet);
            (deps.download ?? downloadFile)(`Spec-${lookSlug(sheet.name)}.txt`, "text/plain;charset=utf-8", new TextEncoder().encode(sheetText(sheet)));
            status.textContent = "Text spec sheet prepared. Check your downloads.";
        }
        catch (error) {
            fail(error);
        }
    });
    return h("section", { class: "decision-sheet", "aria-label": "Decision spec sheet" }, h("h3", {}, "Decision spec sheet"), h("p", {}, "The exact shade, where it goes, an estimated cost in Canadian dollars and how long it lasts, as settings you can hand to a professional."), h("p", { class: "fine" }, "Prices and durations are ASSUMED estimates, not quotes. Leave a field blank to keep the estimate, or enter your own figures."), h("label", {}, "Service ", choice), price.row, lasts.row, upkeep.row, h("p", { class: "fine" }, "This sheet never includes a photo."), h("div", { class: "row" }, preview, savePdf, saveText), status, out);
}
//# sourceMappingURL=decision-sheet.js.map