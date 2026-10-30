/** The Create panel's six tool tabs: Text, Draw, Stickers, Frames, Collage and Story. Each builds
 * its controls from the current document; a control previews while it moves and makes one
 * history step when it is let go. Author: John Khan.
 */
import { h } from "../../dom.js";
import { PALETTE } from "../../ui/palette.js";
import { readLocalImage } from "../../ui/shell/demo.js";
import { photoPicker } from "../../photos/picker.js";
import { chooseCutout, cutSticker } from "../../save/sticker.js";
import { devicePersonMask } from "../../screens/stickers.js";
import { addLayer, describe, editLayer, nextId, reorder, setBoard, setFrame } from "./doc.js";
import { identity } from "./geometry.js";
import { ALIGNS, FONTS, FONT_IDS, MAX_SIZE, MIN_SIZE, TEXT_STYLES, TEXT_STYLE_IDS } from "./text.js";
import { BRUSHES, BRUSH_IDS, MAX_WIDTH, MIN_WIDTH } from "./ink.js";
import { library } from "./stickers.js";
import { DEFAULT_FRAME, FRAMES, FRAME_IDS, MAX_RADIUS, MAX_THICKNESS } from "./frames.js";
import { ASPECT_IDS, MAX_ZOOM } from "./board.js";
import { LAYOUTS, layoutsFor, newCollage, relayout } from "./collage.js";
import { STORIES, story, storyBoard, storyTexts } from "./story.js";
import { pictureOf } from "./assets.js";
import { drawnSticker } from "./stickers.js";
import { btn, choices, section, slider, swatches } from "./kit.js";
export const CREATE_TABS = [
    { id: "text", label: "Text" }, { id: "draw", label: "Draw" }, { id: "stickers", label: "Stickers" },
    { id: "frames", label: "Frames" }, { id: "collage", label: "Collage" }, { id: "story", label: "Story" },
];
export const CREATE_TAB_IDS = CREATE_TABS.map((t) => t.id);
/** The look the next text layer starts with; changing a selected layer updates it too. */
const nextText = { font: "fraunces", style: "marais", align: "center", size: 64, colour: PALETTE.cream, accent: PALETTE.plum };
export function tabControls(p) {
    try {
        if (p.tab === "text")
            return textTab(p);
        if (p.tab === "draw")
            return drawTab(p);
        if (p.tab === "stickers")
            return stickerTab(p);
        if (p.tab === "frames")
            return frameTab(p);
        return boardTab(p, p.tab);
    }
    catch (error) {
        return [h("p", { class: "fine" }, error instanceof Error ? error.message : String(error))];
    }
}
/** Opacity of the selected layer. */
function opacity(p, l) {
    const set = (v) => editLayer(p.editor.create, l.id, { opacity: v / 100 });
    return slider("Opacity", Math.round(l.opacity * 100), 0, 100, 1, (v) => p.preview(set(v)), (v) => p.commit(`${describe(l)}: opacity ${v}%`, set(v)), (v) => `${Math.round(v)}%`);
}
function order(p, l) {
    return h("div", { class: "cr-row" }, btn("Bring to front", () => p.commit(`${describe(l)}: to the front`, reorder(p.editor.create, l.id, "top"))), btn("Send to back", () => p.commit(`${describe(l)}: to the back`, reorder(p.editor.create, l.id, "bottom"))));
}
// ---- Text ----------------------------------------------------------------------------------------
function textTab(p) {
    const sel = p.layer?.type === "text" ? p.layer : null;
    const words = h("textarea", { rows: "3", maxLength: 280, class: "cr-text", "aria-label": sel ? "Edit the selected text" : "Words to add" });
    words.value = sel ? sel.text : "";
    words.placeholder = "Your words";
    const change = (fields, label) => {
        Object.assign(nextText, Object.fromEntries(Object.entries(fields).filter(([k]) => k in nextText)));
        if (sel)
            p.commit(`${describe(sel)}: ${label}`, editLayer(p.editor.create, sel.id, fields));
        else
            p.refresh();
    };
    if (sel) {
        words.addEventListener("input", () => { try {
            p.preview(editLayer(p.editor.create, sel.id, { text: words.value }));
        }
        catch { /* too long: the limit stops it */ } });
        words.addEventListener("change", () => p.commit("Text: words changed", editLayer(p.editor.create, sel.id, { text: words.value })));
    }
    const add = () => {
        const doc = p.editor.create, u = p.pageUnits;
        const layer = { type: "text", id: nextId(doc), hidden: false, opacity: 1, text: words.value.trim() || "Your words",
            font: nextText.font, size: nextText.size, style: nextText.style, align: nextText.align, colour: nextText.colour, accent: nextText.accent,
            boxWidth: 760, transform: identity(u.width / 2, u.height / 2) };
        p.selected = layer.id;
        p.commit("Text: added", addLayer(doc, layer));
    };
    const look = sel ?? nextText;
    const out = [
        section(sel ? "Selected text" : "New text", words, h("div", { class: "cr-row" }, btn(sel ? "Add another text" : "Add text", add, { cls: "cr-btn btn-primary" }), sel ? btn("Done", () => p.select(null)) : null), h("p", { class: "fine" }, sel ? "Drag it on the page; the round handle resizes and turns it." : "Text is added in the middle of the page. Tap any text on the page to edit it.")),
        section("Look", choices("Font", FONT_IDS.map((id) => ({ id, label: FONTS[id].label })), look.font, (font) => change({ font }, `font ${FONTS[font].label}`)), choices("Style", TEXT_STYLE_IDS.map((id) => ({ id, label: TEXT_STYLES[id].label, title: TEXT_STYLES[id].does })), look.style, (style) => change({ style }, `style ${TEXT_STYLES[style].label}`)), choices("Alignment", ALIGNS.map((id) => ({ id, label: id === "center" ? "Centre" : id[0].toUpperCase() + id.slice(1) })), look.align, (align) => change({ align }, `aligned ${align}`)), swatches("Text colour", look.colour, (colour) => change({ colour }, "colour"), () => p.startEyedrop((colour) => change({ colour }, "colour from the picture"))), swatches("Style colour", look.accent, (accent) => change({ accent }, "style colour"), () => p.startEyedrop((accent) => change({ accent }, "style colour from the picture")))),
    ];
    if (sel) {
        const set = (k, v) => editLayer(p.editor.create, sel.id, { [k]: v });
        out.push(section("Size and order", slider("Letter size", sel.size, MIN_SIZE, MAX_SIZE, 1, (v) => p.preview(set("size", v)), (v) => { nextText.size = v; p.commit(`${describe(sel)}: letter size`, set("size", v)); }), slider("Line width", sel.boxWidth, 120, 1000, 10, (v) => p.preview(set("boxWidth", v)), (v) => p.commit(`${describe(sel)}: line width`, set("boxWidth", v))), opacity(p, sel), order(p, sel)));
    }
    return out;
}
// ---- Draw ----------------------------------------------------------------------------------------
function drawTab(p) {
    const ink = p.layer?.type === "ink" ? p.layer : null;
    const out = [section("Brush", choices("Brush", BRUSH_IDS.map((id) => ({ id, label: BRUSHES[id].label })), p.brush, (id) => { p.brush = id; p.inkSize = BRUSHES[id].width; p.refresh(); }), slider("Brush size", p.inkSize, MIN_WIDTH, MAX_WIDTH, 1, () => undefined, (v) => { p.inkSize = v; p.refresh(); }), p.brush === "eraser" ? h("p", { class: "fine" }, "The eraser takes away ink only; your photo underneath is never touched.")
            : swatches("Ink colour", p.inkColour, (c) => { p.inkColour = c; p.refresh(); }, () => p.startEyedrop((c) => { p.inkColour = c; p.refresh(); })), h("p", { class: "fine" }, "Draw on the page with a finger or the mouse. Each stroke is one step: Undo takes back the last stroke."), h("div", { class: "cr-row" }, btn("Undo stroke", () => { p.editor.undo(); p.deps.onChange?.(); }), btn("New drawing layer", () => {
            const doc = p.editor.create, layer = { type: "ink", id: nextId(doc), hidden: false, opacity: 1, strokes: [] };
            p.selected = layer.id;
            p.commit("Draw: new drawing layer", addLayer(doc, layer));
        })))];
    if (ink)
        out.push(section(`Selected: ${describe(ink)}`, opacity(p, ink), order(p, ink)));
    return out;
}
// ---- Stickers ------------------------------------------------------------------------------------
function thumb(source, url) {
    if (url)
        return h("img", { src: url, alt: "", width: "48", height: "48", loading: "lazy", class: "cr-thumb" });
    const c = h("canvas", { width: "48", height: "48", class: "cr-thumb", "aria-hidden": "true" });
    const ctx = c.getContext?.("2d");
    const d = source.kind === "drawn" ? drawnSticker(source.pack, source.name) : null;
    if (ctx && d) {
        ctx.translate(24, 24);
        const k = 40 / Math.max(1, d.aspect);
        ctx.scale(k, k);
        d.draw(ctx);
    }
    return c;
}
function placeSticker(p, source, label) {
    const doc = p.editor.create, u = p.pageUnits;
    const layer = { type: "sticker", id: nextId(doc), hidden: false, opacity: 1, source, width: 260, transform: identity(u.width / 2, u.height / 2) };
    p.selected = layer.id;
    p.commit(`Sticker: ${label} added`, addLayer(doc, layer));
}
export async function cutoutSticker(p, personMask = devicePersonMask) {
    try {
        const shot = p.editor.rendered();
        const cut = chooseCutout(shot.image, { person: await personMask(shot.image).catch(() => null), marked: p.editor.source.person ?? null, face: shot.face });
        const frame = cutSticker(shot.image, cut);
        const asset = p.assets.addCutout(pictureOf(frame, p.element.ownerDocument ?? document));
        placeSticker(p, { kind: "cutout", asset, name: "photo" }, "your photo");
        p.say(cut.note);
    }
    catch (error) {
        p.say(error instanceof Error ? error.message : String(error));
    }
}
function stickerTab(p) {
    const sel = p.layer?.type === "sticker" ? p.layer : null;
    const out = [];
    if (sel) {
        const set = (v) => editLayer(p.editor.create, sel.id, { width: v });
        out.push(section(`Selected: ${describe(sel)}`, h("div", { class: "cr-row" }, btn("Flip", () => p.commit(`${describe(sel)}: flipped`, editLayer(p.editor.create, sel.id, { transform: { ...sel.transform, flip: !sel.transform.flip } }))), btn("Done", () => p.select(null))), slider("Size", sel.width, 40, 900, 5, (v) => p.preview(set(v)), (v) => p.commit(`${describe(sel)}: size`, set(v))), opacity(p, sel), order(p, sel)));
    }
    out.push(section("From your photo", btn("Your photo as a sticker", () => { void cutoutSticker(p, p.deps.personMask); }, { cls: "cr-btn btn-primary" }), h("p", { class: "fine" }, "Cut out along a real outline on this device: the person found by the on-device model, the area you marked, or your face outline.")));
    for (const pack of library()) {
        const grid = h("div", { class: "cr-sticker-grid", role: "group", "aria-label": pack.label });
        for (const item of pack.items) {
            const b = btn("", () => placeSticker(p, item.source, item.label), { cls: "cr-sticker", title: `Add ${item.label}` });
            b.setAttribute("aria-label", `Add sticker: ${item.label}`);
            b.append(thumb(item.source, item.url));
            grid.append(b);
        }
        out.push(section(pack.label, grid));
    }
    return out;
}
// ---- Frames --------------------------------------------------------------------------------------
function frameTab(p) {
    const f = p.doc.frame;
    // a colour she picked goes with her to another frame; a frame's own default colour doesn't
    const picked = f && f.colour !== DEFAULT_FRAME[f.kind].colour ? f.colour : null;
    const kinds = [{ id: "none", label: "None", title: "No frame" }, ...FRAME_IDS.map((id) => ({ id, label: FRAMES[id].label, title: FRAMES[id].does }))];
    const out = [section("Frame", choices("Frame", kinds, f?.kind ?? "none", (id) => p.commit(id === "none" ? "Frame removed" : `Frame: ${FRAMES[id].label}`, setFrame(p.editor.create, id === "none" ? null : { ...DEFAULT_FRAME[id], colour: picked ?? DEFAULT_FRAME[id].colour }))), h("p", { class: "fine" }, p.doc.board ? "On a collage or story the frame sits inside the page." : "The border grows the page round your photo, so none of the photo is cut."))];
    if (f) {
        const set = (k, v) => setFrame(p.editor.create, { ...f, [k]: v });
        out.push(section("Frame settings", swatches("Frame colour", f.colour, (colour) => p.commit("Frame: colour", setFrame(p.editor.create, { ...f, colour })), () => p.startEyedrop((colour) => p.commit("Frame: colour from the picture", setFrame(p.editor.create, { ...f, colour })))), f.kind === "luxembourg" ? null : slider(f.kind === "giverny" ? "Fade width" : "Thickness", f.thickness, 0, MAX_THICKNESS, 5, (v) => p.preview(set("thickness", v)), (v) => p.commit("Frame: thickness", set("thickness", v))), f.kind === "cannes" || f.kind === "giverny" ? null : slider("Corner rounding", f.radius, 0, MAX_RADIUS, 5, (v) => p.preview(set("radius", v)), (v) => p.commit("Frame: corner rounding", set("radius", v)))));
    }
    return out;
}
// ---- Collage and Story ---------------------------------------------------------------------------
function photoInput(p, after) {
    // The shared "Add photos" control: her phone's photo library (multi-select) or camera, plus My photos.
    const picker = photoPicker({ id: `cr-file-${++photoInputs}`, say: (text) => p.say(text), onPhotos: async (files) => {
            const ids = [];
            for (const file of files) {
                try {
                    ids.push(p.assets.addFile(pictureOf(await readLocalImage(file, 2048), p.element.ownerDocument ?? document)));
                }
                catch (error) {
                    p.say(error instanceof Error ? error.message : String(error));
                    break;
                }
            }
            if (ids.length) {
                p.say(`${ids.length} photo${ids.length === 1 ? "" : "s"} added. Nothing is uploaded.`);
                after(ids);
            }
        } });
    picker.input.className += " cr-file"; // scripts/create_check.mjs finds the input by this class
    return h("div", { class: "cr-field cr-file-field" }, h("span", { class: "cr-name" }, "Your photos"), picker.element);
}
let photoInputs = 0;
/** Put new photos into the empty cells, in order. */
function fill(board, ids) {
    const queue = [...ids];
    return { ...board, cells: board.cells.map((c) => (c.asset === null && queue.length ? { ...c, asset: queue.shift(), zoom: 1, panX: 0, panY: 0 } : c)) };
}
function cellControls(p, board) {
    const i = p.cell;
    if (i === null || !board.cells[i])
        return h("p", { class: "fine" }, "Tap a photo on the page to choose it, zoom it or slide it in its cell.");
    const c = board.cells[i];
    const options = [{ v: "edited", t: "Your Studio photo (with its edits)" }, { v: "original", t: "Your Studio photo, unedited" },
        ...p.assets.fileIds.map((id, n) => ({ v: id, t: `Added photo ${n + 1}` })), { v: "", t: "Empty" }];
    const pick = h("select", { class: "cr-select", "aria-label": `Photo in cell ${i + 1}` });
    for (const o of options) {
        const opt = h("option", { value: o.v }, o.t);
        pick.append(opt);
    }
    pick.value = c.asset ?? "";
    pick.addEventListener("change", () => p.commit(`Cell ${i + 1}: photo changed`, p.cellChanged(i, { asset: pick.value || null, zoom: 1, panX: 0, panY: 0 })));
    return section(`Cell ${i + 1}`, h("label", { class: "cr-field" }, h("span", { class: "cr-name" }, "Photo"), pick), slider("Zoom", c.zoom, 1, MAX_ZOOM, 0.05, (v) => p.preview(p.cellChanged(i, { zoom: v })), (v) => p.commit(`Cell ${i + 1}: zoom`, p.cellChanged(i, { zoom: v })), (v) => `${v.toFixed(2)}x`), h("div", { class: "cr-row" }, btn("Centre the photo", () => p.commit(`Cell ${i + 1}: centred`, p.cellChanged(i, { panX: 0, panY: 0, zoom: 1, dx: 0, dy: 0 }))), btn("Done", () => { p.cell = null; p.refresh(); })), h("p", { class: "fine" }, board.layout.startsWith("free-") ? "Drag a print on the page to move it." : "Drag the photo on the page to slide it inside its cell; scroll to zoom."));
}
/** Make a story board from one template, its words as ordinary text layers (one history step).
 * Used by the Story tab and by studio.html#story=<id> (Home's today's pick). */
