/** Tattoo try-on panel: her own design on her face skin, placed by zone, size and turn, shown
 * on the edited photo and saved with the Simulation label. The design and photo stay on this
 * device. Author: John Khan.
 */
import { h } from "../dom.js";
import { paint } from "../ui/shell/canvas.js";
import { canvasEncoder, exportPhoto } from "../save/export.js";
import { downloadFile } from "../save/download.js";
import { DEFAULT_PLACEMENT, MAX_ART_SIDE, renderTattoo, TattooRefused, ZONES, zoneLabel } from "../engines/local/tattoo.js";
/** Her design with its own transparency (not flattened onto white), at most MAX_ART_SIDE a side. */
export async function readArt(file) {
    if (!/^image\/(png|webp|jpeg)$/.test(file.type) || file.size > 8 * 1024 * 1024)
        throw new TattooRefused("bad_art", "Use a PNG, WebP or JPEG design under 8 MB.");
    const bitmap = await createImageBitmap(file);
    try {
        const scale = Math.min(1, MAX_ART_SIDE / Math.max(bitmap.width, bitmap.height));
        const w = Math.max(4, Math.round(bitmap.width * scale)), hgt = Math.max(4, Math.round(bitmap.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = hgt;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx)
            throw new TattooRefused("bad_art", "This browser can't read the design.");
        ctx.drawImage(bitmap, 0, 0, w, hgt);
        return { width: w, height: hgt, data: new Uint8ClampedArray(ctx.getImageData(0, 0, w, hgt).data) };
    }
    finally {
        bitmap.close();
    }
}
export function tattooScreen(editor, lookName, deps = {}) {
    const mine = h("input", { type: "checkbox", "aria-label": "This design is mine, or I have the right to use it" });
    const file = h("input", { type: "file", accept: "image/png,image/webp,image/jpeg", "aria-label": "Your design" });
    const face = editor.rendered().face;
    const zone = h("select", { "aria-label": "Where" }, ...Object.keys(ZONES).map((id) => h("option", { value: id, selected: id === DEFAULT_PLACEMENT.zone }, zoneLabel(id, face))));
    zone.value = DEFAULT_PLACEMENT.zone;
    const range = (label, min, max, step, value) => h("input", { type: "range", min, max, step, value: String(value), "aria-label": label });
    const size = range("Size", 0.15, 1.2, 0.05, DEFAULT_PLACEMENT.size), turn = range("Turn", -45, 45, 1, DEFAULT_PLACEMENT.angle);
    const opacity = range("Ink strength", 0.2, 1, 0.05, DEFAULT_PLACEMENT.opacity);
    const preview = h("canvas", { role: "img", "aria-label": "Photo with your design", style: { maxWidth: "100%", height: "auto" } });
    const save = h("button", { type: "button", class: "btn btn-primary", disabled: true }, "Save photo with this design");
    const status = h("p", { role: "status", "aria-live": "polite", class: "fine" }, "Choose your design, then confirm it is yours to use.");
    let art = null;
    let last = null;
    const placement = () => ({ zone: zone.value, size: Number(size.value), angle: Number(turn.value), opacity: Number(opacity.value) });
    const draw = () => {
        last = null;
        save.disabled = true;
        if (!art)
            return;
        try {
            const shot = editor.rendered();
            last = renderTattoo(shot.image, shot.face, art, placement(), mine.checked);
            try {
                (deps.paint ?? paint)(preview, last.image, { simulate: true, label: "Local simulation" });
            }
            catch { /* status still reports */ }
            save.disabled = false;
            status.textContent = `${last.zone}: design placed.${last.hiddenTriangles ? " Part of it turns away from the camera and is not drawn there." : ""} ${last.label}`;
        }
        catch (error) {
            status.textContent = error instanceof Error ? error.message : String(error);
        }
    };
    file.addEventListener("change", async () => {
        const chosen = file.files?.[0];
        file.value = "";
        if (!chosen)
            return;
        try {
            art = await (deps.readArt ?? readArt)(chosen);
            draw();
        }
        catch (error) {
            art = null;
            status.textContent = error instanceof Error ? error.message : String(error);
        }
    });
    for (const control of [mine, zone, size, turn, opacity])
        control.addEventListener("change", draw);
    save.addEventListener("click", async () => {
        if (!last)
            return;
        try {
            const img = last.image, rgba = new Uint8Array(img.width * img.height * 4);
            for (let p = 0; p < img.width * img.height; p++) {
                for (let c = 0; c < 3; c++)
                    rgba[p * 4 + c] = img.data[p * img.channels + c];
                rgba[p * 4 + 3] = img.channels === 4 ? img.data[p * 4 + 3] : 255;
            }
            const out = await exportPhoto({ width: img.width, height: img.height, data: rgba }, deps.encoder ?? canvasEncoder(), { lookName: `${lookName} tattoo`, index: 1, simulationLabel: (deps.simulationLabel ?? (() => true))(), isSimulation: true });
            (deps.download ?? downloadFile)(out.name, "image/jpeg", out.bytes);
            status.textContent = `Saved ${out.name}.${out.label ? " Labelled Simulation." : ""}`;
        }
        catch (error) {
            status.textContent = error instanceof Error ? error.message : String(error);
        }
    });
    return h("section", { class: "tattoo", "aria-label": "Tattoo try-on" }, h("h2", {}, "Tattoo try-on"), h("p", {}, "Your own design on your face skin. It follows the shape and turn of your face and never covers your eyes, brows or lips."), h("p", { class: "fine" }, "The app has no designs of its own. Face placement only for now; arms and body need a body outline that isn't built yet."), h("label", {}, mine, " This design is mine, or I have the right to use it"), h("label", {}, "Design ", file), h("label", {}, "Where ", zone), h("label", {}, "Size ", size), h("label", {}, "Turn ", turn), h("label", {}, "Ink ", opacity), preview, save, status);
}
//# sourceMappingURL=tattoo.js.map