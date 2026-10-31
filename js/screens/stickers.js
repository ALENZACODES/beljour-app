/** Sticker pack panel: cut her edited photo out, add a caption in the system font, and save a
 * pack of a still sticker and three one-second animations. Made on this device; nothing is
 * uploaded. Author: John Khan.
 */
import { h } from "../dom.js";
import { paint } from "../ui/shell/canvas.js";
import { toRGBA } from "../engines/core/buffer.js";
import { defaultVisionClient } from "../vision/client.js";
import { downloadFile } from "../save/download.js";
import { captionLine, chooseCutout, cutSticker, stickerPack, StickerRefused, withCaption } from "../save/sticker.js";
import { PALETTE } from "../ui/palette.js";
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
/** Person = everything but the background class of the multiclass segmenter, at photo size. */
export async function devicePersonMask(image) {
    const client = defaultVisionClient();
    if (!client.ready("person-segmentation"))
        return null;
    const out = await client.detect("person-segmentation", { width: image.width, height: image.height, rgba: Uint8ClampedArray.from(toRGBA(image)).buffer });
    const seg = out.ok ? out.output?.segmentation : undefined;
    if (!seg || !seg.channels.length)
        return null;
    const data = new Float32Array(image.width * image.height);
    for (let y = 0; y < image.height; y++)
        for (let x = 0; x < image.width; x++) {
            const sx = Math.min(seg.width - 1, Math.floor(x * seg.width / image.width)), sy = Math.min(seg.height - 1, Math.floor(y * seg.height / image.height));
            data[y * image.width + x] = 1 - seg.channels[0][sy * seg.width + sx];
        }
    return { width: image.width, height: image.height, channels: 1, data };
}
function canvasCaption(text, width) {
    if (!text)
        return null;
    const px = Math.max(14, Math.round(width / 11));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = Math.round(px * 1.6);
    const ctx = canvas.getContext("2d");
    if (!ctx)
        return null;
    ctx.font = `700 ${px}px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = Math.max(3, px / 6);
    ctx.strokeStyle = "#ffffff";
    ctx.fillStyle = PALETTE.ink; // white outline kept: it reads on any photo
    ctx.strokeText(text, width / 2, canvas.height / 2, width - 8);
    ctx.fillText(text, width / 2, canvas.height / 2, width - 8);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return { width: canvas.width, height: canvas.height, data: new Uint8ClampedArray(pixels.data) };
}
export function stickersScreen(editor, deps = {}) {
    const caption = h("input", { type: "text", maxLength: 40, "aria-label": "Caption (optional)", placeholder: "Caption (optional)" });
    const make = h("button", { type: "button", class: "btn btn-primary" }, "Make sticker pack");
    const preview = h("canvas", { role: "img", "aria-label": "Sticker preview", style: { maxWidth: "10rem", height: "auto" } });
    const status = h("p", { role: "status", "aria-live": "polite", class: "fine" }, "A still sticker and three one-second animations, saved as one zip.");
    make.addEventListener("click", async () => {
        make.disabled = true;
        try {
            const shot = editor.rendered();
            const cut = chooseCutout(shot.image, { person: await (deps.personMask ?? devicePersonMask)(shot.image), marked: editor.source.person ?? null, face: shot.face });
            const base = cutSticker(shot.image, cut);
            const line = captionLine(caption.value, (deps.simulationLabel ?? (() => true))(), shot.labels.some((l) => /simulat|photo edit/i.test(l)));
            const sticker = withCaption(base, line ? (deps.drawCaption ?? canvasCaption)(line, base.width) : null);
            const pack = stickerPack(sticker, cut);
            try {
                (deps.paint ?? paint)(preview, { width: sticker.width, height: sticker.height, channels: 4, data: Uint8Array.from(sticker.data) }, { simulate: false });
            }
            catch { /* text status still says what was saved */ }
            (deps.download ?? downloadFile)("BELJOUR Stickers.zip", "application/zip", pack.zip);
            status.textContent = `Saved BELJOUR Stickers.zip: ${pack.files.length} stickers. ${pack.note}`;
        }
        catch (error) {
            status.textContent = error instanceof StickerRefused || error instanceof Error ? error.message : String(error);
        }
        finally {
            make.disabled = false;
        }
    });
    return h("section", { class: "stickers", "aria-label": "Sticker pack" }, h("h2", {}, "Sticker pack"), h("p", { class: "fine" }, "Made from your edited photo on this device. Captions use your device's own font. Nothing is uploaded."), h("label", {}, "Caption ", caption), make, preview, status);
}
