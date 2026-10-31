import { ensureConsent } from "../ui/one-consent.js";
import { h } from "../dom.js";
import { resize } from "../engines/core/buffer.js";
import { mixColours, moreChroma, assessShade, MIX_LABEL, SUITABILITY_LABEL } from "../engines/palette/colour.js";
import { extractPalette } from "../engines/palette/extract.js";
import { decodePhoto, browserDecoder, DEFAULT_LIMITS } from "../image/decode.js";
import { PaletteLibrary, browserPalettes, PALETTE_ROLES, MAX_SWATCHES, MAX_PALETTE_FILE, validateSwatch, paletteText } from "../save/palettes.js";
import { downloadFile } from "../save/download.js";
import { paint } from "../ui/shell/canvas.js";
import { appConsent, VISIT_STATEMENTS } from "../ui/shell/consent.js";
import { token } from "../ui/palette.js";
const roleName = (role) => role[0].toUpperCase() + role.slice(1);
function roles(label, value = "lips") {
    const select = h("select", { "aria-label": label }, ...PALETTE_ROLES.map(role => h("option", { value: role }, roleName(role))));
    select.value = value;
    return select;
}
function chip(hex, name) {
    return h("span", { class: "palette-chip", style: { backgroundColor: hex }, role: "img", "aria-label": `${name}: ${hex}` });
}
function errorText(error) { return error instanceof Error ? error.message : "This action could not be completed."; }
/** Exact region used by extraction. Percent controls are converted once to pixel
 * edges; an invalid region is refused, never silently moved onto another object. */
export function regionFromPercent(image, x, y, width, height) {
    if (![x, y, width, height].every(Number.isFinite) || x < 0 || y < 0 || width <= 0 || height <= 0 ||
        x + width > 100 || y + height > 100)
        throw new RangeError("Keep the region inside the photo: left plus width and top plus height must be at most 100 percent.");
    const x0 = Math.floor(x * image.width / 100), y0 = Math.floor(y * image.height / 100);
    const x1 = Math.min(image.width, Math.ceil((x + width) * image.width / 100));
    const y1 = Math.min(image.height, Math.ceil((y + height) * image.height / 100));
    return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}
