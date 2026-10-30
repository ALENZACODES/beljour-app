/** The "Send this photo to YouCam" tick box used next to every provider action on the classic
 * screens. Ticking grants photo consent in the shared gate for that photo and scope; unticking
 * withdraws it. The action button stays disabled until the box is ticked.
 * Author: John Khan.
 */
import { h } from "../dom.js";
import { PROVIDER_FACTS, appConsent, scopeTitle } from "./shell/consent.js";
let counter = 0;
export function sendConsentBox(photoIds, scope, onChange, gate = appConsent, label = "Send this photo to YouCam") {
    const id = `send-consent-${++counter}`;
    const box = h("input", { type: "checkbox", id, "aria-describedby": `${id}-facts` });
    const current = photoIds();
    box.checked = current.length > 0 && current.every((p) => gate.allows(p, scope === "makeup" ? "makeup" : "hair-color"));
    const note = h("p", { class: "hint", "aria-live": "polite" });
    box.addEventListener("change", () => {
        note.textContent = "";
        try {
            for (const photo of photoIds()) {
                if (box.checked)
                    gate.grantPhoto(photo, [scope]);
                else
                    gate.revokePhoto(photo);
            }
            onChange(box.checked);
        }
        catch (err) {
            box.checked = false;
            note.textContent = err instanceof Error ? err.message : String(err);
            onChange(false);
        }
    });
    return h("div", { class: "send-consent" }, h("p", { class: "check" }, box, h("label", { for: id }, ` ${label} for this ${scopeTitle(scope)}.`)), h("details", { id: `${id}-facts` }, h("summary", {}, "What is sent, and what happens to it"), h("ul", { class: "plain-list" }, ...PROVIDER_FACTS.map((fact) => h("li", {}, fact)))), note);
}
//# sourceMappingURL=send-consent.js.map