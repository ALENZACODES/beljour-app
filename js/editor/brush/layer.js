/** Retouch brushes as one Studio layer kind ("retouch"): one layer per brush, its strokes kept
 * as text in the layer's settings (stroke.ts), so each stroke is one step in the Studio history,
 * the layer stack orders it like any other edit, and the same strokes render the preview, the
 * compare frames, the worker's renders and the saved photo at whatever size they are drawn.
 * The layer strength scales the brush's effect; 0 is no change. Author: John Khan.
 */
import { floatImage } from "../../engines/core/buffer.js";
import { NOT_MEDICAL } from "../../engines/skin/local-zones.js";
import { blurPainted, colourPainted, details, fallbackIod, heal, mixWeighted, relightPainted, rgbImage, smooth, whitenPainted } from "./effects.js";
import { buildMask, radiusPx, strokeCoverage } from "./mask.js";
import { reshape } from "./reshape.js";
import { eyeDistance, snapPlanes } from "./snap.js";
import { BRUSHES, decodeStrokes } from "./stroke.js";
export const BRUSH_NAMES = Object.freeze({
    heal: "Heal", smooth: "Smooth", whiten: "Whiten", details: "Details", relight: "Relight", blur: "Blur", colour: "Colour", reshape: "Reshape",
});
export const BRUSH_LABELS = Object.freeze({
    heal: `Spot healing simulation where you painted, filled from the skin around it. Marks you didn't paint are kept. ${NOT_MEDICAL}`,
    smooth: `Skin smoothing simulation where you painted: texture kept, moles and freckles held. ${NOT_MEDICAL}`,
    whiten: "Teeth and eye-white colour simulation where you painted, with a natural cap. Not dental treatment.",
    details: "Photo edit: local detail where you painted. No detail is invented.",
    relight: "Lighting simulation where you painted: burn deepens shading; dodge lightens, only when you choose it.",
    blur: "Photo edit: soft focus where you painted.",
    colour: "Colour simulation where you painted: hue changed, your own lightness kept, never lighter.",
    reshape: "Face shape simulation where you pushed: moves are capped and eyes and teeth keep their shape. Not a prediction.",
});
/** Brushes that change how her face looks carry the simulation label (blur and details are photo edits). */
export const SIMULATION_BRUSHES = new Set(["heal", "smooth", "whiten", "relight", "colour", "reshape"]);
/** Starting strength of a new brush layer. A painted heal or push is already her explicit choice
 * of where, so they start full and the slider softens them; the looks brushes start gentle. ASSUMED. */
export const START_STRENGTH = Object.freeze({
    heal: 100, smooth: 30, whiten: 30, details: 30, relight: 30, blur: 30, colour: 30, reshape: 100,
});
/** The stroke modes each brush accepts (the eraser everywhere). */
export const BRUSH_MODES = Object.freeze({
    heal: ["paint", "erase"], smooth: ["paint", "erase"], whiten: ["paint", "erase"], details: ["paint", "erase"],
    relight: ["burn", "dodge", "erase"], blur: ["paint", "erase"], colour: ["paint", "erase"],
    reshape: ["push", "bloat", "pinch", "restore", "freeze", "erase"],
});
export const DEFAULT_COLOUR = "#7A3B2E";
export function retouchDefaults(brush = "heal") {
    return brush === "colour" ? { brush, strokes: "", colour: DEFAULT_COLOUR } : { brush, strokes: "" };
}
export function brushOf(layer) {
    const value = layer.parameters.brush;
    if (typeof value !== "string" || !BRUSHES.includes(value))
        throw new RangeError("Unknown retouch brush");
    return value;
}
export function strokesOf(layer) {
    const value = layer.parameters.strokes;
    return decodeStrokes(typeof value === "string" ? value : "");
}
export function isSimulationBrush(params) {
    return typeof params.brush === "string" && SIMULATION_BRUSHES.has(params.brush);
}
/** Heal strokes run in order, each filling its own spot from the picture the strokes before it
 * left (as healing by hand does); an erase stroke brings back the picture from below the layer.
 * Strength then mixes the healed picture over the one below. */
