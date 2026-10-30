/** The Crop and straighten panel: the whole turned photo with the crop frame on top, a rule of
 * thirds grid (a finer grid while straightening), ratio buttons, quarter turns, flips, straighten
 * and keystone sliders. Drag the frame or its corners; on the keyboard the picture is focusable:
 * arrow keys move the frame, Shift + arrows resize it. Each change is one undo step; the photo
 * itself is never cut, and the saved photo is cropped at its full size.
 * Author: John Khan.
 */
import { h } from "../../dom.js";
import { PALETTE, PHOTO_MARK, withAlpha } from "../../ui/palette.js";
import { candidate, canvasPoint, choiceRow, commit, frameScheduler, layerOf, paintPicture, rememberFocus, sliderRow, workingImage } from "../adjust/kit.js";
import { orderNote } from "../adjust/panel.js";
import { ASPECT_BUTTONS, IDENTITY, MAX_ANGLE, Transform, applyGeometry, aspectRatio, cropRect, fitInside, flip, geometryParams, readGeometry, refit, swapAspect, turn } from "./geometry.js";
const PAD = 360;
const state = { straightening: false };
export function cropScreen(host) {
    const { editor } = host, layer = layerOf(editor, "crop");
    const g = readGeometry(layer?.parameters ?? {});
    const full = workingImage(editor), W = full.width, H = full.height;
    const save = (next, label) => commit(host, "crop", geometryParams(next), label, layer);
    const schedule = frameScheduler();
    const live = (next) => schedule(() => host.live?.(candidate(editor, "crop", geometryParams(next), layer)));
    // The pad: the whole transformed frame, scaled; the crop frame drawn over it.
    let view = g;
    const pad = h("canvas", { class: "ed-pad ed-crop-pad", tabindex: "0", role: "application", "data-focus-key": "crop:pad",
        "aria-label": "Crop frame on your photo. Drag the frame or a corner. Arrow keys move it; Shift and arrow keys resize it." });
    let frameImage = applyGeometry(full, { ...view, x: 0, y: 0, w: 1, h: 1 }, { whole: true, outside: [43, 26, 34], maxSide: PAD });
    let scale = frameImage.width / new Transform(W, H, view).tw;
    const rectOf = (geo) => {
        const t = new Transform(W, H, geo);
        return fitInside(t.quad(), { x: geo.x * t.tw, y: geo.y * t.th, w: geo.w * t.tw, h: geo.h * t.th });
    };
    const redraw = () => {
        const ctx = paintPicture(pad, frameImage);
        if (!ctx)
            return;
        const r = rectOf(view), x = r.x * scale, y = r.y * scale, w = r.w * scale, hh = r.h * scale;
        ctx.fillStyle = withAlpha(PALETTE.ink, 0.55);
        ctx.fillRect(0, 0, pad.width, y);
        ctx.fillRect(0, y + hh, pad.width, pad.height - y - hh);
        ctx.fillRect(0, y, x, hh);
        ctx.fillRect(x + w, y, pad.width - x - w, hh);
        const lines = state.straightening ? 8 : 3;
        ctx.strokeStyle = withAlpha(PALETTE.cream, state.straightening ? 0.5 : 0.7);
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 1; i < lines; i++) {
            ctx.moveTo(x + w * i / lines, y);
            ctx.lineTo(x + w * i / lines, y + hh);
            ctx.moveTo(x, y + hh * i / lines);
            ctx.lineTo(x + w, y + hh * i / lines);
        }
        ctx.stroke();
        ctx.lineWidth = 3;
        ctx.strokeStyle = PHOTO_MARK.halo;
        ctx.strokeRect(x, y, w, hh);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = PHOTO_MARK.core;
        ctx.strokeRect(x, y, w, hh);
        ctx.fillStyle = PHOTO_MARK.halo;
        for (const [cx, cy] of [[x, y], [x + w, y], [x + w, y + hh], [x, y + hh]])
            ctx.fillRect(cx - 5, cy - 5, 10, 10);
        pad.setAttribute("aria-valuetext", `Crop ${Math.round(r.w)} by ${Math.round(r.h)} pixels at preview size`);
    };
    const reframe = (next) => {
        view = next;
        frameImage = applyGeometry(full, { ...view, x: 0, y: 0, w: 1, h: 1 }, { whole: true, outside: [43, 26, 34], maxSide: PAD });
        scale = frameImage.width / new Transform(W, H, view).tw;
        redraw();
    };
    redraw();
    let drag = null;
    const toFrame = (event) => { const [px, py] = canvasPoint(pad, event); return [px / scale, py / scale]; };
    const withRect = (r) => {
        const t = new Transform(W, H, view), fitted = fitInside(t.quad(), r);
        return { ...view, x: fitted.x / t.tw, y: fitted.y / t.th, w: fitted.w / t.tw, h: fitted.h / t.th, auto: false };
    };
    pad.addEventListener("pointerdown", (event) => {
        const p = toFrame(event), r = rectOf(view), grab = 16 / scale;
        const corners = [["nw", r.x, r.y], ["ne", r.x + r.w, r.y], ["se", r.x + r.w, r.y + r.h], ["sw", r.x, r.y + r.h]];
        const hit = corners.find(([, cx, cy]) => Math.hypot(p[0] - cx, p[1] - cy) <= grab);
        if (hit)
            drag = { mode: hit[0], start: p, rect: r };
        else if (p[0] >= r.x && p[0] <= r.x + r.w && p[1] >= r.y && p[1] <= r.y + r.h)
            drag = { mode: "move", start: p, rect: r };
        else
            return;
        pad.setPointerCapture?.(event.pointerId);
    });
    pad.addEventListener("pointermove", (event) => {
        if (!drag)
            return;
        const p = toFrame(event), dx = p[0] - drag.start[0], dy = p[1] - drag.start[1], r = drag.rect;
        const t = new Transform(W, H, view), ratio = aspectRatio(view.aspect, t.tw, t.th);
        let next;
        if (drag.mode === "move")
            next = { ...r, x: r.x + dx, y: r.y + dy };
        else {
            const left = drag.mode === "nw" || drag.mode === "sw", top = drag.mode === "nw" || drag.mode === "ne";
            let w = Math.max(16, r.w + (left ? -dx : dx)), hh = Math.max(16, r.h + (top ? -dy : dy));
            if (ratio) {
                if (Math.abs(dx) >= Math.abs(dy))
                    hh = w / ratio;
                else
                    w = hh * ratio;
            }
            next = { x: left ? r.x + r.w - w : r.x, y: top ? r.y + r.h - hh : r.y, w, h: hh };
        }
        view = withRect(next);
        redraw();
    });
    const endDrag = () => { if (!drag)
        return; drag = null; save(view, "Crop: frame"); };
    pad.addEventListener("pointerup", endDrag);
    pad.addEventListener("pointercancel", endDrag);
    let keyed = false;
    pad.addEventListener("keydown", (event) => {
        const dirs = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
        const d = dirs[event.key];
        if (!d)
            return;
        event.preventDefault();
        const r = rectOf(view), t = new Transform(W, H, view), step = 0.01 * Math.max(t.tw, t.th);
        const ratio = aspectRatio(view.aspect, t.tw, t.th);
        if (event.shiftKey) {
            let w = Math.max(16, r.w + d[0] * step), hh = Math.max(16, r.h + d[1] * step);
            if (ratio) {
                if (d[0])
                    hh = w / ratio;
                else
                    w = hh * ratio;
            }
            view = withRect({ x: r.x + (r.w - w) / 2, y: r.y + (r.h - hh) / 2, w, h: hh });
        }
        else
            view = withRect({ ...r, x: r.x + d[0] * step, y: r.y + d[1] * step });
        keyed = true;
        redraw();
    });
    pad.addEventListener("keyup", (event) => { if (keyed && event.key.startsWith("Arrow")) {
        keyed = false;
        save(view, "Crop: frame");
    } });
    const ratios = choiceRow("Crop ratio", ASPECT_BUTTONS.map((a) => ({ id: a.id, label: a.label })), ASPECT_BUTTONS.some((a) => a.id === g.aspect) ? g.aspect : swapAspect(g.aspect), (id) => save(refit(W, H, { ...g, aspect: id, auto: true }), `Crop ratio ${ASPECT_BUTTONS.find((a) => a.id === id)?.label ?? id}`), "crop-ratio");
    const swap = h("button", { type: "button", class: "shell-button", "data-focus-key": "crop:swap" }, "Swap tall and wide");
    swap.disabled = swapAspect(g.aspect) === g.aspect;
    swap.addEventListener("click", () => save(refit(W, H, { ...g, aspect: swapAspect(g.aspect), auto: true }), "Crop: swap tall and wide"));
    const button = (label, key, act) => {
        const b = h("button", { type: "button", class: "shell-button", "data-focus-key": `crop:${key}` }, label);
        b.addEventListener("click", act);
        return b;
    };
    const turns = h("div", { class: "ed-actions", role: "group", "aria-label": "Turn and flip" }, button("↺ Turn left", "turn-left", () => save(refit(W, H, turn(g, -1)), "Crop: turn left")), button("↻ Turn right", "turn-right", () => save(refit(W, H, turn(g, 1)), "Crop: turn right")), button("⇋ Flip across", "flip-h", () => save(flip(g, "h"), "Crop: flip across")), button("⇵ Flip up-down", "flip-v", () => save(flip(g, "v"), "Crop: flip up-down")));
    const tilt = (key, label, min, max, step, hint, format) => sliderRow({ key, label, min, max, step, value: g[key], neutral: 0, hint, format,
        onInput: (v) => { state.straightening = key === "angle"; const next = refit(W, H, { ...g, [key]: v }); reframe(next); live(next); },
        onCommit: (v) => { state.straightening = false; save(refit(W, H, { ...g, [key]: v }), `${label} ${format(v)}`); },
        onReset: () => { state.straightening = false; save(refit(W, H, { ...g, [key]: 0 }), `Reset ${label.toLowerCase()}`); } });
    const deg = (v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}°`, pct = (v) => `${v > 0 ? "+" : ""}${v}`;
    const reset = button("Reset crop and geometry", "reset", () => save({ ...IDENTITY }, "Reset crop and geometry"));
    reset.disabled = !layer;
    const out = cropRect(W, H, g);
    const panel = h("section", { class: "ed-panel", "aria-label": "Crop and straighten" }, ratios, h("div", { class: "ed-actions" }, swap), h("div", { class: "ed-pad-wrap" }, pad), h("p", { class: "shell-hint", role: "status" }, `${Math.round(out.w)} × ${Math.round(out.h)} px at preview size; the saved photo is cropped at its full size.`), turns, tilt("angle", "Straighten", -MAX_ANGLE, MAX_ANGLE, 0.1, "Turns the picture; the frame shrinks so no empty corner shows.", deg), tilt("vertical", "Vertical keystone", -100, 100, 1, "Right widens the top: fixes lines that lean in toward the top.", pct), tilt("horizontal", "Horizontal keystone", -100, 100, 1, "Right widens the left side: fixes lines that lean in sideways.", pct), h("div", { class: "ed-actions" }, reset), orderNote());
    rememberFocus(panel, "crop");
    return panel;
}
//# sourceMappingURL=panel.js.map