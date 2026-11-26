/** Drawing on the photo: the five brushes and how a pointer path becomes a stroke.
 *
 * A stroke is a list of points in page units (rounded to a tenth), its brush, colour and size.
 * Points closer than a quarter of the brush width to the last kept point are dropped, so a slow
 * hand doesn't store thousands of points; a stroke keeps at most MAX_POINTS. Each finished stroke
 * is one undo step. The eraser removes ink only: drawing layers are rendered on their own sheet,
 * so the photo underneath is never touched.
 * Author: John Khan.
 */
export const BRUSHES = {
    pen: { label: "Pen", width: 6, alpha: 1, cap: "round" },
    marker: { label: "Marker", width: 16, alpha: 0.9, cap: "round" },
    highlighter: { label: "Highlighter", width: 34, alpha: 0.38, cap: "butt" },
    neon: { label: "Neon", width: 10, alpha: 1, cap: "round" },
    eraser: { label: "Eraser", width: 30, alpha: 1, cap: "round" },
};
export const BRUSH_IDS = Object.keys(BRUSHES);
export const MAX_POINTS = 1500, MAX_STROKES = 400;
export const MIN_WIDTH = 1, MAX_WIDTH = 160; // page units
const round = (v) => Math.round(v * 10) / 10;
/** Collects pointer samples into a stroke. */
export class StrokeBuilder {
    brush;
    colour;
    width;
    pts = [];
    constructor(brush, colour, width) {
        this.brush = brush;
        this.colour = colour;
        this.width = width;
        if (!(brush in BRUSHES))
            throw new RangeError("Unknown brush");
        if (!/^#[0-9A-Fa-f]{6}$/.test(colour))
            throw new RangeError("A colour is #RRGGBB");
        if (!(width >= MIN_WIDTH && width <= MAX_WIDTH))
            throw new RangeError("Brush size is out of range");
    }
    /** Add a sample; returns false when it was too close to the last one (or the stroke is full). */
    add(x, y) {
        if (!Number.isFinite(x) || !Number.isFinite(y))
            return false;
        const n = this.pts.length;
        if (n >= MAX_POINTS * 2)
            return false;
        if (n >= 2 && Math.hypot(x - this.pts[n - 2], y - this.pts[n - 1]) < Math.max(0.5, this.width / 4))
            return false;
        this.pts.push(round(x), round(y));
        return true;
    }
    get count() { return this.pts.length / 2; }
    stroke() { return { brush: this.brush, colour: this.colour.toUpperCase(), width: this.width, points: [...this.pts] }; }
}
export function checkStroke(s) {
    if (!(s.brush in BRUSHES))
        throw new RangeError("Unknown brush");
    if (!/^#[0-9A-F]{6}$/.test(s.colour))
        throw new RangeError("A stroke colour is #RRGGBB");
    if (!(s.width >= MIN_WIDTH && s.width <= MAX_WIDTH))
        throw new RangeError("Brush size is out of range");
    if (s.points.length < 2 || s.points.length % 2 || s.points.length > MAX_POINTS * 2)
        throw new RangeError("A stroke needs 1 to 1500 points");
    if (s.points.some((v) => !Number.isFinite(v) || Math.abs(v) > 10000))
        throw new RangeError("A stroke point is off the page");
}
export function tracePath(sink, points) {
    const n = points.length / 2;
    sink.moveTo(points[0], points[1]);
    if (n === 1) {
        sink.lineTo(points[0] + 0.01, points[1]);
        return;
    }
    if (n === 2) {
        sink.lineTo(points[2], points[3]);
        return;
    }
    for (let i = 1; i < n - 1; i++) {
        const x = points[i * 2], y = points[i * 2 + 1];
        sink.quadraticCurveTo(x, y, (x + points[i * 2 + 2]) / 2, (y + points[i * 2 + 3]) / 2);
    }
    sink.lineTo(points[n * 2 - 2], points[n * 2 - 1]);
}
/** The page-unit box a stroke covers, its width included. */
export function strokeBounds(s) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < s.points.length; i += 2) {
        x0 = Math.min(x0, s.points[i]);
        x1 = Math.max(x1, s.points[i]);
        y0 = Math.min(y0, s.points[i + 1]);
        y1 = Math.max(y1, s.points[i + 1]);
    }
    const r = s.width / 2 + (s.brush === "neon" ? s.width * 1.5 : 0);
    return { x0: x0 - r, y0: y0 - r, x1: x1 + r, y1: y1 + r };
}
//# sourceMappingURL=ink.js.map