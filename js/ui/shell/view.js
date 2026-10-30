import { engineToVisible, visibleToEngine, setStrengthRange, PreviewDebouncer } from "../../layout/strength-scale.js";
/** Working studio UI (R8 shell, extended in R9). Native buttons and inputs; no framework, CDN or
 * third-party art. The editor page never calls fetch and never sends a user photo anywhere.
 * R9 adds: the ten compare modes (compare-view.ts), visit consent before opening a photo and a
 * styling transfer that explains what is sent (consent.ts), the on-device pre-check and the
 * thumbnail strip, both computed in the shell worker, the demo tour (web/src/demo/), the phone
 * panel tabs, a keyboard map with a shortcuts dialog, and live-region announcements.
 * Author: John Khan.
 */
import { SIDEBAR_SECTIONS, defaultSample, readiness, tool, toolsIn } from "./catalogue.js";
import { Editor } from "./controller.js";
import { readLocalImage, SAMPLE_IDS, SAMPLE_NAMES, uploadedSource } from "./demo.js";
import { EXAMPLE_LABEL, examplePeople, framingPoints } from "../../screens/shape-art.js";
import { faceMapFor } from "../../face/map-reader.js";
import { studioMapKey } from "../../screens/face-map.js";
import { paint, downloadCanvas, label as burnLabel, SIMULATION_TAG } from "./canvas.js";
import { isEmpty as createIsEmpty } from "../../editor/create/doc.js";
import { burnCreate, releaseCanvas, showsEditedPhoto } from "../../editor/create/export.js";
import { sharedAssets } from "../../editor/create/assets.js";
import { hapticTick, strengthName, stopsFor } from "./stops.js";
import { documentEvidence } from "./evidence.js";
import { pixelsChanged } from "./pipeline.js";
import { POSTURE_DEFAULTS } from "./settings.js";
import { AnnotationDraft, drawMarks, pointFromScreen } from "./annotations.js";
import { MODES, STEPS as ENHANCE_STEPS } from "../../engines/local/enhance.js";
import { STYLES } from "../../engines/local/beard.js";
import { PRODUCTS } from "../../engines/local/strands.js";
import { fixesFor } from "../../engines/local/posture.js";
import { CompareController } from "./compare-view.js";
import { StripView, renderPrecheck } from "./strip-view.js";
import { Modal } from "./dialogs.js";
import { LOCAL_ONLY_REASON, PROVIDER_FACTS, VISIT_STATEMENTS, appConsent } from "./consent.js";
import { PANELS, PANEL_LABELS, PanelTabs, isPhone } from "./panels.js";
import { SHORTCUTS, resolveKey } from "./keymap.js";
import { Announcer, regionSink } from "./announcer.js";
import { audit, fromDom } from "./a11y.js";
import { createShellClient } from "./worker-protocol.js";
import { DEMO_SCENES } from "../../demo/scenes.js";
import { DemoTour, demoHash, parseDemoHash } from "../../demo/loader.js";
import { PHONE_MAX } from "./compare-layout.js";
import { HairStudio } from "../studios/hair/view.js";
import { hashModel } from "../../vision/model-registry.js";
import { defaultVisionClient } from "../../vision/client.js";
import { faceReaderReady, stagedModels } from "../../vision/staged.js";
import { toRGBA } from "../../engines/core/buffer.js";
import { readHeader } from "../../image/decode.js";
import { photoPicker } from "../../photos/picker.js";
import { heroAppearanceScreen } from "../../screens/hero-appearance.js";
import { lightingScreen } from "../../screens/lighting.js";
import { recolourScreen, CURL_PATTERNS } from "../../screens/recolour.js";
import { balayageScreen } from "../../screens/balayage.js";
import { skinToolsScreen } from "../../screens/skin-tools.js";
import { illustrationScreen, photoStudioScreen } from "../../screens/photo-studio.js";
import { STUDIO_LAYER_TOOLS, STUDIO_TOOL_NAMES } from "./studio-layer.js";
import { BACKDROPS } from "../../engines/studio/backdrops.js";
import { INDUSTRIES } from "../../engines/studio/headshot.js";
import { SIDES } from "../../engines/studio/relight.js";
import { LOOKS as ILLUSTRATION_LOOKS } from "../../engines/studio/illustration.js";
import { GLOWS } from "../../engines/skin/finish.js";
import { SHIFTS as UNDERTONES } from "../../engines/skin/glow-tan.js";
import { SKIN_LAYER_TOOLS as SKIN_TOOLS, SKIN_TOOL_NAMES } from "./skin-layer.js";
import { MAKEUP_PRODUCTS, MAKEUP_PRODUCT_NAMES, lookParams } from "./makeup-layer.js";
import { FINISHES, LOOKS as MAKEUP_LOOKS } from "../../engines/beauty/makeup.js";
import { presetIds, preset } from "../../engines/shade/lighting.js";
import { LEVELS } from "../../engines/haircolour/generated/levels.js";
import { filterControls } from "../../filters/runtime/controls.js";
import { portraitOptions } from "../../filters/portrait/layer.js";
import { LABEL as PORTRAIT_LABEL } from "../../filters/portrait/compose.js";
import { BrushSession } from "../../editor/brush/session.js";
import { BrushPainter } from "../../editor/brush/painter.js";
import { retouchScreen } from "../../editor/brush/screen.js";
import { BRUSH_LABELS, BRUSH_NAMES, brushOf, strokesOf } from "../../editor/brush/layer.js";
import { editorScreen, fullSizeFor, renderFullSize, savedLine } from "../../editor/adjust/tools.js";
import { isEditorKind } from "../../editor/adjust/stack.js";
import { renderLayers } from "./pipeline.js";
import { scaleSource } from "./scale.js";
import { rgbFromRGBA } from "./demo.js";
function node(tag, className = "", text) {
    const n = document.createElement(tag);
    n.className = className;
    if (text !== undefined)
        n.textContent = text;
    return n;
}
function find(id) {
    const n = document.getElementById(id);
    if (!n)
        throw new Error(`The studio page is missing ${id}`);
    return n;
}
function labelled(label, control, className = "shell-field") {
    const el = node("label", className);
    el.append(node("span", "shell-field-name", label), control);
    return el;
}
function button(label, act, title = label, cls = "shell-button") {
    const el = node("button", cls, label);
    el.type = "button";
    el.title = title;
    el.addEventListener("click", act);
    return el;
}
function select(options, value, onChange) {
    const el = node("select", "shell-select");
    for (const item of options) {
        const option = node("option", "", item.label);
        option.value = item.value;
        el.append(option);
    }
    el.value = value;
    el.addEventListener("change", () => onChange(el.value));
    return el;
}
function percent(label, value, min, max, step, change, suffix = "%", format) {
    const range = node("input", "shell-range");
    range.type = "range";
    range.min = String(min);
    range.max = String(max);
    range.step = String(step);
    range.value = String(value);
    range.setAttribute("aria-label", label);
    const show = format ?? ((v) => `${Math.round(v * 100) / 100}${suffix}`);
    const num = node("output", "shell-range-output", show(value));
    let last = value;
    range.addEventListener("input", () => {
        const next = Number(range.value);
        num.textContent = show(next);
        if (format)
            hapticTick(last, next);
        last = next;
    });
    range.addEventListener("change", () => change(Number(range.value)));
    const group = node("div", "shell-percent");
    group.append(range, num);
    return labelled(label, group);
}
/** The checked engine receives its original 0–100 value; the input displays 1.0–5.0. */
function effectStrengthControl(label, current, change) {
    const range = node("input", "shell-range");
    setStrengthRange(range, engineToVisible(current));
    range.setAttribute("aria-label", label);
    const output = node("output", "shell-range-output", `${range.value} of 5.0`);
    const debounce = new PreviewDebouncer(85);
    const submit = () => {
        const level = Number(range.value);
        if (!Number.isFinite(level))
            return;
        output.textContent = `${level.toFixed(1)} of 5.0`;
        debounce.schedule(String(level), () => change(visibleToEngine(level)));
    };
    range.addEventListener("input", submit);
    range.addEventListener("change", () => {
        const level = Number(range.value);
        if (Number.isFinite(level))
            debounce.flush(String(level), () => change(visibleToEngine(level)));
    });
    const group = node("div", "shell-percent");
    group.append(range, output);
    return labelled(label, group);
}
function check(label, checked, change) {
    const el = node("label", "shell-check");
    const input = node("input");
    input.type = "checkbox";
    input.checked = checked;
    input.addEventListener("change", () => change(input.checked));
    el.append(input, node("span", "", label));
    return el;
}
const getParam = (layer, key, fallback) => typeof layer.parameters[key] === "string" ? String(layer.parameters[key]) : fallback;
const getNumber = (layer, key, fallback) => typeof layer.parameters[key] === "number" ? Number(layer.parameters[key]) : fallback;
export class ShellView {
    editor;
    hairStudio;
    canvas;
    stage;
    nav;
    layers;
    settings;
    status;
    history;
    sourceName;
    layerCount;
    toolTitle;
    toolText;
    flow;
    safety;
    add;
    undo;
    redo;
    sample;
    file;
    exportLabel;
    draft = null;
    busy = false;
    pending = 0;
    lastMessage = "Ready. Start with a drawn sample, or open a photo on this device.";
    client;
    threaded;
    compare;
    strip;
    tabs = new PanelTabs("edit");
    announcer;
    tour;
    consentModal;
    providerModal;
    helpModal;
    singleKeys = true;
    stripKey = "";
    precheckTicket = 0;
    /** Retouch brushes: the brush settings and the painter on the photo (editor/brush). */
    brushes;
    painter;
    /** The opened file, kept in memory only, so Save can crop and adjust at the photo's full size. */
    master = null;
    liveProxy = null;
    constructor(editor = new Editor()) {
        this.editor = editor;
        window.addEventListener("pagehide", () => this.editor.dispose(), { once: true });
        this.hairStudio = new HairStudio({ mode: "shell", image: null });
        this.canvas = find("shell-canvas");
        this.stage = find("shell-stage");
        this.nav = find("shell-nav");
        this.layers = find("shell-layers");
        this.settings = find("shell-settings");
        this.status = find("shell-status");
        this.history = find("shell-history");
        this.sourceName = find("shell-source-name");
        this.layerCount = find("shell-layer-count");
        this.toolTitle = find("shell-tool-title");
        this.toolText = find("shell-tool-text");
        this.flow = find("shell-flow");
        this.safety = find("shell-safety");
        this.add = find("shell-apply");
        this.undo = find("shell-undo");
        this.redo = find("shell-redo");
        this.sample = find("shell-sample");
        this.file = find("shell-file");
        this.exportLabel = find("shell-export-label");
        const shell = createShellClient(new URL("./shell-worker.js", import.meta.url));
        this.client = shell.client;
        this.threaded = shell.threaded;
        this.announcer = new Announcer(regionSink(find("shell-announce"), find("shell-alert")));
        this.compare = new CompareController(this.editor, {
            modes: find("shell-compare-modes"), controls: find("shell-compare-controls"), canvas: this.canvas,
            scroll: find("shell-canvas-scroll"), description: find("shell-compare-description"), measure: find("shell-measure"),
            board: find("shell-board"), hold: find("shell-before"), stage: this.stage,
        }, { client: this.client, threaded: this.threaded, announce: (t) => this.announcer.say(t), status: (t) => this.inform(t),
            zoom: () => this.editor.document.zoom, exportLabel: () => this.exportLabel.checked, edited: () => this.draw() });
        this.strip = new StripView(find("shell-strip"), find("shell-strip-note"), {
            client: this.client,
            pick: (tile) => this.safely(() => {
                if (!tile.option)
                    return;
                this.editor.applyOption(tile.option.kind, tile.option.params, tile.label, tile.option.strength);
            }, `${tile.label} applied from its preview. Undo returns the previous option.`),
            provider: () => { void this.openProvider(); },
        });
        const background = [find("shell-editor"), document.querySelector(".shell-header"), document.querySelector(".shell-footer")];
        const scrim = find("shell-scrim");
        this.consentModal = new Modal(find("shell-consent"), scrim, background, false);
        this.providerModal = new Modal(find("shell-provider"), scrim, background, false);
        this.helpModal = new Modal(find("shell-help"), scrim, background, false);
        this.tour = new DemoTour(this.editor, this.compare.session);
        this.brushes = new BrushSession(this.editor);
        this.painter = new BrushPainter({ canvas: this.canvas, scroll: find("shell-canvas-scroll"), session: this.brushes, editor: this.editor,
            committed: () => this.draw(), status: (t) => this.inform(t) });
        this.wire();
        this.wireEditing();
        this.wireR9();
        this.draw();
        this.afterSource();
        const scene = parseDemoHash(location.hash);
        // Developer controls (drawn test images, demo tour, timings) only with ?dev=1 or a demo link.
        const dev = new URLSearchParams(location.search).get("dev") === "1";
        document.body.classList.toggle("shell-dev", dev || !!scene);
        if (scene)
            this.openDemo(scene);
        else if (!dev)
            void this.openExamplePerson(); // ?dev=1 keeps the drawn test image to start
        if (new URLSearchParams(location.search).get("audit") === "1")
            setTimeout(() => this.runAudit(), 300);
    }
    inform(text) { this.lastMessage = text; this.status.textContent = text; }
    safely(action, message) {
        try {
            action();
            if (message)
                this.inform(message);
            this.draw();
        }
        catch (error) {
            this.inform(error instanceof Error ? error.message : String(error));
        }
    }
    wire() {
        this.sample.append(...SAMPLE_IDS.map((id) => { const opt = node("option", "", SAMPLE_NAMES[id]); opt.value = id; return opt; }));
        this.sample.value = "low-light";
        find("shell-load-sample").addEventListener("click", () => this.safely(() => {
            this.draft = null;
            this.editor.loadSample(this.sample.value);
            this.afterSource();
        }, "Drawn sample ready. No network or personal image."));
        find("shell-upload").addEventListener("click", () => { void this.chooseFile(); });
        // The shared "Add photos" control adopts the Studio's file input (its own button keeps the
        // consent step); it adds "Take a photo" on touch devices and the My photos strip under the bar.
        const picker = photoPicker({ id: "shell-file", input: this.file, takes: "one", gate: () => this.consented(),
            say: (text) => this.inform(text), onPhotos: ([file], from) => file ? this.openFile(file, from === "sample") : undefined });
        const upload = find("shell-upload");
        upload.after(picker.actions);
        upload.closest(".shell-source-bar")?.append(picker.element);
    }
    /** Open a photo from her device or from My photos: a local preview only, nothing uploaded. */
    async openFile(file, sample = false) {
        this.inform("Reading this image on your device…");
        this.busy = true;
        try {
            const image = await readLocalImage(file);
            this.draft = null;
            const source = uploadedSource(image, `upload:${Date.now().toString(36)}`);
            if (sample)
                source.label = "Synthetic sample, not a real person";
            try {
                const bytes = await file.arrayBuffer(), header = readHeader(new Uint8Array(bytes));
                source.fileSha256 = await hashModel(bytes);
                source.fileDimensions = header.orientation >= 5 ? [header.height, header.width] : [header.width, header.height];
            }
            catch { /* The image remains usable without recorded-fixture attachment. */ }
            // A new photo opens on Enhance, except that the retouch brushes stay open to paint on it.
            this.editor.load(source, this.editor.document.studio === "retouch" ? "retouch" : undefined);
            this.master = { id: source.id, file };
            this.inform(`Photo ready (${image.width}×${image.height}, local preview). No upload occurred.`);
            this.draw();
            this.afterSource({ type: file.type, bytes: file.size });
            this.newPhoto();
            void this.readFacePoints(source.id);
        }
        catch (error) {
            this.inform(error instanceof Error ? error.message : String(error));
        }
        finally {
            this.busy = false;
        }
    }
    wireEditing() {
        this.canvas.addEventListener("pointerdown", (event) => {
            if (!this.draft || event.button !== 0)
                return;
            event.stopImmediatePropagation();
            try {
                const rect = this.canvas.getBoundingClientRect();
                this.draft.add(pointFromScreen(rect, this.canvas.width, this.canvas.height, event.clientX, event.clientY));
                this.inform(this.draft.instructions);
                this.draw();
            }
            catch (error) {
                this.inform(error instanceof Error ? error.message : String(error));
            }
        });
        find("shell-mark-undo").addEventListener("click", () => this.safely(() => {
            this.draft?.undo();
        }));
        find("shell-mark-clear").addEventListener("click", () => this.safely(() => {
            this.draft?.clear();
        }));
        find("shell-mark-cancel").addEventListener("click", () => this.safely(() => {
            this.draft = null;
        }, "Manual marking cancelled. The original image is unchanged."));
        find("shell-mark-commit").addEventListener("click", () => this.safely(() => {
            const sealed = this.draft?.seal();
            if (!sealed)
                throw new Error("Start the marking tool first");
            this.editor.mark(sealed);
            this.draft = null;
        }, "The manual region is ready. Previous layers have been reset so their geometry cannot become stale."));
        this.add.addEventListener("click", () => this.safely(() => {
            this.editor.add();
        }, "Local layer added; the original image is unchanged."));
        this.undo.addEventListener("click", () => this.safely(() => this.editor.undo(), "Undid one edit."));
        this.redo.addEventListener("click", () => this.safely(() => this.editor.redo(), "Redid one edit."));
        find("shell-reset").addEventListener("click", () => this.safely(() => this.editor.resetAll(), "All layers and Create additions reset; the original remains. Undo brings them back."));
        find("shell-zoom-in").addEventListener("click", () => this.safely(() => this.editor.zoom(this.editor.document.zoom * 1.25)));
        find("shell-zoom-out").addEventListener("click", () => this.safely(() => this.editor.zoom(this.editor.document.zoom / 1.25)));
        find("shell-zoom-reset").addEventListener("click", () => this.safely(() => this.editor.zoom(1)));
        find("shell-download").addEventListener("click", () => { void this.exportPreview(); });
    }
    /** R9 controls: consent, provider transfer, demo tour, tabs, shortcuts and the keyboard map. */
    wireR9() {
        find("shell-consent-understood").nextElementSibling.textContent = VISIT_STATEMENTS[0].text;
        find("shell-consent-statement").textContent = VISIT_STATEMENTS[0].text;
        find("shell-consent-cancel").addEventListener("click", () => this.consentModal.close(false));
        find("shell-consent-accept").addEventListener("click", () => {
            try {
                appConsent.acceptVisit({ understood: true });
                this.consentModal.close(true);
            }
            catch (error) {
                find("shell-consent-error").textContent = error instanceof Error ? error.message : String(error);
            }
        });
        find("shell-provider-facts").replaceChildren(...PROVIDER_FACTS.map((fact) => node("li", "", fact)));
        find("shell-provider-cancel").addEventListener("click", () => this.providerModal.close(false));
        find("shell-provider-continue").addEventListener("click", () => this.providerModal.close(true));
        find("shell-withdraw").addEventListener("click", () => this.safely(() => appConsent.withdraw(), "Consent withdrawn for this tab. Local tools and drawn samples still work."));
        const localOnly = find("shell-local-only");
        localOnly.checked = appConsent.localOnly;
        localOnly.addEventListener("change", () => this.safely(() => appConsent.setLocalOnly(localOnly.checked), localOnly.checked ? "On-device only is on: no photo can be sent to YouCam from this tab." : "On-device only is off. Styling still asks before sending a photo."));
        // Demo tour
        const demo = find("shell-demo"), bar = find("shell-demo-bar"), picker = find("shell-demo-scene");
        picker.append(...DEMO_SCENES.map((scene, i) => { const o = node("option", "", `${i + 1}. ${scene.title}`); o.value = scene.id; return o; }));
        demo.addEventListener("click", () => {
            const open = bar.hidden;
            bar.hidden = !open;
            demo.setAttribute("aria-expanded", String(open));
            if (open && !this.tour.current)
                this.openDemo(DEMO_SCENES[0].id);
            else if (open)
                picker.focus();
        });
        picker.addEventListener("change", () => this.openDemo(picker.value));
        find("shell-demo-prev").addEventListener("click", () => this.stepDemo(-1));
        find("shell-demo-next").addEventListener("click", () => this.stepDemo(1));
        // Phone panel tabs
        const tablist = find("shell-tabs");
        for (const id of PANELS) {
            const tab = find(`shell-tab-${id}`);
            tab.textContent = PANEL_LABELS[id];
            tab.addEventListener("click", () => this.tabs.select(id));
        }
        tablist.addEventListener("keydown", (event) => {
            const next = this.tabs.key(event.key);
            if (next) {
                event.preventDefault();
                find(`shell-tab-${next}`).focus();
            }
        });
        this.tabs.subscribe((id) => { this.renderTabs(); this.announcer.say(`${PANEL_LABELS[id]} panel`); });
        window.matchMedia?.(`(max-width: ${PHONE_MAX}px)`).addEventListener?.("change", () => this.renderTabs());
        this.renderTabs();
        // Shortcuts dialog
        find("shell-help-rows").replaceChildren(...SHORTCUTS.map((row) => {
            const tr = node("tr");
            const k = node("td");
            k.append(node("kbd", "", row.keys));
            tr.append(k, node("td", "", row.does));
            tr.dataset.single = String(row.single);
            return tr;
        }));
        const single = find("shell-single-keys");
        single.addEventListener("change", () => {
            this.singleKeys = single.checked;
            this.announcer.say(single.checked ? "Single-key shortcuts on" : "Single-key shortcuts off");
        });
        find("shell-help-open").addEventListener("click", () => { void this.helpModal.open(); });
        find("shell-help-close").addEventListener("click", () => this.helpModal.close(true));
        window.addEventListener("keydown", (event) => this.handleKey(event, "keydown"));
        window.addEventListener("keyup", (event) => this.handleKey(event, "keyup"));
        window.addEventListener("hashchange", () => { const id = parseDemoHash(location.hash); if (id && id !== this.tour.current?.id)
            this.openDemo(id); });
    }
    handleKey(event, type) {
        const target = event.target instanceof HTMLElement ? event.target : null;
        const editable = Boolean(target?.closest("input, select, textarea, [contenteditable='true']"));
        const inDialog = Boolean(target?.closest("[role=dialog]")) || this.consentModal.isOpen || this.providerModal.isOpen || this.helpModal.isOpen;
        // Keys the compare stage used (arrows, Space, loupe zoom) were already handled there.
        if (event.defaultPrevented)
            return;
        const action = resolveKey({ type, key: event.key, ctrlKey: event.ctrlKey, metaKey: event.metaKey, altKey: event.altKey,
            shiftKey: event.shiftKey, repeat: event.repeat, editable, inDialog }, { singleKeys: this.singleKeys, demoActive: !find("shell-demo-bar").hidden });
        if (!action)
            return;
        if (action.type === "escape") {
            if (this.compare.session.state.held) {
                this.compare.session.hold(false);
                event.preventDefault();
            }
            return;
        }
        event.preventDefault();
        switch (action.type) {
            case "undo":
                this.safely(() => this.editor.undo(), "Undid one edit.");
                break;
            case "redo":
                this.safely(() => this.editor.redo(), "Redid one edit.");
                break;
            case "studio":
                this.safely(() => { this.editor.selectStudio(action.id); this.tabs.followTool(); }, `${tool(action.id).title} open.`);
                break;
            case "compare":
                this.compare.select(action.mode);
                break;
            case "compare-step": {
                const mode = this.compare.session.cycle(action.step);
                this.compare.select(mode);
                break;
            }
            case "hold":
                if (this.compare.session.mode !== "hold")
                    this.compare.session.setMode("hold");
                this.compare.session.hold(action.on);
                break;
            case "zoom":
                this.safely(() => this.editor.zoom(this.editor.document.zoom * (action.direction > 0 ? 1.25 : 0.8)));
                break;
            case "help":
                void this.helpModal.open();
                break;
            case "demo-step":
                this.stepDemo(action.step);
                break;
        }
    }
    /** Phone: the panels are tab panels. Wider: they are ordinary regions and the tabs are hidden. */
    renderTabs() {
        const active = this.tabs.active, phone = isPhone(window.innerWidth);
        find("shell-editor").dataset.panel = active;
        for (const id of PANELS) {
            const tab = find(`shell-tab-${id}`), on = id === active;
            tab.setAttribute("aria-selected", String(on));
            tab.tabIndex = on ? 0 : -1;
            const panel = find(`shell-panel-${id}`);
            if (phone) {
                panel.setAttribute("role", "tabpanel");
                panel.setAttribute("aria-labelledby", `shell-tab-${id}`);
            }
            else if (panel.getAttribute("role") === "tabpanel") {
                panel.removeAttribute("role");
                panel.removeAttribute("aria-labelledby");
            }
        }
    }
    /** Visit consent first; then the file chooser opens from the same click. */
    async chooseFile() {
        if (await this.consented())
            this.file.click();
    }
    /** The visit consent before any photo of hers opens here (picked, taken or from My photos). */
    async consented() {
        if (appConsent.hasVisit)
            return true;
        find("shell-consent-error").textContent = "";
        const ok = await this.consentModal.open(find("shell-consent-accept"));
        if (!ok)
            this.inform("No photo opened. Drawn samples need no consent.");
        return ok;
    }
    /** The styling transfer: what is sent, the pre-check for styling, then a link to the styling screen. */
    async openProvider() {
        const studio = this.editor.document.studio;
        const target = studio === "makeup" ? "index.html#/tryon" : "index.html#/photo";
        // No dialog (owner's order): the cloud action carries its own inline label, and this button
        // either opens the styling screen or says plainly why it can't.
        if (appConsent.localOnly) {
            this.inform(LOCAL_ONLY_REASON);
            return;
        }
        if (!serverConfigured()) {
            this.inform("YouCam styling is off in this on-device preview. Nothing was sent. The on-device tools in the list still work.");
            return;
        }
        window.location.href = target;
    }
    /** A new photo is open: the editor chrome opens its Face map first (studio.html, face-map.ts). */
    newPhoto() {
        document.dispatchEvent(new CustomEvent("beljour:new-photo", { detail: { id: this.editor.source.id } }));
    }
    /** Measure the new source in the worker, and refresh the strip. */
    /** Refresh everything that depends on the open photo (pre-check, canvas); public for the chrome's panels. */
    afterSource(file) {
        const source = this.editor.source, ticket = ++this.precheckTicket;
        this.stripKey = "";
        const details = find("shell-precheck");
        find("shell-precheck-summary").textContent = "Checking on this device…";
        find("shell-precheck-list").replaceChildren();
        details.hidden = false;
        details.dataset.verdict = "pending";
        this.client.precheck(source.image, { face: source.face, file }).then((report) => {
            if (ticket !== this.precheckTicket)
                return;
            const line = renderPrecheck(details, find("shell-precheck-summary"), find("shell-precheck-list"), report);
            this.announcer.say(`Photo check: ${line}`);
        }, (error) => {
            if (ticket !== this.precheckTicket)
                return;
            find("shell-precheck-summary").textContent = `Photo check unavailable: ${error instanceof Error ? error.message : String(error)}`;
        });
        this.draw();
    }
    /** A first visit opens on an AI-generated example person (assets/shape/ or the Skin Moment
     * faces), not a drawn test picture, when those pictures are in the build. Face points come from
     * the shared face map; only a build without the face reader uses the pictures' fixed passport
     * framing, and the label says so. Skipped once she has opened anything herself. */
    async openExamplePerson() {
        const person = (await examplePeople())[0];
        if (!person)
            return;
        try {
            const img = new Image();
            img.decoding = "async";
            await new Promise((ok, fail) => { img.onload = () => ok(); img.onerror = () => fail(new Error("The example picture could not be opened.")); img.src = person.url; });
            const untouched = this.editor.source.id.startsWith("sample:") && !this.editor.document.layers.length && !this.draft && !this.tour.current;
            if (!untouched)
                return;
            const scale = Math.min(1, 640 / Math.max(img.naturalWidth, img.naturalHeight));
            const w = Math.max(8, Math.round(img.naturalWidth * scale)), hgt = Math.max(8, Math.round(img.naturalHeight * scale));
            const c = document.createElement("canvas");
            c.width = w;
            c.height = hgt;
            const g = c.getContext("2d", { willReadFrequently: true });
            if (!g)
                return;
            g.drawImage(img, 0, 0, w, hgt);
            const image = rgbFromRGBA(g.getImageData(0, 0, w, hgt));
            const plain = uploadedSource(image, "upload:example-person-1");
            // The shared face map (face/map-reader.ts) reads the example face; only when this build has
            // no face reader does the labelled example fall back to its picture's fixed framing.
            const map = await faceMapFor(image, { key: studioMapKey(plain) });
            if (!(this.editor.source.id.startsWith("sample:") && !this.editor.document.layers.length && !this.draft && !this.tour.current))
                return;
            const face = map.points ? map.points.map(([x, y]) => [x, y]) : map.status === "unavailable" ? framingPoints(w, hgt) : undefined;
            const source = { ...plain, label: `${EXAMPLE_LABEL}, not a real person`, ...(face ? { face } : {}) };
            this.editor.load(source, this.editor.document.studio);
            this.inform(`${EXAMPLE_LABEL} ready: an invented person, not a real one. ${map.points ? "Face mapped on this device." : map.status === "unavailable" ? "Face area estimated from the picture's framing (no face reader in this build)." : "No face was found in this picture, so the face tools stay off."} Open a photo to use your own.`);
            this.afterSource();
            this.newPhoto();
            void this.readFacePoints(source.id);
        }
        catch { /* the drawn sample stays open */ }
    }
    /** Read the photo's 478 face points and its hair area with the on-device models, when this build
     * staged them, so every face tool lands on her real face instead of a framing estimate. Runs only
     * while the photo is still open with no edits yet (attaching points resets edits). Pixels go to
     * the local vision worker only. */
    async readFacePoints(sourceId) {
        try {
            const vision = defaultVisionClient();
            if (!(await faceReaderReady(vision)))
                return;
            const still = () => this.editor.source.id === sourceId && !this.editor.document.layers.length && !this.draft;
            if (!still())
                return;
            const img = this.editor.source.image, { width, height } = img;
            let faces = 0;
            if (this.editor.source.face?.length !== 478) {
                // The shared face map (face/map-reader.ts): the same cached reading its panel shows.
                const map = await faceMapFor(img, { key: studioMapKey(this.editor.source) });
                if (!still() || map.status !== "mapped" || !map.faces.length)
                    return;
                const all = map.faces.map((face) => face.map(([x, y]) => [x, y]));
                if (all.length === 1)
                    this.editor.setFace(all[0]);
                else
                    this.editor.setFaces(all);
                faces = all.length;
            }
            let hairNote = "";
            if (!this.editor.source.hair && (await stagedModels()).has("hair-segmenter") && vision.ready("hair-segmentation")) {
                const hair = await vision.detect("hair-segmentation", { width, height, rgba: Uint8ClampedArray.from(toRGBA(img)).buffer });
                const seg = hair.ok ? hair.output?.segmentation : undefined;
                if (seg && seg.channels.length >= 2 && this.editor.source.id === sourceId && !this.editor.document.layers.length) {
                    const plane = seg.channels[seg.channels.length - 1], data = new Float32Array(width * height);
                    for (let y = 0; y < height; y++)
                        for (let x = 0; x < width; x++) {
                            const sx = Math.min(seg.width - 1, Math.floor((x + 0.5) * seg.width / width)), sy = Math.min(seg.height - 1, Math.floor((y + 0.5) * seg.height / height));
                            data[y * width + x] = Math.min(1, Math.max(0, plane[sy * seg.width + sx]));
                        }
                    this.editor.setHair({ width, height, channels: 1, data });
                    hairNote = "Hair area";
                }
            }
            if (!this.editor.source.person && (await stagedModels()).has("selfie-multiclass") && vision.ready("person-segmentation")) {
                const found = await vision.detect("person-segmentation", { width, height, rgba: Uint8ClampedArray.from(toRGBA(img)).buffer });
                const seg = found.ok ? found.output?.segmentation : undefined;
                if (seg && seg.channels.length >= 2 && this.editor.source.id === sourceId) {
                    // Channel 0 is the background; the person is everything else.
                    const plane = seg.channels[0], data = new Float32Array(width * height);
                    for (let y = 0; y < height; y++)
                        for (let x = 0; x < width; x++) {
                            const sx = Math.min(seg.width - 1, Math.floor((x + 0.5) * seg.width / width)), sy = Math.min(seg.height - 1, Math.floor((y + 0.5) * seg.height / height));
                            data[y * width + x] = Math.min(1, Math.max(0, 1 - plane[sy * seg.width + sx]));
                        }
                    this.editor.setPerson({ width, height, channels: 1, data });
                    hairNote = hairNote ? `${hairNote}, person area` : "Person area";
                }
            }
            if (!faces && !hairNote)
                return;
            const parts = [faces ? `Face points for ${faces === 1 ? "this face" : `${faces} faces`}` : "", hairNote].filter(Boolean);
            this.inform(`${parts.join(" and ")} read on this device. Nothing was uploaded.`);
            this.draw();
        }
        catch { /* the photo stays usable; face tools say what they need */ }
    }
    openDemo(id) {
        this.safely(() => {
            this.draft = null;
            const result = this.tour.open(id);
            const bar = find("shell-demo-bar");
            bar.hidden = false;
            find("shell-demo").setAttribute("aria-expanded", "true");
            find("shell-demo-scene").value = result.id;
            find("shell-demo-label").textContent = this.tour.label();
            find("shell-demo-line").textContent = result.line;
            if (location.hash !== demoHash(result.id))
                history.replaceState(null, "", demoHash(result.id));
            this.afterSource();
        }, "Demo scene loaded from a drawn sample. Nothing leaves this device.");
    }
    stepDemo(step) {
        const index = this.tour.position < 0 ? 0 : (this.tour.position + step + this.tour.length) % this.tour.length;
        this.openDemo(DEMO_SCENES[index].id);
    }
    /** studio.html?audit=1: run the accessibility baseline on the live page and report it. */
    runAudit() {
        const issues = audit(fromDom(document.documentElement));
        this.inform(issues.length ? `Accessibility check: ${issues.length} issue${issues.length === 1 ? "" : "s"} (details in the console).` : "Accessibility check: no issues found by the baseline rules.");
        document.documentElement.dataset.audit = String(issues.length);
        for (const issue of issues)
            console.warn(`[audit] ${issue.rule}: ${issue.message} at ${issue.where}`);
    }
    /** While a photo-adjustment control moves: render the candidate stack on a small copy and show it
     * in the Hold view (other compare views update when the control is let go). */
    livePreview(layers) {
        if (!layers || this.draft || this.compare.session.mode !== "hold" || this.compare.session.state.held)
            return;
        try {
            const source = this.editor.source, key = `${source.id}:${source.geometryRevision ?? 0}:${source.image.width}x${source.image.height}`;
            if (this.liveProxy?.key !== key)
                this.liveProxy = { key, source: scaleSource(source, 480) };
            const proxy = this.liveProxy.source, shot = renderLayers(proxy, layers);
            const k = (source.image.width / proxy.image.width) * this.editor.document.zoom;
            paint(this.canvas, shot.image, { zoom: 1 });
            this.canvas.style.width = `${Math.round(shot.image.width * k)}px`;
            this.canvas.style.height = `${Math.round(shot.image.height * k)}px`;
        }
        catch { /* The committed render shows on release; a live preview failure changes nothing. */ }
    }
    /** Decode the opened file at full size (up to 12 megapixels), on this device. */
    async fullImage(file) {
        const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
        let canvas = null;
        try {
            const size = fullSizeFor(bitmap.width, bitmap.height);
            canvas = document.createElement("canvas");
            canvas.width = size.width;
            canvas.height = size.height;
            const ctx = canvas.getContext("2d", { willReadFrequently: true });
            if (!ctx)
                throw new Error("2D canvas isn't available in this browser");
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, size.width, size.height);
            ctx.drawImage(bitmap, 0, 0, size.width, size.height);
            return rgbFromRGBA(ctx.getImageData(0, 0, size.width, size.height));
        }
        finally {
            bitmap.close();
            releaseCanvas(canvas);
        } // a 12 MP canvas is freed now, not at the next collection
    }
    async exportPreview() {
        if (this.busy)
            return;
        this.busy = true;
        try {
            let preview = this.editor.preview(), line = "";
            const create = this.editor.document.create;
            const creating = !!create && !createIsEmpty(create);
            let original = this.editor.source.image;
            // Saved at the photo's full size (up to 12 MP): see editor/adjust/fullsize.ts for how each layer gets there.
            if (this.master && this.master.id === this.editor.source.id && !this.editor.document.showBefore && (preview.effective || creating)) {
                this.inform("Saving at full size on this device…");
                try {
                    const big = await this.fullImage(this.master.file);
                    const full = renderFullSize(this.editor.source, this.editor.document.layers, big);
                    preview = full;
                    line = savedLine(full);
                    original = big;
                }
                catch {
                    line = "Saved at the preview size: the full-size render could not finish on this device.";
                }
            }
            const simulated = this.exportLabel.checked && preview.labels.some((l) => /simulat|photo edit/i.test(l));
            let copy;
            if (create && creating) {
                // Text, stickers, drawing, frame or board (web/src/editor/create) drawn again at the saved
                // photo's own size from their stored page units, on top of the full-size render.
                const saved = preview.image, base = original;
                sharedAssets.bind({ edited: () => saved, original: () => base });
                try {
                    copy = await burnCreate(create, saved, sharedAssets);
                }
                finally {
                    sharedAssets.bind({ edited: () => this.editor.rendered().image, original: () => this.editor.source.image });
                }
                const ctx = copy.getContext("2d");
                if (ctx && simulated && showsEditedPhoto(create))
                    burnLabel(ctx, copy.width, copy.height, SIMULATION_TAG);
            }
            else {
                copy = node("canvas");
                paint(copy, preview.image, { label: SIMULATION_TAG, simulate: simulated, zoom: 1 });
            }
            try {
                await downloadCanvas(copy);
            }
            finally {
                releaseCanvas(copy);
            }
            this.inform(`${line || `Image saved from this device (${preview.image.width} × ${preview.image.height}).`} A simulation label is included when the export switch is on.`);
        }
        catch (error) {
            this.inform(error instanceof Error ? error.message : String(error));
        }
        finally {
            this.busy = false;
        }
    }
    renderNavigation() {
        this.nav.replaceChildren();
        const active = this.editor.document.studio;
        for (const section of SIDEBAR_SECTIONS) {
            if (!toolsIn(section).length)
                continue;
            const group = node("section", "shell-nav-group");
            group.append(node("h3", "", section));
            for (const row of toolsIn(section)) {
                const control = button(row.title, () => this.safely(() => { this.editor.selectStudio(row.id); this.tabs.followTool(); }), row.description, "shell-nav-item");
                control.dataset.tool = row.id;
                if (row.id === active) {
                    control.classList.add("is-active");
                    control.setAttribute("aria-current", "page");
                }
                if (row.source === "planned")
                    control.classList.add("is-future");
                control.append(node("span", "shell-nav-status", row.source === "local" ? "On device"
                    : row.source === "youcam" ? (appConsent.localOnly ? "Off" : "YouCam") : "Later"));
                group.append(control);
            }
            this.nav.append(group);
        }
    }
    startMarking(kind, view = "front", facing = 1) {
        const { width, height } = this.editor.source.image;
        this.draft = new AnnotationDraft(kind, width, height, view, facing);
        this.inform(this.draft.instructions);
        this.draw();
    }
    renderMarking() {
        const bar = find("shell-annotation");
        bar.hidden = this.draft === null;
        this.canvas.classList.toggle("shell-marking-canvas", this.draft !== null);
        if (!this.draft)
            return;
        find("shell-mark-next").textContent = this.draft.instructions;
        find("shell-mark-progress").textContent = `${this.draft.progress} / ${this.draft.required} points`;
        find("shell-mark-undo").disabled = this.draft.progress === 0;
        find("shell-mark-clear").disabled = this.draft.progress === 0;
        find("shell-mark-commit").disabled = !this.draft.ready;
    }
    renderIntro() {
        const state = this.editor.document, item = tool(state.studio);
        this.toolTitle.textContent = item.title;
        this.toolText.textContent = item.description;
        this.sourceName.textContent = this.editor.source.label;
        this.sample.value = this.editor.source.id.startsWith("sample:") ? this.editor.source.id.slice(7) : defaultSample(state.studio);
        this.layerCount.textContent = `${state.layers.length} layer${state.layers.length === 1 ? "" : "s"}`;
        const ready = readiness(state.studio, this.editor.source);
        this.add.disabled = !ready.ready || item.source !== "local" || this.busy;
        this.add.textContent = ready.ready ? `Add ${item.title} layer` : "Not ready for this photo";
        // The photo-adjustment panels add their one layer on the first change; no separate Add button.
        this.add.hidden = isEditorKind(item.id);
        this.undo.disabled = !this.editor.history.canUndo;
        this.redo.disabled = !this.editor.history.canRedo;
        this.flow.textContent = item.source === "youcam" ? "sent to YouCam, deleted after the result" : "stays on this device";
        this.flow.dataset.scope = item.source;
        this.safety.textContent = item.safety;
        const guidance = find("shell-guidance");
        guidance.replaceChildren();
        if (!ready.ready) {
            guidance.append(node("p", "shell-note", ready.reason));
            if (item.source === "local" && this.editor.source.kind === "uploaded" && item.id === "hair-fibre") {
                guidance.append(button("Mark the crown on this photo", () => this.safely(() => {
                    this.startMarking("crown");
                }), "Tap the two diagonal corners of an oval above your crown"));
            }
            if (item.source === "local" && this.editor.source.kind === "uploaded" && item.id === "posture") {
                guidance.append(button("Mark front-body points", () => this.safely(() => {
                    this.startMarking("body", "front");
                }), "Six ordered landmarks, using the R7 front controls"));
                guidance.append(button("Mark side-body (facing image right)", () => this.safely(() => {
                    this.startMarking("body", "side", 1);
                }), "Six ordered landmarks, with face to image right"));
                guidance.append(button("Mark side-body (facing image left)", () => this.safely(() => {
                    this.startMarking("body", "side", -1);
                }), "Six ordered landmarks, with face to image left"));
            }
            if (item.source === "local")
                guidance.append(button("Open the drawn example", () => this.safely(() => {
                    this.editor.loadRecommendedSample();
                }, "Matching R7 drawn example loaded; previous layers have been reset."), "Use a drawn photo for this tool"));
            if (item.source === "youcam") {
                guidance.append(button("What is sent, and open the styling screen", () => { void this.openProvider(); }, "Explains what is sent to YouCam before you go to the styling screen", "shell-button shell-link"));
            }
        }
        // R10: embed the Hair Studio in the EXISTING shell guidance panel. The editor
        // remains the single owner of the source, layer history, compare and Trust Centre.
        // Neither switching studios nor re-rendering sends any photo to the provider.
        if (item.id === "hair-style") {
            const src = this.editor.source;
            this.hairStudio.setContext({ mode: "shell", image: {
                    width: src.image.width, height: src.image.height,
                    landmarks: src.face?.map((p) => ({ x: p[0], y: p[1] })) ?? null,
                    synthetic: src.kind === "sample",
                } });
            guidance.append(this.hairStudio.element);
        }
        if (["older", "younger", "gender", "beard"].includes(item.id))
            guidance.append(heroAppearanceScreen(this.editor, () => this.draw()));
        if (item.id === "lighting")
            guidance.append(lightingScreen(this.editor, () => this.draw()));
        if (item.id === "recolour")
            guidance.append(recolourScreen(this.editor, () => this.draw()));
        if (item.id === "balayage")
            guidance.append(balayageScreen(this.editor, () => this.draw()));
        if (item.id === "skin")
            guidance.append(skinToolsScreen(this.editor, () => this.draw()));
        if (item.id === "studio")
            guidance.append(photoStudioScreen(this.editor, () => this.draw()));
        if (item.id === "illustration")
            guidance.append(illustrationScreen(this.editor, () => this.draw()));
        this.painter.setActive(item.id === "retouch" && this.draft === null);
        if (item.id === "retouch") {
            // Brushes paint on the plain photo view, so the compare view goes to Hold.
            if (this.compare.session.mode !== "hold")
                this.compare.select("hold");
            guidance.append(retouchScreen(this.brushes, { changed: () => this.draw(), status: (t) => this.inform(t),
                photoSide: () => Math.min(this.editor.source.image.width, this.editor.source.image.height) }));
        }
        if (isEditorKind(item.id)) {
            try {
                guidance.append(editorScreen(item.id, { editor: this.editor, changed: () => this.draw(), live: (layers) => this.livePreview(layers) }));
            }
            catch (error) {
                guidance.append(node("p", "shell-note", error instanceof Error ? error.message : String(error)));
            }
        }
        const evidence = documentEvidence(this.editor.source, state.layers);
        find("shell-provenance").textContent = evidence.badges.join(" · ");
        find("shell-provenance").title = evidence.warnings.join(" ") || "Local photo editing only";
        find("shell-simulation").hidden = evidence.simulationCount === 0;
    }
    renderLayers() {
        this.layers.replaceChildren();
        const state = this.editor.document;
        if (!state.layers.length) {
            this.layers.append(node("p", "shell-empty", "No edits yet. Add a tool layer to start a reversible preview."));
            return;
        }
        // Top of stack is visually first; order in the model is still bottom to top.
        [...state.layers].reverse().forEach((item, visualIndex) => {
            const index = state.layers.length - 1 - visualIndex;
            const row = node("li", "shell-layer");
            if (state.selected === item.id)
                row.classList.add("is-selected");
            row.dataset.layerId = item.id;
            const top = node("div", "shell-layer-top");
            const visible = check("", item.enabled, () => this.safely(() => this.editor.toggle(item.id), item.enabled ? "Layer hidden." : "Layer shown."));
            // R9: name the checkbox itself (a label's aria-label doesn't name the input inside it).
            visible.classList.add("shell-layer-eye");
            visible.querySelector("input")?.setAttribute("aria-label", `Show ${item.name}`);
            const name = button(item.name, () => this.safely(() => this.editor.choose(item.id)), `Select ${item.name}`, "shell-layer-title");
            name.setAttribute("aria-pressed", String(state.selected === item.id));
            name.setAttribute("aria-label", `${item.name}, layer ${visualIndex + 1} of ${state.layers.length} from the top, ${item.enabled ? "shown" : "hidden"}, strength ${Math.round(item.strength)}%`);
            top.append(visible, name);
            const record = documentEvidence(this.editor.source, state.layers).layers[index];
            const detail = node("span", "shell-layer-origin", record.display);
            detail.title = record.scope === "on-device" ? "stays on this device" :
                record.scope === "provider" ? "sent to YouCam, deleted after the result" : "not built this round";
            const actions = node("div", "shell-layer-actions");
            const up = button("↑", () => this.safely(() => this.editor.move(item.id, 1)), "Move up", "shell-mini");
            const down = button("↓", () => this.safely(() => this.editor.move(item.id, -1)), "Move down", "shell-mini");
            up.disabled = index === state.layers.length - 1;
            down.disabled = index === 0;
            up.setAttribute("aria-label", `Move ${item.name} up`);
            down.setAttribute("aria-label", `Move ${item.name} down`);
            const remove = button("×", () => this.safely(() => this.editor.remove(item.id)), "Delete layer", "shell-mini shell-remove");
            remove.setAttribute("aria-label", `Delete ${item.name}`);
            actions.append(up, down, remove);
            row.append(top, detail, actions);
            this.layers.append(row);
        });
    }
    renderHistory() {
        this.history.replaceChildren();
        for (const item of this.editor.history.timeline) {
            const el = button(`${item.index + 1}  ${item.label}`, () => this.safely(() => this.editor.jump(item.index)), `Jump to ${item.label}`, "shell-history-item");
            if (item.active) {
                el.classList.add("is-active");
                el.setAttribute("aria-current", "step");
            }
            this.history.append(el);
        }
    }
    renderSettings() {
        const layer = this.editor.selected;
        this.settings.replaceChildren();
        if (!layer) {
            this.settings.append(node("p", "shell-empty", "Select a layer to adjust strength, named stops, options and opacity."));
            return;
        }
        const set = (changes, label) => this.safely(() => this.editor.update(layer.id, changes, label));
        const param = (name, value) => this.safely(() => this.editor.param(layer.id, name, value));
        const strength = node("section", "shell-controls");
        strength.append(node("h3", "", "Strength"), effectStrengthControl(`Effect · ${strengthName(layer.kind, layer.strength)}`, layer.strength, (value) => set({ strength: value }, "Adjust strength")));
        const buttons = node("div", "shell-stop-row");
        for (const stop of stopsFor(layer.kind)) {
            const el = button(stop.name, () => set({ strength: stop.value }, `Strength: ${stop.name}`), `Set ${stop.value}%`, "shell-stop");
            if (Math.abs(layer.strength - stop.value) < 0.001)
                el.classList.add("is-active");
            buttons.append(el);
        }
        strength.append(buttons, percent("Layer opacity", Math.round(layer.opacity * 100), 0, 100, 1, (value) => set({ opacity: value / 100 }, "Adjust layer opacity")));
        this.settings.append(strength);
        const settings = node("section", "shell-controls");
        settings.append(node("h3", "", "Tool options"));
        if (layer.kind === "enhance") {
            settings.append(labelled("Enhance mode", select(["auto", ...Object.keys(MODES)].map((m) => ({ value: m, label: m === "auto" ? "Auto fix" : m.replaceAll("_", " ") })), getParam(layer, "mode", "auto"), (v) => param("mode", v))));
            const steps = node("div", "shell-step-grid");
            for (const step of ENHANCE_STEPS)
                steps.append(check(step.replaceAll("_", " "), layer.parameters[step] !== false, (v) => param(step, v)));
            settings.append(node("p", "shell-hint", "Choose which steps of the R7 analysis pipeline run."), steps);
        }
        if (layer.kind === "older" || layer.kind === "younger") {
            settings.append(percent("Appearance stop", getNumber(layer, "stop", 1), 1, layer.kind === "older" ? 5 : 3, 1, n => param("stop", n), ""));
        }
        if (layer.kind === "gender") {
            settings.append(percent("Feminine to masculine appearance", getNumber(layer, "slider", -33), -100, 100, 1, n => param("slider", n), ""), node("p", "shell-hint", "Face-only simulation. Original is 0. Hair and makeup stay as they are."));
        }
        if (layer.kind === "beard") {
            settings.append(labelled("Style", select(Object.keys(STYLES).map((s) => ({ value: s, label: s.replaceAll("_", " ") })), getParam(layer, "style", "stubble"), (v) => param("style", v))));
            settings.append(percent("Length", getNumber(layer, "length", 3), 1, 5, 1, (n) => param("length", n), "/5"));
            const colour = node("input", "shell-colour");
            colour.type = "color";
            colour.value = getParam(layer, "colour", "#3B2A22");
            colour.addEventListener("change", () => param("colour", colour.value));
            settings.append(labelled("Strand colour", colour));
            settings.append(node("p", "shell-hint", "Strength sets strand density (1–4). No real beard is grown."));
        }
        if (layer.kind === "hair-fibre") {
            settings.append(labelled("Product", select(PRODUCTS.map((v) => ({ value: v, label: v })), getParam(layer, "product", "fibres"), (v) => param("product", v))));
            settings.append(node("p", "shell-hint", "The R7 6-zone crown reading picks a shade and the strand renderer. Coverage is a photo simulation, not a diagnosis."));
        }
        if (layer.kind === "filters") {
            const spec = filterControls(layer);
            settings.append(labelled("Look", select(spec.looks, spec.recipe, (v) => this.safely(() => this.editor.applyOption("filters", spec.paramsFor(v), spec.labelFor(v))))));
            if (spec.presets.length > 1)
                settings.append(labelled("Variant", select(spec.presets, spec.preset, (v) => param("preset", v))));
            const toggles = node("div", "shell-step-grid");
            for (const t of spec.toggles)
                toggles.append(check(t.label, t.value, (v) => param(t.key, v)));
            settings.append(toggles);
            settings.append(percent("Fade add-on", spec.fade, 0, 100, 1, (n) => param("addon_fade", n)));
            settings.append(node("p", "shell-hint", spec.hint));
        }
        if (layer.kind === "portrait") {
            const looks = portraitOptions();
            settings.append(labelled("Portrait look", select(looks.map((o) => ({ value: o.look, label: `${o.label} · ${o.description}` })), getParam(layer, "look", looks[0].look), (v) => this.safely(() => this.editor.applyOption("portrait", { look: v }, looks.find((o) => o.look === v)?.label ?? v)))));
            settings.append(node("p", "shell-hint", PORTRAIT_LABEL));
        }
        if (layer.kind === "lighting") {
            settings.append(labelled("Lighting preset", select(presetIds().map(id => ({ value: id, label: preset(id).label })), getParam(layer, "preset", "daylight"), value => param("preset", value))));
            settings.append(node("p", "shell-hint", "Local simulation. Screen calibration and product spectra are not known."));
        }
        if (layer.kind === "recolour") {
            const colour = node("input", "shell-colour");
            colour.type = "color";
            colour.value = getParam(layer, "colour", "#6B3F2A");
            colour.addEventListener("change", () => param("colour", colour.value));
            settings.append(labelled("Target hair colour", colour), labelled("Curl pattern (your description)", select(CURL_PATTERNS.map(value => ({ value, label: value })), getParam(layer, "curl_pattern", "not specified"), value => param("curl_pattern", value))));
        }
        if (layer.kind === "balayage") {
            settings.append(labelled("Target hair level", select(LEVELS.levels.map(row => ({ value: String(row.level), label: `${row.level} · ${row.name}` })), String(getNumber(layer, "target_level", 7)), value => param("target_level", Number(value)))));
            settings.append(labelled("Colour history", select([
                { value: "virgin", label: "Never coloured" }, { value: "colour_treated", label: "Previously coloured" }, { value: "box_dye", label: "Box dye" }
            ], getParam(layer, "history", "colour_treated"), value => param("history", value))));
            settings.append(labelled("Toner estimate", select(Object.keys(LEVELS.toners).map(value => ({ value, label: value })), getParam(layer, "toner", "none"), value => param("toner", value))));
            settings.append(node("p", "shell-hint", "Local simulation of the first session; change the placement in the tool panel."));
        }
        if (layer.kind === "face-makeup") {
            settings.append(labelled("Look", select(MAKEUP_LOOKS.map((look) => ({ value: look.id, label: look.name })), getParam(layer, "look", MAKEUP_LOOKS[0].id), (v) => this.safely(() => this.editor.applyOption("face-makeup", lookParams(v), MAKEUP_LOOKS.find((look) => look.id === v)?.name ?? v)))));
            for (const product of MAKEUP_PRODUCTS) {
                const current = getParam(layer, product, "none"), on = current !== "none";
                const colour = node("input", "shell-colour");
                colour.type = "color";
                colour.value = on ? current : "#8E3B46";
                colour.disabled = !on;
                colour.addEventListener("change", () => param(product, colour.value));
                settings.append(check(MAKEUP_PRODUCT_NAMES[product], on, (v) => param(product, v ? colour.value : "none")), labelled(`${MAKEUP_PRODUCT_NAMES[product]} colour`, colour));
            }
            settings.append(labelled("Lipstick finish", select(FINISHES.map((value) => ({ value, label: value[0].toUpperCase() + value.slice(1) })), getParam(layer, "finish", "satin"), (v) => param("finish", v))));
            settings.append(node("p", "shell-hint", "Makeup simulation on this device. Strength is how much product; your lip lines and skin texture stay."));
        }
        if (layer.kind === "skin") {
            const skinTool = getParam(layer, "tool", "smooth");
            settings.append(labelled("Skin tool", select(SKIN_TOOLS.map((value) => ({ value, label: SKIN_TOOL_NAMES[value] })), skinTool, (v) => param("tool", v))));
            if (skinTool === "glow")
                settings.append(labelled("Glow look", select(Object.entries(GLOWS).map(([value, look]) => ({ value, label: look.name })), getParam(layer, "style", "cassis"), (v) => param("style", v))));
            if (skinTool === "freckles")
                settings.append(percent("Freckle density", getNumber(layer, "density", 50), 0, 100, 1, (n) => param("density", n)));
            if (skinTool === "tone")
                settings.append(percent("Redness", getNumber(layer, "redness", 50), 0, 100, 1, (n) => param("redness", n)));
            if (skinTool === "tan") {
                const allowed = layer.parameters.allow_lightening === true;
                settings.append(labelled("Undertone", select(Object.keys(UNDERTONES).map((value) => ({ value, label: value })), getParam(layer, "undertone", "neutral"), (v) => param("undertone", v))));
                settings.append(check("I choose to lighten my skin (tan removal)", allowed, (on) => this.safely(() => {
                    if (!on)
                        this.editor.param(layer.id, "direction", "add");
                    this.editor.param(layer.id, "allow_lightening", on);
                })));
                if (allowed)
                    settings.append(labelled("Tan", select([{ value: "add", label: "Add a tan" }, { value: "remove", label: "Remove a tan (lightens)" }], getParam(layer, "direction", "add"), (v) => param("direction", v))));
            }
            settings.append(node("p", "shell-hint", "Local simulation, not medical advice. Only tan removal lightens skin, and its button says so."));
        }
        if (layer.kind === "studio") {
            const tool = getParam(layer, "tool", "blur");
            settings.append(labelled("Studio tool", select(STUDIO_LAYER_TOOLS.map((value) => ({ value, label: STUDIO_TOOL_NAMES[value] })), tool, (v) => param("tool", v))));
            if (tool === "replace")
                settings.append(labelled("Backdrop", select(Object.values(BACKDROPS).map((b) => ({ value: b.id, label: b.name })), getParam(layer, "backdrop", "chinon"), (v) => param("backdrop", v))));
            if (tool === "relight")
                settings.append(labelled("Light from", select(Object.keys(SIDES).map((value) => ({ value, label: value.replace("-", " ") })), getParam(layer, "side", "upper-left"), (v) => param("side", v))));
            if (tool === "headshot")
                settings.append(labelled("Industry", select(Object.values(INDUSTRIES).map((row) => ({ value: row.id, label: row.name })), getParam(layer, "industry", "technology"), (v) => param("industry", v))));
            settings.append(node("p", "shell-hint", "Edited photo, not generated. Relight and authenticity mode keep your face's average brightness."));
        }
        if (layer.kind === "retouch") {
            const brush = brushOf(layer), strokes = strokesOf(layer).length;
            settings.append(node("p", "shell-hint", `${BRUSH_NAMES[brush]} brush, ${strokes} stroke${strokes === 1 ? "" : "s"}. Paint more in Retouch brushes; Strength scales the whole brush.`), node("p", "shell-hint", BRUSH_LABELS[brush]));
        }
        if (layer.kind === "illustration") {
            settings.append(labelled("Look", select(Object.entries(ILLUSTRATION_LOOKS).map(([value, row]) => ({ value, label: row.name })), getParam(layer, "look", "sancerre-cartoon"), (v) => param("look", v))));
            settings.append(node("p", "shell-hint", "Illustration filter on your own photo; your face shape is unchanged."));
        }
        if (layer.kind === "under-eye") {
            settings.append(check("Include eye-bag shadow", layer.parameters.include_bags !== false, (v) => param("include_bags", v)));
            settings.append(node("p", "shell-hint", "Brought toward your own cheek colour, never past it. Nothing changes when there is no dark circle. Not medical advice."));
        }
        if (isEditorKind(layer.kind))
            settings.append(node("p", "shell-hint", layer.kind === "crop"
                ? "Crop settings are in the Edit panel above. Strength 0 or hiding the layer shows the whole photo."
                : "Settings are in the Edit panel above. Strength scales every slider of this layer; 0 turns it off."));
        if (layer.kind === "teeth")
            settings.append(node("p", "shell-hint", "A natural cap: teeth go a few shades lighter and keep their warmth. Nothing changes when the mouth is closed. Not dental advice."));
        if (layer.kind === "shave")
            settings.append(node("p", "shell-hint", "Stubble and short beards only. Skin under the hair is estimated from the skin beside it; nothing is lifted past your cheek."));
        if (layer.kind === "grey") {
            settings.append(labelled("Stage", select([{ value: "cover", label: "Cover greys" }, { value: "blend", label: "Blend greys" }, { value: "silver", label: "Go silver" }], getParam(layer, "stage", "cover"), (v) => param("stage", v))));
            settings.append(node("p", "shell-hint", "Grey Transition: a salon-decision preview inside the hair you marked. No age is asked or inferred."));
        }
        if (layer.kind === "posture") {
            settings.append(labelled("Photo edit", select(fixesFor(this.editor.source.body.view).map((v) => ({ value: v, label: v.replaceAll("_", " ") })), getParam(layer, "fix", "lean"), (v) => param("fix", v))));
            settings.append(percent("Body band width", Math.round(getNumber(layer, "band_share", POSTURE_DEFAULTS.bandShare) * 100), 1, 10, 1, (value) => param("band_share", value / 100)));
            settings.append(percent("Movement cap", Math.round(getNumber(layer, "cap_share", POSTURE_DEFAULTS.capShare) * 100), 1, 12, 1, (value) => param("cap_share", value / 100)));
            settings.append(node("p", "shell-hint", "Default: 3% body band and 6% movement cap. Fold safety may reduce actual strength. Photo edit, not medical advice."));
        }
        this.settings.append(settings);
    }
    showCanvas() {
        this.compare.suspended = this.draft !== null;
        if (!this.draft) {
            try {
                this.compare.refresh();
                this.painter.overlay();
            }
            catch (error) {
                this.inform(error instanceof Error ? error.message : String(error));
                this.stage.dataset.preview = "error";
                return;
            }
            this.stage.dataset.preview = this.editor.document.layers.some((l) => l.enabled) ? "edited" : "original";
            return;
        }
        const ticket = ++this.pending;
        try {
            const result = this.editor.preview();
            if (ticket !== this.pending)
                return;
            const simulate = result.labels.some((l) => /simulat|photo edit/i.test(l));
            paint(this.canvas, result.image, { zoom: this.editor.document.zoom,
                label: SIMULATION_TAG, simulate });
            find("shell-measure").textContent = result.effective
                ? `${result.effective} active edit${result.effective === 1 ? "" : "s"} · ${pixelsChanged(this.editor.source.image, result.image).percent.toFixed(1)}% of pixels changed`
                : "Original — no active edits";
            this.stage.dataset.preview = result.effective ? "edited" : "original";
            if (this.draft)
                drawMarks(this.canvas, this.draft);
        }
        catch (error) {
            this.inform(error instanceof Error ? error.message : String(error));
            paint(this.canvas, this.editor.source.image, { zoom: this.editor.document.zoom });
            this.stage.dataset.preview = "error";
            if (this.draft)
                drawMarks(this.canvas, this.draft);
        }
    }
    renderStrip() {
        const key = `${this.editor.source.id}|${this.editor.source.geometryRevision ?? 0}|${this.editor.document.studio}|${this.editor.source.crown ? 1 : 0}|${this.editor.source.body?.view ?? ""}`;
        if (key !== this.stripKey) {
            this.stripKey = key;
            this.strip.show(this.editor.document.studio, this.editor.source, this.editor.selected);
        }
        else
            this.strip.select(this.editor.selected);
    }
    draw() {
        this.renderNavigation();
        this.renderIntro();
        this.renderLayers();
        this.renderSettings();
        this.renderHistory();
        this.renderMarking();
        this.status.textContent = this.lastMessage;
        this.showCanvas();
        this.renderStrip();
    }
}
export function mountShell() { return new ShellView(); }
/** Whether a styling server is configured (same rule as api.ts, read here without importing the API client). */
function serverConfigured() {
    const scope = globalThis;
    const raw = scope.BELJOUR_API ?? scope.PLUMB_API;
    return typeof raw === "string" && /^https?:\/\/[^\s/?#]+$/i.test(raw.trim().replace(/\/+$/, ""));
}
//# sourceMappingURL=view.js.map