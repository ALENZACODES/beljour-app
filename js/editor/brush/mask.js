/** Retouch brush masks: soft round dabs along a stroke, with hardness, flow, opacity and pen
 * pressure, gathered into one mask per brush layer, and the eraser.
 *
 * Inside one stroke each dab adds `flow * pressure * falloff` the way paint builds up
 * (s = s + a * (1 - s)), so going over the same place again inside one stroke darkens it, and
 * the whole stroke is then scaled by its opacity, so one stroke never passes its opacity.
 * Across strokes paint is a union (m = m + s * (1 - m)) and the eraser takes away (m = m * (1 - s)).
 * The dab radius follows pressure from half to full size. Dabs sit a fifth of a radius apart.
 * Author: John Khan.
 */
import { floatImage } from "../../engines/core/buffer.js";
/** Dab spacing as a share of the radius; ASSUMED (a common brush-engine default). */
export const SPACING = 0.2;
/** Smallest dab radius as a share of the full one, at the lightest pen pressure; ASSUMED. */
export const MIN_PRESSURE_SIZE = 0.5;
/** Falloff at distance share t = d / r: 1 inside the hard core (t <= hardness), a cosine
 * shoulder down to 0 at the rim. */
export function falloff(t, hardness) {
    if (!(t >= 0))
        throw new RangeError("distance share must be 0 or more");
    if (t >= 1)
        return 0;
    if (t <= hardness)
        return 1;
    return 0.5 * (1 + Math.cos(Math.PI * (t - hardness) / (1 - hardness)));
}
/** Radius in pixels of a stroke on a photo of this size. */
export function radiusPx(stroke, width, height) {
    return Math.max(0.5, stroke.size * Math.min(width, height));
}
/** The dabs of one stroke, in pixels: every point, and evenly spaced ones between them
 * (pressure interpolated). A one-point stroke is a single dab (a tap). */
export function dabs(stroke, width, height) {
    const full = radiusPx(stroke, width, height);
    const pts = stroke.points.map((p) => ({ x: p.x * (width - 1), y: p.y * (height - 1), p: p.pressure }));
    const make = (x, y, p) => ({ x, y,
        radius: full * (MIN_PRESSURE_SIZE + (1 - MIN_PRESSURE_SIZE) * p), alpha: stroke.flow * p });
    const out = [make(pts[0].x, pts[0].y, pts[0].p)];
    let carry = 0;
    for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        const length = Math.hypot(b.x - a.x, b.y - a.y);
        const step = Math.max(0.5, SPACING * full);
        // Bloat and pinch grow while held: a repeated point is another dab where it is.
        if (length === 0 && (stroke.mode === "bloat" || stroke.mode === "pinch")) {
            out.push(make(b.x, b.y, b.p));
            continue;
        }
        let at = step - carry;
        while (at <= length) {
            const t = at / length;
            out.push(make(a.x + t * (b.x - a.x), a.y + t * (b.y - a.y), a.p + t * (b.p - a.p)));
            at += step;
        }
        carry = length - (at - step);
    }
    return out;
}
/** Add one dab to a coverage plane by build-up, inside its bounding box only. */
export function stamp(cover, width, height, dab, hardness, weight = null) {
    if (!(dab.alpha > 0))
        return;
    const x0 = Math.max(0, Math.floor(dab.x - dab.radius)), x1 = Math.min(width - 1, Math.ceil(dab.x + dab.radius));
    const y0 = Math.max(0, Math.floor(dab.y - dab.radius)), y1 = Math.min(height - 1, Math.ceil(dab.y + dab.radius));
    for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
            const t = Math.hypot(x - dab.x, y - dab.y) / dab.radius;
            if (t >= 1)
                continue;
            const i = y * width + x;
            const a = dab.alpha * falloff(t, hardness) * (weight ? weight(i) : 1);
            if (a > 0)
                cover[i] += a * (1 - cover[i]);
        }
}
/** One stroke's own coverage (0..opacity), before it meets the layer's mask. */
export function strokeCoverage(stroke, width, height, snap = null) {
    const cover = new Float32Array(width * height);
    for (const dab of dabs(stroke, width, height))
        stamp(cover, width, height, dab, stroke.hardness);
    for (let i = 0; i < cover.length; i++) {
        let v = cover[i] * stroke.opacity;
        if (snap)
            v *= snap[i];
        cover[i] = v;
    }
    return cover;
}
/** Paint is a union, the eraser takes away. Works in place on `mask`. */
export function combine(mask, cover, erase) {
    if (mask.length !== cover.length)
        throw new RangeError("mask and stroke sizes differ");
    for (let i = 0; i < mask.length; i++) {
        const s = cover[i];
        if (!(s > 0))
            continue;
        mask[i] = erase ? mask[i] * (1 - s) : mask[i] + s * (1 - mask[i]);
    }
}
/** The mask of the strokes whose mode is in `paint` (an erase stroke takes away from all of them).
 * A stroke snapped to a part the photo doesn't have is limited to nothing, never to everything. */
export function buildMask(strokes, width, height, paint = ["paint"], snaps = {}) {
    const mask = new Float32Array(width * height);
    for (const stroke of strokes) {
        const erase = stroke.mode === "erase";
        if (!erase && !paint.includes(stroke.mode))
            continue;
        const snap = stroke.snap === "none" ? null : snaps[stroke.snap] ?? new Float32Array(width * height);
        combine(mask, strokeCoverage(stroke, width, height, snap), erase);
    }
    const out = floatImage(width, height, 1);
    out.data.set(mask);
    return out;
}
/** Bounding box [x0, y0, x1, y1] (inclusive) of the mask above `level`, or null when empty. */
export function maskBox(mask, level = 0) {
    let x0 = mask.width, y0 = mask.height, x1 = -1, y1 = -1;
    for (let y = 0; y < mask.height; y++)
        for (let x = 0; x < mask.width; x++) {
            if (mask.data[y * mask.width + x] > level) {
                x0 = Math.min(x0, x);
                x1 = Math.max(x1, x);
                y0 = Math.min(y0, y);
                y1 = Math.max(y1, y);
            }
        }
    return x1 < 0 ? null : [x0, y0, x1, y1];
}
//# sourceMappingURL=mask.js.map