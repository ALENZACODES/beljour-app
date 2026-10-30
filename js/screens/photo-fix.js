import { controlIcon } from "./shape-art.js";
import { announce, clear, h } from "../dom.js";
import { fixRedEye } from "../engines/local/red-eye.js";
import { SHADES, eyeColour } from "../engines/local/eye-colour.js";
import { removeGlare } from "../engines/local/glare.js";
import { restoreOldPhoto } from "../engines/local/old-photo.js";
import { brushMask, removeObject } from "../engines/local/object-removal.js";
import { previewPoint } from "./skin-touch-up.js";
import { PRESETS, guideOverlay, idCrop } from "../engines/local/id-crop.js";
import { localPreviewError, measuredMesh } from "./local-preview.js";
export const PHOTO_FIX_BUTTONS = {
    red_eye: "Preview red-eye fix", glare: "Preview glasses glare removal", old_photo: "Preview old photo repair",
    object: "Preview object removal", eye_colour: "Preview eye colour",
};
/** Brush radius as a share of the shorter photo side. ASSUMED sizes. */
export const BRUSH_SHARES = { small: 0.025, medium: 0.05, large: 0.09 };
export const DEFAULT_PHOTO_FIX_STRENGTH = 100;
export function photoFixSection(ctx, dependencies) {
    const source = ctx.photoSrc, points = ctx.face?.points;
    let revision = 0, last = null;
    const taps = [];
    const strength = h("input", { type: "range", id: "photo-fix-strength", min: "0", max: "100", step: "5",
        value: String(DEFAULT_PHOTO_FIX_STRENGTH) });
    const shade = h("select", { id: "photo-fix-shade" }, ...Object.keys(SHADES).map((name) => h("option", { value: name }, name)));
    shade.value = "hazel";
    const brush = h("select", { id: "photo-fix-brush" }, ...Object.keys(BRUSH_SHARES).map((name) => h("option", { value: name }, `${name} brush`)));
    brush.value = "medium";
    const marked = h("p", { class: "fine" }, "Nothing marked. Tap the object-removal preview to mark what to remove.");
    const clearMarks = h("button", { class: "btn btn-quiet", type: "button" }, "Clear marked areas");
    const preset = h("select", { id: "photo-fix-id-size" }, ...Object.keys(PRESETS).map((name) => h("option", { value: name }, name)));
    preset.value = "35x45mm";
    const cropButton = h("button", { class: "btn btn-quiet", type: "button" }, "Show ID photo crop guide");
    const status = h("p", { class: "fine", "aria-live": "polite" });
    const preview = h("div", { class: "photo-fix-map" });
    const buttons = Object.fromEntries(Object.keys(PHOTO_FIX_BUTTONS)
        .map((kind) => [kind, h("button", { class: "btn btn-quiet", type: "button" }, controlIcon(kind), PHOTO_FIX_BUTTONS[kind])]));
    const render = (kind, image) => {
        const amount = Number(strength.value), mesh = measuredMesh(points, image.width, image.height);
        if (kind === "eye_colour")
            return eyeColour(image, mesh, { shade: shade.value, strength: amount });
        if (kind === "glare")
            return removeGlare(image, mesh, { strength: amount });
        if (kind === "old_photo")
            return restoreOldPhoto(image, mesh, { strength: amount });
        if (kind === "object") {
            const radius = Math.max(2, BRUSH_SHARES[brush.value] * Math.min(image.width, image.height));
            return removeObject(image, brushMask(image.height, image.width, taps, radius), { landmarks: mesh, strength: amount });
        }
        return fixRedEye(image, mesh, { strength: amount });
    };
    const run = async (kind) => {
        const own = ++revision;
        for (const b of Object.values(buttons))
            b.disabled = true;
        try {
            const image = await dependencies.read(source);
            if (own !== revision || ctx.photoSrc !== source || ctx.face?.points !== points || !preview.isConnected)
                return;
            const result = render(kind, image);
            clear(preview);
            last = { kind, size: { width: image.width, height: image.height } };
            if (kind === "object" && result.reasonCode !== "edited") {
                // Keep the photo on screen so she can tap what to remove.
                preview.append(dependencies.paint(result.image, `${result.message} Tap what to remove.`));
                status.textContent = "Your photo was not changed.";
            }
            else if (result.status === "edited") {
                preview.append(dependencies.paint(result.image, result.label));
                status.textContent = "Local photo fix ready. Nothing was uploaded.";
            }
            else {
                preview.append(h("p", { class: "notice" }, result.message));
                status.textContent = "Your photo was not changed.";
            }
            announce(status.textContent);
        }
        catch (error) {
            if (own === revision && ctx.photoSrc === source) {
                clear(preview);
                preview.append(localPreviewError(error));
            }
        }
        finally {
            for (const b of Object.values(buttons))
                b.disabled = false;
        }
    };
    for (const kind of Object.keys(buttons))
        buttons[kind].addEventListener("click", () => run(kind));
    const describe = () => { marked.textContent = taps.length ? `${taps.length} marked to remove.` : "Nothing marked. Tap the object-removal preview to mark what to remove."; };
    preview.addEventListener("click", (event) => {
        if (last?.kind !== "object")
            return;
        const point = previewPoint(event, preview.getBoundingClientRect(), last.size);
        if (!point)
            return;
        taps.push(point);
        describe();
        return run("object");
    });
    cropButton.addEventListener("click", async () => {
        const own = ++revision;
        cropButton.disabled = true;
        try {
            const image = await dependencies.read(source);
            if (own !== revision || ctx.photoSrc !== source || ctx.face?.points !== points || !preview.isConnected)
                return;
            const crop = idCrop(image, measuredMesh(points, image.width, image.height), { preset: preset.value });
            clear(preview);
            last = null;
            if (crop.status === "edited") {
                const notes = [crop.checks.level ? "Eyes look level." : "Your head looks tilted; straighten it for an ID photo.",
                    crop.checks.frontal ? "Face looks straight on." : "Your face looks turned; face the camera."];
                preview.append(dependencies.paint(guideOverlay(crop), `${crop.label} Blue lines: crown, eye line, chin and centre.`), h("p", { class: "fine" }, notes.join(" ")));
                status.textContent = "Crop guide ready. Nothing was uploaded.";
            }
            else {
                preview.append(h("p", { class: "notice" }, crop.message));
                status.textContent = "Your photo was not changed.";
            }
            announce(status.textContent);
        }
        catch (error) {
            if (own === revision && ctx.photoSrc === source) {
                clear(preview);
                preview.append(localPreviewError(error));
            }
        }
        finally {
            cropButton.disabled = false;
        }
    });
    clearMarks.addEventListener("click", () => { taps.length = 0; describe(); if (last?.kind === "object")
        return run("object"); });
    return h("section", {}, h("h2", {}, "Local photo fixes"), h("p", {}, "Fixes run on this device from your original photo. Your original stays unchanged."), h("label", { for: strength.id }, "Strength", strength), h("label", { for: shade.id }, "Eye colour shade", shade), h("label", { for: brush.id }, "Object removal brush", brush), clearMarks, marked, h("label", { for: preset.id }, "ID photo size", preset), cropButton, h("div", { class: "row" }, ...Object.values(buttons)), status, preview, h("p", { class: "fine" }, "Eye colour is a simulation: the pupil, catchlights and the detail of your eyes come from your original photo. Removal fills the marked area from the rest of this photo and never covers a face."));
}
//# sourceMappingURL=photo-fix.js.map