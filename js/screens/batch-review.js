/** Batch review grid: per-photo compare, human face decisions, strength/redo,
 * pause/resume and one explicit ZIP download. No cloud operations.
 * Author: John Khan.
 */
import { h } from "../dom.js";
import { ensureConsent } from "../ui/one-consent.js";
import { paint } from "../ui/shell/canvas.js";
import { appConsent, VISIT_STATEMENTS } from "../ui/shell/consent.js";
import { createShellClient } from "../ui/shell/worker-protocol.js";
import { BatchReview } from "../save/batch-review.js";
import { downloadFile } from "../save/download.js";
export function batchReviewScreen(name, layers, deps = {}) {
    const worker = deps.render ? null : createShellClient(new URL("../ui/shell/shell-worker.js", import.meta.url));
    const savePart = (part) => {
        (deps.download ?? downloadFile)(part.name, "application/zip", part.bytes);
        status.textContent = `${part.message} The batch keeps going; check your downloads.`;
    };
    const model = new BatchReview(name, layers, { savePart, ...deps, render: deps.render ?? ((source, stack) => worker.client.render(source, stack)) });
    const gate = deps.consent ?? appConsent;
    const input = h("input", { type: "file", multiple: true, accept: "image/jpeg,image/png,image/webp", "aria-label": "Choose batch photos" });
    const status = h("p", { role: "status", "aria-live": "polite", class: "fine" }, "Choose photos to review. Photos and results stay in this tab until you save or clear them.");
    const grid = h("ol", { class: "batch-review-grid", "aria-label": "Batch photos" });
    const start = h("button", { type: "button", class: "btn btn-primary" }, "Apply look / Resume");
    const pause = h("button", { type: "button", class: "btn btn-quiet" }, "Pause after this photo");
    const save = h("button", { type: "button", class: "btn btn-primary" }, "Save all ZIP");
    const clear = h("button", { type: "button", class: "btn btn-quiet" }, "Clear this batch");
    const understood = h("input", { type: "checkbox", "aria-label": VISIT_STATEMENTS[0].text });
    const consent = h("fieldset", {}, h("legend", {}, "Before choosing photos"), h("label", {}, understood, VISIT_STATEMENTS[0].text));
    const compare = new Map();
    const say = (error) => { status.textContent = error instanceof Error ? error.message : String(error); };
    const draw = () => {
        const rows = model.grid();
        grid.replaceChildren();
        for (const item of rows) {
            const showBefore = compare.get(item.id) ?? false;
            const image = showBefore ? item.before : item.after ?? item.before;
            const canvas = h("canvas", { role: "img", "aria-label": `${item.name}: ${showBefore || !item.after ? "original" : "edited preview"}`, style: { maxWidth: "100%", height: "auto" } });
            if (image)
                try {
                    (deps.paint ?? paint)(canvas, image, { simulate: Boolean(item.after) && !showBefore && model.compatibility.ready.some(layer => layer.simulation), label: "Local simulation" });
                }
                catch { /* text status remains usable without canvas */ }
            const toggle = h("button", { type: "button", class: "btn btn-quiet", disabled: !item.after,
                "aria-pressed": String(showBefore), onclick: () => { compare.set(item.id, !showBefore); draw(); } }, showBefore ? "Show edited" : "Show original");
            const contains = h("button", { type: "button", class: "btn btn-quiet", disabled: model.running || !item.before,
                onclick: () => { try {
                    model.confirmFaces(item.id, true);
                    draw();
                }
                catch (error) {
                    say(error);
                } } }, "It has a face");
            const none = h("button", { type: "button", class: "btn btn-quiet", disabled: model.running || !item.before,
                onclick: () => { try {
                    model.confirmFaces(item.id, false);
                    draw();
                }
                catch (error) {
                    say(error);
                } } }, "No face — skip");
            const strength = h("input", { type: "range", min: 0, max: 100, step: 1, "aria-label": `Strength for ${item.name}` });
            strength.value = String(Math.round(item.dose * 100));
            strength.disabled = model.running;
            const amount = h("output", {}, `${Math.round(item.dose * 100)}% of this look`);
            strength.addEventListener("input", () => { amount.textContent = `${strength.value}% of this look`; });
            strength.addEventListener("change", () => { try {
                model.setDose(item.id, Number(strength.value) / 100);
                draw();
            }
            catch (error) {
                say(error);
            } });
            const redo = h("button", { type: "button", class: "btn btn-quiet", disabled: model.running || !["ready", "done", "failed"].includes(item.status),
                onclick: async () => { try {
                    model.retry(item.id);
                    await model.run(draw, item.id);
                }
                catch (error) {
                    say(error);
                } } }, "Redo this photo");
            grid.append(h("li", { class: "batch-review-card", "data-id": item.id }, h("h3", {}, item.name), canvas, h("p", { class: "fine" }, `${item.status}: ${item.note}`), toggle, item.faces.kind === "unknown" || item.faces.kind === "none" ? h("div", { class: "row" }, contains, none) : null, h("label", {}, "Per-photo strength ", strength, amount), redo));
        }
        input.disabled = model.running || model.disposed;
        start.disabled = model.running || model.disposed || !rows.some(row => row.status === "ready") || !model.compatibility.ready.length;
        pause.disabled = !model.running;
        save.disabled = model.running || !rows.some(row => row.status === "done");
        clear.disabled = model.disposed;
        status.textContent = model.summary();
    };
    const updateConsent = () => {
        if (understood.checked)
            gate.acceptVisit({ understood: true });
        input.disabled = model.running || model.disposed;
        consent.hidden = true; // the single consent is asked once, when photos are first opened
    };
    understood.addEventListener("change", updateConsent);
    input.addEventListener("change", async () => {
        const files = Array.from(input.files ?? []);
        input.value = "";
        if (!gate.visit && (gate !== appConsent || !(await ensureConsent()))) {
            status.textContent = "No photos opened.";
            return;
        }
        try {
            await model.add(files.map(file => ({ name: file.name, size: file.size, read: async () => new Uint8Array(await file.arrayBuffer()) })), draw);
        }
        catch (error) {
            say(error);
        }
    });
    start.addEventListener("click", async () => { try {
        await model.run(draw);
    }
    catch (error) {
        say(error);
    } });
    pause.addEventListener("click", () => { model.cancel(); status.textContent = "Pausing after the current photo. Completed photos are kept."; });
    save.addEventListener("click", () => {
        try {
            const result = model.exportAll();
            (deps.download ?? downloadFile)(result.name, "application/zip", result.bytes);
            status.textContent = `${model.grid().filter(row => row.status === "done").length} original-size edited photos prepared in ${result.name}. Check your downloads.`;
        }
        catch (error) {
            say(error);
        }
    });
    const dispose = () => { model.dispose(); worker?.terminate(); compare.clear(); };
    clear.addEventListener("click", () => { dispose(); draw(); status.textContent = "Batch cleared from this tab. Previously downloaded files remain yours."; });
    const removeConsentListener = gate.subscribe(() => {
        if (!gate.visit) {
            model.cancel();
            understood.checked = false;
        }
    });
    const element = h("section", { class: "batch-review-screen", "aria-label": "Batch review" }, h("h2", {}, "Apply this look to your photos"), h("p", {}, `Look: ${name}. Photo-wide Enhance, Filters and Lighting can run here at each photo's original size.`), h("p", { class: "fine" }, "Automatic face reading, when available, decides whether a photo has a face. If unavailable, confirm faces yourself. These edits cover the whole photo; selecting or reshaping individual people is not available in this batch."), ...(model.compatibility.unavailable.length ? [h("p", { class: "fine" }, "The following edits will be left out:"), h("ul", {}, ...model.compatibility.unavailable.map(note => h("li", {}, note)))] : []), model.compatibility.ready.length ? null : h("p", { class: "fine" }, "No supported edits in this look. Add Enhance, Filters or Lighting in the editor, then reopen the batch."), consent, input, h("div", { class: "row" }, start, pause, save, clear), status, grid, h("p", { class: "fine" }, "Up to 100 photos; JPEG, PNG or WebP, 25 MB and 24 megapixels each. One original is processed at a time. Up to 100 MB of encoded results stay in memory; past that the finished photos download as a numbered album part and the batch keeps going. JPEG exports flatten transparent areas onto white, remove location metadata and mark simulations."));
    updateConsent();
    draw();
    return { element, model, dispose: () => { removeConsentListener(); dispose(); } };
}
