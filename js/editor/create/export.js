import { pictureOf } from "./assets.js";
import { pageGeometry, renderPage } from "./render.js";
/** One reusable drawing sheet (renderPage asks for a sheet per drawing layer and is done with it
 * before it asks again), so a redraw doesn't leave a new canvas behind for every drawing layer.
 * `release` empties it: a canvas holds its pixel memory until its size is set to 0, and some
 * browsers cap the total canvas memory a page may hold. */
export function sheetPool(doc = document) {
    let canvas = null, ctx = null;
    return {
        sheet(w, h) {
            if (!canvas) {
                canvas = doc.createElement("canvas");
                ctx = canvas.getContext("2d");
            }
            if (!ctx)
                return null;
            if (canvas.width !== w || canvas.height !== h) {
                canvas.width = w;
                canvas.height = h;
            }
            else {
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.clearRect(0, 0, w, h);
            }
            return { ctx, source: canvas };
        },
        release() { if (canvas) {
            canvas.width = 0;
            canvas.height = 0;
        } canvas = null; ctx = null; },
    };
}
/** Let a canvas go: its pixel memory is freed now rather than whenever it is collected. */
export function releaseCanvas(canvas) {
    if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
    }
}
/** Whether the saved page shows the Studio's edited photo (so its simulation label applies). */
export function showsEditedPhoto(doc) {
    return !doc.board || doc.board.cells.some((c) => c.asset === "edited");
}
/** The page as a canvas at full resolution. */
export async function burnCreate(doc, photo, assets, d = document) {
    await assets.ready();
    const g = pageGeometry(doc, photo);
    const canvas = d.createElement("canvas");
    canvas.width = g.pixels.width;
    canvas.height = g.pixels.height;
    const ctx = canvas.getContext("2d");
    if (!ctx)
        throw new Error("This browser has no 2D canvas.");
    // The page at full size can be 12 MP: the photo's own canvas and the drawing sheet are
    // released as soon as the page is drawn, so a save doesn't hold them until the next collection.
    const sheets = sheetPool(d), base = pictureOf(photo, d);
    try {
        renderPage({ ctx, assets, sheet: sheets.sheet }, doc, { base, scale: 1 });
    }
    finally {
        sheets.release();
        releaseCanvas(base.source);
    }
    return canvas;
}
//# sourceMappingURL=export.js.map