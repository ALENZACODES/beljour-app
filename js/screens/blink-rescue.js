/** Blink rescue panel: take open eyes from another photo of yourself into this one. Both photos
 * need face points (this photo's attached points; the other photo's from the on-device face
 * model). She confirms both photos are of her. The result opens as a new photo in the editor;
 * nothing is uploaded or kept. Author: John Khan. */
import { h } from "../dom.js";
import { paint } from "../ui/shell/canvas.js";
import { readLocalImage } from "../ui/shell/demo.js";
import { appConsent } from "../ui/shell/consent.js";
import { BlinkError, rescueBlink } from "../save/blink-rescue.js";
import { TransferError } from "../save/region-transfer.js";
import { devicePoints } from "./best-selfie.js";
export function blinkRescueScreen(source, open, deps = {}) {
    const input = h("input", { type: "file", accept: "image/jpeg,image/png,image/webp", "aria-label": "Your other photo" });
    const same = h("input", { type: "checkbox", "aria-label": "Both photos are of me" });
    const status = h("p", { role: "status", "aria-live": "polite", class: "fine" });
    const view = h("div", { class: "blink-preview" });
    let last = null;
    const use = h("button", { type: "button", class: "btn btn-primary", disabled: true, onclick: () => {
            if (!last)
                return;
            const { result, from } = last;
            open({ ...from, id: `${from.id}-eyes`.slice(0, 57), image: result.image, face: result.points, faces: undefined, label: "Photo with eyes from your other photo" });
            status.textContent = "The result is open in the editor as a new photo. Earlier edits on this photo were reset.";
        } }, "Use this result");
    input.addEventListener("change", async () => {
        const file = input.files?.[0];
        input.value = "";
        last = null;
        use.disabled = true;
        view.replaceChildren();
        if (!file)
            return;
        try {
            if (!(deps.consent ?? (() => appConsent.hasVisit))())
                throw new Error("Confirm photo consent before opening another photo.");
            const from = source();
            if (!from.face)
                throw new Error("This photo needs its face points first: Older, Younger or Gender, then Find face points.");
            status.textContent = "Lining up the two photos on this device…";
            const donor = await (deps.read ?? readLocalImage)(file);
            const points = await (deps.points ?? devicePoints)(donor);
            if (!points)
                throw new Error("No face points for the other photo: the on-device face model is not available or did not find exactly one face.");
            const result = rescueBlink(from.image, from.face, donor, points, { samePerson: same.checked });
            last = { result, from };
            use.disabled = false;
            const canvas = h("canvas", { role: "img", "aria-label": "Photo with eyes from your other photo", style: { maxWidth: "100%", height: "auto" } });
            try {
                (deps.paint ?? paint)(canvas, result.image, { simulate: true, label: "Edited from two photos" });
            }
            catch {
                canvas.replaceChildren("Preview");
            }
            view.replaceChildren(canvas);
            status.textContent = `${result.eyes.length === 2 ? "Both eyes" : `The ${result.eyes[0]} eye`} now come from your other photo. ${result.labels[0]}`;
        }
        catch (error) {
            status.textContent = `${error instanceof Error ? error.message : String(error)}${error instanceof BlinkError || error instanceof TransferError ? " Your photo is unchanged." : ""}`;
        }
    });
    return h("section", { class: "blink-rescue", "aria-label": "Blink rescue" }, h("h2", {}, "Blink rescue"), h("p", {}, "Eyes closed in this photo? Take the open eyes from another photo of yourself, taken at about the same angle."), h("p", { class: "fine" }, "Only the eye areas change; the edges are blended. It does not check who is in the photos."), h("label", {}, same, " Both photos are of me"), h("label", {}, "Other photo ", input), status, view, use);
}
//# sourceMappingURL=blink-rescue.js.map