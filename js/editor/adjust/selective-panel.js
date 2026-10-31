/** The Selective adjust panel: a picture of her photo to tap or paint on, the area's size and
 * softness, and exposure, contrast, saturation and warmth for that area only.
 * Each area is its own layer (Add area makes another); the tinted overlay shows where it acts.
 * Keyboard: the picture is focusable; arrow keys move the point (Shift for bigger steps).
 * Author: John Khan.
 */
import { h } from "../../dom.js";
import { resize } from "../../engines/core/buffer.js";
import { PHOTO_MARK } from "../../ui/palette.js";
import { candidate, canvasPoint, choiceRow, commit, frameScheduler, paintPicture, rememberFocus, signed, sliderRow, workingImage } from "./kit.js";
import { SELECTIVE_SLIDERS, addStroke, areaMask, encodeDabs, readArea, readSelective, DAB_KEYS } from "./selective.js";
import { orderNote } from "./panel.js";
import { SELECTIVE_START } from "./options.js";
import { capturePointer } from "../../ui/shell/pointer-capture.js";
const PAD = 360;
const state = { showMask: true };
function areas(host) { return host.editor.document.layers.filter((l) => l.kind === "selective"); }
function current(host) {
    const s = host.editor.selected;
    return s?.kind === "selective" ? s : areas(host).at(-1);
}
export function selectiveScreen(host) {
    const { editor } = host, layer = current(host), params = layer?.parameters ?? SELECTIVE_START;
    const area = readArea(params), values = readSelective(params), schedule = frameScheduler();
    const set = (changes) => {
        const next = { ...params };
        for (const [k, v] of Object.entries(changes)) {
            if (v === undefined)
                delete next[k];
            else
                next[k] = v;
        }
        return next;
    };
    const save = (next, label) => commit(host, "selective", next, label, layer);
    // The picture to tap or paint on.
    let base = null;
    try {
        const full = workingImage(editor), k = Math.min(1, PAD / Math.max(full.width, full.height));
        base = k < 1 ? resize(full, Math.max(1, Math.round(full.width * k)), Math.max(1, Math.round(full.height * k))) : full;
    }
    catch {
        base = null;
    }
    const pad = h("canvas", { class: "ed-pad", tabindex: "0", role: "application", "data-focus-key": "selective:pad",
        "aria-label": area.mode === "point" ? "Your photo. Tap where the area goes; arrow keys move it, Shift for bigger steps."
            : "Your photo. Drag to paint the area." });
    let stroke = [], dabs = area.dabs, point = [area.x, area.y];
    const redraw = () => {
        if (!base)
            return;
        const ctx = paintPicture(pad, base);
        if (!ctx)
            return;
        const shown = { ...area, x: point[0], y: point[1], dabs };
        if (state.showMask && (layer || area.mode === "paint")) {
            const floats = Float32Array.from(base.data.filter((_, i) => base.channels === 3 || i % 4 !== 3), (v) => v / 255);
            const mask = areaMask(shown, base.width, base.height, floats);
            const img = ctx.getImageData(0, 0, base.width, base.height);
            for (let i = 0; i < mask.length; i++) {
                const m = mask[i] * 0.45;
                if (m <= 0)
                    continue;
                img.data[i * 4] = Math.round(img.data[i * 4] * (1 - m) + 0x6b * m);
                img.data[i * 4 + 1] = Math.round(img.data[i * 4 + 1] * (1 - m) + 0x30 * m);
                img.data[i * 4 + 2] = Math.round(img.data[i * 4 + 2] * (1 - m) + 0x44 * m);
            }
            ctx.putImageData(img, 0, 0);
        }
        if (area.mode === "point") {
            const short = Math.min(base.width, base.height), cx = point[0] * base.width, cy = point[1] * base.height;
            ctx.lineWidth = 4;
            ctx.strokeStyle = PHOTO_MARK.halo;
            ctx.beginPath();
            ctx.arc(cx, cy, area.radius * short, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(cx, cy, 6, 0, Math.PI * 2);
            ctx.stroke();
            ctx.lineWidth = 2;
            ctx.strokeStyle = PHOTO_MARK.core;
            ctx.beginPath();
            ctx.arc(cx, cy, area.radius * short, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(cx, cy, 6, 0, Math.PI * 2);
            ctx.stroke();
        }
    };
    redraw();
    const at = (event) => {
        const [x, y] = canvasPoint(pad, event);
        return [Math.min(1, Math.max(0, x / Math.max(1, pad.width))), Math.min(1, Math.max(0, y / Math.max(1, pad.height)))];
    };
    let painting = false;
    pad.addEventListener("pointerdown", (event) => {
        if (area.mode === "point") {
            point = at(event);
            redraw();
            save(set({ mode: "point", x: Math.round(point[0] * 10000) / 10000, y: Math.round(point[1] * 10000) / 10000 }), "Selective: place point");
            return;
        }
        painting = true;
        stroke = [at(event)];
        capturePointer(pad, event.pointerId);
        dabs = addStroke(area.dabs, stroke, area.brush, base ? base.width / base.height : 1);
        redraw();
    });
    pad.addEventListener("pointermove", (event) => {
        if (!painting)
            return;
        stroke.push(at(event));
        dabs = addStroke(area.dabs, stroke, area.brush, base ? base.width / base.height : 1);
        redraw();
    });
    const endPaint = () => {
        if (!painting)
            return;
        painting = false;
        const cleared = Object.fromEntries(DAB_KEYS.map((k) => [k, undefined]));
        save(set({ ...cleared, ...encodeDabs(dabs), mode: "paint" }), "Selective: paint");
    };
    pad.addEventListener("pointerup", endPaint);
    pad.addEventListener("pointercancel", endPaint);
    let keyed = false;
    pad.addEventListener("keydown", (event) => {
        const step = event.shiftKey ? 0.05 : 0.01;
        const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
        if (area.mode !== "point" || !moves[event.key])
            return;
        event.preventDefault();
        point = [Math.min(1, Math.max(0, point[0] + moves[event.key][0])), Math.min(1, Math.max(0, point[1] + moves[event.key][1]))];
        keyed = true;
        redraw();
    });
    pad.addEventListener("keyup", (event) => {
        if (!keyed || !event.key.startsWith("Arrow"))
            return;
        keyed = false;
        save(set({ mode: "point", x: Math.round(point[0] * 10000) / 10000, y: Math.round(point[1] * 10000) / 10000 }), "Selective: move point");
    });
    const mode = choiceRow("How to choose the area", [{ id: "point", label: "Tap a point" }, { id: "paint", label: "Paint" }], area.mode, (id) => save(set({ mode: id }), id === "paint" ? "Selective: paint mode" : "Selective: point mode"), "selective-mode");
    const sizeSliders = area.mode === "point" ? [
        sliderRow({ key: "radius", label: "Size", min: 2, max: 60, step: 1, value: Math.round(area.radius * 100), neutral: 15, format: (v) => `${v}%`,
            onCommit: (v) => save(set({ radius: v / 100 }), `Selective size ${v}%`), onReset: () => save(set({ radius: undefined }), "Reset selective size") }),
        sliderRow({ key: "feather", label: "Softness", min: 0, max: 100, step: 1, value: area.feather, neutral: 60, format: String,
            onCommit: (v) => save(set({ feather: v }), `Selective softness ${v}`), onReset: () => save(set({ feather: undefined }), "Reset selective softness") }),
        sliderRow({ key: "similar", label: "Similar colours only", min: 0, max: 100, step: 1, value: area.similar, neutral: 0, format: (v) => v ? String(v) : "Off",
            hint: "Narrows the area to colours like the one under the point.",
            onCommit: (v) => save(set({ similar: v || undefined }), `Similar colours ${v}`), onReset: () => save(set({ similar: undefined }), "Similar colours off") }),
    ] : [
        sliderRow({ key: "brush", label: "Brush size", min: 1, max: 20, step: 1, value: Math.round(area.brush * 100), neutral: 5, format: (v) => `${v}%`,
            onCommit: (v) => save(set({ brush: v / 100 }), `Brush size ${v}%`), onReset: () => save(set({ brush: undefined }), "Reset brush size") }),
        sliderRow({ key: "soft", label: "Brush softness", min: 0, max: 100, step: 1, value: area.soft, neutral: 60, format: String,
            onCommit: (v) => save(set({ soft: v }), `Brush softness ${v}`), onReset: () => save(set({ soft: undefined }), "Reset brush softness") }),
    ];
    const adjust = SELECTIVE_SLIDERS.map((s) => sliderRow({ key: `sel-${s.key}`, label: s.label, min: -100, max: 100, step: 1, value: values[s.key], neutral: 0,
        hint: s.hint,
        onInput: (v) => schedule(() => host.live?.(candidate(editor, "selective", set({ [s.key]: v || undefined }), layer))),
        onCommit: (v) => save(set({ [s.key]: v || undefined }), `Selective ${s.label.toLowerCase()} ${signed(v)}`),
        onReset: () => save(set({ [s.key]: undefined }), `Reset selective ${s.label.toLowerCase()}`) }));
    const list = areas(host);
    const picker = list.length > 1 ? choiceRow("Areas", list.map((l, i) => ({ id: l.id, label: `Area ${i + 1}` })), layer?.id ?? "", (id) => { editor.choose(id); host.changed(); }, "selective-area") : null;
    const addArea = h("button", { type: "button", class: "shell-button", "data-focus-key": "selective:add" }, "Add another area");
    addArea.disabled = !layer;
    addArea.addEventListener("click", () => { editor.add("selective", { ...SELECTIVE_START }, 100); host.changed(); });
    const removeArea = h("button", { type: "button", class: "shell-button", "data-focus-key": "selective:remove" }, "Delete this area");
    removeArea.disabled = !layer;
    removeArea.addEventListener("click", () => { if (layer) {
        editor.remove(layer.id);
        host.changed();
    } });
    const clearPaint = area.mode === "paint" ? h("button", { type: "button", class: "shell-button", "data-focus-key": "selective:clear" }, "Clear painting") : null;
    if (clearPaint) {
        clearPaint.disabled = area.dabs.length === 0;
        clearPaint.addEventListener("click", () => save(set(Object.fromEntries(DAB_KEYS.map((k) => [k, undefined]))), "Selective: clear painting"));
    }
    const show = h("input", { type: "checkbox", id: "ed-show-mask", "data-focus-key": "selective:mask" });
    show.checked = state.showMask;
    show.addEventListener("change", () => { state.showMask = show.checked; redraw(); });
    const panel = h("section", { class: "ed-panel", "aria-label": "Selective adjust" }, picker, mode, h("div", { class: "ed-pad-wrap" }, pad), h("p", { class: "shell-check-row" }, show, h("label", { for: "ed-show-mask" }, "Show the area")), h("p", { class: "shell-hint" }, layer ? (area.mode === "point" ? "Tap the picture in this panel to move the point." : `${area.dabs.length} brush dab${area.dabs.length === 1 ? "" : "s"}. Drag to paint more.`)
        : "Tap the picture in this panel where you want to change something, then move a slider."), ...sizeSliders, ...adjust, h("div", { class: "ed-actions" }, addArea, clearPaint, removeArea), orderNote());
    rememberFocus(panel, "selective");
    return panel;
}
