/** Home filter gallery: a live preview of each filter, drawn on this device on one synthetic
 * example person, so the gallery shows what each look does. The names and links are static HTML
 * written from the registry (scripts/home_hub.py); this only adds pictures, a strip at a time as
 * it scrolls into view, one filter per idle slot. Without it (or if the image can't load) the
 * gallery still works as a list of names. Nothing is sent anywhere. Author: John Khan.
 *
 * r2: the gallery used to render with no masks, so the engine's no-skin fallback dropped every
 * skin-hue step (4 looks came out byte-identical to the original, median change 2.1). It now hands
 * the engine a SKIN mask for this one fixed sample crop, so every recipe runs all of its stages with
 * the engine's own skin guard and hue clamp, at the strength one tap gives in the Studio: the
 * recipe default through the Studio's own ease (lookStrength), so the gallery shows what a tap shows.
 * The mask is a soft ellipse over the face of this fixed crop: it is not a face detector and must be
 * re-checked if SAMPLE or the crop changes.
 */
import { floatImage } from "../engines/core/buffer.js";
import { NO_MASKS } from "../filters/masks/blend.js";
import { catalogue } from "../filters/recipe/registry.js";
import { render } from "../filters/runtime/engine.js";
import { lookStrength } from "../filters/runtime/layer.js";
export const SAMPLE = "assets/skin-moment/faces/face-02-day0.png";
const W = 96, H = 120;
/** Face of the fixed crop below, as shares of the tile (ASSUMED from the crop: centre-x, 12% down, 62% wide). */
export const FACE = { cx: 0.5, cy: 0.43, rx: 0.315, ry: 0.335 };
function idle(fn) {
    const ric = globalThis.requestIdleCallback;
    if (ric)
        ric(fn);
    else
        setTimeout(fn, 16);
}
/** The example face cropped to the thumbnail shape (centre of the frame), as RGBA bytes. */
async function sample(doc) {
    const img = new Image();
    img.decoding = "async";
    img.src = SAMPLE;
    try {
        await img.decode();
    }
    catch {
        return null;
    }
    const canvas = doc.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx)
        return null;
    const sw = img.naturalWidth * 0.62, sh = sw * (H / W);
    ctx.drawImage(img, (img.naturalWidth - sw) / 2, img.naturalHeight * 0.12, sw, sh, 0, 0, W, H);
    return ctx.getImageData(0, 0, W, H);
}
/** Soft skin mask for the fixed crop: 1 inside 0.6 of the ellipse (squared radius), smooth to 0 at 1.25. A narrower ramp
 * (0.78-1.1, as in r1) changed by up to 0.29 between neighbouring pixels at 96 px: a visible rim where the guard stops. */
export function galleryFaceMask(width = W, height = H) {
    const m = floatImage(width, height, 1);
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
            const nx = (x + 0.5 - width * FACE.cx) / (width * FACE.rx), ny = (y + 0.5 - height * FACE.cy) / (height * FACE.ry);
            const d = nx * nx + ny * ny, t = Math.min(1, Math.max(0, (1.25 - d) / 0.65));
            m.data[y * width + x] = t * t * (3 - 2 * t);
        }
    return m;
}
let masks = null;
/** The gallery's masks: a skin mask placed from the fixed crop's face geometry, so its source is
 * "landmarks" (an estimate from face position, not a segmenter). The person mask stays null:
 * Background-only looks fall back to the whole frame below, as before. */
export function galleryMasks() {
    const ready = masks ?? { ...NO_MASKS, skin: galleryFaceMask(), source: "landmarks" };
    masks = ready;
    return ready;
}
function paint(doc, link, base) {
    const id = link.dataset.filter ?? "";
    const books = catalogue();
    if (!books.has(id))
        return;
    const image = { width: W, height: H, channels: 4, data: base.data };
    // The strength one tap gives in the Studio (the default through the slider's ease), so the
    // gallery shows neither more nor less than a tap does.
    const strength = lookStrength(books.get(id).defaults.strength);
    const centre = [W * FACE.cx, H * FACE.cy];
    let out;
    // A background-only look needs a person outline, which the gallery has none of: the preview
    // then shows the colour look over the whole frame (the skin guard still protects the face).
    try {
        out = render(image, id, { strength }, galleryMasks(), centre);
    }
    catch {
        out = render(image, id, { strength, backgroundOnly: false }, galleryMasks(), centre);
    }
    const rgba = new ImageData(W, H);
    for (let i = 0, j = 0; i < W * H; i++, j += 3) {
        rgba.data[i * 4] = out.image.data[j];
        rgba.data[i * 4 + 1] = out.image.data[j + 1];
        rgba.data[i * 4 + 2] = out.image.data[j + 2];
        rgba.data[i * 4 + 3] = 255;
    }
    const canvas = doc.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    canvas.className = "hub-thumb";
    canvas.setAttribute("aria-hidden", "true");
    canvas.getContext("2d")?.putImageData(rgba, 0, 0);
    link.querySelector(".hub-swatch")?.replaceWith(canvas);
}
export function mountHomeFilters(doc = document) {
    const strips = [...doc.querySelectorAll("#filters .hub-filter-strip")];
    if (!strips.length || typeof ImageData === "undefined")
        return;
    let base = null;
    const draw = (strip) => {
        base ??= sample(doc);
        void base.then((data) => {
            if (!data)
                return;
            const queue = [...strip.querySelectorAll("a[data-filter]")];
            const next = () => {
                const link = queue.shift();
                if (!link)
                    return;
                try {
                    paint(doc, link, data);
                }
                catch { /* this filter keeps its plain swatch */ }
                idle(next);
            };
            idle(next);
        });
    };
    const IO = globalThis.IntersectionObserver;
    if (!IO) {
        strips.forEach(draw);
        return;
    }
    const seen = new IO((entries, observer) => {
        for (const e of entries)
            if (e.isIntersecting) {
                observer.unobserve(e.target);
                draw(e.target);
            }
    }, { rootMargin: "200px" });
    strips.forEach((s) => seen.observe(s));
}
//# sourceMappingURL=home-filters.js.map