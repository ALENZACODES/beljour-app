/** Group photo panel: every face's own edits, each kept inside that face, shown together and
 * saved as one photo. Faces without edits keep their exact pixels. Local only: no upload,
 * no face identity, nothing stored. Author: John Khan.
 */
import { h } from "../dom.js";
import { paint } from "../ui/shell/canvas.js";
import { canvasEncoder } from "../save/export.js";
import { downloadFile } from "../save/download.js";
import { MultiFaceError } from "../save/multi-face.js";
import { MAX_SHOTS, mergeBestFaces, MergeError } from "../save/group-merge.js";
import { toRGBA } from "../engines/core/buffer.js";
import { readLocalImage } from "../ui/shell/demo.js";
import { appConsent } from "../ui/shell/consent.js";
import { defaultVisionClient } from "../vision/client.js";
/** Every face's points in a shot from the on-device face model, or null when it is not available. */
async function deviceFaces(image) {
    const client = defaultVisionClient();
    if (!client.ready("face-landmarks"))
        return null;
    const result = await client.detect("face-landmarks", { width: image.width, height: image.height, rgba: Uint8ClampedArray.from(toRGBA(image)).buffer });
    if (!result.ok || !result.faces?.length)
        return null;
    return result.faces.map((face) => face.landmarks.map((p) => [p.x * image.width, p.y * image.height]));
}
/** Pick each person's best face from other shots of the same group and merge them into this photo. */
function bestFacesSection(session, deps) {
    const input = h("input", { type: "file", multiple: true, accept: "image/jpeg,image/png,image/webp", "aria-label": "Other shots of this group" });
    const status = h("p", { role: "status", "aria-live": "polite", class: "fine" });
    const view = h("div", { class: "group-merge-preview" });
    let merged = null;
    const use = h("button", { type: "button", class: "btn btn-primary", disabled: true, onclick: () => {
            if (!merged || !deps.openSource)
                return;
            deps.openSource({ ...session.source, id: `${session.source.id}-best`.slice(0, 57), image: merged.image, face: merged.faces[0], faces: merged.faces,
                label: "Group photo with best faces" });
            status.textContent = "The merged photo is open in the editor. Earlier edits were reset.";
        } }, "Use merged photo");
    input.addEventListener("change", async () => {
        const files = [...(input.files ?? [])];
        input.value = "";
        merged = null;
        use.disabled = true;
        view.replaceChildren();
        try {
            if (!(deps.consent ?? (() => appConsent.hasVisit))())
                throw new Error("Confirm adult photo consent before opening more shots.");
            if (!files.length)
                return;
            if (files.length > MAX_SHOTS - 1)
                throw new MergeError("too_many_shots");
            status.textContent = "Finding everyone in each shot on this device…";
            const shots = [{ image: session.source.image, faces: session.faces }];
            for (const [i, file] of files.entries()) {
                const image = await (deps.read ?? readLocalImage)(file);
                const faces = await (deps.shotFaces ?? deviceFaces)(image);
                if (!faces)
                    throw new Error(`No face points for shot ${i + 2}: the on-device face model is not available or found no faces.`);
                shots.push({ image, faces });
            }
            const result = mergeBestFaces(shots);
            merged = { image: result.image, faces: result.faces };
            use.disabled = !result.changedPixels || !deps.openSource;
            const canvas = h("canvas", { role: "img", "aria-label": "Group photo with each person's best face", style: { maxWidth: "100%", height: "auto" } });
            try {
                (deps.paint ?? paint)(canvas, result.image, { simulate: result.changedPixels > 0, label: "Edited from several shots" });
            }
            catch {
                canvas.replaceChildren("Merged preview");
            }
            view.replaceChildren(canvas, h("ul", {}, ...result.people.map((p) => h("li", {}, p.reason))));
            status.textContent = result.changedPixels ? result.labels[0] : "Every face is already at its best in this photo; nothing was changed.";
        }
        catch (error) {
            status.textContent = `${error instanceof Error ? error.message : String(error)} Your photo is unchanged.`;
        }
    });
    return h("section", { class: "group-merge", "aria-label": "Best faces from other shots" }, h("h3", {}, "Best faces from other shots"), h("p", { class: "fine" }, "Add other shots of the same group, taken from the same spot. Each person gets the face where their eyes are most open; other people keep their exact pixels."), h("label", {}, "Other shots ", input), status, view, use);
}
function rgba(result) {
    const { width, height, channels, data } = result.image;
    const out = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
        for (let c = 0; c < 3; c++)
            out[i * 4 + c] = data[i * channels + c];
        out[i * 4 + 3] = channels === 4 ? data[i * 4 + 3] : 255;
    }
    return out;
}
/** `sync` stores the editor's current layers for the face being edited before each render. */
export function groupFacesScreen(session, active, sync, deps = {}) {
    const status = h("p", { role: "status", "aria-live": "polite", class: "fine" });
    const view = h("div", { class: "group-faces-preview" });
    let last = null;
    const show = () => {
        try {
            sync();
            const result = session.render();
            last = result;
            const simulated = session.faces.some((_, i) => session.editsFor(i).some((l) => l.simulation));
            const canvas = h("canvas", { role: "img", "aria-label": "Group photo with each face's own edits", style: { maxWidth: "100%", height: "auto" } });
            try {
                (deps.paint ?? paint)(canvas, result.image, { simulate: simulated, label: "Local simulation" });
            }
            catch {
                canvas.replaceChildren("Group photo preview");
            }
            view.replaceChildren(canvas, h("ul", {}, ...result.faces.map((face) => h("li", {}, face.edits ? `Face ${face.face + 1}${face.face === active ? " (editing now)" : ""}: ${face.edits} edit${face.edits === 1 ? "" : "s"}, ${face.changed} pixels changed inside this face.`
                : `Face ${face.face + 1}${face.face === active ? " (editing now)" : ""}: no edits; its pixels are exactly as in your photo.`))), h("p", { class: "fine" }, `${result.editedFaces} face${result.editedFaces === 1 ? "" : "s"} edited, ${result.untouchedFaces} left as they were. Nothing outside the edited faces changed.`));
            status.textContent = "Group preview updated on this device.";
        }
        catch (error) {
            last = null;
            status.textContent = error instanceof MultiFaceError ? error.message : `${error instanceof Error ? error.message : String(error)} Your original is unchanged.`;
        }
    };
    const refresh = h("button", { type: "button", class: "btn btn-quiet", onclick: show }, "Update group preview");
    const save = h("button", { type: "button", class: "btn btn-primary" }, "Save group photo");
    save.addEventListener("click", async () => {
        show();
        if (!last)
            return;
        save.disabled = true;
        try {
            const simulated = session.faces.some((_, i) => session.editsFor(i).some((l) => l.simulation));
            const bytes = await (deps.encoder ?? canvasEncoder()).encode({ width: last.image.width, height: last.image.height, data: rgba(last) }, { type: "image/png", quality: 1, label: simulated ? "Simulation" : null });
            (deps.download ?? downloadFile)("Group-photo.png", "image/png", bytes);
            status.textContent = "Group photo prepared. Check your downloads.";
        }
        catch (error) {
            status.textContent = error instanceof Error ? error.message : String(error);
        }
        finally {
            save.disabled = false;
        }
    });
    const panel = h("section", { class: "group-faces", "aria-label": "Faces in this group photo" }, h("h2", {}, "Group photo"), h("p", {}, `${session.faces.length} faces. Pick a face chip above the photo to edit that face; each face's edits stay inside that face.`), h("p", { class: "fine" }, "The main view shows the face you are editing. This preview puts every face's edits together. No face is recognised or stored."), h("div", { class: "row" }, refresh, save), status, view, bestFacesSection(session, deps));
    show();
    return panel;
}
//# sourceMappingURL=group-faces.js.map