export function paletteScreen(ctx, deps = {}) {
    const library = deps.library ?? browserPalettes(), gate = deps.consent ?? appConsent;
    const download = deps.download ?? downloadFile;
    let draft = [], selectedId, serial = 0;
    let reference = null, extracted = null, request = 0, disposed = false;
    let mixed = mixColours("#893F64", "#B96B43", .5);
    const status = h("p", { role: "status", "aria-live": "polite", class: "palette-status" }, library.note || "Start with a digital mix, or open a reference photo below.");
    const title = h("input", { type: "text", maxlength: 40, value: "My palette", "aria-label": "Palette name" });
    const swatchName = h("input", { type: "text", maxlength: 40, value: "My mix", "aria-label": "New swatch name" });
    const role = roles("Role for new swatches"), first = h("input", { type: "color", value: "#893f64", "aria-label": "First mix colour" });
    const second = h("input", { type: "color", value: "#b96b43", "aria-label": "Second mix colour" });
    const share = h("input", { type: "range", min: 0, max: 100, step: 1, value: "50", "aria-label": "Second colour share" });
    const shareText = h("output", {}, "50% second colour"), mixPreview = h("div", { class: "palette-mix-result", "aria-live": "polite" });
    const draftList = h("ol", { class: "palette-list", "aria-label": "Palette draft" });
    const savedList = h("ul", { class: "palette-saved", "aria-label": "Saved palettes" });
    const sourceInput = h("input", { type: "file", accept: "image/jpeg,image/png,image/webp", "aria-label": "Reference photo" });
    const importInput = h("input", { type: "file", accept: "application/json,.json", "aria-label": "Import palette colour file" });
    const canvas = h("canvas", { class: "palette-reference", role: "img", "aria-label": "Reference photo and selected region", hidden: true });
    const referenceStatus = h("p", { class: "fine", "aria-live": "polite" }, "No reference photo is open.");
    const extractionList = h("ul", { class: "palette-extracted", "aria-label": "Extracted reference colours" });
    const count = h("input", { type: "number", min: 1, max: 8, step: 1, value: "6", "aria-label": "Number of reference colours" });
    const area = ["Left", "Top", "Width", "Height"].map((name, index) => h("input", {
        type: "number", min: index < 2 ? 0 : 1, max: 100, step: 1, value: index < 2 ? "0" : "100", "aria-label": `${name} percent`,
    }));
    const run = h("button", { type: "button", class: "btn", disabled: true }, "Extract region colours");
    const clearReference = h("button", { type: "button", class: "btn btn-quiet", disabled: true }, "Clear reference photo");
    const save = h("button", { type: "button", class: "btn", disabled: true }, "Save palette");
    const exportDraft = h("button", { type: "button", class: "btn btn-quiet", disabled: true }, "Export draft colours");
    const say = (value) => { status.textContent = value; };
    const measured = !ctx.localShade?.refused ? ctx.localShade?.measured_lab : null;
    const checks = (hex) => {
        const check = assessShade(hex, measured);
        return h("div", { class: check.flags.length ? "palette-warning" : "fine" }, ...check.notes.map(note => h("p", {}, note)), check.deltaE === null ? null : h("p", {}, `Difference from your current-photo W6 reading: ${check.deltaE.toFixed(1)} ΔE00.`));
    };
    const showMix = () => {
        mixPreview.replaceChildren(chip(mixed.hex, "Digital mix"), h("code", {}, mixed.hex), h("span", {}, `Swatch lightness ${mixed.lab[0].toFixed(1)} L*.`), checks(mixed.hex));
    };
    const mix = () => {
        try {
            mixed = mixColours(first.value, second.value, Number(share.value) / 100);
            shareText.textContent = `${share.value}% second colour`;
            showMix();
        }
        catch (error) {
            say(errorText(error));
        }
    };
    first.addEventListener("input", mix);
    second.addEventListener("input", mix);
    share.addEventListener("input", mix);
    const more = h("button", { type: "button", class: "btn btn-quiet", onclick: () => {
            try {
                const result = moreChroma(mixed.hex, 1.2);
                mixed = { ...result, label: MIX_LABEL };
                showMix();
                say(result.gamutReduced ? "Chroma raised as far as this screen's colour space allows. Swatch lightness is held; no face is changed."
                    : "Chroma raised at the same swatch lightness. No face is changed.");
            }
            catch (error) {
                say(errorText(error));
            }
        } }, "More chroma, same lightness");
    const drawDraft = () => {
        draftList.replaceChildren();
        for (const [index, swatch] of draft.entries()) {
            const name = h("input", { type: "text", maxlength: 40, value: swatch.name, "aria-label": `Name for swatch ${index + 1}` });
            const colour = h("input", { type: "color", value: swatch.hex.toLowerCase(), "aria-label": `Colour for swatch ${index + 1}` });
            const usage = roles(`Role for swatch ${index + 1}`, swatch.role);
            const apply = h("button", { type: "button", class: "btn btn-quiet", onclick: () => {
                    try {
                        draft[index] = validateSwatch({ ...swatch, name: name.value, hex: colour.value, role: usage.value });
                        drawDraft();
                        say("Swatch edited. Save the palette to keep this change.");
                    }
                    catch (error) {
                        say(errorText(error));
                    }
                } }, `Apply edits to ${swatch.name}`);
            const remove = h("button", { type: "button", class: "btn btn-quiet", onclick: () => {
                    draft.splice(index, 1);
                    drawDraft();
                    say("Swatch removed from this draft. Save to update a saved palette.");
                } }, `Remove ${swatch.name}`);
            const move = (offset) => { [draft[index], draft[index + offset]] = [draft[index + offset], draft[index]]; drawDraft(); };
            draftList.append(h("li", { "data-swatch": swatch.id }, chip(swatch.hex, swatch.name), h("code", {}, swatch.hex), h("div", { class: "palette-fields" }, name, colour, usage), checks(swatch.hex), h("div", { class: "row" }, apply, remove, h("button", { type: "button", class: "btn btn-quiet", disabled: index === 0, onclick: () => move(-1) }, `Move ${swatch.name} up`), h("button", { type: "button", class: "btn btn-quiet", disabled: index === draft.length - 1, onclick: () => move(1) }, `Move ${swatch.name} down`))));
        }
        if (!draft.length)
            draftList.append(h("li", { class: "fine" }, "Your draft is empty. Add colours for Eyes, Blush or Lips."));
        save.disabled = exportDraft.disabled = draft.length === 0;
    };
    const add = (hex, suggested) => {
        try {
            if (draft.length >= MAX_SWATCHES)
                throw new Error(`A palette holds at most ${MAX_SWATCHES} swatches. Remove one first.`);
            let id;
            do {
                id = `swatch-${++serial}`;
            } while (draft.some(item => item.id === id));
            const value = validateSwatch({ id, name: suggested, hex, role: role.value });
            draft.push(value);
            drawDraft();
            say(`${value.name} added for ${roleName(value.role)}. Save when your palette is ready.`);
        }
        catch (error) {
            say(errorText(error));
        }
    };
    const exportPalette = (value) => {
        download("beljour-palette.json", "application/json", new TextEncoder().encode(paletteText(value)));
        say("Colour file prepared. It contains no photo, filename, skin measurement or product claim.");
    };
    const load = (value) => {
        selectedId = value.id;
        title.value = value.name;
        draft = value.swatches.map(swatch => ({ ...swatch }));
        drawDraft();
        say(`${value.name} loaded into the draft. Changes are saved only when you press Save palette.`);
    };
    const drawSaved = () => {
        savedList.replaceChildren();
        for (const palette of library.list())
            savedList.append(h("li", {}, h("strong", {}, palette.name), h("p", { class: "fine" }, `${palette.swatches.length} colour preferences; no photo.`), h("div", { class: "palette-chip-row" }, ...palette.swatches.map(swatch => chip(swatch.hex, `${roleName(swatch.role)}: ${swatch.name}`))), h("div", { class: "row" }, h("button", { type: "button", class: "btn btn-quiet", onclick: () => load(palette) }, `Load ${palette.name}`), h("button", { type: "button", class: "btn btn-quiet", onclick: () => { try {
                    exportPalette(palette);
                }
                catch (error) {
                    say(errorText(error));
                } } }, `Export ${palette.name}`), h("button", { type: "button", class: "btn btn-quiet", onclick: () => {
                    library.remove(palette.id);
                    if (selectedId === palette.id)
                        selectedId = undefined;
                    drawSaved();
                    say(library.note);
                } }, `Delete ${palette.name}`))));
        if (!library.list().length)
            savedList.append(h("li", { class: "fine" }, "No saved palettes on this device."));
    };
    const saveDraft = (asNew = false) => {
        try {
            const result = library.save(title.value, draft, asNew ? undefined : selectedId);
            selectedId = result.palette.id;
            drawSaved();
            say(result.note);
        }
        catch (error) {
            say(errorText(error));
        }
    };
    save.addEventListener("click", () => saveDraft());
    exportDraft.addEventListener("click", () => {
        try {
            // Use a transient store so exporting a draft cannot silently persist it.
            const value = new PaletteLibrary(null).save(title.value, draft).palette;
            exportPalette(value);
        }
        catch (error) {
            say(errorText(error));
        }
    });
    importInput.addEventListener("change", async () => {
        const file = importInput.files?.[0];
        importInput.value = "";
        if (!file)
            return;
        try {
            if (file.size > MAX_PALETTE_FILE)
                throw new Error("Palette file is too large.");
            const contents = await file.text();
            if (disposed)
                return;
            const result = library.import(contents);
            load(result.palette);
            drawSaved();
            say(`Imported as a new palette. ${result.note}`);
        }
        catch (error) {
            if (!disposed)
                say(errorText(error));
        }
    });
    const selectedRegion = () => {
        if (!reference)
            throw new Error("Open a reference photo first.");
        return regionFromPercent(reference, Number(area[0].value), Number(area[1].value), Number(area[2].value), Number(area[3].value));
    };
    const drawReference = () => {
        if (!reference) {
            canvas.hidden = true;
            return;
        }
        const region = selectedRegion(), factor = Math.min(1, 640 / Math.max(reference.width, reference.height));
        const preview = factor < 1 ? resize(reference, Math.max(1, Math.round(reference.width * factor)), Math.max(1, Math.round(reference.height * factor))) : reference;
        canvas.hidden = false;
        try {
            (deps.paint ?? paint)(canvas, preview, { overlay: false });
            canvas.style.width = "100%";
            canvas.style.height = "auto";
            const drawing = canvas.getContext("2d");
            if (drawing) {
                drawing.strokeStyle = token("plum");
                drawing.lineWidth = 2;
                drawing.strokeRect(region.x * factor, region.y * factor, region.width * factor, region.height * factor);
            }
        }
        catch {
            referenceStatus.textContent = "Preview is unavailable. The chosen pixel region can still be extracted locally.";
        }
    };
    for (const field of area)
        field.addEventListener("change", () => {
            extracted = null;
            extractionList.replaceChildren();
            try {
                drawReference();
                run.disabled = !reference;
            }
            catch (error) {
                run.disabled = true;
                referenceStatus.textContent = errorText(error);
            }
        });
    const drawExtraction = () => {
        extractionList.replaceChildren();
        if (!extracted)
            return;
        for (const [index, colour] of extracted.colours.entries()) {
            const name = `Reference ${index + 1}`;
            extractionList.append(h("li", {}, chip(colour.hex, name), h("code", {}, colour.hex), h("p", {}, `${Math.round(colour.share * 100)}% of sampled visible colour; mean difference ${colour.meanDeltaE.toFixed(2)} ΔE00.`), checks(colour.hex), h("button", { type: "button", class: "btn btn-quiet", onclick: () => add(colour.hex, name) }, `Add ${name}`)));
        }
    };
    const understood = h("input", { type: "checkbox", "aria-label": VISIT_STATEMENTS[0].text });
    const consent = h("fieldset", {}, h("legend", {}, "Before opening a reference photo"), h("label", {}, understood, VISIT_STATEMENTS[0].text));
    const updateConsent = () => {
        if (understood.checked) {
            gate.acceptVisit({ understood: true });
            ctx.consent = true;
        }
        sourceInput.disabled = false;
        consent.hidden = true; // the single consent is asked at the first photo open
    };
    understood.addEventListener("change", updateConsent);
    sourceInput.addEventListener("change", async () => {
        const file = sourceInput.files?.[0];
        sourceInput.value = "";
        if (!file)
            return;
        if (!gate.hasVisit && (gate !== appConsent || !(await ensureConsent()))) {
            referenceStatus.textContent = "No photo opened.";
            return;
        }
        ctx.consent = gate.hasVisit;
        const version = ++request;
        run.disabled = true;
        clearReference.disabled = false;
        referenceStatus.textContent = "Opening the reference on this device. Nothing is uploaded.";
        reference = null;
        extracted = null;
        extractionList.replaceChildren();
        canvas.hidden = true;
        try {
            if (file.size > DEFAULT_LIMITS.maxBytes)
                throw new Error("Choose a reference photo no larger than 25 MB.");
            const bytes = new Uint8Array(await file.arrayBuffer());
            if (disposed || version !== request)
                return;
            const photo = await decodePhoto(bytes, deps.decoder ?? browserDecoder());
            if (disposed || version !== request || !gate.hasVisit)
                return;
            reference = { width: photo.width, height: photo.height, channels: 4, data: photo.data };
            area.forEach((field, index) => { field.value = index < 2 ? "0" : "100"; });
            referenceStatus.textContent = `${photo.width} × ${photo.height} reference ready. File metadata was discarded. Select the region you want; the app does not guess which object is a face or garment.`;
            run.disabled = false;
            drawReference();
        }
        catch (error) {
            if (!disposed && version === request) {
                clearReference.disabled = true;
                referenceStatus.textContent = errorText(error);
            }
        }
    });
    const discardReference = () => {
        request++;
        reference = null;
        extracted = null;
        sourceInput.value = "";
        canvas.hidden = true;
        canvas.width = canvas.height = 1;
        run.disabled = clearReference.disabled = true;
        extractionList.replaceChildren();
    };
    clearReference.addEventListener("click", () => { discardReference(); referenceStatus.textContent = "Reference pixels cleared from this page. Only colours you explicitly added remain in the draft."; });
    run.addEventListener("click", () => {
        if (!reference)
            return;
        try {
            extracted = extractPalette(reference, { colours: Number(count.value), region: selectedRegion() });
            drawExtraction();
            referenceStatus.textContent = `${extracted.label} ${extracted.sampled} visible samples; ${extracted.transparentSkipped} transparent samples skipped. Mean sampled colour difference ${extracted.meanDeltaE.toFixed(2)} ΔE00. Shares are approximate.`;
        }
        catch (error) {
            referenceStatus.textContent = errorText(error);
        }
    });
    const element = h("section", { class: "palette-screen", "data-features": "W1 W2" }, h("h1", {}, "Your colour palettes"), h("p", { class: "lede" }, "Mix your own colour references for eyes, blush and lips, or take colours from a dress, a sunset or a photo you choose."), h("p", { class: "source" }, "Local tools. Not tested against real products. No photo is uploaded or changed."), h("p", { class: "fine" }, SUITABILITY_LABEL), measured ? h("p", { class: "fine" }, `Depth warnings use your current-photo W6 reading (${measured[0].toFixed(1)} L*), held in this tab only.`)
        : h("p", { class: "fine" }, "No skin reading is available. Colour preferences work without one; depth warnings need a successful W6 reading. ", h("a", { href: "#/shade" }, "Open the shade finder")), status, h("section", { class: "palette-section" }, h("h2", {}, "Mix a colour"), h("p", { class: "fine" }, MIX_LABEL), h("div", { class: "palette-fields" }, h("label", {}, "First colour", first), h("label", {}, "Second colour", second), h("label", {}, "Second colour share", share, shareText)), mixPreview, h("div", { class: "palette-fields" }, h("label", {}, "New swatch name", swatchName), h("label", {}, "Use for", role)), h("div", { class: "row" }, h("button", { type: "button", class: "btn", onclick: () => add(mixed.hex, swatchName.value) }, "Add mix to palette"), more)), h("section", { class: "palette-section" }, h("h2", {}, "Extract a reference palette"), h("p", { class: "fine" }, "JPEG, PNG or WEBP, up to 25 MB and 24 megapixels. Choose your own region. Transparent pixels below half opacity are ignored; other pixels are weighted by opacity."), consent, sourceInput, canvas, referenceStatus, h("div", { class: "palette-fields" }, ...area.map((field, index) => h("label", {}, ["Left %", "Top %", "Width %", "Height %"][index], field)), h("label", {}, "Colours (1–8)", count)), h("div", { class: "row" }, run, clearReference), extractionList), h("section", { class: "palette-section" }, h("h2", {}, "Your draft"), h("label", { class: "field" }, "Palette name", title), draftList, h("div", { class: "row" }, save, exportDraft, h("button", { type: "button", class: "btn btn-quiet", onclick: () => saveDraft(true) }, "Save as new palette"), h("button", { type: "button", class: "btn btn-quiet", onclick: () => { draft = []; selectedId = undefined; title.value = "My palette"; drawDraft(); say("Empty draft started. Saved palettes remain below."); } }, "New empty draft"))), h("section", { class: "palette-section" }, h("h2", {}, "Saved palettes"), h("p", { class: "fine" }, "Only names, Eyes/Blush/Lips roles and six-digit colour codes are saved. Reference photos and skin readings are excluded."), savedList, h("label", { class: "field" }, "Import a colour file", importInput), h("button", { type: "button", class: "btn btn-quiet", onclick: () => { library.clear(); selectedId = undefined; drawSaved(); say(library.note); } }, "Clear all saved palettes")), h("p", { class: "fine" }, "These swatches are colour preferences. Applying them to a face or matching them to a real makeup range requires a separately supported tool; no product match is invented here."));
    updateConsent();
    showMix();
    drawDraft();
    drawSaved();
    return { element, dispose() { disposed = true; discardReference(); draft = []; } };
}
export function renderPalettes(main, ctx) {
    const screen = paletteScreen(ctx);
    main.replaceChildren(screen.element);
    return () => screen.dispose();
}
