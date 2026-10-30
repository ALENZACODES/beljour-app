/** Eyes, brows and original art studio. All image work is local. Author: John Khan. */
import { h } from "../../dom.js";
import { readFace } from "../../face/landmarks.js";
import { defaultVisionClient } from "../../vision/client.js";
import { makeSample } from "../shell/demo.js";
import { FEATURES, featureById } from "./catalogue.js";
import { PreviewCancelled, PreviewClient } from "./client.js";
import { CONTROLS, checkedControl, initialControls } from "./controls.js";
import { download, exportLabelled, openPhoto, rgbaData } from "./files.js";
import { MAX_EVIDENCE_BYTES, parseEvidence, pixelFingerprint } from "./input.js";
import { canvasPoint } from "./observations.js";
import { detailView } from "./present.js";
import { PreviewSession } from "./session.js";
import { PALETTE } from "../palette.js";
export function mountEyesBrows(root) {
    const session = new PreviewSession(), worker = new PreviewClient();
    let importController = null;
    let generation = 0, disposed = false, showingBefore = false;
    let animation = null;
    let drawingTool = "hair";
    let pointerId = null;
    const status = h("p", { role: "status", "aria-live": "polite", class: "eb-status" }, "Choose a local photo or a labelled drawn fixture.");
    const caption = h("p", { class: "eb-note" }, "Nothing is uploaded. The original stays in memory until you clear it or close this page.");
    const original = h("canvas", { width: 320, height: 360, "aria-label": "Original photo, local only" });
    const result = h("canvas", { width: 320, height: 360, "aria-label": "Simulation result; use the labelled controls below to mark evidence", tabindex: 0 });
    const photoInput = h("input", { type: "file", accept: "image/jpeg,image/png,image/webp", "aria-label": "Open a local photo" });
    const evidenceInput = h("input", { type: "file", accept: ".json,application/json", "aria-label": "Import checked local geometry and observations" });
    const selector = h("select", { "aria-label": "Feature" });
    for (const [family, label] of [["eyes", "Eyes and lashes"], ["brows", "Brows"], ["artistic", "Original art"]]) {
        const group = h("optgroup", { label });
        FEATURES.filter(item => item.family === family).forEach(item => group.append(h("option", { value: item.id }, `${item.id.startsWith("W") ? `${item.id} · ` : ""}${item.name}`)));
        selector.append(group);
    }
    const styles = h("select", { "aria-label": "Style" });
    const summary = h("p", {}), limitation = h("p", { class: "eb-note" });
    const controls = h("div", { class: "eb-control-grid" });
    const amount = h("input", { type: "range", min: 0, max: 100, value: 35, step: 1, "aria-label": "Simulation amount" });
    const amountOutput = h("output", {}, "35%");
    const light = h("input", { type: "range", min: -80, max: 80, step: 5, value: 0, "aria-label": "Light angle in degrees" });
    const lightOutput = h("output", {}, "0°");
    const lightLabel = h("label", {}, "Light angle ", light, lightOutput);
    const animate = h("button", { type: "button", class: "eb-button", "aria-pressed": "false" }, "Move the light");
    const rightEye = anatomySelect("Right eye anatomy"), leftEye = anatomySelect("Left eye anatomy");
    const anatomyGroup = h("div", { class: "eb-anatomy" }, h("label", {}, "Your right eye ", rightEye), h("label", {}, "Your left eye ", leftEye), h("p", { class: "eb-note" }, "Choose each eye separately. These describe placement; nothing corrects or reshapes your eye anatomy."));
    const run = h("button", { type: "button", class: "eb-button eb-primary" }, "Preview locally");
    const cancel = h("button", { type: "button", class: "eb-button" }, "Cancel preview");
    const reset = h("button", { type: "button", class: "eb-button" }, "Reset preview");
    const compare = h("button", { type: "button", class: "eb-button", "aria-pressed": "false" }, "Show original");
    const save = h("button", { type: "button", class: "eb-button" }, "Download labelled preview");
    const readings = h("div", {});
    const reasons = h("ul", { class: "eb-reasons" });
    const tool = h("select", { "aria-label": "Evidence drawing tool" }, ...["hair", "erase", "right-upper", "right-lower", "left-upper", "left-lower"].map(value => h("option", { value }, value === "hair" ? "Mark hair" : value === "erase" ? "Erase hair mark" : `Trace ${value.replace("-", " ")} lash`)));
    const brush = h("input", { type: "range", min: 1, max: 60, value: 12, "aria-label": "Hair brush radius" });
    const showEvidence = h("input", { type: "checkbox", checked: true });
    const evidenceCount = h("p", { class: "eb-note" }, "0 observed lashes; hair not marked.");
    const noHair = h("button", { type: "button", class: "eb-button" }, "Confirm no hair is visible");
    const clearHair = h("button", { type: "button", class: "eb-button" }, "Clear hair marks");
    const undoTrace = h("button", { type: "button", class: "eb-button" }, "Remove last lash trace");
    const detect = h("button", { type: "button", class: "eb-button" }, "Find face points on this device");
    detect.disabled = !defaultVisionClient().ready("face-landmarks");
    const modelNote = h("p", { class: "eb-note" }, detect.disabled
        ? "Automatic face points are unavailable until the existing model licence and hash gate is cleared. Import checked points for this photo, or use the drawn fixture."
        : "Face detection uses the existing cleared local runtime. Check the face selection before previewing.");
    const markHelp = h("p", { class: "eb-note" }, "Drag on the result canvas to mark hair or trace a visible lash from root to tip. Keyboard-only users can import a checked observation file. No blank trace is turned into an invented lash.");
    const header = h("header", { class: "eb-heading" }, h("p", { class: "eb-kicker" }, "BELJOUR / LOCAL STUDIO"), h("h1", {}, "Eyes, brows and original art"), h("p", {}, "Explore placement and texture, with each assumption visible."));
    const load = h("section", { class: "eb-card", "aria-label": "Local inputs" }, h("h2", {}, "1. Open and check"), h("label", {}, "Photo on this device ", photoInput), h("div", { class: "eb-actions" }, h("button", { type: "button", class: "eb-button", onclick: () => loadDrawn() }, "Use drawn fixture"), h("button", { type: "button", class: "eb-button", onclick: () => clearPhoto() }, "Clear photo and observations")), detect, modelNote, h("label", {}, "Checked local geometry file ", evidenceInput), h("button", { type: "button", class: "eb-button", onclick: () => void exportEvidence() }, "Export observations for this photo"), caption);
    const editing = h("section", { class: "eb-card", "aria-label": "Simulation controls" }, h("h2", {}, "2. Choose a simulation"), h("label", {}, "Feature ", selector), summary, styles, anatomyGroup, h("label", {}, "Amount ", amount, amountOutput), controls, lightLabel, animate, limitation, reasons, h("div", { class: "eb-actions" }, run, cancel, reset, compare, save));
    const observations = h("details", { class: "eb-card" }, h("summary", {}, "Hair protection and observed lashes"), tool, h("label", {}, "Hair brush radius ", brush), h("label", { class: "eb-check" }, showEvidence, " Show marks and traces"), markHelp, evidenceCount, h("div", { class: "eb-actions" }, noHair, clearHair, undoTrace));
    root.replaceChildren(header, h("div", { class: "eb-layout" }, h("aside", {}, load, editing, observations), h("section", { class: "eb-workspace", "aria-label": "Local comparison" }, h("div", { class: "eb-comparison" }, h("figure", {}, original, h("figcaption", {}, "Original")), h("figure", {}, result, h("figcaption", {}, "Simulation / evidence marks"))), status, readings)));
    function stopMotion() {
        if (animation !== null)
            clearInterval(animation);
        animation = null;
        animate.textContent = "Move the light";
        animate.setAttribute("aria-pressed", "false");
    }
    function changed() { worker.cancel(); session.invalidate(); showingBefore = false; refresh(); draw(); }
    function refresh() {
        const missing = session.reasons();
        reasons.replaceChildren(...missing.map(reason => h("li", {}, reason)));
        run.disabled = missing.length > 0;
        cancel.disabled = !worker.running;
        save.disabled = !session.result;
        compare.disabled = !session.result;
        compare.textContent = showingBefore ? "Show simulation" : "Show original";
        compare.setAttribute("aria-pressed", String(showingBefore));
        noHair.disabled = clearHair.disabled = undoTrace.disabled = !session.hasPhoto;
        const measured = session.observations;
        evidenceCount.textContent = `${measured?.count ?? 0} observed lashes; hair ${measured?.hairDeclared ? "checked" : "not marked"}.`;
        if (!session.result)
            readings.replaceChildren();
    }
    function draw() {
        const image = session.image;
        if (!image) {
            for (const canvas of [original, result]) {
                const ctx = canvas.getContext("2d");
                ctx?.clearRect(0, 0, canvas.width, canvas.height);
            }
            return;
        }
        const after = session.result;
        for (const canvas of [original, result]) {
            canvas.width = image.width;
            canvas.height = image.height;
        }
        original.getContext("2d")?.putImageData(rgbaData(image), 0, 0);
        const ctx = result.getContext("2d");
        if (!ctx)
            return;
        ctx.putImageData(rgbaData(image, after && !showingBefore ? after.pixels : image.data), 0, 0);
        if (showEvidence.checked && session.observations && !showingBefore) {
            const mask = session.observations.mask;
            const overlay = new Uint8ClampedArray(image.data.length);
            for (let i = 0; i < mask.length; i++) {
                overlay[i * 4] = 0;
                overlay[i * 4 + 1] = 145;
                overlay[i * 4 + 2] = 230;
                overlay[i * 4 + 3] = Math.round(mask[i] * 85);
            }
            const layer = document.createElement("canvas");
            layer.width = image.width;
            layer.height = image.height;
            layer.getContext("2d")?.putImageData(new ImageData(overlay, image.width, image.height), 0, 0);
            ctx.drawImage(layer, 0, 0);
            layer.width = layer.height = 1;
            ctx.strokeStyle = PALETTE.wine;
            ctx.lineWidth = 1.5;
            for (const trace of session.observations.traces) {
                ctx.beginPath();
                trace.points.forEach((point, index) => index === 0 ? ctx.moveTo(point[0] * image.width, point[1] * image.height) : ctx.lineTo(point[0] * image.width, point[1] * image.height));
                ctx.stroke();
            }
        }
    }
    function featureControls() {
        const item = featureById(session.feature);
        summary.textContent = item.summary;
        limitation.textContent = item.limitation;
        styles.replaceChildren(...item.choices.map(choice => h("option", { value: choice.value }, choice.label)));
        styles.hidden = item.choices.length === 0;
        anatomyGroup.hidden = item.family !== "eyes";
        lightLabel.hidden = animate.hidden = item.id !== "W67";
        controls.replaceChildren();
        for (const control of CONTROLS[item.id] ?? []) {
            const input = h("input", { type: "range", min: control.min, max: control.max, step: control.step, value: control.initial });
            const value = h("output", {}, String(control.initial));
            input.addEventListener("input", () => {
                try {
                    session.setControl(control.key, checkedControl(item.id, control.key, Number(input.value)));
                    value.textContent = input.value;
                    changed();
                }
                catch (error) {
                    showError(error);
                }
            });
            controls.append(h("label", {}, control.label, input, value, h("small", {}, control.help)));
        }
        for (const [key, value] of Object.entries(initialControls(item.id)))
            session.setControl(key, value);
        refresh();
    }
    function showError(error) {
        if (disposed || error instanceof PreviewCancelled)
            return;
        status.textContent = error instanceof Error ? error.message : "This local action could not finish.";
        refresh();
    }
    async function preview() {
        let id = null;
        try {
            const job = session.job();
            id = job.id;
            status.textContent = "Rendering locally. The original is retained.";
            const task = worker.run(job);
            refresh();
            const response = await task;
            if (disposed || !session.complete(job.id, response))
                return;
            status.textContent = `${response.label} ${response.warnings.join(" ")} Preview computation: ${response.elapsedMs.toFixed(0)} ms on this device.`;
            readings.replaceChildren(detailView(response.metrics));
            showingBefore = false;
            draw();
            refresh();
        }
        catch (error) {
            if (id !== null)
                session.failed(id);
            showError(error);
        }
    }
    function clearPhoto() {
        generation++;
        importController?.abort();
        worker.cancel();
        stopMotion();
        session.clear();
        photoInput.value = evidenceInput.value = "";
        status.textContent = "Photo, face points and observations cleared from this studio.";
        refresh();
        draw();
    }
    function loadDrawn() {
        clearPhoto();
        const sample = makeSample("portrait"), rgba = new Uint8ClampedArray(sample.image.width * sample.image.height * 4);
        for (let i = 0; i < sample.image.width * sample.image.height; i++) {
            rgba.set(sample.image.data.slice(i * 3, i * 3 + 3), i * 4);
            rgba[i * 4 + 3] = 255;
        }
        session.load({ width: sample.image.width, height: sample.image.height, channels: 4, data: rgba }, true);
        session.setMesh(sample.face.map(point => [point[0] / sample.image.width, point[1] / sample.image.height]));
        status.textContent = "Drawn fixture. No real person and no real-face quality evidence. Mark hair or trace lashes to use observation-dependent features.";
        featureControls();
        refresh();
        draw();
    }
    async function exportEvidence() {
        try {
            const image = session.image, landmarks = session.landmarks;
            if (!image || !landmarks)
                throw new RangeError("Open a photo and check its face points before exporting observations.");
            const payload = { format: "beljour-eyes-brows-input/1", width: image.width, height: image.height,
                pixel_sha256: await pixelFingerprint(image), landmarks,
                ...(session.observations?.hairDeclared ? { hair_mask: Array.from(session.observations.mask) } : {}),
                observed_lashes: session.observations?.traces ?? [], anatomy: session.anatomy };
            download(new Blob([JSON.stringify(payload)], { type: "application/json" }), "beljour-local-observations.json");
            status.textContent = "Local observation file downloaded by your request. It contains face geometry; keep it private.";
        }
        catch (error) {
            showError(error);
        }
    }
    photoInput.addEventListener("change", async () => {
        const file = photoInput.files?.[0];
        if (!file)
            return;
        const token = ++generation;
        importController?.abort();
        importController = new AbortController();
        stopMotion();
        worker.cancel();
        try {
            const image = await openPhoto(file, importController.signal);
            if (disposed || token !== generation)
                return;
            session.load(image);
            featureControls();
            refresh();
            draw();
            status.textContent = "Photo opened locally. Add checked face points before eye and brow previews.";
        }
        catch (error) {
            if (token === generation)
                showError(error);
        }
    });
    evidenceInput.addEventListener("change", async () => {
        const file = evidenceInput.files?.[0], image = session.image, version = session.version;
        if (!file || !image)
            return;
        try {
            if (file.size > MAX_EVIDENCE_BYTES)
                throw new RangeError("The observation file is too large.");
            const parsed = parseEvidence(await file.text(), image, await pixelFingerprint(image));
            if (disposed || version !== session.version)
                return;
            session.importEvidence(parsed);
            rightEye.value = session.anatomy.right;
            leftEye.value = session.anatomy.left;
            refresh();
            draw();
            status.textContent = "Checked observations attached to this exact local photo. No consent was imported.";
        }
        catch (error) {
            showError(error);
        }
    });
    detect.addEventListener("click", async () => {
        if (!session.hasPhoto) {
            status.textContent = "Open a photo first.";
            return;
        }
        const version = session.version;
        try {
            const face = await readFace(original);
            if (disposed || version !== session.version)
                return;
            if (!face || face.points.length !== 478)
                throw new RangeError("A complete face was not found. Your photo remains unchanged.");
            session.setMesh(face.points.map(point => [point.x, point.y]));
            refresh();
            status.textContent = "Local face points found. Choose the eye anatomy that matches your photo.";
        }
        catch (error) {
            showError(error);
        }
    });
    selector.addEventListener("change", () => { stopMotion(); worker.cancel(); session.select(selector.value); featureControls(); draw(); });
    styles.addEventListener("change", () => { session.setStyle(styles.value); changed(); });
    amount.addEventListener("input", () => { session.setAmount(Number(amount.value) / 100); amountOutput.textContent = `${amount.value}%`; changed(); });
    rightEye.addEventListener("change", () => { session.setAnatomy("right", rightEye.value); changed(); });
    leftEye.addEventListener("change", () => { session.setAnatomy("left", leftEye.value); changed(); });
    light.addEventListener("input", () => { session.setAngle(Number(light.value)); lightOutput.textContent = `${light.value}°`; changed(); });
    animate.addEventListener("click", () => {
        if (animation !== null) {
            stopMotion();
            return;
        }
        if (session.reasons().length) {
            status.textContent = session.reasons().join(" ");
            return;
        }
        animate.textContent = "Stop moving light";
        animate.setAttribute("aria-pressed", "true");
        animation = setInterval(() => {
            if (worker.running || disposed || session.feature !== "W67")
                return;
            const next = session.angle >= 70 ? -70 : session.angle + 20;
            session.setAngle(next);
            light.value = String(next);
            lightOutput.textContent = `${next}°`;
            void preview();
        }, 500);
    });
    run.addEventListener("click", () => void preview());
    cancel.addEventListener("click", () => { worker.cancel(); session.invalidate(); stopMotion(); status.textContent = "Preview cancelled; original retained."; refresh(); draw(); });
    reset.addEventListener("click", () => { stopMotion(); changed(); });
    compare.addEventListener("click", () => { showingBefore = !showingBefore; draw(); refresh(); });
    save.addEventListener("click", async () => {
        const image = session.image, current = session.result, name = featureById(session.feature).name;
        if (!image || !current)
            return;
        try {
            download(await exportLabelled(image, current.pixels, name, session.synthetic), `beljour-${session.feature.toLowerCase()}-simulation.png`);
        }
        catch (error) {
            showError(error);
        }
    });
    tool.addEventListener("change", () => { session.observations?.cancel(); drawingTool = tool.value; });
    showEvidence.addEventListener("change", draw);
    noHair.addEventListener("click", () => { session.observations?.declareNoHair(); changed(); });
    clearHair.addEventListener("click", () => { session.observations?.clearHair(); changed(); });
    undoTrace.addEventListener("click", () => { session.observations?.removeLastTrace(); changed(); });
    result.addEventListener("pointerdown", event => {
        if (!session.observations || pointerId !== null || event.button !== 0)
            return;
        try {
            session.observations.begin(drawingTool, canvasPoint(event.clientX, event.clientY, result.getBoundingClientRect()), Number(brush.value));
            pointerId = event.pointerId;
            result.setPointerCapture(event.pointerId);
            draw();
        }
        catch (error) {
            showError(error);
        }
    });
    result.addEventListener("pointermove", event => {
        if (pointerId !== event.pointerId)
            return;
        session.observations?.move(canvasPoint(event.clientX, event.clientY, result.getBoundingClientRect()), Number(brush.value));
        draw();
    });
    result.addEventListener("pointerup", event => {
        if (pointerId !== event.pointerId)
            return;
        pointerId = null;
        try {
            session.observations?.end();
            changed();
        }
        catch (error) {
            showError(error);
        }
    });
    result.addEventListener("pointercancel", () => { pointerId = null; session.observations?.cancel(); draw(); });
    featureControls();
    refresh();
    return () => { disposed = true; generation++; importController?.abort(); stopMotion(); worker.dispose(); session.clear(); root.replaceChildren(); };
}
function anatomySelect(label) {
    return h("select", { "aria-label": label }, ...["open", "hooded", "monolid", "deep_set"].map(value => h("option", { value }, value.replace("_", " "))));
}
const root = typeof document === "undefined" ? null : document.getElementById("eyes-brows-root");
if (root) {
    const dispose = mountEyesBrows(root);
    window.addEventListener("pagehide", dispose, { once: true });
}
//# sourceMappingURL=entry.js.map