export function applyStory(p, id) {
    const doc = p.editor.create, kept = doc.layers.filter((l) => !l.template);
    const base = { ...doc, layers: kept, board: fill(storyBoard(id), p.assets.fileIds) };
    const first = Number(nextId(base).slice(1));
    p.cell = null;
    p.selected = null;
    p.commit(`Story: ${story(id).label}`, { ...base, layers: [...kept, ...storyTexts(id, first)] });
}
function boardTab(p, kind) {
    const board = p.doc.board?.kind === kind ? p.doc.board : null;
    const files = () => p.assets.fileIds;
    const leave = p.doc.board ? btn("Back to the single photo", () => { p.cell = null; p.commit(`${p.doc.board.kind === "story" ? "Story" : "Collage"} closed`, setBoard(p.editor.create, null)); }) : null;
    const add = photoInput(p, (ids) => { const b = p.editor.create.board; if (b)
        p.commit("Photos added", setBoard(p.editor.create, fill(b, ids)));
    else
        p.refresh(); });
    if (kind === "story") {
        const apply = (id) => applyStory(p, id);
        const out = [section("Story templates (9:16)", choices("Template", STORIES.map((s) => ({ id: s.id, label: s.label, title: s.does })), board?.layout ?? null, apply), h("p", { class: "fine" }, board ? story(board.layout).does + ". Tap any words on the page to edit them in Text." : "Pick a template. Its words become text layers you can edit, move or delete."), add, leave)];
        if (board) {
            out.push(section("Background", swatches("Background", board.background, (bg) => p.commit("Story: background", setBoard(p.editor.create, { ...board, background: bg })))));
            const cells = cellControls(p, board);
            if (cells)
                out.push(cells);
        }
        return out;
    }
    const count = board?.cells.length ?? 0;
    const make = (n) => {
        const doc = p.editor.create;
        const b = board ? fill(relayout(board, layoutsFor(n)[0].id), files().filter((f) => !board.cells.some((c) => c.asset === f))) : newCollage(n, ["edited", ...files()]);
        p.cell = null;
        p.commit(`Collage: ${n} photos`, setBoard(doc, b));
    };
    const out = [section("Collage", choices("Photos", [2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({ id: String(n), label: String(n) })), count ? String(count) : null, (n) => make(Number(n))), h("p", { class: "fine" }, board ? `${count} photos. Your Studio photo is first; add more from this device.` : "Choose how many photos. The first is your Studio photo with its edits."), add, leave)];
    if (board) {
        const set = (k, v) => setBoard(p.editor.create, { ...board, [k]: v });
        out.push(section("Layout", choices("Layout", LAYOUTS.filter((l) => l.count === count).map((l) => ({ id: l.id, label: l.label })), board.layout, (id) => p.commit(`Collage: ${LAYOUTS.find((l) => l.id === id).label}`, setBoard(p.editor.create, relayout(board, id)))), choices("Shape", ASPECT_IDS.map((id) => ({ id, label: id })), board.aspect, (aspect) => p.commit(`Collage: shape ${aspect}`, setBoard(p.editor.create, { ...board, aspect }))), slider("Spacing", board.spacing, 0, 120, 2, (v) => p.preview(set("spacing", v)), (v) => p.commit("Collage: spacing", set("spacing", v))), board.layout.startsWith("free-") ? null : slider("Corner radius", board.radius, 0, 300, 2, (v) => p.preview(set("radius", v)), (v) => p.commit("Collage: corner radius", set("radius", v))), swatches("Background", board.background, (bg) => p.commit("Collage: background", setBoard(p.editor.create, { ...board, background: bg })), () => p.startEyedrop((bg) => p.commit("Collage: background from the picture", setBoard(p.editor.create, { ...board, background: bg }))))));
        const cells = cellControls(p, board);
        if (cells)
            out.push(cells);
    }
    return out;
}
//# sourceMappingURL=tabs.js.map