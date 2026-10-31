/**
 * The Face map screen: the first panel for any photo (Skin Moment's photo step, after consent,
 * and the Studio for a new photo). The photo with the face mesh drawn on it (thin lines, can be
 * turned off), the named regions lit on hover or tap, the photo checks, and the face symmetry
 * score with a bar per region and the two mirrored halves.
 *
 * Every number comes from the shared map (face/map-reader.ts), read once per photo on this
 * device; the mirror check reads the flipped photo once more, also on this device. Nothing is
 * uploaded. Author: John Khan.
 */
import { h } from "../dom.js";
import { delaunay, edges } from "../engines/warp/triangulate.js";
import { CONTOURS } from "../data/regions/index.js";
import { toRGBA } from "../engines/core/buffer.js";
import { REGION_TITLES, regionAt } from "../face/map.js";
import { faceMapFor, mirrorCheck } from "../face/map-reader.js";
import { SYMMETRY_NOTE, TYPICAL_RANGE } from "../face/symmetry-score.js";
/** The shared-map key for a Studio photo: its id and size (a new photo or a resize is a new map). */
export function studioMapKey(source) {
    return `studio:${source.id}:${source.image.width}x${source.image.height}`;
}
const MESH_KEY = "beljour.facemap.mesh";
function meshPreferred() {
    try {
        return globalThis.localStorage?.getItem(MESH_KEY) !== "off";
    }
    catch {
        return true;
    }
}
function rememberMesh(on) {
    try {
        globalThis.localStorage?.setItem(MESH_KEY, on ? "on" : "off");
    }
    catch { /* a preference only */ }
}
/** The photo as a canvas at its own size. */
function photoCanvas(source) {
    const c = document.createElement("canvas");
    const bytes = source.channels !== undefined && source.data !== undefined;
    if (bytes) {
        const img = source;
        c.width = img.width;
        c.height = img.height;
        c.getContext("2d")?.putImageData(new ImageData(Uint8ClampedArray.from(toRGBA(img)), img.width, img.height), 0, 0);
    }
    else {
        const el = source;
        c.width = el instanceof HTMLImageElement ? el.naturalWidth : el.width;
        c.height = el instanceof HTMLImageElement ? el.naturalHeight : el.height;
        c.getContext("2d")?.drawImage(el, 0, 0);
    }
    return c;
}
/** Mesh lines: a triangulation of the 468 surface points, keeping only short edges so the mesh
 * follows the face and never bridges an open mouth or eye. Kept per map. */
const meshCache = new WeakMap();
export function meshEdges(map) {
    const held = meshCache.get(map);
    if (held || !map.points)
        return held ?? [];
    const pts = map.points.slice(0, 468);
    const pupil = Math.hypot(map.points[468][0] - map.points[473][0], map.points[468][1] - map.points[473][1]);
    // An edge between two points of the same eye or inner-lip outline that are not neighbours on it
    // would cross the opening, so it is left out: the eye and mouth stay open.
    const loops = [CONTOURS.right_eye, CONTOURS.left_eye, CONTOURS.lips_inner];
    const across = (a, b) => loops.some((loop) => {
        const i = loop.indexOf(a), j = loop.indexOf(b);
        return i >= 0 && j >= 0 && Math.abs(i - j) !== 1 && Math.abs(i - j) !== loop.length - 1;
    });
    const all = edges(delaunay(pts)).filter(([a, b]) => Math.hypot(pts[a][0] - pts[b][0], pts[a][1] - pts[b][1]) < pupil * 0.42 && !across(a, b));
    meshCache.set(map, all);
    return all;
}
function tracePolygon(g, loop) {
    g.moveTo(loop[0][0], loop[0][1]);
    for (const [x, y] of loop.slice(1))
        g.lineTo(x, y);
    g.closePath();
}
function drawOverlay(canvas, map, mesh, lit) {
    const g = canvas.getContext("2d");
    if (!g || !map.points)
        return;
    g.clearRect(0, 0, canvas.width, canvas.height);
    const unit = Math.max(0.6, Math.min(canvas.width, canvas.height) / 640);
    if (mesh) {
        g.lineWidth = 0.7 * unit;
        g.strokeStyle = "rgba(255, 255, 255, 0.5)";
        g.beginPath();
        for (const [a, b] of meshEdges(map)) {
            g.moveTo(map.points[a][0], map.points[a][1]);
            g.lineTo(map.points[b][0], map.points[b][1]);
        }
        g.stroke();
        g.fillStyle = "rgba(255, 255, 255, 0.85)";
        for (const i of [468, 473]) {
            g.beginPath();
            g.arc(map.points[i][0], map.points[i][1], 1.6 * unit, 0, Math.PI * 2);
            g.fill();
        }
    }
    if (map.symmetry.ok && mesh) {
        const line = map.symmetry.midline, reach = Math.hypot(canvas.width, canvas.height) * 0.22;
        g.save();
        g.setLineDash([5 * unit, 4 * unit]);
        g.lineWidth = 1.2 * unit;
        g.strokeStyle = "rgba(242, 194, 122, 0.95)";
        g.beginPath();
        g.moveTo(line.cx - line.dx * reach, line.cy - line.dy * reach);
        g.lineTo(line.cx + line.dx * reach, line.cy + line.dy * reach);
        g.stroke();
        g.restore();
    }
    if (lit) {
        g.beginPath();
        for (const loop of lit.polygons)
            tracePolygon(g, loop);
        g.fillStyle = "rgba(231, 182, 200, 0.38)";
        g.fill("evenodd");
        g.lineWidth = 1.6 * unit;
        g.strokeStyle = "rgba(255, 236, 244, 0.95)";
        g.stroke();
    }
}
/** One mirrored half: the photo turned so the midline is upright, one side kept and mirrored
 * onto the other. `side` is the photo side that is kept. */
