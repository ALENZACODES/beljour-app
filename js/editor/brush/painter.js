/** Finger, pen and mouse painting on the Studio photo for the retouch brushes.
 *
 * While the Retouch studio is open, a press on the photo paints with the current brush (pen
 * pressure where the device reports it), two fingers pan and pinch-zoom, and with Move on, or
 * the middle mouse button, or Space held, one finger pans. The stroke is drawn live on the photo
 * and committed on release as one history step; the whole stack then renders it for real. Show
 * mask tints the brush's painted area (and Freeze in amber). Hold for before still works.
 * Author: John Khan.
 */
import { floatImage, toRGBA } from "../../engines/core/buffer.js";
import { renderLayers } from "../../ui/shell/pipeline.js";
import { effective } from "../../ui/shell/layers.js";
import { finishStage, geometryStage, stagePlan } from "../adjust/stack.js";
import { applyGeometry, cropRect, isIdentity, outputShareToSource, readGeometry } from "../crop/geometry.js";
import { PHOTO_MARK, rgbOf } from "../../ui/palette.js";
import { blurPainted, colourPainted, details, fallbackIod, mixWeighted, relightPainted, smooth } from "./effects.js";
import { BRUSH_NAMES, brushOf, START_STRENGTH, strokesOf } from "./layer.js";
import { buildMask, radiusPx, strokeCoverage } from "./mask.js";
import { reshape, strokeField } from "./reshape.js";
import { eyeDistance, snapPlanes } from "./snap.js";
const TINT = rgbOf(PHOTO_MARK.core), FREEZE_TINT = rgbOf(PHOTO_MARK.second);
const MIX_LIVE = new Set(["smooth", "details", "blur", "colour"]);
/** How often a held bloat or pinch adds a dab where the finger rests; ASSUMED. */
export const HOLD_MS = 60;
/** How strongly Show mask tints a fully painted pixel. */
export const MASK_SHARE = 0.55;
/** Pen pressure when the device reports one; a mouse, or a touch that reports none, paints at full. */
export function pressureOf(event) {
    if (event.pointerType === "mouse")
        return 1;
    const p = event.pressure;
    return Number.isFinite(p) && p > 0 && p <= 1 && !(event.pointerType === "touch" && p === 0.5) ? p : 1;
}
/** The zoom factor a two-finger pinch asks for: the change in finger distance, or none for a
 * pinch that started too close together to measure or moved less than 8%. */
