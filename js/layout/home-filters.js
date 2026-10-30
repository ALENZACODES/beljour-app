/** Home filter gallery: a live preview of each filter, drawn on this device on one AI-generated
 * example person, so the gallery shows what each look does. The names and links are static HTML
 * written from the registry (scripts/home_hub.py); this only adds pictures, a strip at a time as
 * it scrolls into view, one filter per idle slot. Without it (or if the image can't load) the
 * gallery still works as a list of names. Nothing is sent anywhere. Author: John Khan.
 */
import { catalogue } from "../filters/recipe/registry.js";
import { render } from "../filters/runtime/engine.js";
export const SAMPLE = "assets/skin-moment/faces/face-02-day0.png";
const W = 96, H = 120;
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
function paint(doc, link, base) {
    const id = link.dataset.filter ?? "";
    const books = catalogue();
    if (!books.has(id))
        return;
    const image = { width: W, height: H, channels: 4, data: base.data };
    const strength = books.get(id).defaults.strength;
    let out;
    // A background-only look needs a person outline, which the gallery has none of: the preview
    // then shows the colour look over the whole frame.
    try {
        out = render(image, id, { strength });
    }
    catch {
        out = render(image, id, { strength, backgroundOnly: false });
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