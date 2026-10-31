/** The Curves panel: an RGB curve and red, green and blue curves over the channel's histogram.
 * Drag a point, tap the graph to add one, or use the keyboard: arrows move the chosen point
 * (Shift for bigger steps), [ and ] choose another, Delete removes it; the two number fields
 * set the chosen point exactly. A drag previews live and commits one undo step when it ends.
 * Author: John Khan.
 */
import { h } from "../../dom.js";
import { PALETTE, PHOTO_MARK, withAlpha } from "../../ui/palette.js";
import { CHANNEL_LABELS, CURVE_CHANNELS, CURVE_PRESETS, STRAIGHT, addPoint, curvePreset, movePoint, presetParams, readCurves, removePoint, sampleCurve, withCurve } from "./curves.js";
import { candidate, choiceRow, commit, frameScheduler, layerOf, rememberFocus, workingImage } from "./kit.js";
import { orderNote } from "./panel.js";
import { capturePointer } from "../../ui/shell/pointer-capture.js";
const SIDE = 256;
const state = { channel: "master", point: 1 };
/** 256-bin histogram of one channel (luma for the RGB curve), scaled to 0..1. */
export function histogram(image, channel) {
    const bins = new Float32Array(256), ch = image.channels;
    for (let i = 0; i < image.width * image.height; i++) {
        const r = image.data[i * ch], g = image.data[i * ch + 1], b = image.data[i * ch + 2];
        const v = channel === "red" ? r : channel === "green" ? g : channel === "blue" ? b : Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
        bins[v]++;
    }
    // Square root keeps a tall spike from flattening the rest.
    let max = 0;
    for (let i = 0; i < 256; i++) {
        bins[i] = Math.sqrt(bins[i]);
        max = Math.max(max, bins[i]);
    }
    if (max > 0)
        for (let i = 0; i < 256; i++)
            bins[i] /= max;
    return bins;
}
const LINE = { master: PALETTE.ink, red: "#B3261E", green: "#2E6B3F", blue: "#1F4E99" };
function draw(canvas, points, channel, hist, selected) {
    const ctx = canvas.getContext("2d");
    if (!ctx)
        return;
    canvas.width = SIDE;
    canvas.height = SIDE;
    ctx.fillStyle = PALETTE.surface;
    ctx.fillRect(0, 0, SIDE, SIDE);
    if (hist) {
        ctx.fillStyle = withAlpha(LINE[channel], 0.16);
        for (let i = 0; i < 256; i++)
            ctx.fillRect(i, SIDE - hist[i] * SIDE * 0.9, 1, hist[i] * SIDE * 0.9);
    }
    ctx.strokeStyle = PALETTE.rule;
    ctx.lineWidth = 1;
    for (const v of [64, 128, 192]) {
        ctx.beginPath();
        ctx.moveTo(v + 0.5, 0);
        ctx.lineTo(v + 0.5, SIDE);
        ctx.moveTo(0, v + 0.5);
        ctx.lineTo(SIDE, v + 0.5);
        ctx.stroke();
    }
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, SIDE);
    ctx.lineTo(SIDE, 0);
    ctx.stroke();
    ctx.setLineDash([]);
    const ys = sampleCurve(points, 256);
    ctx.strokeStyle = LINE[channel];
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 256; i++) {
        const y = SIDE - ys[i] * SIDE;
        if (i)
            ctx.lineTo(i, y);
        else
            ctx.moveTo(i, y);
    }
    ctx.stroke();
    points.forEach(([x, y], i) => {
        ctx.beginPath();
        ctx.arc(x, SIDE - 1 - y, i === selected ? 7 : 5, 0, Math.PI * 2);
        ctx.fillStyle = i === selected ? PHOTO_MARK.core : PALETTE.surface;
        ctx.fill();
        ctx.strokeStyle = PHOTO_MARK.core;
        ctx.lineWidth = 2;
        ctx.stroke();
    });
}
export function curvesScreen(host) {
    const { editor } = host, layer = layerOf(editor, "curves"), params = layer?.parameters ?? {};
    const curves = readCurves(params), schedule = frameScheduler();
    let points = curves[state.channel];
    state.point = Math.min(Math.max(0, state.point), points.length - 1);
    let hist = null;
    try {
        hist = histogram(workingImage(editor), state.channel);
    }
    catch {
        hist = null;
    }
    const graph = h("canvas", { class: "ed-curve", width: String(SIDE), height: String(SIDE), tabindex: "0", role: "application",
        "data-focus-key": "curves:graph",
        "aria-label": `${CHANNEL_LABELS[state.channel]} curve. Arrow keys move the chosen point, Shift for bigger steps; [ and ] choose a point; Delete removes it.` });
    const pointLabel = h("span", { class: "shell-field-name" });
    const inX = h("input", { type: "number", class: "ed-number", min: "0", max: "255", step: "1", "aria-label": "Chosen point input level", "data-focus-key": "curves:x" });
    const inY = h("input", { type: "number", class: "ed-number", min: "0", max: "255", step: "1", "aria-label": "Chosen point output level", "data-focus-key": "curves:y" });
    const remove = h("button", { type: "button", class: "shell-button", "data-focus-key": "curves:remove" }, "Remove point");
    const redraw = () => {
        draw(graph, points, state.channel, hist, state.point);
        const [x, y] = points[state.point];
        pointLabel.textContent = `Point ${state.point + 1} of ${points.length}`;
        inX.value = String(x);
        inY.value = String(y);
        inX.disabled = state.point === 0 || state.point === points.length - 1;
        remove.disabled = inX.disabled;
        graph.setAttribute("aria-valuetext", `Point ${state.point + 1}: input ${x}, output ${y}`);
    };
    const preview = () => schedule(() => host.live?.(candidate(editor, "curves", withCurve(params, state.channel, points), layer)));
    const save = (label) => commit(host, "curves", withCurve(params, state.channel, points), label, layer);
    redraw();
    let dragging = false;
    graph.addEventListener("pointerdown", (event) => {
        const r = graph.getBoundingClientRect();
        const x = (event.clientX - r.left) * SIDE / Math.max(1, r.width), y = SIDE - 1 - (event.clientY - r.top) * SIDE / Math.max(1, r.height);
        let best = -1, dist = 14;
        points.forEach(([px, py], i) => { const d = Math.hypot(px - x, py - y); if (d < dist) {
            dist = d;
            best = i;
        } });
        if (best < 0) {
            const added = addPoint(points, x, y);
            if (!added)
                return;
            points = added.points;
            best = added.index;
        }
        state.point = best;
        dragging = true;
        capturePointer(graph, event.pointerId);
        redraw();
        preview();
    });
    graph.addEventListener("pointermove", (event) => {
        if (!dragging)
            return;
        const r = graph.getBoundingClientRect();
        points = movePoint(points, state.point, (event.clientX - r.left) * SIDE / Math.max(1, r.width), SIDE - 1 - (event.clientY - r.top) * SIDE / Math.max(1, r.height));
        redraw();
        preview();
    });
    const end = () => { if (!dragging)
        return; dragging = false; save(`${CHANNEL_LABELS[state.channel]} curve point`); };
    graph.addEventListener("pointerup", end);
    graph.addEventListener("pointercancel", end);
    let keyed = false;
    graph.addEventListener("keydown", (event) => {
        const step = event.shiftKey ? 8 : 1, [x, y] = points[state.point];
        const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
        if (moves[event.key]) {
            event.preventDefault();
            points = movePoint(points, state.point, x + moves[event.key][0], y + moves[event.key][1]);
            keyed = true;
            redraw();
            preview();
        }
        else if (event.key === "[" || event.key === "]") {
            event.preventDefault();
            state.point = (state.point + (event.key === "]" ? 1 : -1) + points.length) % points.length;
            redraw();
        }
        else if (event.key === "Delete" || event.key === "Backspace") {
            event.preventDefault();
            const next = removePoint(points, state.point);
            if (next !== points) {
                points = next;
                state.point = Math.max(0, state.point - 1);
                save(`${CHANNEL_LABELS[state.channel]} curve: remove point`);
            }
        }
    });
    graph.addEventListener("keyup", (event) => {
        if (keyed && event.key.startsWith("Arrow")) {
            keyed = false;
            save(`${CHANNEL_LABELS[state.channel]} curve point`);
        }
    });
    const exact = () => {
        const x = Number(inX.value), y = Number(inY.value);
        if (!Number.isFinite(x) || !Number.isFinite(y))
            return;
        points = movePoint(points, state.point, x, y);
        save(`${CHANNEL_LABELS[state.channel]} curve point`);
    };
    inX.addEventListener("change", exact);
    inY.addEventListener("change", exact);
    remove.addEventListener("click", () => {
        const next = removePoint(points, state.point);
        if (next === points)
            return;
        points = next;
        state.point = Math.max(0, state.point - 1);
        save(`${CHANNEL_LABELS[state.channel]} curve: remove point`);
    });
    const tabs = choiceRow("Curve channel", CURVE_CHANNELS.map((c) => ({ id: c, label: CHANNEL_LABELS[c] })), state.channel, (id) => {
        state.channel = id;
        state.point = 1;
        host.changed();
    }, "curves-channel");
    const presetId = typeof params.preset === "string" ? params.preset : "";
    const presets = h("select", { class: "shell-select", id: "ed-curve-preset", "data-focus-key": "curves:preset" }, h("option", { value: "" }, presetId ? "Starting point" : "Custom or none"), ...CURVE_PRESETS.map((p) => h("option", { value: p.id }, `${p.name} · ${p.note}`)));
    presets.value = presetId;
    presets.addEventListener("change", () => {
        if (!presets.value)
            return;
        commit(host, "curves", presetParams(presets.value), `Curves: ${curvePreset(presets.value).name}`, layer);
    });
    const resetChannel = h("button", { type: "button", class: "shell-button", "data-focus-key": "curves:reset-channel" }, `Reset ${CHANNEL_LABELS[state.channel]}`);
    resetChannel.disabled = points.length === 2 && points[0][1] === 0 && points[1][1] === 255;
    resetChannel.addEventListener("click", () => commit(host, "curves", withCurve(params, state.channel, STRAIGHT), `Reset ${CHANNEL_LABELS[state.channel]} curve`, layer));
    const resetAll = h("button", { type: "button", class: "shell-button", "data-focus-key": "curves:reset-all" }, "Reset all curves");
    resetAll.disabled = !layer || Object.keys(params).length === 0;
    resetAll.addEventListener("click", () => commit(host, "curves", {}, "Reset all curves", layer));
    const panel = h("section", { class: "ed-panel", "aria-label": "Curves" }, tabs, h("label", { class: "shell-field" }, h("span", { class: "shell-field-name" }, "Starting point"), presets), h("div", { class: "ed-curve-wrap" }, graph), h("div", { class: "ed-point" }, pointLabel, h("label", {}, "In ", inX), h("label", {}, "Out ", inY), remove), h("p", { class: "shell-hint" }, "Tap the graph to add a point and drag it. Outputs never go down, so the picture can't invert."), h("div", { class: "ed-actions" }, resetChannel, resetAll), orderNote());
    rememberFocus(panel, "curves");
    return panel;
}
