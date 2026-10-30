/** The Retouch brushes panel in the Studio's Edit panel: pick a brush and what it does, set its
 * size, hardness, opacity and flow, snap it to a face part, show the painted mask, move the
 * photo with one finger, and clear a brush. Painting itself happens on the photo (painter.ts).
 * Author: John Khan.
 */
import { h } from "../../dom.js";
import { BRUSH_LABELS, BRUSH_MODES, BRUSH_NAMES, SIMULATION_BRUSHES, strokesOf } from "./layer.js";
import { MODE_NAMES } from "./session.js";
import { SNAP_NAMES } from "./snap.js";
import { BRUSHES, MAX_SIZE, MIN_SIZE } from "./stroke.js";
export const BRUSH_HINTS = Object.freeze({
    heal: "Tap or paint over a spot: it is filled from the skin around it. Only what you paint is healed.",
    smooth: "Paint over skin to soften it. Texture stays, and moles and freckles inside the stroke are held.",
    whiten: "Paint over teeth or eye whites. Only enamel-like, low-colour pixels lift, a few shades at most.",
    details: "Paint over eyes, lashes or brows to bring out their own detail. Nothing is added.",
    relight: "Burn deepens shading where you paint. Dodge lightens and is never the default.",
    blur: "Paint a soft focus over a background or a stray detail.",
    colour: "Paint a colour onto hair, lips or lids. Your own light and shade stay; nothing gets lighter.",
    reshape: "Push, bloat or pinch where you drag; Restore takes it back; Freeze protects an area. Moves are capped and eyes and teeth keep their shape.",
});
/** Size slider position 0..100 to a brush size share, on a log scale (fine control when small). */
export function sizeFromSlider(v) {
    return MIN_SIZE * (MAX_SIZE / MIN_SIZE) ** (Math.min(100, Math.max(0, v)) / 100);
}
export function sliderFromSize(size) {
    return Math.round(100 * Math.log(size / MIN_SIZE) / Math.log(MAX_SIZE / MIN_SIZE));
}
export function retouchScreen(session, hooks) {
    const s = session.settings;
    const set = (changes, redraw = false) => {
        try {
            session.set(changes);
        }
        catch (error) {
            hooks.status(error instanceof Error ? error.message : String(error));
        }
        if (redraw)
            hooks.changed();
    };
    const brushes = h("div", { class: "lg-brush-row", role: "group", "aria-label": "Brush" }, ...BRUSHES.map((b) => h("button", { type: "button", class: "shell-button lg-brush", "data-brush": b, "aria-pressed": String(b === s.brush),
        onclick: () => set({ brush: b }, true) }, BRUSH_NAMES[b])));
    const modes = h("div", { class: "lg-brush-row", role: "group", "aria-label": `${BRUSH_NAMES[s.brush]} does` }, ...BRUSH_MODES[s.brush].map((m) => h("button", { type: "button", class: "shell-button lg-brush-mode", "data-mode": m,
        "aria-pressed": String(m === s.mode), onclick: () => set({ mode: m }, true) }, m === "erase" && s.brush === "reshape" ? "Unfreeze" : MODE_NAMES[m])));
    const slider = (label, value, show, change) => {
        const out = h("output", { class: "shell-range-output" }, show(value));
        const input = h("input", { type: "range", min: "0", max: "100", step: "1", class: "shell-range", "aria-label": label });
        input.value = String(value);
        input.addEventListener("input", () => { out.textContent = show(Number(input.value)); change(Number(input.value)); });
        return h("label", { class: "shell-field" }, h("span", { class: "shell-field-name" }, label), h("div", { class: "shell-percent" }, input, out));
    };
    const px = (v) => `${Math.max(1, Math.round(sizeFromSlider(v) * hooks.photoSide()))} px`;
    const pct = (v) => `${Math.round(v)}%`;
    const snaps = session.snaps();
    const snap = h("select", { class: "shell-select", "aria-label": "Snap to" }, ...snaps.map((v) => h("option", { value: v }, SNAP_NAMES[v])));
    snap.value = s.snap;
    snap.addEventListener("change", () => set({ snap: snap.value }));
    const check = (label, checked, change) => {
        const input = h("input", { type: "checkbox" });
        input.checked = checked;
        input.addEventListener("change", () => change(input.checked));
        return h("label", { class: "shell-check" }, input, h("span", {}, label));
    };
    const target = session.target();
    const count = target ? strokesOf(target).length : 0;
    const parts = [
        h("p", { class: "shell-small" }, BRUSH_HINTS[s.brush]),
        brushes, modes,
        slider("Size", sliderFromSize(s.size), px, (v) => set({ size: sizeFromSlider(v) })),
        slider("Hardness", s.hardness * 100, pct, (v) => set({ hardness: v / 100 })),
        slider("Opacity", s.opacity * 100, pct, (v) => set({ opacity: v / 100 })),
        slider("Flow", s.flow * 100, pct, (v) => set({ flow: v / 100 })),
        h("label", { class: "shell-field" }, h("span", { class: "shell-field-name" }, "Snap to"), snap),
        snaps.length === 1 ? h("p", { class: "shell-hint" }, "Snapping to lips, eyes, skin or teeth needs face points on this photo; hair needs a marked hair area.") : null,
        s.brush === "colour" ? (() => {
            const colour = h("input", { type: "color", "aria-label": "Brush colour" });
            colour.value = s.colour;
            colour.addEventListener("change", () => set({ colour: colour.value.toUpperCase() }));
            return h("label", { class: "shell-field" }, h("span", { class: "shell-field-name" }, "Colour"), colour);
        })() : null,
        check(s.brush === "reshape" ? "Show frozen area" : "Show mask", s.showMask, (v) => set({ showMask: v }, true)),
        check("One finger moves the photo", s.move, (v) => set({ move: v })),
        h("div", { class: "lg-brush-row" }, h("button", { type: "button", class: "shell-button", disabled: count === 0, onclick: () => {
                try {
                    session.clear();
                    hooks.status(`${BRUSH_NAMES[s.brush]} strokes cleared. Undo brings them back.`);
                }
                catch (error) {
                    hooks.status(error instanceof Error ? error.message : String(error));
                }
                hooks.changed();
            } }, `Clear ${BRUSH_NAMES[s.brush]}`)),
        h("p", { class: "shell-small", "aria-live": "polite" }, count ? `${count} ${BRUSH_NAMES[s.brush]} stroke${count === 1 ? "" : "s"} on this layer. Each one is a step in History.` : "Paint on the photo. Two fingers move and zoom; Hold for before shows the original."),
        h("p", { class: "shell-hint" }, SIMULATION_BRUSHES.has(s.brush) ? BRUSH_LABELS[s.brush] : `${BRUSH_LABELS[s.brush]} Not a simulation of a change to you.`),
    ];
    return h("section", { class: "lg-retouch", "aria-label": "Retouch brushes" }, ...parts);
}
//# sourceMappingURL=screen.js.map