export function healStrokes(img, strokes, amount, snaps = {}) {
    const { width, height } = img;
    const base = rgbImage(img);
    if (amount === 0)
        return base;
    let current = base;
    for (const stroke of strokes) {
        const snap = stroke.snap === "none" ? null : snaps[stroke.snap] ?? new Float32Array(width * height);
        const cover = floatImage(width, height, 1);
        cover.data.set(strokeCoverage(stroke, width, height, snap));
        current = stroke.mode === "erase" ? mixWeighted(current, base.data, cover.data) : heal(current, cover, radiusPx(stroke, width, height));
    }
    if (amount === 1)
        return current;
    const weight = new Float32Array(width * height);
    for (let i = 0; i < weight.length; i++) {
        const d = current.data[i * 3] !== base.data[i * 3] || current.data[i * 3 + 1] !== base.data[i * 3 + 1] || current.data[i * 3 + 2] !== base.data[i * 3 + 2];
        weight[i] = d ? amount : 0;
    }
    return mixWeighted(base, current.data, weight);
}
/** The brush layer's picture on `img` (the stack below it). */
export function renderBrush(img, source, brush, strokes, amount, params = {}) {
    const { width, height } = img;
    const face = source.face?.length === 478 ? source.face : undefined;
    const ctx = { iod: face ? eyeDistance(face) : fallbackIod(width, height) };
    const allowed = BRUSH_MODES[brush];
    for (const s of strokes)
        if (!allowed.includes(s.mode))
            throw new RangeError(`${BRUSH_NAMES[brush]} has no ${s.mode} stroke`);
    const metrics = { brush, strokes: strokes.length, face_points: Boolean(face) };
    if (brush === "reshape") {
        const result = reshape(img, strokes, { amount, face, fallbackIod: fallbackIod(width, height) });
        return { image: result.image, metrics: { ...metrics, ...result.metrics } };
    }
    const snaps = snapPlanes({ width, height, face, hair: source.hair }, strokes);
    if (brush === "relight") {
        const dodge = buildMask(strokes, width, height, ["dodge"], snaps), burn = buildMask(strokes, width, height, ["burn"], snaps);
        return { image: relightPainted(img, dodge, burn, amount), metrics };
    }
    if (brush === "heal")
        return { image: healStrokes(img, strokes, amount, snaps), metrics };
    const mask = buildMask(strokes, width, height, ["paint"], snaps);
    let image;
    if (brush === "smooth")
        image = smooth(img, mask, amount, ctx);
    else if (brush === "whiten")
        image = whitenPainted(img, mask, amount);
    else if (brush === "details")
        image = details(img, mask, amount);
    else if (brush === "blur")
        image = blurPainted(img, mask, amount);
    else
        image = colourPainted(img, mask, amount, typeof params.colour === "string" ? params.colour : DEFAULT_COLOUR);
    return { image, metrics };
}
export function applyRetouchLayer(img, source, layer) {
    if (layer.kind !== "retouch")
        return null;
    const brush = brushOf(layer);
    const result = renderBrush(img, source, brush, strokesOf(layer), layer.strength / 100, layer.parameters);
    return { image: result.image, label: BRUSH_LABELS[brush], metrics: result.metrics };
}
/** Whether a full-size save can render this brush layer on the full-size pixels themselves: its
 * strokes are in shares of the photo, so the same strokes make the same picture at more pixels.
 * Reshape moves pixels and goes the moved-layer way; a stroke snapped to a marked hair area (kept
 * at the preview size only) is carried instead. */
export function rendersAtFullSize(layer) {
    if (layer.kind !== "retouch")
        return false;
    return brushOf(layer) !== "reshape" && !strokesOf(layer).some((s) => s.snap === "hair");
}
/** Whether a brush layer moves pixels (the full-size save treats it as a moving layer). */
export function movesPixels(layer) {
    return layer.kind === "retouch" && brushOf(layer) === "reshape";
}
