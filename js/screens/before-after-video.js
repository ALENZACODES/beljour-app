/** Before / after video panel: record a 4-second clip of the original and the edit on this device
 * and save it. Nothing is uploaded. Author: John Khan.
 */
import { LongWork } from "../ui/long-work.js";
import { h } from "../dom.js";
import { downloadFile } from "../save/download.js";
import { lookSlug } from "../save/export.js";
import { FPS, recordBeforeAfter, SECONDS, VideoRefused } from "../save/before-after-video.js";
export function browserRecordDeps() {
    return {
        canvas: (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; },
        imageData: (data, w, h) => new ImageData(new Uint8ClampedArray(data), w, h),
        supported: (mime) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(mime),
        tick: () => new Promise((resolve) => setTimeout(resolve, 1000 / FPS)),
    };
}
export function beforeAfterScreen(editor, lookName, deps = {}) {
    const status = h("p", { role: "status", "aria-live": "polite", class: "fine" }, `Records ${SECONDS} seconds: your photo, a wipe, then your edit.`);
    const record = h("button", { type: "button", class: "btn btn-primary" }, "Record before / after");
    const work = new LongWork("Stop recording");
    record.addEventListener("click", async () => {
        record.disabled = true;
        status.textContent = `Recording ${SECONDS} seconds on this device…`;
        const signal = work.begin();
        try {
            const shot = editor.rendered();
            const clip = await recordBeforeAfter(shot.before ?? editor.source.image, shot.image, { ...(deps.record ?? browserRecordDeps()), signal }, {
                simulationLabel: (deps.simulationLabel ?? (() => true))(), isSimulation: shot.labels.some((l) => /simulat|photo edit/i.test(l))
            });
            const ext = clip.mime.startsWith("video/mp4") ? "mp4" : "webm";
            const name = `Beljour_${lookSlug(lookName)}_BeforeAfter.${ext}`;
            (deps.download ?? downloadFile)(name, clip.mime.split(";")[0], new Uint8Array(await clip.blob.arrayBuffer()));
            status.textContent = `Saved ${name} (${clip.seconds} s, ${clip.width} x ${clip.height}).${clip.label ? " The edit is labelled Simulation." : ""}`;
        }
        catch (error) {
            status.textContent = error instanceof VideoRefused || error instanceof Error ? error.message : String(error);
        }
        finally {
            record.disabled = false;
            work.end(signal);
        }
    });
    return h("section", { class: "before-after-video", "aria-label": "Before and after video" }, h("h2", {}, "Before / after video"), h("p", { class: "fine" }, "Made and saved on this device; nothing is uploaded. The Simulation label follows your Trust Centre switch."), record, work.button, status);
}
