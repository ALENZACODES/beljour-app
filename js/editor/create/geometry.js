/** Placement maths for the Create layers (text, stickers, collage cells): one transform per layer,
 * the page-to-layer mapping, hit tests and the gestures that change a transform.
 *
 * Coordinates are page units: the page is PAGE_UNITS wide whatever its pixel size, and as tall as
 * its shape needs (a 4:5 page is 1000 x 1250). A layer's transform puts its box centre at (x, y),
 * scales it by `scale`, turns it by `rotation` radians (clockwise on screen, y grows downward)
 * and mirrors it left-right when `flip` is set. Export multiplies everything by pixels / 1000,
 * so a layer lands at the same place at any resolution.
 * Author: John Khan.
 */
export const PAGE_UNITS = 1000;
export const MIN_SCALE = 0.1, MAX_SCALE = 12; // ASSUMED: from a tenth to twelve times the placed size
/** Corner handle radius in screen pixels; at least a 44 px target (accessibility rule). */
export const HANDLE_PX = 22;
export function identity(x, y) { return { x, y, scale: 1, rotation: 0, flip: false }; }
/** Turn an angle into (-PI, PI]. */
export function wrapAngle(a) {
    let r = a % (2 * Math.PI);
    if (r <= -Math.PI)
        r += 2 * Math.PI;
    if (r > Math.PI)
        r -= 2 * Math.PI;
    return r;
}
export function clampScale(s) {
    if (!Number.isFinite(s))
        throw new RangeError("Scale must be finite");
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
}
export function checkTransform(t) {
    for (const v of [t.x, t.y, t.scale, t.rotation])
        if (!Number.isFinite(v))
            throw new RangeError("A layer position must be finite");
    if (t.scale < MIN_SCALE || t.scale > MAX_SCALE)
        throw new RangeError("A layer scale is out of range");
    if (Math.abs(t.x) > 4 * PAGE_UNITS || Math.abs(t.y) > 8 * PAGE_UNITS)
        throw new RangeError("A layer is too far off the page");
}
/** A page point in the layer's own box coordinates (centre 0, 0; before scale and flip). */
export function toLocal(t, p) {
    const dx = p[0] - t.x, dy = p[1] - t.y;
    const c = Math.cos(-t.rotation), s = Math.sin(-t.rotation);
    const rx = (dx * c - dy * s) / t.scale, ry = (dx * s + dy * c) / t.scale;
    return [t.flip ? -rx : rx, ry];
}
/** A point of the layer's own box on the page. */
export function toPage(t, p) {
    const lx = (t.flip ? -p[0] : p[0]) * t.scale, ly = p[1] * t.scale;
    const c = Math.cos(t.rotation), s = Math.sin(t.rotation);
    return [t.x + lx * c - ly * s, t.y + lx * s + ly * c];
}
/** The four corners of a box of `size` on the page: top-left, top-right, bottom-right, bottom-left
 * as seen in the layer (a flipped layer swaps left and right on the page). */
export function corners(t, size) {
    const w = size.width / 2, h = size.height / 2;
    return [[-w, -h], [w, -h], [w, h], [-w, h]].map((p) => toPage(t, p));
}
/** True when the page point is inside the layer's box, widened by `pad` page units each side. */
export function hitBox(t, size, p, pad = 0) {
    const [lx, ly] = toLocal(t, p);
    const padLocal = pad / t.scale;
    return Math.abs(lx) <= size.width / 2 + padLocal && Math.abs(ly) <= size.height / 2 + padLocal;
}
/** The top-most layer under the point (the list is bottom first, as it renders). */
export function hitTop(layers, p, pad = 0) {
    for (let i = layers.length - 1; i >= 0; i--) {
        const l = layers[i];
        if (!l.hidden && hitBox(l.transform, l.size, p, pad))
            return l.id;
    }
    return null;
}
/** The scale-and-turn handle sits on the box's bottom-right corner (as drawn). */
export function handlePoint(t, size) { return toPage(t, [size.width / 2 * (t.flip ? -1 : 1), size.height / 2]); }
export function hitHandle(t, size, p, radius) {
    const [hx, hy] = handlePoint(t, size);
    return Math.hypot(p[0] - hx, p[1] - hy) <= radius;
}
export function moveBy(t, dx, dy) { return { ...t, x: t.x + dx, y: t.y + dy }; }
/** Dragging the corner handle from `from` to `to`: scale by the change in distance from the
 * centre, turn by the change in angle around it. The centre stays put. */
export function dragHandle(t, from, to) {
    const d0 = Math.hypot(from[0] - t.x, from[1] - t.y), d1 = Math.hypot(to[0] - t.x, to[1] - t.y);
    if (d0 < 1e-6 || d1 < 1e-6)
        return t;
    const a0 = Math.atan2(from[1] - t.y, from[0] - t.x), a1 = Math.atan2(to[1] - t.y, to[0] - t.x);
    return { ...t, scale: clampScale(t.scale * d1 / d0), rotation: wrapAngle(t.rotation + a1 - a0) };
}
/** Two fingers from (a0, b0) to (a1, b1): the layer follows the fingers' midpoint, scales with
 * their spread and turns with the line between them. */
export function pinch(t, a0, b0, a1, b1) {
    const d0 = Math.hypot(b0[0] - a0[0], b0[1] - a0[1]), d1 = Math.hypot(b1[0] - a1[0], b1[1] - a1[1]);
    const m0 = [(a0[0] + b0[0]) / 2, (a0[1] + b0[1]) / 2], m1 = [(a1[0] + b1[0]) / 2, (a1[1] + b1[1]) / 2];
    if (d0 < 1e-6 || d1 < 1e-6)
        return moveBy(t, m1[0] - m0[0], m1[1] - m0[1]);
    const turn = Math.atan2(b1[1] - a1[1], b1[0] - a1[0]) - Math.atan2(b0[1] - a0[1], b0[0] - a0[0]);
    const k = d1 / d0, scale = clampScale(t.scale * k), applied = scale / t.scale;
    // The point under the first midpoint stays under the fingers: rotate and scale the centre about m0.
    const ox = t.x - m0[0], oy = t.y - m0[1], c = Math.cos(turn), s = Math.sin(turn);
    return { ...t, x: m1[0] + (ox * c - oy * s) * applied, y: m1[1] + (ox * s + oy * c) * applied, scale, rotation: wrapAngle(t.rotation + turn) };
}
/** A screen point (CSS pixels relative to the canvas box) as page units. */
export function screenToPage(rect, page, clientX, clientY) {
    if (!(rect.width > 0 && rect.height > 0))
        throw new RangeError("The page isn't on screen");
    return [(clientX - rect.left) * page.width / rect.width, (clientY - rect.top) * page.height / rect.height];
}
/** The page's size in units for a pixel size: 1000 wide. */
export function pageUnits(pixelWidth, pixelHeight) {
    if (!(pixelWidth > 0 && pixelHeight > 0))
        throw new RangeError("A page needs a size");
    return { width: PAGE_UNITS, height: PAGE_UNITS * pixelHeight / pixelWidth };
}
