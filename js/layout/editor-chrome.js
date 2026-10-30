import { STUDIO_IDS } from "../ui/shell/types.js";
import { regionMask } from "../data/regions/index.js";
import { stillYou } from "./still-you.js";
import { CATEGORIES, STRENGTH_TICKS, clampStrength, effectsIn, studioFor } from "./effects.js";
import { LookStore, browserLooks, stepsFromLayers } from "./my-looks.js";
import { rescueSteps } from "./rescue.js";
import { tryStep } from "./holiday/try-look.js";
import { wireSave } from "./topbar.js";
import { simulationLabelPref } from "./trust.js";
import { browserStore } from "../session.js";
import { LookLibrary, SaveOffer, OFFER_TEXT } from "../save/looks.js";
import { browserLookStorage } from "../save/storage.js";
import { paywallCopy, DEMO_NOTE } from "../screens/paywall.js";
import { strengthLabel, hapticTick } from "../ui/shell/stops.js";
import { engineToVisible, visibleToEngine, parseVisibleStrength, PreviewDebouncer, setStrengthRange, } from "./strength-scale.js";
import { mountStudioIdentity } from "../ui/shell/studio-identity.js";
import { paintFaceChip } from "./face-chip.js";
import { batchReviewScreen } from "../screens/batch-review.js";
import { groupFacesScreen } from "../screens/group-faces.js";
import { bestSelfieScreen } from "../screens/best-selfie.js";
import { exportSizesScreen } from "../screens/export-sizes.js";
import { eventTrialScreen } from "../screens/event-trial.js";
import { beforeAfterScreen } from "../screens/before-after-video.js";
import { stickersScreen } from "../screens/stickers.js";
import { tattooScreen } from "../screens/tattoo.js";
import { voiceFramingScreen } from "../screens/voice-framing.js";
import { blinkRescueScreen } from "../screens/blink-rescue.js";
import { MultiFaceEdit, MultiFaceError } from "../save/multi-face.js";
import { BRUSHES } from "../editor/brush/stroke.js";
import { BRUSH_NAMES } from "../editor/brush/layer.js";
import { createScreen } from "../editor/create/panel.js";
import { applyStory } from "../editor/create/tabs.js";
import { STORIES } from "../editor/create/story.js";
/** The Create panel's tabs, by the panel id a Home link uses (#tool=<id>). */
export const CREATE_PANELS = {
    text: "text", draw: "draw", stickerlayer: "stickers", frames: "frames", collage: "collage", story: "story"
};
/** The panels a link from Home may open directly (#tool=<id>); batch needs a saved look. */
export const HASH_TOOLS = ["faces", "selfie", "blink", "sizes", "event", "video", "stickers", "tattoo", "framing", "batch",
    "text", "draw", "stickerlayer", "frames", "collage", "story"];
