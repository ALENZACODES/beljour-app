/** Shared pieces of the photo-adjustment panels: the slider row with its own reset, the layer
 * lookup that adds a layer only on her first change, focus that survives the Studio redrawing
 * the panel after each commit, the live-preview scheduler and painting a picture into a panel
 * canvas. Native inputs only; every control has a visible label or an accessible name.
 * Author: John Khan.
 */
import { h } from "../../dom.js";
import { toRGBA } from "../../engines/core/buffer.js";
/** The tool's layer (the selected one of this kind, else the top one), or undefined before her
 * first change. */
export function layerOf(editor, kind) {
    const selected = editor.selected;
    if (selected?.kind === kind)
        return selected;
    return [...editor.document.layers].reverse().find((l) => l.kind === kind);
}
/** Commit new parameters: change the layer in one undo step, or add it with them. */
export function commit(host, kind, params, label, layer = layerOf(host.editor, kind)) {
    if (layer)
        host.editor.setParams(layer.id, params, label);
    else
        host.editor.add(kind, params, 100, label);
    host.live?.(null);
    host.changed();
}
/** The layer stack with this tool's layer given candidate parameters (for the live preview). */
export function candidate(editor, kind, params, layer = layerOf(editor, kind)) {
    const layers = editor.document.layers;
    if (layer)
        return layers.map((l) => l.id === layer.id ? { ...l, enabled: true, parameters: { ...params } } : l);
    return [...layers, { id: "live-preview", kind, name: "Preview", enabled: true, opacity: 1, strength: 100, parameters: { ...params },
            provenance: "local", simulation: false, origin: editor.source.kind === "sample" ? "sample" : "photo" }];
}
/** Coalesce many input events into one call per frame (a timer where frames don't exist). */
export function frameScheduler() {
    let pending = null;
    const raf = globalThis.requestAnimationFrame;
    return (job) => {
        const first = pending === null;
        pending = job;
        if (!first)
            return;
        const run = () => { const next = pending; pending = null; next?.(); };
        if (raf)
            raf(run);
        else
            setTimeout(run, 16);
    };
}
/** Focus memory per panel: the Studio rebuilds its panel after every commit, so the control she
 * was using is focused again in the new panel (keyboard and screen-reader users keep their place). */
const focusKeys = new Map();
export function rememberFocus(panel, id) {
    panel.addEventListener("focusin", (event) => {
        const key = event.target?.dataset?.focusKey;
        if (key)
            focusKeys.set(id, key);
    });
    const key = focusKeys.get(id);
    if (!key)
        return;
    const restore = () => {
        const target = panel.querySelector(`[data-focus-key="${key}"]`);
        if (target && panel.isConnected !== false)
            target.focus();
    };
    if (typeof queueMicrotask === "function")
        queueMicrotask(restore);
    else
        restore();
}
export function forgetFocus(id) { focusKeys.delete(id); }
export const signed = (v) => v > 0 ? `+${v}` : String(v);
/** A labelled range with its value and a reset button. The reset is disabled at the neutral value. */
export function sliderRow(o) {
    const id = `ed-${o.key.replace(/[^a-z0-9-]/gi, "-")}`;
    const show = o.format ?? signed;
    const range = h("input", { type: "range", class: "shell-range", id, min: String(o.min), max: String(o.max), step: String(o.step),
        value: String(o.value), "data-key": o.key, "data-focus-key": `range:${o.key}` });
    const output = h("output", { class: "shell-range-output", for: id }, show(o.value));
    range.setAttribute("aria-valuetext", `${o.label} ${show(o.value)}`);
    const reset = h("button", { type: "button", class: "shell-mini ed-reset", "aria-label": `Reset ${o.label}`, title: `Reset ${o.label}`,
        "data-reset": o.key, "data-focus-key": `reset:${o.key}` }, "↺");
    reset.disabled = o.value === o.neutral;
    range.addEventListener("input", () => {
        const v = Number(range.value);
        output.textContent = show(v);
        range.setAttribute("aria-valuetext", `${o.label} ${show(v)}`);
        o.onInput?.(v);
    });
    range.addEventListener("change", () => o.onCommit(Number(range.value)));
    range.addEventListener("dblclick", () => { if (Number(range.value) !== o.neutral)
        o.onReset(); });
    reset.addEventListener("click", () => o.onReset());
    const label = h("label", { class: "shell-field-name", for: id }, o.label);
    const row = h("div", { class: "ed-slider", "data-slider": o.key }, h("div", { class: "ed-slider-head" }, label, output, reset), range);
    if (o.hint)
        row.append(h("p", { class: "shell-hint ed-hint" }, o.hint));
    return row;
}
/** A row of toggle buttons (aria-pressed), for tabs that switch what the panel shows. */
export function choiceRow(label, items, active, pick, focusPrefix) {
    return h("div", { class: "ed-choices", role: "group", "aria-label": label }, ...items.map((item) => {
        const b = h("button", { type: "button", class: "shell-button ed-choice", "aria-pressed": String(item.id === active),
            "data-choice": item.id, "data-focus-key": `${focusPrefix}:${item.id}` }, item.label);
        b.addEventListener("click", () => pick(item.id));
        return b;
    }));
}
/** Paint a picture into a panel canvas at its own size; CSS sizes it. False when there is no 2D context. */
export function paintPicture(canvas, image) {
    const ctx = canvas.getContext("2d");
    if (!ctx || typeof ImageData === "undefined")
        return null;
    canvas.width = image.width;
    canvas.height = image.height;
    ctx.putImageData(new ImageData(new Uint8ClampedArray(toRGBA(image)), image.width, image.height), 0, 0);
    return ctx;
}
/** Pointer position in canvas pixels. */
export function canvasPoint(canvas, event) {
    const r = canvas.getBoundingClientRect();
    return [(event.clientX - r.left) * canvas.width / Math.max(1, r.width), (event.clientY - r.top) * canvas.height / Math.max(1, r.height)];
}
/** The picture a panel works on: the edit before the crop and finish (the photo's own frame). */
export function workingImage(editor) {
    const shot = editor.rendered();
    return shot.beforeGeometry ?? shot.image;
}
