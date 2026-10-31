/** Browser loading of the lens pictures that exist in this build (assets.ts, written at build
 * time), turned into square sprites for render.ts. A picture that fails to load is skipped and
 * its layer keeps the drawn fallback. Pictures are reduced to PICTURE_SIDE so a 1024 square
 * file costs no more per frame than the drawing. Author: John Khan.
 */
import { LENS_FILES } from "./assets.js";
import { lensSlots } from "./recipes.js";
export const LENS_DIR = "assets/lenses/";
export const PICTURE_SIDE = 256; // ASSUMED: enough detail for a prop on a 480 to 720 px frame
/** The listed files that a recipe uses (anything else in the folder is ignored). */
export function usableFiles(listed = LENS_FILES) {
    const known = new Set(lensSlots().map((s) => s.file));
    return listed.filter((f) => known.has(f));
}
async function loadOne(url) {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    try {
        await img.decode();
    }
    catch {
        return null;
    }
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = PICTURE_SIDE;
    const ctx = canvas.getContext("2d");
    if (!ctx)
        return null;
    ctx.drawImage(img, 0, 0, PICTURE_SIDE, PICTURE_SIDE);
    return { side: PICTURE_SIDE, data: ctx.getImageData(0, 0, PICTURE_SIDE, PICTURE_SIDE).data };
}
/** Load every usable picture once; the result answers render.ts's sprite lookups. */
export async function loadPictures(listed = LENS_FILES, dir = LENS_DIR) {
    const files = usableFiles(listed), loaded = new Map();
    await Promise.all(files.map(async (f) => { const s = await loadOne(dir + f); if (s)
        loaded.set(f, s); }));
    return (file) => loaded.get(file) ?? null;
}