export function parseHash(hash) {
    let value;
    try {
        value = decodeURIComponent(hash.replace(/^#/, ""));
    }
    catch {
        return { kind: "none" };
    }
    if (value === "rescue")
        return { kind: "rescue" };
    if (value === "open")
        return { kind: "open" };
    if (value === "paywall")
        return { kind: "paywall" };
    const look = /^look=(look-[0-9a-f]{8})$/.exec(value);
    if (look)
        return { kind: "look", id: look[1] };
    if (/^try=(?:filters|portrait):[A-Z]{1,2}\d{1,3}$/.test(value))
        return { kind: "try", value };
    const batch = /^batch=(look-[0-9a-f]{8})$/.exec(value);
    if (batch)
        return { kind: "batch", id: batch[1] };
    const studio = /^studio=([a-z-]+)$/.exec(value);
    if (studio && STUDIO_IDS.includes(studio[1]))
        return { kind: "studio", studio: studio[1] };
    const tool = /^tool=([a-z]+)$/.exec(value);
    if (tool && HASH_TOOLS.includes(tool[1]))
        return { kind: "tool", tool: tool[1] };
    const storyId = /^story=([a-z-]+)$/.exec(value);
    if (storyId && STORIES.some((x) => x.id === storyId[1]))
        return { kind: "story", id: storyId[1] };
    const brush = /^brush=([a-z]+)$/.exec(value);
    if (brush && BRUSHES.includes(brush[1]))
        return { kind: "brush", brush: brush[1] };
    const cat = /^cat=(\w+)$/.exec(value);
    if (cat && CATEGORIES.includes(cat[1]))
        return { kind: "category", category: cat[1] };
    return { kind: "none" };
}
/** Apply look steps as new layers, in order. Returns how many were added and what failed. */
export function applySteps(editor, steps) {
    let added = 0;
    const skipped = [];
    for (const step of steps) {
        try {
            editor.add(step.kind, step.params, clampStrength(step.strength));
            added++;
        }
        catch (error) {
            skipped.push(`${step.kind}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    return { added, skipped };
}
/** What a category tap does: open its studio tool, or explain that it isn't in the studio yet. */
export function categoryTarget(category) {
    const studio = studioFor(category);
    if (studio)
        return { studio, note: "" };
    const items = effectsIn(category);
    return { studio: null, note: items.map((e) => `${e.label}: ${e.note}`).join(" ") };
}
export function faceCount(editor) {
    return editor.source.faces?.length ?? (editor.source.face ? 1 : 0);
}
/** The Still you check on the current edits: recorded face points give the real skin region
 * (eyes, brows and lips left out); without them a centred face ellipse is used. */
export function stillYouFor(editor) {
    const edited = editor.document.layers.some((l) => l.enabled && l.strength > 0 && l.opacity > 0);
    const before = editor.source.image;
    if (!edited)
        return stillYou(before, before, { edited: false });
    const face = editor.source.face;
    const skin = face && face.length >= 468
        ? regionMask("skin", face, before.width, before.height, { normalized: false, supersample: 2 }) : undefined;
    // A crop changes the frame, not her: the check reads the edit before the crop, in the photo's own frame.
    const shot = editor.rendered();
    return stillYou(before, shot.beforeGeometry ?? shot.image, { skin, face, edited: true });
}
/** Simulation tag: shown whenever a visible layer is a simulation (enhance is not). */
export function showsSimulation(layers) {
    return layers.some((l) => l.enabled && l.strength > 0 && l.simulation);
}
/** The photo's bottom-left tag: always there once the photo is edited (spec: permanent),
 * saying "Simulation" whenever any visible edit is one. */
export function editTag(layers) {
    const visible = layers.filter((l) => l.enabled && l.strength > 0 && l.opacity > 0);
    if (!visible.length)
        return null;
    return showsSimulation(visible) ? "Simulation, edited photo" : "Edited photo";
}
/** My Look steps as versioned Save System recipe steps (all local tools). */
export function recipeSteps(steps) {
    return steps.map((s) => ({ tool: s.kind, strength: s.strength, settings: { ...s.params }, provider: "local" }));
}
export class EditorChrome {
    view;
    doc;
    looks = new LookStore(browserLooks());
    library = new LookLibrary(browserLookStorage());
    offer = new SaveOffer(browserStore());
    savedAsLook = false;
    stillKey = "";
    stillSource = null;
    stillFace;
    line;
    previewDebouncer = new PreviewDebouncer(85);
    identityUI = null;
    closePanel = null;
    /** The Create panel while it is open (studio.html#story=<id> applies a template to it). */
    createPanel = null;
    /** Per-face edits of the open group photo; rebuilt when the photo's faces change. */
    group = null;
    chipsKey = "";
    constructor(view, doc = document) {
        this.view = view;
        this.doc = doc;
        this.line = doc.getElementById("lg-chrome-status");
    }
    get editor() { return this.view.editor; }
    say(text) { if (this.line)
        this.line.textContent = text; }
    mount() {
        wireSave(this.doc, () => this.doc.getElementById("shell-download")?.click());
        const label = this.doc.getElementById("shell-export-label");
        const pref = simulationLabelPref(browserStore());
        if (label) {
            label.checked = pref.get();
            label.addEventListener("change", () => pref.set(label.checked));
        }
        this.buildCategories();
        this.wireStrength();
        this.identityUI = mountStudioIdentity(this.doc, this.doc.querySelector(".lg-strength"));
        this.doc.getElementById("lg-split")?.addEventListener("click", () => {
            this.doc.querySelector('#shell-compare-modes [data-mode="split-vertical"]')?.click();
            this.say("Split compare: drag the line or use the arrow keys on the photo.");
        });
        this.doc.getElementById("lg-batch-review")?.addEventListener("click", () => this.openDeliverable("batch"));
        this.doc.getElementById("lg-group-faces")?.addEventListener("click", () => this.openDeliverable("faces"));
        this.doc.getElementById("lg-best-selfie")?.addEventListener("click", () => this.openDeliverable("selfie"));
        this.doc.getElementById("lg-export-sizes")?.addEventListener("click", () => this.openDeliverable("sizes"));
        this.doc.getElementById("lg-event-trial")?.addEventListener("click", () => this.openDeliverable("event"));
        this.doc.getElementById("lg-before-after")?.addEventListener("click", () => this.openDeliverable("video"));
        this.doc.getElementById("lg-stickers")?.addEventListener("click", () => this.openDeliverable("stickers"));
        this.doc.getElementById("lg-tattoo")?.addEventListener("click", () => this.openDeliverable("tattoo"));
        this.doc.getElementById("lg-voice-framing")?.addEventListener("click", () => this.openDeliverable("framing"));
        this.doc.getElementById("lg-blink-rescue")?.addEventListener("click", () => this.openDeliverable("blink"));
        this.doc.getElementById("lg-create")?.addEventListener("click", () => this.openDeliverable("text"));
        this.doc.getElementById("lg-close-deliverable")?.addEventListener("click", () => {
            this.closePanel?.();
            this.closePanel = null;
            const panel = this.doc.getElementById("lg-deliverable");
            if (panel) {
                panel.replaceChildren();
                panel.hidden = true;
            }
            const close = this.doc.getElementById("lg-close-deliverable");
            if (close)
                close.hidden = true;
        });
        globalThis.addEventListener?.("pagehide", () => {
            this.closePanel?.();
            this.closePanel = null;
            this.previewDebouncer.dispose();
            this.identityUI?.dispose();
        }, { once: true });
        this.doc.getElementById("lg-save-look")?.addEventListener("click", () => this.saveLook());
        this.doc.getElementById("shell-download")?.addEventListener("click", () => this.afterSavePhoto());
        for (const id of ["shell-canvas", "shell-layers", "shell-settings", "shell-strip"]) {
            this.doc.getElementById(id)?.addEventListener("click", () => this.refresh());
            this.doc.getElementById(id)?.addEventListener("input", () => this.refresh());
        }
        this.doc.getElementById("shell-apply")?.addEventListener("click", () => this.refresh());
        globalThis.addEventListener?.("hashchange", () => this.runHash());
        this.runHash();
        this.refresh();
        // edits made through the studio's own controls (strip, inspector, keyboard) also refresh the chrome
        this.doc.addEventListener("keyup", () => this.refresh());
    }
    buildCategories() {
        const bar = this.doc.getElementById("lg-categories");
        if (!bar)
            return;
        for (const category of CATEGORIES) {
            const b = this.doc.createElement("button");
            b.type = "button";
            b.className = "lg-cat";
            b.textContent = category;
            b.dataset.category = category;
            b.addEventListener("click", () => this.openCategory(category));
            bar.append(b);
        }
    }
    openCategory(category) {
        const target = categoryTarget(category);
        if (target.studio) {
            this.editor.selectStudio(target.studio);
            this.view.draw();
            this.say(`${category}: edits stack on the ones you already have.`);
        }
        else {
            this.say(`${category}. ${target.note}`);
        }
        for (const b of this.doc.querySelectorAll("#lg-categories .lg-cat")) {
            b.setAttribute("aria-pressed", String(b.dataset.category === category));
        }
    }
    wireStrength() {
        const slider = this.doc.getElementById("lg-strength");
        const list = this.doc.getElementById("lg-ticks");
        if (list && !list.childElementCount) {
            for (const tick of STRENGTH_TICKS) {
                const option = this.doc.createElement("option");
                option.value = engineToVisible(tick.value).toFixed(1);
                option.label = tick.name;
                list.append(option);
            }
        }
        if (!slider)
            return;
        setStrengthRange(slider, 1.0);
        const apply = (value) => {
            const layer = this.editor.selected;
            if (!layer)
                return;
            const internal = visibleToEngine(value);
            if (Math.abs(internal - layer.strength) < 0.0001)
                return;
            hapticTick(layer.strength, internal);
            this.editor.update(layer.id, { strength: clampStrength(internal) }, "Strength");
            this.view.draw();
            this.refresh();
        };
        slider.addEventListener("input", () => {
            const layer = this.editor.selected;
            if (!layer)
                return;
            let value;
            try {
                value = parseVisibleStrength(slider.value);
            }
            catch {
                return;
            }
            const output = this.doc.getElementById("lg-strength-value");
            if (output)
                output.textContent = `${value.toFixed(1)} / 5.0`;
            const key = `${this.editor.source.image.width}x${this.editor.source.image.height}:${layer.id}:${value}`;
            this.previewDebouncer.schedule(key, () => apply(value));
        });
        slider.addEventListener("change", () => {
            const layer = this.editor.selected;
            if (!layer)
                return;
            let value;
            try {
                value = parseVisibleStrength(slider.value);
            }
            catch {
                return;
            }
            this.previewDebouncer.flush(`${this.editor.source.image.width}x${this.editor.source.image.height}:${layer.id}:${value}`, () => apply(value));
        });
    }
    runHash() {
        const action = parseHash(globalThis.location?.hash ?? "");
        if (action.kind === "rescue") {
            const res = applySteps(this.editor, rescueSteps());
            this.say(res.added ? `Rescue applied: ${res.added === 2 ? "a gentle enhance and under-eye brightening" : "a gentle enhance"}.`
                + (res.skipped.length ? ` Skipped ${res.skipped.join("; ")}.` : "") + " Dull skin and flyaway hair are not built yet."
                : `Rescue couldn't run: ${res.skipped.join("; ")}`);
        }
        else if (action.kind === "look") {
            const look = this.looks.get(action.id);
            if (!look)
                this.say("That saved look isn't in this browser.");
            else {
                const res = applySteps(this.editor, look.steps);
                this.say(`${look.name}: ${res.added} edit${res.added === 1 ? "" : "s"} applied` + (res.skipped.length ? `; skipped ${res.skipped.join("; ")}` : "."));
            }
        }
        else if (action.kind === "try") {
            const tried = tryStep(action.value);
            if (!tried)
                this.say("That look isn't in this version of the app.");
            else {
                const res = applySteps(this.editor, [tried.step]);
                this.say(res.added ? `${tried.name} added at its gentle default. Move the slider to taste.`
                    : `${tried.name} couldn't be added: ${res.skipped.join("; ")}`);
            }
        }
        else if (action.kind === "batch") {
            const look = this.looks.get(action.id);
            if (!look)
                this.say("That saved look is not in this browser.");
            else {
                const name = this.doc.getElementById("lg-look-name");
                if (name)
                    name.value = look.name;
                const layers = look.steps.map((step, i) => ({ id: `saved-${i}`, kind: step.kind, name: step.kind,
                    strength: step.strength, parameters: { ...step.params }, enabled: true, opacity: 1, provenance: "local",
                    origin: "photo", simulation: !["enhance", "filters"].includes(step.kind) }));
                this.openDeliverable("batch", layers);
            }
        }
        else if (action.kind === "category") {
            this.openCategory(action.category);
        }
        else if (action.kind === "studio") {
            this.editor.selectStudio(action.studio);
        }
        else if (action.kind === "brush") {
            this.editor.selectStudio("retouch");
            this.view.brushes.set({ brush: action.brush });
            this.say(`${BRUSH_NAMES[action.brush]} brush ready: paint on the photo. Each stroke is one step in History.`);
        }
        else if (action.kind === "tool") {
            this.openDeliverable(action.tool);
            this.doc.getElementById("lg-deliverable")?.scrollIntoView?.({ block: "start" });
        }
        else if (action.kind === "story") {
            this.openDeliverable("story");
            const panel = this.createPanel;
            if (panel) {
                applyStory(panel, action.id);
                // A first visit then swaps in the example person, which starts a new document: apply the
                // template once more to that picture (only for the first new source, within 15 seconds).
                const first = panel.editor.source.image;
                const stop = panel.editor.subscribe(() => {
                    if (panel.editor.source.image === first)
                        return;
                    stop();
                    setTimeout(() => { if (this.createPanel === panel && !panel.editor.create.board)
                        applyStory(panel, action.id); }, 0);
                });
                setTimeout(stop, 15_000);
            }
            this.doc.getElementById("lg-deliverable")?.scrollIntoView?.({ block: "start" });
        }
        else if (action.kind === "open") {
            this.doc.getElementById("shell-upload")?.click();
        }
        else if (action.kind === "paywall") {
            const copy = paywallCopy();
            this.say(`${copy.title}: ${copy.trial} ${DEMO_NOTE}`);
        }
        if (action.kind !== "none") {
            this.view.draw();
            this.refresh();
        }
    }
    openDeliverable(kind, layers = this.editor.document.layers) {
        const panel = this.doc.getElementById("lg-deliverable");
        if (!panel)
            return;
        this.closePanel?.();
        this.closePanel = null;
        const name = this.doc.getElementById("lg-look-name")?.value.trim() || "My look";
        try {
            const createTab = CREATE_PANELS[kind];
            if (createTab) {
                const screen = createScreen(this.view.editor, createTab, { onChange: () => { this.view.draw(); this.refresh(); },
                    save: () => this.doc.getElementById("shell-download")?.click() });
                panel.replaceChildren(screen.element);
                this.closePanel = () => { this.createPanel = null; screen.dispose(); };
                this.createPanel = screen.panel;
            }
            else if (kind === "faces") {
                const group = this.groupSession();
                if (!group)
                    throw new Error("Find two or more faces first: Older, Younger or Gender, then Find face points.");
                panel.replaceChildren(groupFacesScreen(group.session, group.active, () => group.session.setEdits(group.active, this.editor.document.layers), { openSource: (source) => { this.view.editor.load(source); this.view.afterSource(); this.refresh(); } }));
            }
            else if (kind === "blink") {
                panel.replaceChildren(blinkRescueScreen(() => this.view.editor.source, (source) => { this.view.editor.load(source); this.view.afterSource(); this.refresh(); }));
            }
            else if (kind === "framing") {
                const screen = voiceFramingScreen((source) => { this.view.editor.load(source); this.view.afterSource(); this.refresh(); });
                panel.replaceChildren(screen.element);
                this.closePanel = screen.dispose;
            }
            else if (kind === "tattoo") {
                panel.replaceChildren(tattooScreen(this.view.editor, name, { simulationLabel: () => simulationLabelPref(browserStore()).get() }));
            }
            else if (kind === "stickers") {
                panel.replaceChildren(stickersScreen(this.view.editor, { simulationLabel: () => simulationLabelPref(browserStore()).get() }));
            }
            else if (kind === "video") {
                panel.replaceChildren(beforeAfterScreen(this.view.editor, name, { simulationLabel: () => simulationLabelPref(browserStore()).get() }));
            }
            else if (kind === "event") {
                panel.replaceChildren(eventTrialScreen(() => this.looks.list()));
            }
            else if (kind === "sizes") {
                panel.replaceChildren(exportSizesScreen(this.view.editor, name, { simulationLabel: () => simulationLabelPref(browserStore()).get() }));
            }
            else if (kind === "selfie") {
                panel.replaceChildren(bestSelfieScreen((source) => { this.view.editor.load(source); this.view.afterSource(); this.refresh(); }));
            }
            else {
                const screen = batchReviewScreen(name, layers);
                panel.replaceChildren(screen.element);
                this.closePanel = screen.dispose;
            }
            panel.hidden = false;
            this.doc.getElementById("lg-close-deliverable")?.removeAttribute("hidden");
            panel.scrollIntoView({ block: "nearest" });
        }
        catch (error) {
            this.say(error instanceof Error ? error.message : String(error));
        }
    }
    saveLook() {
        const input = this.doc.getElementById("lg-look-name");
        const name = (input?.value ?? "").trim() || "My look";
        const steps = stepsFromLayers(this.editor.document.layers);
        if (!steps.length) {
            this.say("Add an edit first, then save it as a look.");
            return;
        }
        try {
            const look = this.looks.save(name, steps);
            this.savedAsLook = true;
            // The versioned recipe (Save System v1) goes to IndexedDB; failures keep the My Look copy.
            void this.library.saveLook(look.name, recipeSteps(look.steps)).catch(() => undefined);
            this.say(`Saved "${look.name}" with ${look.steps.length} edit${look.steps.length === 1 ? "" : "s"}. It's on Home under My Looks.`);
        }
        catch (error) {
            this.say(error instanceof Error ? error.message : String(error));
        }
    }
    /** After "Save photo": offer once to keep the edits as a reusable look. */
    afterSavePhoto() {
        const hasEdits = stepsFromLayers(this.editor.document.layers).length > 0;
        if (this.offer.shouldOffer({ savedPhoto: true, hasEdits, savedAsLook: this.savedAsLook })) {
            this.offer.answer("no");
            this.say(OFFER_TEXT + " Name it below and tap Save as My Look.");
            this.doc.getElementById("lg-look-name")?.focus();
        }
    }
    refresh() {
        const layer = this.editor.selected;
        const slider = this.doc.getElementById("lg-strength");
        const out = this.doc.getElementById("lg-strength-value");
        if (slider) {
            slider.disabled = !layer;
            setStrengthRange(slider, layer ? engineToVisible(layer.strength) : 1.0);
            slider.setAttribute("aria-valuetext", layer
                ? `${layer.name} ${engineToVisible(layer.strength).toFixed(1)} of 5.0`
                : "No edit selected");
        }
        if (out)
            out.textContent = layer
                ? `${engineToVisible(layer.strength).toFixed(1)} / 5.0 · ${strengthLabel(layer.kind, layer.strength)}`
                : "Add an edit";
        const sim = this.doc.getElementById("lg-sim-tag");
        if (sim) {
            const tag = editTag(this.editor.document.layers);
            sim.hidden = tag === null;
            if (tag)
                sim.textContent = tag;
        }
        const still = this.doc.getElementById("lg-still-tag");
        const key = JSON.stringify(this.editor.document.layers) + (this.editor.source.image.width + "x" + this.editor.source.image.height);
        if (still && (key !== this.stillKey || this.stillSource !== this.editor.source.image || this.stillFace !== this.editor.source.face)) {
            this.stillSource = this.editor.source.image;
            this.stillFace = this.editor.source.face;
            this.stillKey = key;
            try {
                const result = stillYouFor(this.editor);
                still.textContent = result.text;
                still.dataset.state = result.state;
            }
            catch {
                still.textContent = "Photo checks: unavailable for this photo";
                still.dataset.state = "not checked";
            }
        }
        const faces = this.doc.getElementById("lg-faces");
        if (faces)
            this.renderFaceChips(faces);
    }
    /** The open photo's group session, or null for a photo with fewer than two faces. */
    groupSession() {
        const all = this.editor.source.faces;
        if (!all || all.length < 2) {
            this.group = null;
            return null;
        }
        if (this.group?.faces !== all) {
            try {
                this.group = { faces: all, session: new MultiFaceEdit(this.view.editor.source, all), active: 0 };
            }
            catch (error) {
                this.group = null;
                this.say(error instanceof MultiFaceError ? error.message : String(error));
            }
        }
        return this.group;
    }
    /** Keep this face's edits, move the editor to face `index` and bring back that face's edits. */
    switchFace(index) {
        const group = this.groupSession();
        if (!group || index === group.active)
            return;
        group.session.setEdits(group.active, this.editor.document.layers);
        this.view.editor.setFace(group.session.faces[index]);
        const restored = applySteps(this.editor, stepsFromLayers(group.session.editsFor(index)));
        group.active = index;
        this.say(`Editing face ${index + 1}. The other faces keep their own edits.${restored.skipped.length ? ` Not restored: ${restored.skipped.join("; ")}` : ""}`);
        this.view.draw();
        this.refresh();
    }
    /** "All": the face being edited gives its edits to every face. */
    editAllFaces() {
        const group = this.groupSession();
        if (!group)
            return;
        group.session.setEdits(group.active, this.editor.document.layers);
        group.session.copyToAll(group.active);
        this.say(`Face ${group.active + 1}'s edits now apply to every face, each inside its own face.`);
        this.openDeliverable("faces");
    }
    renderFaceChips(faces) {
        const group = this.groupSession(), n = faceCount(this.editor), active = group?.active ?? 0;
        const key = `${n}:${active}:${this.editor.source.image.width}x${this.editor.source.image.height}`;
        faces.dataset.count = String(n);
        if (key !== this.chipsKey) {
            this.chipsKey = key;
            const chips = Array.from({ length: Math.max(1, n) }, (_, i) => {
                const chip = this.doc.createElement("button");
                chip.type = "button";
                chip.textContent = String(i + 1);
                chip.disabled = n <= 1;
                chip.setAttribute("aria-label", `Edit face ${i + 1}`);
                chip.setAttribute("aria-pressed", String(n > 1 && i === active));
                chip.addEventListener("click", () => this.switchFace(i));
                return chip;
            });
            const all = this.doc.createElement("button");
            all.type = "button";
            all.textContent = "All";
            all.disabled = n <= 1;
            all.addEventListener("click", () => this.editAllFaces());
            const note = this.doc.createElement("span");
            note.className = "lg-small lg-faces-note";
            note.textContent = n > 1 ? `${n} faces. Pick a face to edit it, or All. Each face's edits stay inside that face.` : "One face, or no recorded face points.";
            faces.replaceChildren(...chips, all, note);
        }
        // 4.1: each face chip shows that face, cut from this photo on the device.
        const points = group ? group.session.faces : this.editor.source.face ? [this.editor.source.face] : [];
        faces.querySelectorAll("button").forEach((chip, i) => {
            if (points[i])
                paintFaceChip(this.doc, chip, this.editor.source.image, points[i]);
        });
    }
}
export function mountChrome(view) {
    const chrome = new EditorChrome(view);
    chrome.mount();
    return chrome;
}
//# sourceMappingURL=editor-chrome.js.map