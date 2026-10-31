/** The Create document: the layers placed on the photo (text, stickers, drawing), its frame and,
 * for a collage or a story, the board under them. It lives in the Studio's own undo history
 * (StudioState.create), so every change is one history step and Undo, Redo and the History panel
 * cover it like any other edit. It holds settings only: words, positions, colours, stroke points
 * and the ids of pictures kept in memory (assets.ts), never pixels.
 * Every change returns a new document; nothing here mutates one, so history steps can share the
 * layers they did not change.
 * Author: John Khan.
 */
import { checkTransform } from "./geometry.js";
import { ALIGNS, FONTS, TEXT_STYLES, MAX_SIZE, MIN_SIZE, checkText } from "./text.js";
import { MAX_STROKES, checkStroke } from "./ink.js";
import { checkStickerSource, drawnSticker } from "./stickers.js";
import { checkFrame } from "./frames.js";
import { checkBoard } from "./board.js";
export const MAX_CREATE_LAYERS = 40;
const HEX = /^#[0-9A-F]{6}$/;
export const EMPTY = Object.freeze({ layers: Object.freeze([]), frame: null, board: null });
export function isEmpty(doc) {
    return !doc || (!doc.layers.some((l) => !l.hidden) && !doc.frame && !doc.board);
}
export function checkColour(c, what = "colour") {
    if (typeof c !== "string" || !HEX.test(c))
        throw new RangeError(`A ${what} is #RRGGBB`);
}
export function checkLayer(l) {
    if (!/^c[0-9]{1,6}$/.test(l.id))
        throw new RangeError("A Create layer id is c<number>");
    if (!(l.opacity >= 0 && l.opacity <= 1))
        throw new RangeError("Opacity must be 0 to 1");
    if (typeof l.hidden !== "boolean")
        throw new RangeError("Hidden must be true or false");
    if (l.template !== undefined && !/^[a-z-]{1,24}$/.test(l.template))
        throw new RangeError("Unknown template mark");
    if (l.type === "text") {
        checkText(l.text);
        if (!(l.font in FONTS) || !(l.style in TEXT_STYLES) || !ALIGNS.includes(l.align))
            throw new RangeError("Unknown font, style or alignment");
        if (!(l.size >= MIN_SIZE && l.size <= MAX_SIZE))
            throw new RangeError("Text size is out of range");
        if (!(l.boxWidth >= 40 && l.boxWidth <= 2000))
            throw new RangeError("Text box width is out of range");
        checkColour(l.colour);
        checkColour(l.accent, "style colour");
        checkTransform(l.transform);
    }
    else if (l.type === "sticker") {
        checkStickerSource(l.source);
        if (!(l.width >= 10 && l.width <= 2000))
            throw new RangeError("Sticker size is out of range");
        checkTransform(l.transform);
    }
    else if (l.type === "ink") {
        if (l.strokes.length > MAX_STROKES)
            throw new RangeError(`A drawing holds up to ${MAX_STROKES} strokes`);
        l.strokes.forEach(checkStroke);
    }
    else
        throw new RangeError("Unknown Create layer");
}
export function checkDoc(doc) {
    if (!doc || !Array.isArray(doc.layers))
        throw new RangeError("Create document is malformed");
    if (doc.layers.length > MAX_CREATE_LAYERS)
        throw new RangeError(`Up to ${MAX_CREATE_LAYERS} Create layers`);
    const ids = new Set();
    for (const l of doc.layers) {
        if (ids.has(l.id))
            throw new RangeError("A Create layer id is duplicated");
        ids.add(l.id);
        checkLayer(l);
    }
    if (doc.frame)
        checkFrame(doc.frame);
    if (doc.board)
        checkBoard(doc.board);
}
/** The next free layer id in this document. */
export function nextId(doc) {
    let n = 0;
    for (const l of doc.layers)
        n = Math.max(n, Number(l.id.slice(1)));
    return `c${n + 1}`;
}
export function find(doc, id) {
    const l = doc.layers.find((x) => x.id === id);
    if (!l)
        throw new RangeError("That layer isn't here any more");
    return l;
}
export function addLayer(doc, layer) {
    const next = { ...doc, layers: [...doc.layers, layer] };
    checkDoc(next);
    return next;
}
/** Change one layer's fields (its id and type stay). */
export function editLayer(doc, id, changes) {
    find(doc, id);
    const next = { ...doc, layers: doc.layers.map((l) => l.id === id ? { ...l, ...changes } : l) };
    checkDoc(next);
    return next;
}
export function removeLayer(doc, id) {
    find(doc, id);
    return { ...doc, layers: doc.layers.filter((l) => l.id !== id) };
}
/** Move a layer up (+1, drawn later) or down (-1) the order; to "top" or "bottom". */
export function reorder(doc, id, by) {
    const i = doc.layers.findIndex((l) => l.id === id);
    if (i < 0)
        throw new RangeError("That layer isn't here any more");
    const layers = [...doc.layers];
    const [item] = layers.splice(i, 1);
    const to = by === "top" ? layers.length : by === "bottom" ? 0 : Math.max(0, Math.min(layers.length, i + by));
    layers.splice(to, 0, item);
    return { ...doc, layers };
}
export function setFrame(doc, frame) {
    const next = { ...doc, frame };
    checkDoc(next);
    return next;
}
export function setBoard(doc, board) {
    const next = { ...doc, board };
    checkDoc(next);
    return next;
}
/** A short plain description of a layer for the layer list and the History panel. */
export function describe(l) {
    if (l.type === "text") {
        const t = l.text.replace(/\s+/g, " ").trim();
        return `Text "${t.length > 18 ? t.slice(0, 17) + "…" : t || " "}"`;
    }
    // The sticker's own name ("Speech bubble"): it already sits under Stickers, so no "Sticker" prefix.
    if (l.type === "sticker") {
        if (l.source.kind === "cutout")
            return "Cut-out of your photo";
        const drawn = l.source.kind === "drawn" ? drawnSticker(l.source.pack, l.source.name) : null;
        const name = drawn?.label ?? l.source.name.replace(/-/g, " ");
        return name.charAt(0).toUpperCase() + name.slice(1);
    }
    return `Drawing (${l.strokes.length} stroke${l.strokes.length === 1 ? "" : "s"})`;
}
export function isColour(c) { return HEX.test(c); }
