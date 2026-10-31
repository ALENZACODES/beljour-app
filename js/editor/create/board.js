/** The board under a collage or a story: its shape, background, spacing and the photo in each
 * cell with that cell's own pan and zoom. The cells' places come from collage.ts (grids and
 * freeform) or story.ts (the story templates).
 *
 * Pan and zoom: a photo fills its cell edge to edge (cover fit, never squashed); zoom 1 shows
 * as much as fits, zoom 2 half as much. Pan -1..1 slides it from one edge of what is spare to
 * the other, so the cell never shows past the photo's edge.
 * Author: John Khan.
 */
import { PRESETS } from "../../save/size-presets.js";
export const ASPECTS = { "1:1": "square", "4:5": "portrait", "9:16": "story" };
export const ASPECT_IDS = Object.keys(ASPECTS);
export const MAX_ZOOM = 4, MAX_CELLS = 9;
export function emptyCell(asset = null) { return { asset, zoom: 1, panX: 0, panY: 0, dx: 0, dy: 0 }; }
export function checkCell(c) {
    if (c.asset !== null && !/^(edited|original|file-[0-9]{1,4})$/.test(c.asset))
        throw new RangeError("Unknown photo in a cell");
    if (!(c.zoom >= 1 && c.zoom <= MAX_ZOOM))
        throw new RangeError(`Cell zoom is 1 to ${MAX_ZOOM}`);
    if (!(Math.abs(c.panX) <= 1 && Math.abs(c.panY) <= 1))
        throw new RangeError("Cell pan is -1 to 1");
    if (!(Math.abs(c.dx) <= 2000 && Math.abs(c.dy) <= 4000))
        throw new RangeError("A cell moved off the board");
}
export function checkBoard(b) {
    if (b.kind !== "collage" && b.kind !== "story")
        throw new RangeError("Unknown board");
    if (!(b.aspect in ASPECTS))
        throw new RangeError("Unknown board shape");
    if (!/^[a-z0-9-]{1,24}$/.test(b.layout))
        throw new RangeError("Unknown layout");
    if (!(b.spacing >= 0 && b.spacing <= 120))
        throw new RangeError("Spacing is 0 to 120");
    if (!(b.radius >= 0 && b.radius <= 300))
        throw new RangeError("Corner radius is 0 to 300");
    if (!/^#[0-9A-F]{6}$/.test(b.background))
        throw new RangeError("A background colour is #RRGGBB");
    if (b.cells.length < 1 || b.cells.length > MAX_CELLS)
        throw new RangeError(`A board holds 1 to ${MAX_CELLS} photos`);
    b.cells.forEach(checkCell);
}
/** The board's export size in pixels: the matching one-tap export size (1080 wide). */
export function boardPixels(aspect) {
    const p = PRESETS.find((x) => x.id === ASPECTS[aspect]);
    if (!p || p.height === null)
        throw new RangeError("Unknown board shape");
    return { width: p.width, height: p.height };
}
export function aspectRatio(aspect) {
    const [w, h] = aspect.split(":").map(Number);
    return h / w;
}
/** The part of a `iw` x `ih` photo shown in a `cw` x `ch` cell, as a source rectangle. */
export function coverCrop(iw, ih, cw, ch, zoom = 1, panX = 0, panY = 0) {
    if (!(iw > 0 && ih > 0 && cw > 0 && ch > 0))
        throw new RangeError("A cell and its photo need a size");
    const z = Math.min(MAX_ZOOM, Math.max(1, zoom));
    const scale = Math.max(cw / iw, ch / ih) * z;
    const sw = Math.min(iw, cw / scale), sh = Math.min(ih, ch / scale);
    const px = Math.max(-1, Math.min(1, panX)), py = Math.max(-1, Math.min(1, panY));
    return { sx: (iw - sw) / 2 * (1 + px), sy: (ih - sh) / 2 * (1 + py), sw, sh };
}
/** Pan after dragging the photo by (dx, dy) cell pixels: the photo follows the finger. */
export function panBy(cell, iw, ih, cw, ch, dx, dy) {
    const c = coverCrop(iw, ih, cw, ch, cell.zoom, cell.panX, cell.panY);
    const spareX = (iw - c.sw) / 2, spareY = (ih - c.sh) / 2, perPixel = c.sw / cw;
    const clamp = (v) => Math.max(-1, Math.min(1, v));
    return { ...cell, panX: spareX > 0 ? clamp(cell.panX - dx * perPixel / spareX) : 0, panY: spareY > 0 ? clamp(cell.panY - dy * perPixel / spareY) : 0 };
}
