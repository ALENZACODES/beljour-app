/** Best selfie panel: choose 2 to 12 photos of yourself, see them ranked by the photo checks and
 * eyes open, with the reason for each place, and open the one you want. Photos are read on this
 * device only and nothing is kept after the panel closes. Author: John Khan.
 */
import { LongWork } from "../ui/long-work.js";
import { ensureConsent } from "../ui/one-consent.js";
import { h } from "../dom.js";
import { paint } from "../ui/shell/canvas.js";
import { readLocalImage, uploadedSource } from "../ui/shell/demo.js";
import { MAX_PHOTOS, rankSelfies, SelfieError } from "../ui/shell/best-selfie.js";
import { defaultVisionClient } from "../vision/client.js";
import { toRGBA } from "../engines/core/buffer.js";
/** Points from the on-device face model when it is ready and finds exactly one face; else none. */
export async function devicePoints(image) {
    const client = defaultVisionClient();
    if (!client.ready("face-landmarks"))
        return null;
    const result = await client.detect("face-landmarks", { width: image.width, height: image.height, rgba: Uint8ClampedArray.from(toRGBA(image)).buffer });
    if (!result.ok || result.faces?.length !== 1)
        return null;
    return result.faces[0].landmarks.map((p) => [p.x * image.width, p.y * image.height]);
}
export function bestSelfieScreen(open, deps = {}) {
    const input = h("input", { type: "file", multiple: true, accept: "image/jpeg,image/png,image/webp", "aria-label": "Photos to compare" });
    const status = h("p", { role: "status", "aria-live": "polite", class: "fine" });
    const list = h("ol", { class: "best-selfie-list" });
    let ticket = 0;
    const work = new LongWork("Stop checking", () => { ticket++; list.replaceChildren(); status.textContent = "Stopped. No photo was kept."; });
    const run = async (files) => {
        const own = ++ticket;
        list.replaceChildren();
        const signal = work.begin();
        try {
            if (!(await (deps.consent ?? (() => ensureConsent()))()))
                throw new Error("Confirm photo consent before comparing photos.");
            if (files.length > MAX_PHOTOS)
                throw new SelfieError("too_many_photos", `Compare at most ${MAX_PHOTOS} photos at a time.`);
            status.textContent = "Checking your photos on this device…";
            const inputs = [];
            for (const [i, file] of files.entries()) {
                if (signal.aborted || own !== ticket)
                    return;
                status.textContent = `Checking photo ${i + 1} of ${files.length} on this device…`;
                const image = await (deps.read ?? readLocalImage)(file);
                const face = await (deps.points ?? devicePoints)(image);
                inputs.push({ id: `photo-${i + 1}`, label: `Photo ${i + 1}`, image, face, file: { type: file.type, bytes: file.size } });
            }
            if (signal.aborted || own !== ticket)
                return;
            const ranking = rankSelfies(inputs);
            const images = new Map(inputs.map((x) => [x.id, x.image]));
            for (const row of ranking.rows) {
                const canvas = h("canvas", { role: "img", "aria-label": row.label, style: { maxWidth: "8rem", height: "auto" } });
                try {
                    (deps.paint ?? paint)(canvas, images.get(row.id), { simulate: false });
                }
                catch {
                    canvas.replaceChildren(row.label);
                }
                const use = h("button", { type: "button", class: row.id === ranking.best ? "btn btn-primary" : "btn btn-quiet", onclick: () => {
                        open(uploadedSource(images.get(row.id), `upload:${row.id}-${Date.now().toString(36)}`));
                        status.textContent = `${row.label} is open in the editor. No upload occurred.`;
                    } }, `Use ${row.label}`);
                use.disabled = !row.usable;
                list.append(h("li", {}, canvas, h("p", {}, h("strong", {}, `${row.rank}. ${row.label}`)), h("p", { class: "fine" }, row.why), use));
            }
            status.textContent = [ranking.summary, ...ranking.notes].join(" ");
        }
        catch (error) {
            if (own === ticket)
                status.textContent = error instanceof Error ? error.message : String(error);
        }
        finally {
            work.end(signal);
        }
    };
    input.addEventListener("change", async () => { const files = [...(input.files ?? [])]; input.value = ""; await run(files); });
    return h("section", { class: "best-selfie", "aria-label": "Best selfie" }, h("h2", {}, "Best selfie"), h("p", {}, "Choose 2 to 12 photos of yourself. They are ranked by sharpness, light, framing and eyes open, and each one says why."), h("p", { class: "fine" }, "Photo quality only: it does not judge looks or recognise anyone. Photos stay on this device."), h("label", {}, "Photos ", input), work.button, status, list);
}
//# sourceMappingURL=best-selfie.js.map