export function pinchRatio(startDistance, endDistance) {
    if (!(startDistance > 8 && endDistance > 0))
        return 1;
    const ratio = endDistance / startDistance;
    return Math.abs(ratio - 1) > 0.08 ? ratio : 1;
}
/** The photo share (0..1) under a point on the canvas. */
export function photoPoint(rect, clientX, clientY) {
    return [Math.min(1, Math.max(0, (clientX - rect.left) / Math.max(1, rect.width))), Math.min(1, Math.max(0, (clientY - rect.top) / Math.max(1, rect.height)))];
}
/** A tinted copy of `image` where `mask` is set (the Show mask view). */
export function tinted(image, mask, tint, share = MASK_SHARE) {
    const out = new Uint8Array(image.width * image.height * 3), ch = image.channels;
    for (let i = 0; i < image.width * image.height; i++) {
        const w = Math.min(1, Math.max(0, mask[i])) * share;
        for (let c = 0; c < 3; c++)
            out[i * 3 + c] = Math.round(image.data[i * ch + c] * (1 - w) + tint[c] * w);
    }
    return { width: image.width, height: image.height, channels: 3, data: out };
}
/** A source-size mask (0..1) as the cropped picture shows it, at the crop's output size. */
export function maskThroughCrop(mask, width, height, g) {
    if (!g)
        return { width, height, data: Float32Array.from(mask) };
    const grey = new Uint8Array(width * height * 3);
    for (let i = 0; i < width * height; i++)
        grey[i * 3] = grey[i * 3 + 1] = grey[i * 3 + 2] = Math.round(255 * Math.min(1, Math.max(0, mask[i])));
    const out = applyGeometry({ width, height, channels: 3, data: grey }, g);
    const data = new Float32Array(out.width * out.height);
    for (let i = 0; i < data.length; i++)
        data[i] = out.data[i * 3] / 255;
    return { width: out.width, height: out.height, data };
}
export class BrushPainter {
    host;
    active = false;
    live = null;
    /** Where each pointer on the photo is now. */
    pointers = new Map();
    gesture = null;
    space = false;
    raf = 0;
    /** Bloat and pinch keep working while the finger is held still. */
    holdTimer = null;
    /** Full-size scratch planes reused across live frames, so a drag does not allocate several
     * photo-sized arrays per frame (a long drag on a large photo could exhaust a phone's memory). */
    scratch = null;
    planes(width, height) {
        const s = this.scratch;
        if (s && s.width === width && s.height === height)
            return s;
        const m = floatImage(width, height, 1), none = floatImage(width, height, 1);
        this.scratch = { width, height, zero: new Float32Array(width * height), mask: new Float32Array(width * height), m, none };
        return this.scratch;
    }
    offscreen;
    constructor(host, doc = document) {
        this.host = host;
        this.offscreen = doc.createElement("canvas");
        const scroll = host.scroll;
        // Capture on the canvas's scroller, so a brush press never reaches the compare view's own hold.
        scroll.addEventListener("pointerdown", (e) => this.down(e), { capture: true });
        scroll.addEventListener("pointermove", (e) => this.move(e), { capture: true });
        for (const name of ["pointerup", "pointercancel"])
            scroll.addEventListener(name, (e) => this.up(e), { capture: true });
        doc.defaultView?.addEventListener("keydown", (e) => { if (e.key === " " && this.active && e.target === host.canvas)
            this.space = true; });
        doc.defaultView?.addEventListener("keyup", (e) => { if (e.key === " ")
            this.space = false; });
    }
    get isActive() { return this.active; }
    get painting() { return this.live !== null; }
    setActive(on) {
        this.active = on;
        this.host.canvas.classList.toggle("lg-brush-canvas", on);
        if (!on)
            this.cancel();
    }
    stopHold() { if (this.holdTimer !== null) {
        clearInterval(this.holdTimer);
        this.holdTimer = null;
    } }
    cancel() {
        this.stopHold();
        this.unschedule();
        if (this.live) {
            this.live = null;
            this.scratch = null;
            this.host.committed();
        }
        this.gesture = null;
    }
    onPhoto(e) { return e.target === this.host.canvas; }
    /** The crop and finish stages of the current stack, or null when there are none. */
    after() {
        const plan = stagePlan(effective(this.host.editor.document.layers));
        if (!plan.geometry && !plan.finish)
            return null;
        const g = plan.geometry ? readGeometry(plan.geometry.parameters) : null;
        return { geometry: plan.geometry, finish: plan.finish, g: g && !isIdentity(g) ? g : null };
    }
    /** A picture at the brush's (source) size as the canvas shows it: through crop and finish. */
    shown(image, after) {
        return after ? finishStage(geometryStage(image, after.geometry).image, after.finish).image : image;
    }
    down(e) {
        if (!this.active || !this.onPhoto(e))
            return;
        e.stopPropagation();
        e.preventDefault();
        this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (this.gesture) {
            // A second finger joins a one-finger pan: start over as a two-finger pan and pinch.
            if (this.gesture.ids.length < 2)
                this.startGesture([...this.gesture.ids, e.pointerId]);
            this.capture(e);
            return;
        }
        const pans = this.host.session.settings.move || e.button === 1 || this.space;
        if (this.live && e.pointerType === "touch") {
            // A second finger: a stroke just begun becomes a pan and pinch instead.
            const first = this.live.id;
            this.stopHold();
            this.live = null;
            this.scratch = null;
            this.host.committed();
            this.startGesture([first, e.pointerId]);
            return;
        }
        if (pans) {
            this.startGesture([e.pointerId]);
            this.capture(e);
            return;
        }
        if (e.button !== 0 && e.pointerType === "mouse")
            return;
        try {
            this.begin(e);
            this.capture(e);
        }
        catch (error) {
            this.host.status(error instanceof Error ? error.message : String(error));
        }
    }
    capture(e) { try {
        this.host.canvas.setPointerCapture(e.pointerId);
    }
    catch { /* capture is optional */ } }
    startGesture(ids) {
        const start = new Map(ids.map((id) => [id, this.pointers.get(id) ?? { x: 0, y: 0 }]));
        this.gesture = { ids, start, last: new Map(start), scroll: [this.host.scroll.scrollLeft, this.host.scroll.scrollTop] };
    }
    move(e) {
        if (!this.active)
            return;
        if (this.pointers.has(e.pointerId))
            this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (this.gesture?.ids.includes(e.pointerId)) {
            e.stopPropagation();
            this.gesture.last.set(e.pointerId, { x: e.clientX, y: e.clientY });
            const g = this.gesture, centre = (m) => {
                const pts = g.ids.map((id) => m.get(id) ?? m.get(g.ids[0]));
                return [pts.reduce((s, p) => s + p.x, 0) / pts.length, pts.reduce((s, p) => s + p.y, 0) / pts.length];
            };
            const [sx, sy] = centre(g.start), [lx, ly] = centre(g.last);
            this.host.scroll.scrollLeft = g.scroll[0] - (lx - sx);
            this.host.scroll.scrollTop = g.scroll[1] - (ly - sy);
            return;
        }
        if (!this.live || e.pointerId !== this.live.id)
            return;
        e.stopPropagation();
        const events = typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : [];
        for (const one of events.length ? events : [e])
            this.add(one);
        this.schedule();
    }
    up(e) {
        this.pointers.delete(e.pointerId);
        if (!this.active)
            return;
        if (this.gesture?.ids.includes(e.pointerId)) {
            e.stopPropagation();
            const g = this.gesture;
            if (g.ids.length === 2) {
                const d = (m) => {
                    const [a, b] = g.ids.map((id) => m.get(id));
                    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
                };
                const ratio = pinchRatio(d(g.start), d(g.last));
                if (ratio !== 1) {
                    this.host.editor.zoom(this.host.editor.document.zoom * ratio);
                    this.host.committed();
                }
            }
            this.gesture = null;
            return;
        }
        if (!this.live || e.pointerId !== this.live.id)
            return;
        e.stopPropagation();
        if (e.type === "pointercancel") {
            this.cancel();
            return;
        }
        this.add(e);
        this.stopHold();
        const points = this.live.points;
        this.live = null;
        this.scratch = null;
        this.unschedule();
        try {
            const layer = this.host.session.commit(points);
            this.host.status(`${BRUSH_NAMES[brushOf(layer)]} stroke added. Undo takes back this stroke only.`);
        }
        catch (error) {
            this.host.status(error instanceof Error ? error.message : String(error));
        }
        this.host.committed();
    }
    add(e) {
        if (!this.live)
            return;
        const on = photoPoint(this.host.canvas.getBoundingClientRect(), e.clientX, e.clientY);
        this.live.last = on;
        // The canvas shows the cropped picture; strokes are kept in shares of the uncropped photo.
        const g = this.live.after?.g, { width, height } = this.host.editor.source.image;
        const at = g ? outputShareToSource(width, height, g, on) : on;
        if (!at)
            return;
        this.live.points.push({ x: at[0], y: at[1], pressure: pressureOf(e) });
    }
    /** Start a stroke: the picture below the brush layer, and for the mixing brushes the brush's
     * effect over the whole photo, so the live stroke only has to mix the two. */
    begin(e) {
        const { session, editor } = this.host;
        const target = session.target();
        const layers = editor.document.layers;
        const index = target ? layers.findIndex((l) => l.id === target.id) : -1;
        const after = this.after();
        const below = index >= 0 ? renderLayers(editor.source, layers.slice(0, index)) : editor.rendered();
        const under = after ? below.beforeGeometry ?? below.image : below.image;
        const s = session.settings;
        const amount = (target?.strength ?? START_STRENGTH[s.brush]) / 100;
        let full = null, old = null;
        const { width, height } = under;
        const strokes = target ? strokesOf(target) : [];
        if (MIX_LIVE.has(s.brush)) {
            const ones = floatImage(width, height, 1);
            ones.data.fill(1);
            const face = editor.source.face?.length === 478 ? editor.source.face : undefined;
            const iod = face ? eyeDistance(face) : fallbackIod(width, height);
            full = s.brush === "smooth" ? smooth(under, ones, amount, { iod }) : s.brush === "details" ? details(under, ones, amount)
                : s.brush === "blur" ? blurPainted(under, ones, amount) : colourPainted(under, ones, amount, target ? String(target.parameters.colour) : s.colour);
        }
        if (s.brush !== "reshape")
            old = buildMask(strokes, width, height, s.brush === "relight" ? ["dodge", "burn"] : ["paint"], snapPlanes({ width, height, face: editor.source.face, hair: editor.source.hair }, strokes));
        this.live = { id: e.pointerId, points: [], under, full, old, after, last: null };
        this.add(e);
        this.schedule();
        if (s.mode === "bloat" || s.mode === "pinch") {
            this.holdTimer = setInterval(() => {
                const last = this.live?.points[this.live.points.length - 1];
                if (last) {
                    this.live.points.push({ ...last });
                    this.schedule();
                }
            }, HOLD_MS);
        }
    }
    /** Drop a pending live frame (scheduled with requestAnimationFrame, or a timer where there is none). */
    unschedule() {
        if (!this.raf)
            return;
        if (typeof cancelAnimationFrame === "function")
            cancelAnimationFrame(this.raf);
        else
            clearTimeout(this.raf);
        this.raf = 0;
    }
    schedule() {
        if (this.raf)
            return;
        const run = () => { this.raf = 0; try {
            this.drawLive();
        }
        catch (error) {
            this.host.status(error instanceof Error ? error.message : String(error));
        } };
        this.raf = typeof requestAnimationFrame === "function" ? requestAnimationFrame(run) : setTimeout(run, 16);
    }
    /** The live picture of the stroke so far. */
    liveImage() {
        const live = this.live;
        if (!live || !live.points.length)
            return null;
        const { session, editor } = this.host;
        const s = session.settings, target = session.target();
        const stroke = session.stroke(live.points);
        const { width, height } = live.under;
        if (s.brush === "reshape") {
            const strokes = [...(target ? strokesOf(target) : []), stroke];
            const face = editor.source.face?.length === 478 ? editor.source.face : undefined;
            return reshape(live.under, strokes, { amount: (target?.strength ?? START_STRENGTH.reshape) / 100, face, fallbackIod: fallbackIod(width, height) }).image;
        }
        const snap = stroke.snap === "none" ? null : snapPlanes({ width, height, face: editor.source.face, hair: editor.source.hair }, [stroke])[stroke.snap] ?? new Float32Array(width * height);
        const cover = strokeCoverage(stroke, width, height, snap);
        const erase = stroke.mode === "erase";
        const planes = this.planes(width, height);
        const old = live.old?.data ?? planes.zero;
        const mask = planes.mask;
        for (let i = 0; i < mask.length; i++)
            mask[i] = erase ? old[i] * (1 - cover[i]) : old[i] + cover[i] * (1 - old[i]);
        if (live.full)
            return mixWeighted(live.under, live.full.data, mask);
        if (s.brush === "relight" && target) {
            // Old dodge and burn from the layer, plus the live stroke in its own mode.
            const all = [...strokesOf(target), stroke], snaps = snapPlanes({ width, height, face: editor.source.face, hair: editor.source.hair }, all);
            return relightPainted(live.under, buildMask(all, width, height, ["dodge"], snaps), buildMask(all, width, height, ["burn"], snaps), target.strength / 100);
        }
        if (s.brush === "relight") {
            const m = planes.m, none = planes.none;
            m.data.set(mask);
            return relightPainted(live.under, stroke.mode === "dodge" ? m : none, stroke.mode === "burn" ? m : none, START_STRENGTH.relight / 100);
        }
        // Heal and whiten fill or measure the whole painted spot, so while painting the spot is tinted.
        const shot = editor.rendered();
        return tinted(live.after ? shot.beforeGeometry ?? shot.image : shot.image, mask, TINT, 0.45);
    }
    drawLive() {
        const image = this.liveImage();
        if (!image || !this.live)
            return;
        const after = this.live.after;
        this.blit(this.shown(image, after));
        const last = this.live.last;
        const ctx = this.host.canvas.getContext("2d");
        if (!ctx || !last)
            return;
        // Brush radius in source pixels, then in canvas pixels through the crop's own scale.
        const across = after?.g ? cropRect(image.width, image.height, after.g).w : image.width;
        const r = radiusPx(this.host.session.settings, image.width, image.height) * this.host.canvas.width / across;
        ctx.save();
        ctx.lineWidth = 2;
        ctx.strokeStyle = PHOTO_MARK.halo;
        ctx.beginPath();
        ctx.arc(last[0] * this.host.canvas.width, last[1] * this.host.canvas.height, r, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.lineWidth = 1;
        ctx.strokeStyle = PHOTO_MARK.core;
        ctx.stroke();
        ctx.restore();
    }
    /** Draw a photo-size picture over the whole canvas, at the canvas's own scale. */
    blit(image) {
        const off = this.offscreen;
        off.width = image.width;
        off.height = image.height;
        off.getContext("2d")?.putImageData(new ImageData(new Uint8ClampedArray(toRGBA(image)), image.width, image.height), 0, 0);
        const ctx = this.host.canvas.getContext("2d");
        ctx?.drawImage(off, 0, 0, this.host.canvas.width, this.host.canvas.height);
    }
    /** After the Studio paints the photo: tint the brush's mask (Freeze in amber) when Show mask is
     * on. The tint is laid over what the Studio drew, so its labels stay. */
    overlay() {
        if (!this.active || this.live || !this.host.session.settings.showMask)
            return;
        const target = this.host.session.target();
        if (!target)
            return;
        const { width, height } = this.host.editor.source.image;
        const strokes = strokesOf(target);
        const reshaping = brushOf(target) === "reshape";
        const modes = brushOf(target) === "relight" ? ["dodge", "burn"] : ["paint"];
        const mask = reshaping ? strokeField(strokes, width, height).freeze
            : buildMask(strokes, width, height, modes, snapPlanes({ width, height, face: this.host.editor.source.face, hair: this.host.editor.source.hair }, strokes)).data;
        const tint = reshaping ? FREEZE_TINT : TINT;
        // The mask is in source pixels; the canvas shows the picture after the crop.
        const shown = maskThroughCrop(mask, width, height, this.after()?.g ?? null);
        const n = shown.width * shown.height, rgba = new Uint8ClampedArray(n * 4);
        for (let i = 0; i < n; i++) {
            rgba[i * 4] = tint[0];
            rgba[i * 4 + 1] = tint[1];
            rgba[i * 4 + 2] = tint[2];
            rgba[i * 4 + 3] = Math.round(255 * MASK_SHARE * Math.min(1, Math.max(0, shown.data[i])));
        }
        const off = this.offscreen;
        off.width = shown.width;
        off.height = shown.height;
        off.getContext("2d")?.putImageData(new ImageData(rgba, shown.width, shown.height), 0, 0);
        this.host.canvas.getContext("2d")?.drawImage(off, 0, 0, this.host.canvas.width, this.host.canvas.height);
    }
}
//# sourceMappingURL=painter.js.map