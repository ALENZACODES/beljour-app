/** Deliberately approximate photo-local colour simulation; no trained models.
 * When the photo's face is mapped on this device (the 478-point face map), the areas follow
 * that mesh: foundation fills the face outline less eyes, brows and lips; blush sits on the
 * mapped cheeks; lip colour fills the outer lip line less the mouth opening. Without a mapped
 * face it falls back to a fixed portrait layout (as in the coarse Python commerce preview);
 * landmarks are never guessed. In the browser the layout is feathered, foundation
 * and blush only touch pixels whose colour is close to the photo's own central skin,
 * and colour moves by ratio so skin texture stays. A full face try-on needs a
 * validated segmentation model or the consented YouCam API.
 * Author: John Khan.
 */
import { applyGuard, PixelGuard } from "./identity.js";
import { DEFAULT_LOCK, toLegacy, validateLevel } from "./strength.js";
import { CONTOURS } from "../data/regions/index.js";
import { CHEEK_LEFT, CHEEK_RIGHT } from "../face/map.js";
export function maskShapes(category) {
    if (category === "complexion")
        return [
            { cx: 0.50, cy: 0.50, rx: 0.21, ry: 0.29, mode: "add" },
            { cx: 0.395, cy: 0.415, rx: 0.06, ry: 0.032, mode: "subtract" },
            { cx: 0.605, cy: 0.415, rx: 0.06, ry: 0.032, mode: "subtract" },
            { cx: 0.50, cy: 0.612, rx: 0.07, ry: 0.035, mode: "subtract" },
        ];
    if (category === "cheek")
        return [
            { cx: 0.39, cy: 0.505, rx: 0.065, ry: 0.042, mode: "add" },
            { cx: 0.61, cy: 0.505, rx: 0.065, ry: 0.042, mode: "add" },
        ];
    if (category === "lip")
        return [{ cx: 0.5, cy: 0.612, rx: 0.058, ry: 0.022, mode: "add" }];
    return [];
}
/** Feather radius as a share of the shorter photo side. */
export const FEATHER = 0.022;
/** Lips are thin, so their edge is feathered much less. */
export const LIP_FEATHER = 0.006;
/** Full-strength opacity per category; blush stays a flush rather than a painted patch. */
const OPACITY = { complexion: 0.38, cheek: 0.35, lip: 0.55 };
/** Colour ratios are capped so a far-off sample shade previews strongly but not as paint. */
const RATIO_MIN = 0.5, RATIO_MAX = 1.8;
function hexRgb(hex) {
    const v = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!v)
        throw Error("The sample swatch is not a colour.");
    const n = parseInt(v[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function smoothstep(a, b, x) {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
}
const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
/** Per-channel median of the masked area's centre: lips for lip colour, central cheek skin otherwise. */
function referenceColour(data, weights, w, h, category, placed = null) {
    const fixed = category === "lip" ? { x0: 0.46, x1: 0.54, y0: 0.60, y1: 0.625 } : { x0: 0.40, x1: 0.60, y0: 0.50, y1: 0.58 };
    const boxes = placed ? placed.samples : [{ x0: fixed.x0 * w, x1: fixed.x1 * w, y0: fixed.y0 * h, y1: fixed.y1 * h }];
    const ch = [[], [], []];
    const step = Math.max(1, Math.round(Math.min(w, h) / 200));
    for (const box of boxes) {
        for (let y = Math.max(0, Math.floor(box.y0)); y < Math.min(h, Math.ceil(box.y1)); y += step) {
            for (let x = Math.max(0, Math.floor(box.x0)); x < Math.min(w, Math.ceil(box.x1)); x += step) {
                const i = (y * w + x) * 4;
                if (category === "lip" && weights[i + 3] < 128)
                    continue;
                for (let c = 0; c < 3; c += 1)
                    ch[c].push(data[i + c]);
            }
        }
    }
    if (!ch[0].length)
        return [180, 140, 120];
    return ch.map((v) => { v.sort((a, b) => a - b); return Math.max(8, v[v.length >> 1]); });
}
/** How close a pixel is to the reference skin, by brightness ratio and chromaticity. */
function skinLikeness(r, g, b, ref, refY) {
    const y = Math.max(1, luma(r, g, b));
    const ratio = y / refY;
    // Dark pixels (brows, lashes, hair) are left alone; highlights are skin and are kept in.
    const lum = smoothstep(0.4, 0.65, ratio) * (1 - smoothstep(2.2, 2.8, ratio));
    // Speculars wash toward white, so chroma is judged against a reference pulled toward grey as brightness rises.
    const wash = smoothstep(1.1, 1.8, ratio);
    const dr = r / y - (ref[0] / refY) * (1 - wash) - wash, db = b / y - (ref[2] / refY) * (1 - wash) - wash;
    return lum * (1 - smoothstep(0.1, 0.22, Math.hypot(dr, db)));
}
/** Ratio move; lightening is limited by the headroom left, so highlights never clip to white. */
function move(v, k) {
    return k <= 1 ? v * k : Math.min(v * k, v + (255 - v) * HEADROOM * (k - 1));
}
const HEADROOM = 0.85;
/** Moves masked pixels toward the swatch by ratio, which keeps pores, freckles and shading. */
function tint(data, weights, swatch, opacity, skinOnly, ref) {
    const k = swatch.map((s, c) => Math.min(RATIO_MAX, Math.max(RATIO_MIN, s / ref[c])));
    const refY = Math.max(1, luma(...ref));
    for (let i = 0; i < data.length; i += 4) {
        const shape = weights[i + 3] / 255;
        if (shape <= 0)
            continue;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const a = opacity * shape * (skinOnly ? skinLikeness(r, g, b, ref, refY) : 1);
        if (a <= 0)
            continue;
        data[i] = r + a * (move(r, k[0]) - r);
        data[i + 1] = g + a * (move(g, k[1]) - g);
        data[i + 2] = b + a * (move(b, k[2]) - b);
    }
}
/** Feathers as shares of the distance between the eye centres. */
const MESH_FEATHER = { complexion: 0.12, cheek: 0.17, lip: 0.03 };
function centre(points, ids) {
    let x = 0, y = 0;
    for (const i of ids) {
        x += points[i][0];
        y += points[i][1];
    }
    return [x / ids.length, y / ids.length];
}
function loop(ctx, points, ids) {
    ctx.beginPath();
    ids.forEach((i, n) => (n ? ctx.lineTo(points[i][0], points[i][1]) : ctx.moveTo(points[i][0], points[i][1])));
    ctx.closePath();
}
/** Draws the category's area from the mesh into the mask; returns where to sample the base colour. */
function meshLayout(m, mesh, category, w, h) {
    const kx = w / mesh.width, ky = h / mesh.height;
    const pts = mesh.points.map(([x, y]) => [x * kx, y * ky]);
    const right = centre(pts, CONTOURS.right_eye), left = centre(pts, CONTOURS.left_eye);
    const iod = Math.hypot(left[0] - right[0], left[1] - right[1]);
    if (!(iod > 4) || !(category === "complexion" || category === "cheek" || category === "lip"))
        return null;
    const feather = Math.max(1, Math.round(MESH_FEATHER[category] * iod));
    const angle = Math.atan2(left[1] - right[1], left[0] - right[0]);
    const cheeks = [centre(pts, CHEEK_RIGHT), centre(pts, CHEEK_LEFT)];
    const r = 0.16 * iod;
    const samples = cheeks.map(([x, y]) => ({ x0: x - r, x1: x + r, y0: y - r, y1: y + r }));
    m.fillStyle = "#ffffff";
    m.strokeStyle = "#ffffff";
    m.lineJoin = "round";
    m.filter = `blur(${feather}px)`;
    if (category === "complexion") {
        m.globalCompositeOperation = "source-over";
        loop(m, pts, CONTOURS.face_oval);
        m.fill();
        m.globalCompositeOperation = "destination-out";
        for (const [ids, grow] of [[CONTOURS.right_eye, 0.14], [CONTOURS.left_eye, 0.14], [CONTOURS.right_brow, 0.05],
            [CONTOURS.left_brow, 0.05], [CONTOURS.lips_outer, 0.05]]) {
            loop(m, pts, ids);
            m.fill();
            m.lineWidth = grow * iod;
            m.stroke();
        }
    }
    else if (category === "cheek") {
        m.globalCompositeOperation = "source-over";
        for (const [x, y] of cheeks) {
            m.beginPath();
            m.ellipse(x, y, 0.42 * iod, 0.28 * iod, angle, 0, Math.PI * 2);
            m.fill();
        }
    }
    else {
        m.globalCompositeOperation = "source-over";
        loop(m, pts, CONTOURS.lips_outer);
        m.fill();
        m.globalCompositeOperation = "destination-out";
        loop(m, pts, CONTOURS.lips_inner);
        m.fill();
    }
    m.filter = "none";
    m.globalCompositeOperation = "source-over";
    return { samples };
}
function ellipse(ctx, geometry, w, h) {
    ctx.beginPath();
    ctx.ellipse(geometry.cx * w, geometry.cy * h, geometry.rx * w, geometry.ry * h, 0, 0, Math.PI * 2);
    ctx.fill();
}
export function renderLocal(source, product, strength, guard = new PixelGuard(), lockLevel = DEFAULT_LOCK, mesh = null) {
    if (!product.vto)
        throw Error("This item does not support visual try-on.");
    if (!Number.isInteger(strength) || strength < 0 || strength > 100)
        throw Error("Choose a valid strength.");
    const dest = document.createElement("canvas");
    dest.width = source.width;
    dest.height = source.height;
    const ctx = dest.getContext("2d");
    if (!ctx)
        throw Error("Your browser does not support this local preview.");
    ctx.drawImage(source, 0, 0);
    if (!strength) {
        const checked = guard.guard(source, dest, validateLevel(lockLevel));
        if (checked instanceof Promise)
            throw Error("Use renderLevelAsync for an asynchronous identity guard.");
        return checked.image;
    }
    const mask = document.createElement("canvas");
    mask.width = source.width;
    mask.height = source.height;
    const m = mask.getContext("2d");
    if (!m)
        throw Error("Could not make an overlay mask.");
    const placed = mesh && mesh.points.length >= 478 ? meshLayout(m, mesh, product.category, mask.width, mask.height) : null;
    if (!placed) {
        // Feathered fixed layout: soft edges instead of a hard painted oval.
        m.filter = `blur(${Math.max(1, Math.round((product.category === "lip" ? LIP_FEATHER : FEATHER) * Math.min(mask.width, mask.height)))}px)`;
        for (const shape of maskShapes(product.category)) {
            m.globalCompositeOperation = shape.mode === "subtract" ? "destination-out" : "source-over";
            m.fillStyle = "#ffffff";
            ellipse(m, shape, mask.width, mask.height);
        }
        m.filter = "none";
        m.globalCompositeOperation = "source-over";
    }
    const opacity = (strength / 100) * OPACITY[product.category];
    const pixels = ctx.getImageData(0, 0, dest.width, dest.height);
    const weights = m.getImageData(0, 0, mask.width, mask.height).data;
    tint(pixels.data, weights, hexRgb(product.swatch), opacity, product.category !== "lip", referenceColour(pixels.data, weights, dest.width, dest.height, product.category, placed));
    ctx.putImageData(pixels, 0, 0);
    const checked = guard.guard(source, dest, validateLevel(lockLevel));
    if (checked instanceof Promise)
        throw Error("Use renderLevelAsync for an asynchronous identity guard.");
    return checked.image;
}
/** Preferred level renderer: always validates tenths before legacy conversion. */
export function renderLevel(source, product, level, guard = new PixelGuard(), lockLevel = DEFAULT_LOCK, mesh = null) {
    return renderLocal(source, product, toLegacy(validateLevel(level)), guard, lockLevel, mesh);
}
/** Capped-size draft during input; full-resolution result comes on release. */
export function renderInteractive(source, product, level, guard = new PixelGuard(), lockLevel = DEFAULT_LOCK, mesh = null) {
    const maxEdge = 384;
    const ratio = Math.min(1, maxEdge / Math.max(source.width, source.height));
    const small = document.createElement("canvas");
    small.width = Math.max(1, Math.round(source.width * ratio));
    small.height = Math.max(1, Math.round(source.height * ratio));
    const ctx = small.getContext("2d");
    if (!ctx)
        throw Error("Cannot prepare low-resolution preview.");
    ctx.drawImage(source, 0, 0, small.width, small.height);
    return renderLevel(small, product, level, guard, lockLevel, mesh);
}
export async function renderLevelAsync(source, product, level, guard, lockLevel = DEFAULT_LOCK) {
    const raw = renderLocal(source, product, toLegacy(validateLevel(level)), new PixelGuard(), lockLevel);
    return (await applyGuard(source, raw, guard, lockLevel)).image;
}
export async function renderProviderResult(dataUrl, reference, guard = new PixelGuard(), lockLevel = DEFAULT_LOCK) {
    if (!/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(dataUrl) || dataUrl.length > 15_000_000) {
        throw Error("The preview image reply was not a supported bounded image.");
    }
    // Decode the bounded data URL locally; a data URL must never require a network request.
    const comma = dataUrl.indexOf(",");
    const encoded = dataUrl.slice(comma + 1);
    const decoded = atob(encoded);
    if (decoded.length > 11_000_000)
        throw Error("The preview image is too large to decode.");
    const bytes = new Uint8Array(decoded.length);
    for (let index = 0; index < decoded.length; index += 1)
        bytes[index] = decoded.charCodeAt(index);
    const mime = dataUrl.slice(5, dataUrl.indexOf(";"));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: mime }));
    try {
        if (bitmap.width * bitmap.height > 24_000_000)
            throw Error("Preview image exceeds the pixel limit.");
        const result = document.createElement("canvas");
        result.width = reference.width;
        result.height = reference.height;
        const context = result.getContext("2d");
        if (!context)
            throw Error("Could not display the result image.");
        context.drawImage(bitmap, 0, 0, result.width, result.height);
        return (await applyGuard(reference, result, guard, lockLevel)).image;
    }
    finally {
        bitmap.close();
    }
}
//# sourceMappingURL=local-render.js.map