export function mirroredHalf(photo, map, side, outWidth = 240) {
    const out = document.createElement("canvas");
    if (!map.points || !map.symmetry.ok)
        return out;
    const line = map.symmetry.midline;
    const oval = map.regions.find((r) => r.name === "face_oval")?.polygons[0] ?? map.points;
    const xs = oval.map((p) => p[0]), ys = oval.map((p) => p[1]);
    const faceW = Math.max(...xs) - Math.min(...xs), faceH = Math.max(...ys) - Math.min(...ys);
    const scale = outWidth / (faceW * 1.35);
    out.width = outWidth;
    out.height = Math.round(faceH * 1.3 * scale);
    const turned = document.createElement("canvas");
    turned.width = out.width;
    turned.height = out.height;
    const t = turned.getContext("2d"), o = out.getContext("2d");
    if (!t || !o)
        return out;
    // midline direction (dx, dy) goes to straight down: rotate by atan2(dx, dy)
    const midY = (Math.min(...ys) + Math.max(...ys)) / 2;
    const along = (midY - line.cy) / (line.dy || 1);
    const ax = line.cx + line.dx * along, ay = line.cy + line.dy * along;
    t.translate(out.width / 2, out.height / 2);
    t.rotate(Math.atan2(line.dx, line.dy));
    t.scale(scale, scale);
    t.translate(-ax, -ay);
    t.drawImage(photo, 0, 0);
    const half = out.width / 2;
    o.save();
    o.beginPath();
    o.rect(side === "left" ? 0 : half, 0, half, out.height);
    o.clip();
    o.drawImage(turned, 0, 0);
    o.restore();
    o.save();
    o.beginPath();
    o.rect(side === "left" ? half : 0, 0, half, out.height);
    o.clip();
    o.translate(out.width, 0);
    o.scale(-1, 1);
    o.drawImage(turned, 0, 0);
    o.restore();
    return out;
}
const CHECK_MARK = { pass: "✓", warn: "!", fail: "✕" };
function checksList(map) {
    return h("ul", { class: "fm-checks" }, ...map.quality.checks.map((c) => h("li", { class: `fm-check fm-${c.level}`, "data-check": c.id }, h("span", { class: "fm-check-mark", "aria-hidden": "true" }, CHECK_MARK[c.level]), h("span", {}, h("strong", {}, c.title), h("span", { class: "visually-hidden" }, c.level === "pass" ? ": passed. " : c.level === "warn" ? ": could be better. " : ": not met. "), h("span", { class: "fm-check-text" }, c.message)))));
}
function scale(score) {
    const [lo, hi] = TYPICAL_RANGE;
    return h("div", { class: "fm-scale", "aria-hidden": "true" }, h("span", { class: "fm-scale-band", style: `left:${lo}%;width:${hi - lo}%` }), h("span", { class: "fm-scale-mark", style: `left:${score}%` }));
}
function symmetryBlock(map, result, mirror, halves, level, withMirror = false) {
    const title = h(`h${level}`, { class: "fm-h" }, "Face symmetry");
    if (!result.ok) {
        return h("section", { class: "fm-sym fm-sym-refused", "data-symmetry": "refused", "data-code": result.code }, title, h("p", { class: "fm-refusal", role: "status" }, result.message), h("p", { class: "fm-fine" }, SYMMETRY_NOTE));
    }
    return h("section", { class: "fm-sym", "data-symmetry": String(result.score) }, title, h("div", { class: "fm-score-row" }, h("p", { class: "fm-score", "aria-label": `Symmetry ${result.score} out of 100 in this photo` }, String(result.score), h("span", { class: "fm-score-of" }, "/100")), h("div", { class: "fm-score-side" }, scale(result.score), h("p", { class: "fm-range" }, `Most faces: ${TYPICAL_RANGE[0]}–${TYPICAL_RANGE[1]}. `, h("span", { class: "fm-range-turn" }, `This photo: ${result.range[0]}–${result.range[1]}, allowing for a one-degree head turn${withMirror ? " and the mirror check" : ""}.`)))), h("p", { class: "fm-fine" }, SYMMETRY_NOTE), h("ul", { class: "fm-bars", "aria-label": "Symmetry by part of the face" }, ...result.regions.map((r) => h("li", { class: "fm-bar", "data-region": r.name }, h("span", { class: "fm-bar-name" }, r.label), h("span", { class: "fm-bar-track", "aria-hidden": "true" }, h("span", { class: "fm-bar-fill", style: `width:${r.score}%` })), h("span", { class: "fm-bar-score" }, String(r.score)), h("span", { class: "fm-bar-side" }, r.side)))), mirror, halves, h("p", { class: "fm-fine" }, `Measured from ${map.points ? 478 : 0} face points after levelling a ${Math.abs(result.rollDegrees)}° head tilt; distances are in pupil-to-pupil units. "Photo-left" is the left of the picture as you look at it.`));
}
/** Mount the Face map for one photo. Returns at once; the panel fills in when the map is ready. */
export function faceMapPanel(options) {
    const level = options.level ?? 2;
    const sub = (level + 1);
    const status = h("p", { class: "fm-status", role: "status", "aria-live": "polite" }, "Mapping the face on this device…");
    const root = h("section", { class: "fm", "aria-label": "Face map", "data-state": "reading" }, h("div", { class: "fm-head" }, h(`h${level}`, { class: "fm-title" }, "Face map"), h("span", { class: "fm-badge" }, "On this device")), h("p", { class: "fm-lead" }, "The first step for any photo: 478 points on the face, the parts of the face named, and a check that the photo is clear. Every tool uses this one map."), status);
    void build();
    return root;
    async function build() {
        let map;
        try {
            map = await faceMapFor(options.source, { key: options.key });
        }
        catch (e) {
            status.textContent = e instanceof Error ? e.message : "The face could not be mapped here.";
            root.dataset.state = "error";
            return;
        }
        options.onMap?.(map);
        root.dataset.state = map.status;
        if (map.status !== "mapped" || !map.points) {
            status.textContent = map.reason;
            status.classList.add("fm-status-none");
            return;
        }
        status.textContent = "";
        status.hidden = true;
        const photo = photoCanvas(options.source);
        photo.className = "fm-photo";
        photo.setAttribute("role", "img");
        photo.setAttribute("aria-label", `${options.label} with the face map drawn on it`);
        const overlay = h("canvas", { class: "fm-overlay", width: String(photo.width), height: String(photo.height), "aria-hidden": "true" });
        let mesh = meshPreferred(), lit = null, pinned = null;
        const redraw = () => drawOverlay(overlay, map, mesh, lit ?? pinned);
        const meshBox = h("input", { type: "checkbox", id: `fm-mesh-${options.key.replace(/[^a-z0-9]/gi, "")}`, checked: mesh });
        meshBox.addEventListener("change", () => { mesh = meshBox.checked; rememberMesh(mesh); redraw(); });
        const said = h("p", { class: "fm-region-said", "aria-live": "polite" });
        const chips = h("div", { class: "fm-chips", role: "group", "aria-label": "Parts of the face" }, ...map.regions.map((r) => {
            const b = h("button", { type: "button", class: "fm-chip", "data-region": r.name, "aria-pressed": "false" }, REGION_TITLES[r.name]);
            b.addEventListener("pointerenter", () => { lit = r; redraw(); });
            b.addEventListener("pointerleave", () => { lit = null; redraw(); });
            b.addEventListener("focus", () => { lit = r; redraw(); });
            b.addEventListener("blur", () => { lit = null; redraw(); });
            b.addEventListener("click", () => select(pinned === r ? null : r));
            return b;
        }));
        const select = (r) => {
            pinned = r;
            for (const b of chips.querySelectorAll("button"))
                b.setAttribute("aria-pressed", String(b.dataset.region === r?.name));
            said.textContent = r ? `${r.title}${r.name === "forehead" ? (map.hairline === "hair segmenter" ? ", up to the hairline the hair reader found" : ", up to the top of the face mesh (no hair reader in this build)") : ""}.` : "";
            redraw();
        };
        const stage = h("div", { class: "fm-canvas" }, photo, overlay);
        stage.addEventListener("click", (event) => {
            const rect = photo.getBoundingClientRect();
            const x = ((event.clientX - rect.left) / rect.width) * photo.width, y = ((event.clientY - rect.top) / rect.height) * photo.height;
            select(regionAt(map, x, y));
        });
        stage.addEventListener("pointermove", (event) => {
            if (event.pointerType !== "mouse")
                return;
            const rect = photo.getBoundingClientRect();
            const found = regionAt(map, ((event.clientX - rect.left) / rect.width) * photo.width, ((event.clientY - rect.top) / rect.height) * photo.height);
            if (found !== lit) {
                lit = found;
                redraw();
            }
        });
        stage.addEventListener("pointerleave", () => { lit = null; redraw(); });
        redraw();
        const mirror = h("p", { class: "fm-mirror", role: "status" }, map.symmetry.ok ? "Checking the score on the mirrored photo…" : "");
        const halves = map.symmetry.ok ? h("div", { class: "fm-halves" }, h("figure", {}, mirroredHalf(photo, map, "left"), h("figcaption", {}, "Photo-left side, mirrored")), h("figure", {}, mirroredHalf(photo, map, "right"), h("figcaption", {}, "Photo-right side, mirrored"))) : h("div");
        for (const c of halves.querySelectorAll("canvas")) {
            c.setAttribute("role", "img");
            c.setAttribute("aria-label", c.nextElementSibling?.textContent ?? "Mirrored half");
        }
        let sym = symmetryBlock(map, map.symmetry, mirror, halves, sub);
        const pose = map.pose ? `Head turned about ${Math.abs(Math.round(map.pose.yawDegrees))}° from facing the camera.` : "";
        root.append(h("div", { class: "fm-grid" }, h("figure", { class: "fm-stage" }, stage, h("div", { class: "fm-tools" }, h("label", { class: "fm-toggle", for: meshBox.id }, meshBox, h("span", {}, "Show the mesh")), chips, said), h("figcaption", { class: "fm-caption" }, `${options.label}. ${pose}`)), h("div", { class: "fm-side" }, h("section", { class: "fm-checks-box" }, h(`h${sub}`, { class: "fm-h" }, "Photo checks"), h("p", { class: `fm-verdict fm-verdict-${map.quality.ok ? "ok" : "no"}` }, map.quality.summary), checksList(map)), sym)));
        root.dataset.ready = "1";
        if (!map.symmetry.ok)
            return;
        try {
            const checked = await mirrorCheck(options.source, { key: options.key });
            if (checked.mirrorScore === null || !checked.map.symmetry.ok) {
                mirror.textContent = "The mirrored photo could not be read, so the mirror check was skipped.";
                return;
            }
            const diff = Math.abs(checked.mirrorScore - map.symmetry.score);
            mirror.textContent = `Mirror check: the same photo flipped left to right reads ${checked.mirrorScore} (${diff === 0 ? "the same" : `${diff} point${diff === 1 ? "" : "s"} apart`}). The method treats both sides alike; the gap is the face reader's own wobble.`;
            mirror.dataset.mirror = String(checked.mirrorScore);
            const next = symmetryBlock(map, checked.map.symmetry, mirror, halves, sub, true);
            sym.replaceWith(next);
            sym = next;
        }
        catch {
            mirror.textContent = "The mirror check could not run here.";
        }
    }
}
