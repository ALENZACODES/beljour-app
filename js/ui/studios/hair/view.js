/** Hair Studio view mounted *inside* the R8/R9 shell and also the existing classic photo flow.
 * There is no second navigation shell, provider, history, licence boundary or Trust Centre.
 * Editor remains the owner of the sample/photo, while HairSession owns only styling choices.
 * The only rendered offline result is the original synthetic S2 cassette illustration.
 * Author: John Khan.
 */
import { appConsent } from "../../shell/consent.js";
import { strengthLabel, hapticTick } from "../../shell/stops.js";
import { YOUCAM_PRODUCTS } from "../../provider-labels.js";
import { HAIR_GROUPS, HAIR_TEXTURES, HAIR_LENGTHS, catalogueSummary, filteredStyles, groupCounts, sourceLabel } from "./model.js";
import { ONE_TAP_HAIR, HairSession } from "./session.js";
import { evaluateHairPose, poseMessage, syntheticHairPose } from "./pose.js";
import { HAIR_REPLAY } from "./replay.js";
import { positiveAdjuncts } from "./variants.js";
import { hairDiagramDataUri } from "./diagram.js";
import { buildSalonBrief, salonBriefText, salonBriefJson, salonBoardSvg, MAX_NOTES } from "./brief.js";
const MAX_REFERENCE_BYTES = 8 * 1024 * 1024;
const SUPPORTED_REFERENCE = new Set(["image/jpeg", "image/png", "image/webp"]);
const ADJUNCTS = [
    { id: "bangs", title: "Bangs", description: "Optional fringe styling task" },
    { id: "curl", title: "Curl", description: "Optional wave/curl styling task" },
    { id: "extension", title: "Extension", description: "Optional extra-length styling task" },
    { id: "volume", title: "Volume", description: "Optional fullness styling task" },
];
function n(tag, css = "", content = "") {
    const node = document.createElement(tag);
    node.className = css;
    if (content)
        node.textContent = content;
    return node;
}
function b(label, act, css = "hair-button") {
    const node = n("button", css, label);
    node.type = "button";
    node.addEventListener("click", act);
    return node;
}
function nameControl(text, control) {
    const label = n("label", "hair-field");
    const span = n("span", "hair-field-label", text);
    label.append(span, control);
    return label;
}
function slider(text, value, act) {
    const input = n("input", "hair-range");
    input.type = "range";
    input.min = "0";
    input.max = "100";
    input.step = "1";
    input.value = String(value);
    input.setAttribute("aria-label", text);
    const number = n("output", "hair-number", strengthLabel("hair-fibre", value));
    input.setAttribute("aria-valuetext", number.value);
    let previous = value;
    input.addEventListener("input", () => {
        const next = Number(input.value);
        number.value = strengthLabel("hair-fibre", next);
        input.setAttribute("aria-valuetext", number.value);
        hapticTick(previous, next);
        previous = next;
    });
    // Change, rather than input, avoids destroying the input during a pointer drag.
    input.addEventListener("change", () => act(Number(input.value)));
    const wrap = n("span", "hair-slider");
    wrap.append(input, number);
    return nameControl(text, wrap);
}
function labelledCheck(title, checked, onChange) {
    const label = n("label", "hair-check");
    const input = n("input");
    input.type = "checkbox";
    input.checked = checked;
    input.addEventListener("change", () => onChange(input.checked));
    label.append(input, n("span", "", title));
    return label;
}
function choose(title, choices, selected, change) {
    const select = n("select", "hair-select");
    for (const option of choices) {
        const child = n("option", "", option.label);
        child.value = option.id;
        select.append(child);
    }
    select.value = selected;
    select.addEventListener("change", () => change(select.value));
    return nameControl(title, select);
}
const all = (items) => [{ id: "all", label: "All" }, ...items.map((item) => ({ id: item, label: item[0].toUpperCase() + item.slice(1) }))];
export class HairStudio {
    session;
    element;
    context;
    referenceFile = null;
    refUrl = null;
    salonNotes = "";
    alive = true;
    subscription;
    constructor(context, session = new HairSession()) {
        this.context = context;
        this.session = session;
        this.element = n("section", "hair-studio");
        this.element.dataset.component = "hair-studio";
        this.element.setAttribute("aria-label", "Hair Studio hairstyle catalogue");
        this.subscription = session.subscribe((state) => { if (this.alive)
            this.draw(state); });
    }
    /** The shell calls this after loading a different photo; the studio doesn't store it. */
    setContext(next) {
        this.context = next;
        this.draw(this.session.state);
    }
    dispose() {
        this.alive = false;
        this.subscription();
        if (this.refUrl)
            URL.revokeObjectURL(this.refUrl);
        this.referenceFile = null;
        this.refUrl = null;
        this.element.replaceChildren();
    }
    safe(fn) {
        try {
            fn();
        }
        catch (error) {
            this.session.setMessage(error instanceof Error ? error.message : String(error));
        }
    }
    facePose() {
        const source = this.context.image;
        if (!source)
            return evaluateHairPose({ points: null, width: 900, height: 1100, faceCount: 0 });
        if (source.synthetic)
            return syntheticHairPose();
        return evaluateHairPose({ points: source.landmarks, width: source.width, height: source.height,
            faceCount: source.faces ?? 1 });
    }
    dropReference() {
        if (this.refUrl)
            URL.revokeObjectURL(this.refUrl);
        this.referenceFile = null;
        this.refUrl = null;
        this.session.setReference(null);
    }
    takeReference(file) {
        if (!SUPPORTED_REFERENCE.has(file.type))
            throw new Error("Use JPEG, PNG or WebP for a reference haircut.");
        if (!file.size || file.size > MAX_REFERENCE_BYTES)
            throw new Error("Reference cut must be an image under 8 MB.");
        if (this.refUrl)
            URL.revokeObjectURL(this.refUrl);
        this.refUrl = URL.createObjectURL(file);
        this.referenceFile = file;
        const ref = { fileName: file.name.slice(0, 120), mime: file.type,
            size: file.size, localPreview: this.refUrl };
        this.session.setReference(ref);
    }
    actionReady(state, pose) {
        if (!this.context.onApply || !this.context.photoId)
            return { ok: false, reason: "Open the classic Hair Studio with an uploaded photo to apply a live request." };
        if (appConsent.localOnly)
            return { ok: false, reason: "On-device only is on in Trust Centre." };
        if (!appConsent.allows(this.context.photoId, "hair-style"))
            return { ok: false, reason: "Grant photo-specific hair-styling consent before applying." };
        if (!pose.acceptable || this.context.image?.synthetic)
            return { ok: false, reason: poseMessage(pose) };
        if (!state.selection.reference || !this.referenceFile)
            return { ok: false, reason: "Preset IDs are synthetic. Choose a reference haircut photo instead." };
        if (!state.selection.referenceRights)
            return { ok: false, reason: "Tick the reference-image rights checkbox." };
        return { ok: true, reason: "Reference ready to quote through the single YouCam gateway." };
    }
    async apply(reference, adjunct = null) {
        const state = this.session.state, pose = this.facePose();
        if (!this.context.onApply) {
            this.session.setMessage("Demo mode needs no provider. The one illustrated sample remains available.");
            return;
        }
        if (appConsent.localOnly || !this.context.photoId || !appConsent.allows(this.context.photoId, "hair-style") ||
            !pose.acceptable || this.context.image?.synthetic) {
            this.session.setMessage("The on-device photo check, individual hair consent, and a real uploaded photo must pass first.");
            return;
        }
        let request;
        if (adjunct) {
            const strength = state.selection.adjuncts[adjunct];
            if (strength <= 0) {
                this.session.setMessage("Move this styling slider above zero first.");
                return;
            }
            const map = {
                bangs: "hair-bang", curl: "hair-curl", extension: "hair-extension", volume: "hair-volume",
            };
            request = { action: map[adjunct], options: { strength } };
        }
        else if (reference) {
            const ready = this.actionReady(state, pose);
            if (!ready.ok || !this.referenceFile) {
                this.session.setMessage(ready.reason);
                return;
            }
            request = { action: "hair-transfer", options: {}, referenceFile: this.referenceFile,
                referenceRights: state.selection.referenceRights };
        }
        else {
            // This path cannot be reached until a genuine operator-reviewed S1 import is
            // provided. The synthetic catalogue never authorizes live template IDs.
            this.session.setMessage("No verified live preset ID yet. Use a reference photo with rights.");
            return;
        }
        this.session.markBusy(true);
        try {
            this.session.showResult(await this.context.onApply(request));
        }
        catch (error) {
            this.session.setMessage(error instanceof Error ? error.message : "The provider result couldn't be opened.");
        }
        finally {
            this.session.markBusy(false);
        }
    }
    head(state) {
        const head = n("div", "hair-heading");
        const start = n("div", "hair-heading-copy");
        start.append(n("h2", "", "Hair Studio"), n("p", "hair-subtitle", "Choose a shape first. Gentle previews, your colour and features unchanged."));
        const trust = n("div", "hair-trust");
        const local = n("span", "hair-chip hair-chip-local", "Local ideas and demo · no network");
        const provider = n("span", "hair-chip", `${YOUCAM_PRODUCTS.hair} · only after a quote and consent`);
        trust.append(local, provider);
        head.append(start, trust);
        return head;
    }
    factBar() {
        const stats = catalogueSummary();
        const root = n("div", "hair-facts");
        const facts = [["Cut references", stats.total], ["Short sides", stats.shortSides],
            ["Short-length", stats.shortStyles], ["Synthetic S1", stats.s1Synthetic],
            ["Live verified", stats.verifiedLive]];
        for (const [label, value] of facts) {
            const item = n("div", "hair-fact");
            item.append(n("strong", "", String(value)), n("small", "", label));
            root.append(item);
        }
        return root;
    }
    quickLooks() {
        const section = n("section", "hair-subsection");
        section.append(n("h3", "", "One-tap starting looks"), n("p", "hair-small", "These select settings. They do not generate a different photo or change skin/face shape."));
        const strip = n("div", "hair-quick-strip");
        for (const look of ONE_TAP_HAIR) {
            const chip = b(look.title, () => this.safe(() => this.session.oneTap(look.id)), "hair-pill");
            chip.title = look.description;
            chip.dataset.intent = look.intent;
            strip.append(chip);
        }
        section.append(strip);
        return section;
    }
    catalogueFilters(state) {
        const section = n("div", "hair-filterbar");
        const query = state.query;
        section.append(choose("Group", [{ id: "all", label: "All cuts" }, ...HAIR_GROUPS.map((g) => ({ id: g.id, label: g.title }))], query.group, (group) => this.session.updateQuery({ group: group })), choose("Hair length", all(HAIR_LENGTHS), query.length, (length) => this.session.updateQuery({ length: length })), choose("Natural texture", all(HAIR_TEXTURES), query.texture, (texture) => this.session.updateQuery({ texture: texture })), choose("Catalogue type", [{ id: "all", label: "All ideas" },
            { id: "synthetic-s1", label: "S1 synthetic" }, { id: "inspiration", label: "Original references" }], query.source, (source) => this.session.updateQuery({ source })));
        const search = n("input", "hair-search");
        search.type = "search";
        search.value = query.term;
        search.maxLength = 80;
        search.placeholder = "Search cuts, texture, fade, fringe…";
        search.setAttribute("aria-label", "Find a haircut");
        // Updating on change (blur/Enter) keeps typing and focus stable.
        search.addEventListener("change", () => this.session.updateQuery({ term: search.value }));
        section.append(nameControl("Find a look", search), labelledCheck("Favourites only", query.favouritesOnly, (value) => this.session.updateQuery({ favouritesOnly: value })));
        return section;
    }
    card(state, row) {
        const picked = row.id === state.selection.styleId;
        const card = n("article", "hair-style-card");
        card.dataset.styleId = row.id;
        if (picked)
            card.classList.add("hair-selected");
        const silhouette = n("div", "hair-shape");
        silhouette.dataset.family = row.group;
        const diagram = n("img", "hair-cut-diagram");
        diagram.src = hairDiagramDataUri(row, { size: 140, guides: false, showCaption: false });
        diagram.alt = `${row.name} — original schematic cut diagram, not your hair preview`;
        diagram.loading = "lazy";
        diagram.decoding = "async";
        silhouette.append(diagram);
        const information = n("div", "hair-style-info");
        const source = n("small", "hair-source", row.source === "synthetic-s1" ? "Synthetic list" : "Cut reference");
        const title = n("h4", "", row.name);
        const copy = n("p", "hair-card-desc", row.description);
        const tags = n("div", "hair-tags");
        for (const tag of row.tags.slice(0, 3))
            tags.append(n("span", "", tag.replaceAll("-", " ")));
        information.append(source, title, copy, tags);
        const actions = n("div", "hair-card-actions");
        const pick = b(picked ? "Selected" : "Choose", () => this.safe(() => {
            this.dropReference();
            this.session.choose(row.id);
        }), "hair-mini-button");
        pick.setAttribute("aria-pressed", String(picked));
        const add = b("+ Board", () => this.safe(() => this.session.addToBoard(row.id)), "hair-mini-button");
        const fav = b(state.favourites.includes(row.id) ? "★ Saved" : "☆ Save", () => this.safe(() => this.session.toggleFavourite(row.id)), "hair-mini-button");
        fav.setAttribute("aria-pressed", String(state.favourites.includes(row.id)));
        actions.append(pick, add, fav);
        card.append(silhouette, information, actions);
        card.title = sourceLabel(row);
        return card;
    }
    catalogue(state) {
        const section = n("section", "hair-subsection hair-catalogue");
        section.append(n("h3", "", "Cuts for every style and texture"), n("p", "hair-small", "Style names are references, not claims of YouCam availability. No person or skin-tone category limits a cut."), this.catalogueFilters(state));
        const rows = filteredStyles(state.query, new Set(state.favourites));
        const grid = n("div", "hair-card-grid");
        if (!rows.length)
            grid.append(n("p", "hair-empty", "No cuts match those filters. Clear the search to see more options."));
        else
            for (const row of rows)
                grid.append(this.card(state, row));
        const counts = groupCounts().map((g) => `${g.title}: ${g.count}`).join(" · ");
        section.append(n("p", "hair-count", `${rows.length} matching cut${rows.length === 1 ? "" : "s"}. ${counts}`), grid);
        return section;
    }
    controls(state) {
        const selection = state.selection, root = n("section", "hair-subsection");
        root.append(n("h3", "", "Adjust this look"), n("p", "hair-small", "Each value is 0–100. Extra styling tasks are separate; changing the slider does not change the sample image."));
        const controls = n("div", "hair-control-grid");
        controls.append(slider("Hairstyle strength", selection.strength, (value) => this.session.setStrength(value)));
        for (const entry of ADJUNCTS) {
            const control = n("div", "hair-adjunct");
            control.append(slider(entry.title, selection.adjuncts[entry.id], (value) => this.session.setAdjunct(entry.id, value)), n("p", "hair-small", entry.description));
            const apply = b(`Try ${entry.title.toLowerCase()} separately`, () => { void this.apply(false, entry.id); }, "hair-mini-button");
            apply.disabled = selection.adjuncts[entry.id] <= 0 || state.busy || !this.context.onApply || !this.facePose().acceptable || appConsent.localOnly;
            control.append(apply);
            controls.append(control);
        }
        const keep = labelledCheck("Keep my existing colour (recommended)", selection.keepColour, (value) => this.session.setKeepColour(value));
        controls.append(keep);
        root.append(controls);
        return root;
    }
    reference(state, pose) {
        const root = n("section", "hair-subsection hair-reference");
        root.append(n("h3", "", "Try a reference haircut"), n("p", "hair-small", "Choose a photo of the cut you own or have permission to use. It stays in this browser until you confirm an upload for one styling task."));
        const picker = n("input", "hair-file");
        picker.type = "file";
        picker.accept = "image/jpeg,image/png,image/webp";
        picker.setAttribute("aria-label", "Choose your permitted haircut reference");
        picker.addEventListener("change", () => {
            const file = picker.files?.[0];
            picker.value = "";
            if (file)
                this.safe(() => this.takeReference(file));
        });
        root.append(nameControl("Reference haircut photo", picker));
        if (state.selection.reference) {
            const row = n("div", "hair-reference-preview");
            const im = n("img");
            im.src = state.selection.reference.localPreview;
            im.alt = "Locally selected haircut reference";
            im.loading = "lazy";
            im.decoding = "async";
            const details = n("div", "hair-reference-copy");
            details.append(n("strong", "", state.selection.reference.fileName), n("p", "hair-small", `${Math.round(state.selection.reference.size / 1024)} KB · never sent automatically`), labelledCheck("I own this photo or have permission to use it as a haircut reference.", state.selection.referenceRights, (yes) => this.session.setReferenceRights(yes)));
            row.append(im, details, b("Remove reference", () => this.dropReference(), "hair-mini-button"));
            root.append(row);
        }
        const note = n("p", "hair-small", "S2 reference-transfer endpoint and cost remain unverified; results are experimental until tested on released real photos.");
        const ready = this.actionReady(state, pose);
        const apply = b(state.busy ? "Waiting for styling…" : "Quote and try reference cut", () => { void this.apply(true); }, "hair-button hair-apply");
        apply.disabled = !ready.ok || state.busy;
        apply.title = ready.reason;
        root.append(note, apply, n("p", "hair-gate", ready.reason));
        return root;
    }
    board(state) {
        const section = n("section", "hair-subsection");
        section.append(n("h3", "", "Variant board"), n("p", "hair-small", "Compare cut choices side by side. These are cards, not nine separate rendered haircut photographs."));
        const bar = n("div", "hair-board-bar");
        bar.append(choose("Grid", [{ id: "4", label: "2 × 2" }, { id: "9", label: "3 × 3" }], String(state.selection.variantCount), (value) => this.session.setGridSize(Number(value))), b("Add chosen cut", () => this.session.addToBoard(state.selection.styleId), "hair-mini-button"), b("Clear board", () => this.session.clearBoard(), "hair-mini-button"));
        section.append(bar);
        const grid = n("div", "hair-variants");
        grid.dataset.cols = state.board.size === 9 ? "3" : "2";
        for (const tile of state.board.tiles) {
            const cell = n("article", "hair-variant");
            cell.dataset.state = tile.state;
            const number = n("span", "hair-variant-index", `${tile.slot + 1}`);
            const title = n("h4", "", tile.title);
            const stateTag = n("span", "hair-variant-state", tile.state.replaceAll("-", " "));
            const reason = n("p", "hair-small", tile.reason);
            cell.append(number, title, stateTag, reason);
            if (tile.styleId) {
                const actions = n("div", "hair-variant-actions");
                actions.append(b("←", () => this.session.moveOnBoard(tile.styleId, -1), "hair-mini-button"), b("→", () => this.session.moveOnBoard(tile.styleId, 1), "hair-mini-button"), b("×", () => this.session.removeFromBoard(tile.styleId), "hair-mini-button"));
                cell.append(actions);
            }
            grid.append(cell);
        }
        section.append(grid);
        return section;
    }
    download(name, mime, content) {
        if (!/^[a-z0-9._-]{1,75}$/.test(name) || name.includes(".."))
            throw new RangeError("Unsafe file name");
        const url = URL.createObjectURL(new Blob([content], { type: mime }));
        const link = n("a");
        link.download = name;
        link.href = url;
        link.style.display = "none";
        document.body.append(link);
        link.click();
        link.remove();
        // Downloads use browser-owned bytes; reference photos never enter the note file.
        setTimeout(() => URL.revokeObjectURL(url), 1500);
    }
    salon(state) {
        const root = n("section", "hair-subsection hair-salon");
        root.append(n("h3", "", "Take these ideas to your stylist"), n("p", "hair-small", "Save a real consultation brief or a printable 2×2 / 3×3 diagram board. No portrait, reference-photo bytes, landmarks, secrets, or face data are exported. Diagrams are not try-on results."));
        const selected = state.selection;
        const row = n("div", "hair-salon-notes");
        const notes = n("textarea", "hair-notes");
        notes.rows = 3;
        notes.maxLength = MAX_NOTES;
        notes.placeholder = "Optional: how much length to keep, daily styling time, or what you'd like to discuss";
        notes.value = this.salonNotes;
        notes.setAttribute("aria-label", "Private notes to discuss with stylist");
        notes.addEventListener("input", () => { this.salonNotes = notes.value; });
        row.append(nameControl("My notes (in memory only)", notes));
        const actions = n("div", "hair-download-actions");
        const make = () => buildSalonBrief(selected, state.board, { notes: this.salonNotes });
        actions.append(b("Download consultation notes", () => this.safe(() => this.download("beljour-cut-consultation.txt", "text/plain;charset=utf-8", salonBriefText(make()))), "hair-button"), b("Save editable cut choices", () => this.safe(() => this.download("beljour-cut-choices.json", "application/json", salonBriefJson(make()))), "hair-mini-button"), b("Download diagram board", () => this.safe(() => this.download(`beljour-cut-board-${state.board.size}.svg`, "image/svg+xml;charset=utf-8", salonBoardSvg(make(), state.board.size))), "hair-mini-button"));
        root.append(row, actions, n("p", "hair-small", "Print the board or share the plain-text notes. These are haircut ideas, not a prediction or a rendered hairstyle on your photo."));
        return root;
    }
    result(state) {
        const section = n("section", "hair-subsection hair-result");
        section.append(n("h3", "", "Preview and provenance"));
        const preview = state.preview;
        if (preview.image) {
            const figure = n("figure", "hair-result-figure");
            if (preview.synthetic) {
                const original = n("div", "hair-result-photo");
                const source = n("img");
                source.src = "hair-assets/before-hairstyle-synthetic.jpeg";
                source.alt = "Original illustrated source before the synthetic style";
                source.loading = "lazy";
                original.append(source, n("span", "hair-caption", "Drawn before"));
                figure.append(original);
            }
            else if (this.context.originalSrc) {
                const original = n("div", "hair-result-photo");
                const image = n("img");
                image.src = this.context.originalSrc;
                image.alt = "Your original photo before YouCam styling";
                original.append(image, n("span", "hair-caption", "Before"));
                figure.append(original);
            }
            const result = n("div", "hair-result-photo");
            const img = n("img");
            img.src = preview.image;
            img.alt = preview.synthetic ? "Synthetic haircut illustration, not provider output" : "Your hair styling result";
            img.loading = "lazy";
            img.decoding = "async";
            result.append(img, n("span", "hair-caption", preview.synthetic ? "Synthetic replay, not YouCam" : "YouCam styling"));
            figure.append(result);
            section.append(figure);
        }
        else
            section.append(n("p", "hair-empty", preview.note));
        const info = n("div", "hair-provenance");
        info.append(n("strong", "", preview.provenance), n("p", "", preview.note));
        if (preview.synthetic)
            info.append(n("small", "", HAIR_REPLAY.flow));
        else if (preview.status === "live")
            info.append(n("small", "", "sent to YouCam, deleted after the result"));
        section.append(info);
        return section;
    }
    safety(state, pose) {
        const root = n("section", "hair-subsection hair-safety");
        root.append(n("h3", "", "Photo suitability and Trust Centre"));
        const status = n("div", "hair-pose-status");
        status.dataset.state = pose.acceptable ? "ok" : "check";
        status.append(n("strong", "", pose.acceptable ? "Pose check ready" : "Retake or use a clearer photo"), n("p", "hair-small", poseMessage(pose)));
        if (pose.rollDegrees !== null)
            status.append(n("small", "", `Photo tilt ${Math.abs(pose.rollDegrees).toFixed(1)}° · turn proxy ${pose.yawProxy?.toFixed(2)} · not a diagnosis`));
        const flow = n("p", "hair-small", this.context.mode === "shell"
            ? "This Hair Studio view only uses an illustrated sample and on-device metadata. No photo is sent from the shell."
            : "Your uploaded portrait was sent to our server in the photo step. Hair styling requires a separate YouCam consent tick. The reference photo is only uploaded on Apply.");
        const trust = n("a", "hair-link", "Open Trust Centre");
        trust.href = "trust.html";
        const label = n("p", "hair-small", "No automatic skin lightening, slimming or facial changes. A reference cut preview is a style simulation. No quality-arena score is assigned until tested on permitted real faces.");
        root.append(status, flow, trust, label);
        if (positiveAdjuncts(state.selection.adjuncts).length)
            root.append(n("p", "hair-small", "Bangs / curl / extension / volume are separate optional provider tasks. A multi-step layered hairstyle is not yet supported."));
        return root;
    }
    draw(state) {
        if (!this.alive)
            return;
        const root = this.element;
        const pose = this.facePose();
        const summary = n("p", "hair-live-message");
        summary.setAttribute("role", "status");
        summary.setAttribute("aria-live", "polite");
        summary.textContent = state.note;
        root.replaceChildren(this.head(state), this.factBar(), summary, this.quickLooks(), this.catalogue(state), this.controls(state), this.reference(state, pose), this.board(state), this.salon(state), this.result(state), this.safety(state, pose));
    }
}
//# sourceMappingURL=view.js.map