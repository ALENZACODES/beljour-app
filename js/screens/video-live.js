/** Video and live: local per-frame effects on a chosen clip, and later on the live camera.
 * Every frame is processed on this device from what was measured on it (face points, a
 * person mask); nothing is uploaded and no frame is stored. A processed clip is recorded only
 * when she ticks "keep", and it is offered as a download only when she saves it. Labelled
 * simulations; skin effects are not medical advice. Author: John Khan.
 */
import { LongWork } from "../ui/long-work.js";
import { ensureConsent } from "../ui/one-consent.js";
import { appConsent } from "../ui/shell/consent.js";
import { announce, clear, h } from "../dom.js";
import { browserMirrorDeps, clipFrames, clipRecorder, frameToPng, measureFrame, modelsReady } from "../reel/live/browser.js";
import { LiveMirror } from "../reel/live/mirror.js";
import { BACKDROP_NAMES, EFFECTS, backdropFor, effectChoice } from "../reel/live/effects.js";
import { APPEARANCE_MODES } from "../reel/live/appearance.js";
import { LIVE_FILTERS } from "../reel/live/ar-filters.js";
import { LENSES } from "../lenses/recipes.js";
import { loadPictures } from "../lenses/pictures.js";
import { processSequence } from "../reel/live/frames.js";
import { ReelProject } from "../reel/live/editor.js";
import { paintPreview } from "./local-preview.js";
export const CLIP_FPS = 10;
export const browserVideoDeps = {
    frames: clipFrames, measure: measureFrame, ready: modelsReady, recorder: clipRecorder, paint: paintPreview,
    save(blob, name) {
        const a = h("a", { class: "btn", href: URL.createObjectURL(blob), download: name }, "Save the processed clip");
        return a;
    },
    mirror: browserMirrorDeps,
    still: frameToPng,
};
export function renderVideoLive(main, _ctx, deps = browserVideoDeps) {
    clear(main);
    let revision = 0, disposed = false;
    // One Stop for whichever clip work is running (processing, finding scenes, rendering a reel).
    const work = new LongWork("Stop processing", () => { revision++; });
    const status = h("p", { class: "fine", "aria-live": "polite" });
    const preview = h("div", { class: "video-preview" });
    const saved = h("div", {});
    const file = h("input", { type: "file", accept: "video/*", id: "video-clip" });
    const effect = h("select", { id: "video-effect" }, ...EFFECTS.map((e) => h("option", { value: e.id }, e.title)));
    effect.value = EFFECTS[0].id;
    const strength = h("input", { type: "range", id: "video-strength", min: "0", max: "100", step: "5", value: "60" });
    const backdrop = h("select", { id: "video-backdrop" }, ...BACKDROP_NAMES.map((name) => h("option", { value: name }, name === "soft" ? "soft blur of your own background" : name)));
    backdrop.value = "ivoire";
    const filter = h("select", { id: "video-filter" }, ...LIVE_FILTERS.map((f) => h("option", { value: f.id }, f.title)));
    filter.value = LIVE_FILTERS[0].id;
    const appearance = h("select", { id: "video-appearance" }, ...APPEARANCE_MODES.map((m) => h("option", { value: m.id }, m.title)));
    appearance.value = APPEARANCE_MODES[0].id;
    const lens = h("select", { id: "video-lens" }, ...LENSES.map((l) => h("option", { value: l.id }, l.title)));
    lens.value = LENSES[0].id;
    let lensPictures;
    void loadPictures().then((found) => { lensPictures = found; }).catch(() => { lensPictures = undefined; });
    const keep = h("input", { type: "checkbox", id: "video-keep" });
    const run = h("button", { class: "btn", type: "button" }, "Process this clip on this device");
    // Reel editor (#79): scan once, keep or drop scenes, ramp strength inside each scene, render.
    let project = null;
    const sceneList = h("div", { class: "reel-scenes" });
    const rampStart = h("input", { type: "range", id: "reel-ramp-start", min: "0", max: "100", step: "5", value: "30" });
    const rampEnd = h("input", { type: "range", id: "reel-ramp-end", min: "0", max: "100", step: "5", value: "80" });
    const findScenes = h("button", { class: "btn btn-quiet", type: "button" }, "Find the scenes in this clip");
    const renderReel = h("button", { class: "btn", type: "button", disabled: true }, "Render the kept scenes");
    const reelStatus = h("p", { class: "fine", "aria-live": "polite" });
    findScenes.addEventListener("click", async () => {
        const chosen = file.files?.[0];
        if (!chosen) {
            reelStatus.textContent = "Choose a clip first.";
            return;
        }
        const own = ++revision, next = new ReelProject(), signal = work.begin();
        findScenes.disabled = true;
        try {
            for await (const frame of deps.frames(chosen, CLIP_FPS)) {
                if (disposed || own !== revision || signal.aborted) {
                    reelStatus.textContent = "Stopped. Nothing was kept.";
                    return;
                }
                next.scan(frame);
                if (next.times.length % 10 === 0)
                    reelStatus.textContent = `Scanned ${next.times.length} frames on this device.`;
            }
            const scenes = next.findScenes();
            project = next;
            clear(sceneList);
            for (const scene of scenes) {
                const box = h("input", { type: "checkbox", id: `reel-scene-${scene.index}`, checked: true });
                box.checked = true;
                box.addEventListener("change", () => project?.setKeep(scene.index, box.checked));
                sceneList.append(h("p", { class: "check" }, box, h("label", { for: box.id }, `Scene ${scene.index + 1}: ${scene.start.toFixed(1)} s to ${scene.end.toFixed(1)} s`)));
            }
            renderReel.disabled = false;
            reelStatus.textContent = `Found ${scenes.length} scene${scenes.length === 1 ? "" : "s"} on this device. Untick a scene to leave it out.`;
        }
        catch (error) {
            if (!disposed && own === revision)
                reelStatus.textContent = error instanceof Error ? error.message : "This clip could not be scanned.";
        }
        finally {
            findScenes.disabled = false;
            work.end(signal);
        }
    });
    renderReel.addEventListener("click", async () => {
        const chosen = file.files?.[0], current = project;
        if (!chosen || !current)
            return;
        const own = ++revision, choice = effectChoice(effect.value), needs = { face: choice.needsFace, person: choice.needsPerson };
        clear(saved);
        if (!deps.ready(needs)) {
            reelStatus.textContent = "This effect needs an on-device model that is not available in this browser yet. Nothing was changed.";
            return;
        }
        if (!current.keptFrames()) {
            reelStatus.textContent = "Every scene is unticked, so there is nothing to render.";
            return;
        }
        current.setKeyframes(current.scenes.flatMap((scene) => [
            { t: scene.start, strength: Number(rampStart.value) }, { t: scene.end, strength: Number(rampEnd.value) }
        ]));
        const made = choice.make({ backdrop: backdropFor(backdrop.value), filter: filter.value, appearance: appearance.value, lens: lens.value, lensPictures });
        let recorder = null, last = null, rendered = 0;
        renderReel.disabled = true;
        const signal = work.begin();
        try {
            const done = await current.render(deps.frames(chosen, CLIP_FPS), made, (frame) => deps.measure(frame.image, needs), (output) => {
                if (disposed || own !== revision || signal.aborted)
                    throw new Error("stopped");
                if (keep.checked) {
                    recorder ??= deps.recorder(output.image.width, output.image.height, CLIP_FPS);
                    recorder.push(output.image);
                }
                last = output.image;
                if (++rendered % 10 === 0)
                    reelStatus.textContent = `Rendered ${rendered} of ${current.keptFrames()} frames on this device.`;
            });
            if (disposed || own !== revision)
                return;
            clear(preview);
            if (last)
                preview.append(deps.paint(last, `${made.label} Last rendered frame of the reel.`));
            reelStatus.textContent = `Rendered ${done.frames} frames from ${done.scenes} scene${done.scenes === 1 ? "" : "s"} on this device; nothing was uploaded.`;
            if (recorder) {
                const blob = await recorder.finish();
                if (!disposed && own === revision)
                    saved.append(deps.save(blob, "beljour-reel.webm"));
            }
            else
                reelStatus.textContent += " No clip was kept.";
            announce(reelStatus.textContent);
        }
        catch (error) {
            if (!disposed && own === revision)
                reelStatus.textContent = error instanceof Error && error.message !== "stopped" ? error.message : "Rendering stopped. Nothing was kept.";
        }
        finally {
            renderReel.disabled = false;
            work.end(signal);
        }
    });
    // Live mirror (#98): the camera opens only after she ticks the camera consent and taps start.
    const camVideo = h("video", { class: "mirror-src", hidden: true });
    const camDisplay = h("canvas", { class: "mirror-view", role: "img", "aria-label": "Live mirror on this device" });
    const mirror = new LiveMirror(deps.mirror(camVideo, camDisplay));
    const startMirror = h("button", { class: "btn", type: "button" }, "Start the live mirror");
    const stopMirror = h("button", { class: "btn btn-quiet", type: "button", disabled: true }, "Stop the camera");
    const saveStill = h("button", { class: "btn btn-quiet", type: "button", disabled: true }, "Save this frame");
    const mirrorStatus = h("p", { class: "fine", "aria-live": "polite" });
    const mirrorSaved = h("div", {});
    const syncMirrorEffect = () => {
        const choice = effectChoice(effect.value), needs = { face: choice.needsFace, person: choice.needsPerson };
        if (!deps.ready(needs)) {
            mirror.setEffect(null, { face: false, person: false }, 0);
            mirrorStatus.textContent = "This effect needs an on-device model that is not available in this browser yet; the mirror shows the camera unchanged.";
            return false;
        }
        mirror.setEffect(choice.make({ backdrop: backdropFor(backdrop.value), filter: filter.value, appearance: appearance.value,
            lens: lens.value, lensPictures, lensBeauty: false }), needs, Number(strength.value));
        return true;
    };
    const endMirror = () => { mirror.stop(); startMirror.disabled = false; stopMirror.disabled = saveStill.disabled = true; };
    startMirror.addEventListener("click", async () => {
        const withEffect = syncMirrorEffect();
        if (!(await ensureConsent())) {
            mirrorStatus.textContent = "The camera stays off.";
            return;
        }
        const result = await mirror.start(true);
        if (!result.started) {
            mirrorStatus.textContent = result.reason === "camera_consent" ? "Continue on the consent screen first. The camera stays off."
                : result.reason === "camera_unavailable" ? "The camera is unavailable. You can still process a clip." : "The mirror is already starting.";
            return;
        }
        startMirror.disabled = true;
        stopMirror.disabled = saveStill.disabled = false;
        if (withEffect)
            mirrorStatus.textContent = "Live mirror on. Frames are processed on this device and are not recorded or uploaded.";
    });
    stopMirror.addEventListener("click", () => { endMirror(); mirrorStatus.textContent = "Camera off. No frame was kept."; });
    // Withdrawing the one consent (Trust page, any tab) turns the camera off at once.
    const stopOnWithdraw = appConsent.subscribe(() => {
        if (!appConsent.hasVisit && mirror.state !== "off") {
            endMirror();
            mirrorStatus.textContent = "Consent withdrawn; the camera is off.";
        }
    });
    for (const control of [effect, strength, backdrop, filter, appearance, lens])
        control.addEventListener("change", () => { if (mirror.state === "on")
            syncMirrorEffect(); });
    saveStill.addEventListener("click", async () => {
        const frame = mirror.saveFrame();
        if (!frame)
            return;
        clear(mirrorSaved);
        mirrorSaved.append(deps.save(await deps.still(frame), "beljour-mirror.png"));
        mirrorStatus.textContent = "Frame ready to save. Only this frame was kept.";
    });
    run.addEventListener("click", async () => {
        const chosen = file.files?.[0];
        if (!chosen) {
            status.textContent = "Choose a clip first.";
            return;
        }
        const own = ++revision, choice = effectChoice(effect.value), needs = { face: choice.needsFace, person: choice.needsPerson };
        clear(saved);
        if (!deps.ready(needs)) {
            status.textContent = needs.person
                ? "This effect needs the on-device person outline, which is not available in this browser yet. Nothing was changed."
                : "This effect needs on-device face points, which are not available in this browser yet. Nothing was changed.";
            return;
        }
        run.disabled = true;
        const signal = work.begin();
        let recorder = null, last = null, count = 0;
        try {
            const made = choice.make({ backdrop: backdropFor(backdrop.value), filter: filter.value, appearance: appearance.value, lens: lens.value, lensPictures });
            const report = await processSequence(deps.frames(chosen, CLIP_FPS), made, (frame) => deps.measure(frame.image, needs), (output) => {
                if (disposed || own !== revision || signal.aborted)
                    throw new Error("stopped");
                if (keep.checked) {
                    recorder ??= deps.recorder(output.image.width, output.image.height, CLIP_FPS);
                    recorder.push(output.image);
                }
                last = output.image;
                count++;
                if (count % 10 === 0)
                    status.textContent = `Processed ${count} frames on this device.`;
            }, Number(strength.value));
            if (disposed || own !== revision)
                return;
            clear(preview);
            if (last)
                preview.append(deps.paint(last, `${made.label} Last processed frame.`));
            const notes = report.notes.length ? ` ${report.notes.join(" ")}` : "";
            status.textContent = `Processed ${report.frames} frames on this device; nothing was uploaded.${notes}`;
            if (recorder) {
                const blob = await recorder.finish();
                if (!disposed && own === revision)
                    saved.append(deps.save(blob, "beljour-clip.webm"));
            }
            else
                status.textContent += " No clip was kept.";
            announce(status.textContent);
        }
        catch (error) {
            if (!disposed && own === revision)
                status.textContent = error instanceof Error && error.message !== "stopped"
                    ? error.message : "Processing stopped. Nothing was kept.";
        }
        finally {
            run.disabled = false;
            work.end(signal);
        }
    });
    main.append(h("h1", {}, "Video and live"), h("p", { class: "lede" }, "Local effects on a clip, frame by frame, on this device. Nothing is uploaded and no frame is stored."), h("section", {}, h("h2", {}, "Process a clip"), h("label", { for: file.id }, "Clip", file), h("label", { for: effect.id }, "Effect", effect), h("label", { for: strength.id }, "Strength", strength), h("label", { for: backdrop.id }, "New background", backdrop), h("label", { for: filter.id }, "Live filter", filter), h("label", { for: appearance.id }, "Appearance", appearance), h("label", { for: lens.id }, "Face lens", lens), h("p", { class: "check" }, keep, h("label", { for: keep.id }, "Keep the processed clip so I can save it")), run, work.button, status), h("section", {}, h("h2", {}, "Edit a reel"), h("p", {}, "Scenes are found from the clip's brightness on this device. Strength ramps inside each scene and never across a cut."), findScenes, sceneList, h("label", { for: rampStart.id }, "Strength at the start of each scene", rampStart), h("label", { for: rampEnd.id }, "Strength at the end of each scene", rampEnd), renderReel, reelStatus), h("section", {}, h("h2", {}, "Live mirror"), h("p", { class: "fine" }, "Uses your camera on this device. Nothing is recorded or uploaded unless you save a frame."), h("div", { class: "row" }, startMirror, stopMirror, saveStill), mirrorStatus, camDisplay, camVideo, mirrorSaved), preview, saved, h("p", { class: "fine" }, "Every effect is a labelled simulation. Skin effects are general cosmetic information, not medical advice."), h("p", { class: "fine" }, "Age and gender appearance uses the same engines as photos, frame by frame; it is not a prediction of age, sex or gender identity, and its quality on video has not been tested."));
    return () => { disposed = true; revision++; work.stop(); mirror.stop(); stopOnWithdraw(); };
}
