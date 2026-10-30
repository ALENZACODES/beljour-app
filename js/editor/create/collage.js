/** Collage layouts for 2 to 9 photos: grids (even and with one large cell) and a freeform
 * scatter of tilted prints, and the geometry that turns a layout, the board's size and its
 * spacing into the cell rectangles.
 *
 * A grid layout is cells in a unit square (x, y, w, h from 0 to 1). On the page they are
 * stretched to the board, then each edge gets the spacing: the outer margin and every gap are
 * exactly `spacing` page units. A freeform layout places each cell by its centre, width and
 * tilt; she can then move a cell (Cell.dx, dy).
 * Author: John Khan.
 */
import { emptyCell, aspectRatio } from "./board.js";
import { PAGE_UNITS } from "./geometry.js";
import { PALETTE } from "../../ui/palette.js";
function grid(cols, rows) {
    const out = [];
    for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++)
            out.push([c / cols, r / rows, 1 / cols, 1 / rows]);
    return out;
}
/** Cells of one row band, `n` side by side, from y with height h. */
function band(n, y, h) { return Array.from({ length: n }, (_, i) => [i / n, y, 1 / n, h]); }
/** One column band of `n` stacked cells. */
function column(n, x, w) { return Array.from({ length: n }, (_, i) => [x, i / n, w, 1 / n]); }
const G = (id, label, cells) => ({ id, label, count: cells.length, free: false, cells });
/** Tilts for the freeform prints, in turn. ASSUMED: gentle, alternating, never past 9 degrees. */
const TILT = [-0.12, 0.09, -0.05, 0.14, -0.1, 0.06, -0.15, 0.11, -0.03];
function scatter(n) {
    const cols = n <= 2 ? 2 : n <= 4 ? 2 : 3, rows = Math.ceil(n / cols);
    const w = Math.min(0.56, 0.84 / cols); // ASSUMED: prints overlap a little but stay on the page
    const cells = Array.from({ length: n }, (_, i) => {
        const r = Math.floor(i / cols), c = i % cols, inRow = Math.min(cols, n - r * cols);
        const x = (c + 0.5 + (cols - inRow) / 2) / cols + (r % 2 ? 0.015 : -0.015);
        const y = (r + 0.5) / rows + ((i * 7) % 3 - 1) * 0.02;
        return [x, y, w, 1.12, TILT[i % TILT.length]];
    });
    return { id: `free-${n}`, label: "Freeform prints", count: n, free: true, cells };
}
export const LAYOUTS = [
    G("2-side", "Side by side", grid(2, 1)), G("2-stack", "One above the other", grid(1, 2)),
    G("3-cols", "Three columns", grid(3, 1)), G("3-rows", "Three rows", grid(1, 3)),
    G("3-big-left", "One large and two", [[0, 0, 0.6, 1], ...column(2, 0.6, 0.4)]),
    G("3-big-top", "One wide and two", [[0, 0, 1, 0.6], ...band(2, 0.6, 0.4)]),
    G("4-grid", "Four squares", grid(2, 2)), G("4-big-top", "One wide and three", [[0, 0, 1, 0.62], ...band(3, 0.62, 0.38)]),
    G("4-big-left", "One tall and three", [[0, 0, 0.62, 1], ...column(3, 0.62, 0.38)]),
    G("5-big-left", "One tall and four", [[0, 0, 0.5, 1], [0.5, 0, 0.25, 0.5], [0.75, 0, 0.25, 0.5], [0.5, 0.5, 0.25, 0.5], [0.75, 0.5, 0.25, 0.5]]),
    G("5-two-three", "Two over three", [...band(2, 0, 0.55), ...band(3, 0.55, 0.45)]),
    G("6-grid", "Six, three across", grid(3, 2)), G("6-tall", "Six, two across", grid(2, 3)),
    G("6-big", "One large and five", [[0, 0, 2 / 3, 2 / 3], [2 / 3, 0, 1 / 3, 1 / 3], [2 / 3, 1 / 3, 1 / 3, 1 / 3], ...band(3, 2 / 3, 1 / 3)]),
    G("7-big-top", "One wide and six", [[0, 0, 1, 0.46], ...band(3, 0.46, 0.27), ...band(3, 0.73, 0.27)]),
    G("7-three-four", "Three over four", [...band(3, 0, 0.5), ...band(4, 0.5, 0.5)]),
    G("8-grid", "Eight, four across", grid(4, 2)), G("8-tall", "Eight, two across", grid(2, 4)),
    G("9-grid", "Nine squares", grid(3, 3)),
    G("9-big-top", "One wide and eight", [[0, 0, 1, 0.5], ...band(4, 0.5, 0.25), ...band(4, 0.75, 0.25)]),
    ...[2, 3, 4, 5, 6, 7, 8, 9].map(scatter),
];
export function layout(id) {
    const found = LAYOUTS.find((l) => l.id === id);
    if (!found)
        throw new RangeError("That collage layout isn't in this version");
    return found;
}
export function layoutsFor(count) { return LAYOUTS.filter((l) => l.count === count); }
/** The cells of a collage board in page units, for a page `width` x `height` units. */
export function collageCells(board, width, height) {
    const l = layout(board.layout);
    const s = board.spacing;
    if (!l.free) {
        // inset the whole board by s/2 and every cell by s/2: outer margin and gaps are both s
        const W = width - s, H = height - s;
        return l.cells.map(([x, y, w, h]) => ({ x: s / 2 + x * W + s / 2, y: s / 2 + y * H + s / 2,
            width: Math.max(1, w * W - s), height: Math.max(1, h * H - s), rotation: 0, shape: "rect", border: 0 }));
    }
    return l.cells.map(([cx, cy, w, ratio, tilt], i) => {
        const cw = w * width, ch = Math.min(cw * ratio, height * 0.9);
        const cell = board.cells[i];
        return { x: cx * width - cw / 2 + (cell?.dx ?? 0), y: cy * height - ch / 2 + (cell?.dy ?? 0), width: cw, height: ch,
            rotation: tilt, shape: "rect", border: Math.max(6, s) };
    });
}
/** A new collage board for `count` photos, filled from `assets` in order. */
export function newCollage(count, assets, aspect = "4:5", layoutId) {
    const chosen = layoutId ? layout(layoutId) : layoutsFor(count)[0];
    if (!chosen || chosen.count !== count)
        throw new RangeError("A collage holds 2 to 9 photos");
    return { kind: "collage", layout: chosen.id, aspect, spacing: 16, radius: 0, background: PALETTE.cream,
        cells: Array.from({ length: count }, (_, i) => emptyCell(assets[i] ?? null)) };
}
/** Change the layout, keeping the photos (and their pan and zoom) in order; cells added are empty. */
export function relayout(board, layoutId) {
    const l = layout(layoutId);
    const cells = Array.from({ length: l.count }, (_, i) => board.cells[i] ? { ...board.cells[i], dx: 0, dy: 0 } : emptyCell());
    return { ...board, layout: l.id, cells };
}
/** The page size in units for a board shape. */
export function boardUnits(aspect) {
    return { width: PAGE_UNITS, height: PAGE_UNITS * aspectRatio(aspect) };
}
//# sourceMappingURL=collage.js.map