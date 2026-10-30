/** Event trial panel: pick one of her saved looks and 2 to 12 photos of the day, and see the look
 * on every photo side by side, with what ran where. Photos are read on this device and nothing is
 * kept after the panel closes. Author: John Khan.
 */
import { LongWork } from "../ui/long-work.js";
import { h } from "../dom.js";
import { paint } from "../ui/shell/canvas.js";
import { readLocalImage, uploadedSource } from "../ui/shell/demo.js";
import { appConsent } from "../ui/shell/consent.js";
import { upgradeMyLook } from "../save/validate.js";
import { MAX_PHOTOS, runEventTrial } from "../save/event-trial.js";
import { devicePoints } from "./best-selfie.js";
export function eventTrialScreen(looks, deps = {}) {
    const saved = looks();
    const pick = h("select", { "aria-label": "Saved look" }, ...saved.map((l) => h("option", { value: l.id }, l.name)));
    const input = h("input", { type: "file", multiple: true, accept: "image/jpeg,image/png,image/webp", "aria-label": "Photos of the day" });
    const status = h("p", { role: "status", "aria-live": "polite", class: "fine" }, saved.length ? "Choose 2 to 12 photos." : "Save a look first (Save as My Look), then try it here.");
    const board = h("ol", { class: "event-trial-board" });
    const coverage = h("ul", { class: "event-trial-coverage" });
    input.disabled = !saved.length;
    let ticket = 0;
    const work = new LongWork("Stop the trial", () => {
        ticket++;
        board.replaceChildren();
        coverage.replaceChildren();
        status.textContent = "Stopped. No photo was kept.";
    });
    const run = async (files) => {
        const own = ++ticket;
        board.replaceChildren();
        coverage.replaceChildren();
        const signal = work.begin();
        try {
            if (!(deps.consent ?? (() => appConsent.hasVisit))())
                throw new Error("Confirm adult photo consent before opening photos.");
            const chosen = saved.find((l) => l.id === pick.value) ?? saved[0];
            if (files.length > MAX_PHOTOS)
                throw new Error(`Compare at most ${MAX_PHOTOS} photos at a time.`);
            status.textContent = "Trying the look on each photo, on this device…";
            const photos = [];
            for (const [i, file] of files.entries()) {
                if (signal.aborted || own !== ticket)
                    return;
                status.textContent = `Trying the look on photo ${i + 1} of ${files.length}, on this device…`;
                const image = await (deps.read ?? readLocalImage)(file);
                const face = await (deps.points ?? devicePoints)(image);
                const source = { ...uploadedSource(image, `upload:event-${i + 1}-${Date.now().toString(36)}`), ...(face ? { face } : {}) };
                photos.push({ id: `photo-${i + 1}`, label: `Photo ${i + 1}`, source });
            }
            if (signal.aborted || own !== ticket)
                return;
            const trial = runEventTrial(upgradeMyLook(chosen), photos);
            for (const row of trial.rows) {
                const before = h("canvas", { role: "img", "aria-label": `${row.label}, original`, style: { maxWidth: "8rem", height: "auto" } });
                const after = h("canvas", { role: "img", "aria-label": `${row.label}, with ${trial.look}`, style: { maxWidth: "8rem", height: "auto" } });
                try {
                    (deps.paint ?? paint)(before, row.before, { simulate: false });
                    (deps.paint ?? paint)(after, row.after, { simulate: true, label: "Local simulation" });
                }
                catch {
                    after.replaceChildren(row.label);
                }
                board.append(h("li", { "data-id": row.id }, h("h3", {}, row.label), before, after, h("p", { class: "fine" }, `Ran: ${row.applied.join(", ") || "nothing"}.`), ...row.skipped.map((s) => h("p", { class: "fine" }, s.reason))));
            }
            for (const c of trial.coverage)
                coverage.append(h("li", {}, c.provider ? `${c.label}: styling screen only` : `${c.label}: ${c.ranOn} of ${c.of} photos`));
            status.textContent = `${trial.summary} ${trial.label}`;
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
    return h("section", { class: "event-trial", "aria-label": "Event trial" }, h("h2", {}, "Event trial"), h("p", {}, "Try one saved look on several photos of the same day and see it on all of them at once."), h("p", { class: "fine" }, "Each photo uses its own face points. Makeup and hair styling from the styling screen are not sent from here. Photos stay on this device."), h("label", {}, "Look ", pick), h("label", {}, "Photos ", input), work.button, status, coverage, board);
}
//# sourceMappingURL=event-trial.js.map