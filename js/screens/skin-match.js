/** Skin match: YouCam Skin AI concerns plus our own depth and undertone estimate, mapped to
 * generic product types. States and words live in skin-match-model.ts (tested offline);
 * this file only lays them out. Shown as a section of the Skin screen.
 * Author: John Khan.
 */
import { api } from "../api.js";
import { announce, clear, h } from "../dom.js";
import { YOUCAM_PRODUCTS } from "../ui/provider-labels.js";
import { CONSENT_TEXT, ConsentMissing, NOT_TESTED, SkinMatchController, view } from "./skin-match-model.js";
function consentForm(controller, note) {
    const agreed = h("input", { type: "checkbox", id: "skin-match-agree" });
    const send = h("button", { class: "btn", type: "button", onclick: async () => {
            try {
                await controller.analyse({ agreed: agreed.checked });
            }
            catch (err) {
                if (err instanceof ConsentMissing) {
                    clear(note);
                    note.append(err.message);
                    return;
                }
                throw err;
            }
        } }, "Send to YouCam and match");
    const local = h("button", { class: "btn btn-quiet", type: "button", onclick: () => { void controller.localOnly(); } }, "Local estimate only");
    return h("form", { class: "consent", onsubmit: (e) => e.preventDefault() }, h("p", {}, h("label", { for: "skin-match-agree" }, agreed, " ", CONSENT_TEXT)), h("div", { class: "row" }, send, local));
}
function draw(box, controller, state) {
    const v = view(state);
    clear(box);
    const note = h("p", { class: "fine", role: "status" });
    box.append(h("h2", {}, v.title), h("p", { class: "fine" }, YOUCAM_PRODUCTS.skin), h("p", {}, v.message));
    if (v.actions.includes("send"))
        box.append(consentForm(controller, note), note);
    if (v.tone)
        box.append(h("p", {}, v.tone));
    if (v.concerns.length)
        box.append(h("ul", { class: "concerns" }, ...v.concerns.map((c) => h("li", {}, c))));
    if (v.products.length) {
        box.append(h("h3", {}, "Product types to look for"), h("ul", { class: "shades" }, ...v.products.map((p) => h("li", { class: "shade" }, h("strong", {}, p.name), h("p", { class: "fine" }, `${p.why} For: ${p.forWhat}.`)))));
    }
    if (v.sourceLine)
        box.append(h("p", { class: "fine" }, v.sourceLine));
    if (v.notTested)
        box.append(h("p", { class: "fine" }, `These are product types, ${NOT_TESTED}. No brand pays to appear here.`));
    const buttons = h("div", { class: "row" });
    if (v.actions.includes("retry"))
        buttons.append(h("button", { class: "btn", type: "button", onclick: () => controller.back() }, "Try again"));
    else if (v.actions.includes("back"))
        buttons.append(h("button", { class: "btn btn-quiet", type: "button", onclick: () => controller.back() }, "Start over"));
    if (buttons.childNodes.length)
        box.append(buttons);
    if (state.kind === "result" || state.kind === "fallback")
        announce("Skin match ready.");
}
/** A section for the Skin screen. Creating it costs nothing; only "Send" can spend units. */
export function skinMatchSection(ctx) {
    const box = h("section", { class: "skin-match", "aria-live": "polite" });
    const controller = new SkinMatchController(api);
    controller.subscribe((state) => draw(box, controller, state));
    controller.open(ctx.photo?.photo_id);
    return box;
}
