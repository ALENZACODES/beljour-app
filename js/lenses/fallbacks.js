/** Drawn fallbacks for every lens prop, so a lens looks finished before its PNG exists.
 *
 * Each prop is a short list of shapes (signed distances in a square box from -1 to 1, y down)
 * painted in order with a one-pixel soft edge, or a wider glow where a shape asks for one.
 * The drawings are our own simple designs in the app palette (blush, plum, cream, gold); a
 * picture John adds at web/assets/lenses/<lens-id>/<layer>.png replaces the drawing of that
 * layer. Sprites are drawn once per kind at SPRITE_SIDE and cached. Author: John Khan.
 */
export const SPRITE_SIDE = 160;
// Palette (our own, ASSUMED to sit with the app's plum and blush theme).
const BLUSH = [236, 160, 170], ROSE = [214, 104, 128], PLUM = [112, 46, 78], CREAM = [250, 240, 226];
const GOLD = [226, 186, 102], PALE_GOLD = [246, 222, 160], SILVER = [214, 216, 226], LEAF = [120, 158, 104];
const LAVENDER = [176, 150, 214], WHITE = [255, 255, 255], INK = [34, 26, 30], BROWN = [92, 60, 44];
const GREY = [150, 146, 150], RUSSET = [196, 98, 52], CARAMEL = [180, 124, 76], WINE = [140, 30, 52];
const PINK = [240, 128, 168], VIOLET = [150, 96, 236], SKY = [176, 214, 240], BEIGE = [214, 176, 140];
// Signed distances -------------------------------------------------------------------------
const circle = (cx, cy, r) => (x, y) => Math.hypot(x - cx, y - cy) - r;
function ellipse(cx, cy, rx, ry, turn = 0) {
    const c = Math.cos(turn), s = Math.sin(turn);
    return (x, y) => {
        const dx = x - cx, dy = y - cy, lx = dx * c + dy * s, ly = -dx * s + dy * c;
        return (Math.hypot(lx / rx, ly / ry) - 1) * Math.min(rx, ry);
    };
}
const ring = (d, t) => (x, y) => Math.abs(d(x, y)) - t;
const minus = (a, b) => (x, y) => Math.max(a(x, y), -b(x, y));
const above = (d, cut) => (x, y) => Math.max(d(x, y), y - cut);
function segment(ax, ay, bx, by, r) {
    return (x, y) => {
        const px = x - ax, py = y - ay, ex = bx - ax, ey = by - ay;
        const h = Math.max(0, Math.min(1, (px * ex + py * ey) / (ex * ex + ey * ey || 1)));
        return Math.hypot(px - ex * h, py - ey * h) - r;
    };
}
/** Exact signed distance to a closed polygon (even-odd inside test). */
function polygon(pts) {
    return (x, y) => {
        let d = Infinity, inside = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
            const [ax, ay] = pts[j], [bx, by] = pts[i], ex = bx - ax, ey = by - ay, wx = x - ax, wy = y - ay;
            const h = Math.max(0, Math.min(1, (wx * ex + wy * ey) / (ex * ex + ey * ey || 1)));
            d = Math.min(d, Math.hypot(wx - ex * h, wy - ey * h));
            if ((ay > y) !== (by > y) && x < ax + (y - ay) * ex / (ey || 1e-12))
                inside = !inside;
        }
        return inside ? -d : d;
    };
}
function heart(cx, cy, s, turn = 0) {
    const pts = [], c = Math.cos(turn), sn = Math.sin(turn);
    for (let k = 0; k < 36; k++) {
        const t = 2 * Math.PI * k / 36, hx = 16 * Math.sin(t) ** 3 / 17;
        const hy = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 17;
        pts.push([cx + s * (hx * c - hy * sn), cy + s * (hx * sn + hy * c)]);
    }
    return polygon(pts);
}
function star(cx, cy, outer, inner, n = 5, turn = -Math.PI / 2) {
    const pts = [];
    for (let k = 0; k < 2 * n; k++) {
        const r = k % 2 ? inner : outer, a = turn + Math.PI * k / n;
        pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    return polygon(pts);
}
const tri = (ax, ay, bx, by, cx, cy) => polygon([[ax, ay], [bx, by], [cx, cy]]);
const box = (cx, cy, hw, hh, r = 0) => (x, y) => {
    const qx = Math.abs(x - cx) - hw + r, qy = Math.abs(y - cy) - hh + r;
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};
/** Points along the top of an ellipse from `from` to `to` (degrees, 180 = left, 270 = top). */
function arc(n, cx, cy, rx, ry, from = 200, to = 340) {
    return Array.from({ length: n }, (_, k) => {
        const a = (from + (to - from) * k / Math.max(1, n - 1)) * Math.PI / 180;
        return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)];
    });
}
/** A fixed scatter (seeded), so the same prop always looks the same. */
function scatter(n, seed, w, h, cy = 0) {
    let s = seed >>> 0;
    const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
    return Array.from({ length: n }, () => [(r() * 2 - 1) * w, cy + (r() * 2 - 1) * h]);
}
// Shape builders -------------------------------------------------------------------------
const fill = (d, c, a = 1, glow) => ({ d, c, a, glow });
function butterfly(cx, cy, s, c, edge = GOLD) {
    const wings = [ellipse(cx - 0.45 * s, cy - 0.25 * s, 0.42 * s, 0.32 * s, -0.5), ellipse(cx + 0.45 * s, cy - 0.25 * s, 0.42 * s, 0.32 * s, 0.5),
        ellipse(cx - 0.32 * s, cy + 0.28 * s, 0.28 * s, 0.22 * s, 0.6), ellipse(cx + 0.32 * s, cy + 0.28 * s, 0.28 * s, 0.22 * s, -0.6)];
    return [...wings.map((d) => fill(ring(d, 0.03 * s), edge)), ...wings.map((d) => fill(d, c, 0.92)),
        fill(segment(cx, cy - 0.35 * s, cx, cy + 0.45 * s, 0.06 * s), PLUM),
        fill(segment(cx, cy - 0.35 * s, cx - 0.2 * s, cy - 0.7 * s, 0.02 * s), PLUM), fill(segment(cx, cy - 0.35 * s, cx + 0.2 * s, cy - 0.7 * s, 0.02 * s), PLUM)];
}
function whiskers(cy, spread, c) {
    const out = [];
    for (const side of [-1, 1])
        for (const dy of [-0.12, 0, 0.12])
            out.push(fill(segment(side * 0.3, cy, side * spread, cy + dy * 1.6, 0.018), c, 0.9));
    return out;
}
function glasses(lens, frame, tint, tintAlpha, t = 0.035) {
    return [fill(segment(-0.14, -0.06, 0.14, -0.06, t * 0.8), frame), fill(segment(-0.82, -0.08, -0.98, -0.12, t * 0.8), frame),
        fill(segment(0.82, -0.08, 0.98, -0.12, t * 0.8), frame),
        ...[-0.46, 0.46].flatMap((cx) => [fill(lens(cx), tint, tintAlpha), fill(ring(lens(cx), t), frame)]),
        fill(ellipse(-0.56, -0.14, 0.08, 0.04, -0.5), WHITE, 0.55), fill(ellipse(0.36, -0.14, 0.08, 0.04, -0.5), WHITE, 0.55)];
}
function catEye(cx) {
    const s = Math.sign(cx) || 1;
    return polygon([[cx - s * 0.34, -0.12], [cx - s * 0.1, -0.24], [cx + s * 0.22, -0.24], [cx + s * 0.4, -0.36],
        [cx + s * 0.34, -0.02], [cx + s * 0.12, 0.2], [cx - s * 0.18, 0.2], [cx - s * 0.32, 0.06]]);
}
function earsPair(make) { return [...make(-1), ...make(1)]; }
function flowerAt(cx, cy, r, c) {
    const petals = Array.from({ length: 5 }, (_, k) => {
        const a = 2 * Math.PI * k / 5;
        return fill(circle(cx + 0.55 * r * Math.cos(a), cy + 0.55 * r * Math.sin(a), 0.55 * r), c);
    });
    return [...petals, fill(circle(cx, cy, 0.4 * r), PALE_GOLD)];
}
function rose(cx, cy, r, c) {
    return [fill(circle(cx, cy, r), c), fill(ring(circle(cx, cy, 0.55 * r), 0.07 * r), [c[0] - 30, c[1] - 30, c[2] - 30]),
        fill(circle(cx, cy, 0.22 * r), [c[0] - 40, c[1] - 40, c[2] - 40])];
}
/** Every drawn prop, by fallback name. */
export const DRAWINGS = {
    "flower-ring": () => {
        const at = arc(9, 0, 0.55, 0.92, 0.75);
        const leaves = arc(8, 0, 0.55, 0.92, 0.75, 208, 332).map(([x, y], k) => fill(ellipse(x, y + 0.02, 0.12, 0.05, k % 2 ? 0.6 : -0.6), LEAF));
        const lav = arc(5, 0, 0.55, 0.98, 0.84, 215, 325).flatMap(([x, y]) => [0, 1, 2].map((j) => fill(circle(x, y - 0.05 * j, 0.035), LAVENDER)));
        return [...leaves, ...lav, ...at.flatMap(([x, y], k) => rose(x, y, k % 2 ? 0.11 : 0.14, k % 3 === 0 ? ROSE : BLUSH))];
    },
    "butterfly-arc": () => arc(5, 0, 0.6, 0.85, 0.75).flatMap(([x, y], k) => butterfly(x, y, k === 2 ? 0.26 : 0.2, [BLUSH, LAVENDER, PALE_GOLD, LAVENDER, BLUSH][k])),
    "butterflies-scatter": () => [...butterfly(-0.6, -0.3, 0.22, LAVENDER), ...butterfly(0.55, -0.55, 0.18, BLUSH), ...butterfly(0.7, 0.35, 0.15, PALE_GOLD)],
    "heart-glasses": () => glasses((cx) => heart(cx, -0.04, 0.36), GOLD, PINK, 0.55, 0.03),
    "star-glasses": () => glasses((cx) => star(cx, -0.04, 0.38, 0.19), PLUM, PALE_GOLD, 0.6, 0.045),
    "round-glasses": () => glasses((cx) => circle(cx, -0.04, 0.3), GOLD, [74, 48, 36], 0.78, 0.022),
    "cat-eye-glasses": () => glasses(catEye, PLUM, [80, 40, 64], 0.7, 0.055),
    "bunny-ears": () => [...earsPair((s) => [fill(ellipse(s * 0.3, 0.1, 0.17, 0.58, s * 0.12), CREAM), fill(ellipse(s * 0.3, 0.12, 0.08, 0.45, s * 0.12), BLUSH)]),
        fill(ring(above(ellipse(0, 1.05, 0.62, 0.35), 0.95), 0.03), BLUSH)],
    "bunny-nose": () => [...whiskers(0.05, 0.95, [90, 70, 76]), fill(ellipse(0, 0, 0.3, 0.2), ROSE), fill(ellipse(-0.08, -0.06, 0.08, 0.05), WHITE, 0.6)],
    "kitten-ears": () => earsPair((s) => [fill(tri(s * 0.12, 0.6, s * 0.75, 0.6, s * 0.5, -0.4), GREY), fill(tri(s * 0.25, 0.5, s * 0.63, 0.5, s * 0.5, -0.12), BLUSH)]),
    "kitten-nose": () => [...whiskers(0.05, 0.95, [80, 76, 80]), fill(tri(-0.25, -0.12, 0.25, -0.12, 0, 0.18), PINK)],
    "fox-ears": () => earsPair((s) => [fill(tri(s * 0.1, 0.65, s * 0.82, 0.62, s * 0.52, -0.5), RUSSET), fill(tri(s * 0.27, 0.52, s * 0.66, 0.5, s * 0.5, -0.1), CREAM),
        fill(tri(s * 0.43, -0.28, s * 0.6, -0.3, s * 0.52, -0.5), INK)]),
    "fox-nose": () => [...whiskers(0.04, 0.95, INK), fill(ellipse(0, 0, 0.26, 0.17), INK), fill(ellipse(-0.07, -0.05, 0.07, 0.04), WHITE, 0.5)],
    "bear-ears": () => earsPair((s) => [fill(circle(s * 0.55, 0.15, 0.3), CARAMEL), fill(circle(s * 0.55, 0.17, 0.16), [226, 180, 140])]),
    "bear-nose": () => [fill(ellipse(0, 0, 0.42, 0.3), BROWN), fill(ellipse(-0.12, -0.1, 0.12, 0.07), WHITE, 0.4)],
    antlers: () => {
        const out = [];
        for (const s of [-1, 1]) {
            const segs = [[0.22, 0.75, 0.38, 0.1], [0.38, 0.1, 0.55, -0.55], [0.38, 0.1, 0.72, -0.12],
                [0.47, -0.22, 0.3, -0.6], [0.55, -0.55, 0.78, -0.75]];
            for (const [ax, ay, bx, by] of segs)
                out.push(fill(segment(s * ax, ay, s * bx, by, 0.045), [150, 110, 80]));
            for (const [x, y] of [[0.4, 0.05], [0.53, -0.4], [0.7, -0.14], [0.33, -0.55]])
                out.push(...flowerAt(s * x, y, 0.06, WHITE));
        }
        return out;
    },
    "fawn-spots": () => [-1, 1].flatMap((s) => scatter(7, s > 0 ? 11 : 7, 0.2, 0.14).map(([x, y]) => fill(circle(s * 0.58 + x, y, 0.035), BEIGE, 0.85))),
    halo: () => [fill(ring(ellipse(0, 0.2, 0.75, 0.22), 0.05), GOLD, 1, 0.05), fill(ring(ellipse(0, 0.2, 0.75, 0.22), 0.02), PALE_GOLD)],
    horns: () => earsPair((s) => [fill(polygon([[s * 0.22, 0.6], [s * 0.6, 0.6], [s * 0.6, 0.3], [s * 0.7, -0.05], [s * 0.85, -0.45], [s * 0.6, -0.1], [s * 0.38, 0.25]]), WINE),
        fill(ellipse(s * 0.55, 0.25, 0.05, 0.16, s * 0.4), [200, 90, 110], 0.6)]),
    tiara: () => [fill(ring(above(ellipse(0, 0.8, 0.8, 0.5), 0.7), 0.04), SILVER),
        fill(polygon([[-0.5, 0.45], [-0.3, 0.1], [-0.14, 0.32], [0, -0.25], [0.14, 0.32], [0.3, 0.1], [0.5, 0.45], [0, 0.38]]), SILVER),
        ...[[0, -0.02, 0.09], [-0.28, 0.26, 0.06], [0.28, 0.26, 0.06], [-0.55, 0.42, 0.04], [0.55, 0.42, 0.04]].map(([x, y, r]) => fill(circle(x, y, r), [244, 182, 196]))],
    crown: () => [fill(polygon([[-0.6, 0.45], [-0.66, -0.2], [-0.33, 0.12], [0, -0.42], [0.33, 0.12], [0.66, -0.2], [0.6, 0.45]]), GOLD),
        fill(box(0, 0.42, 0.62, 0.1, 0.03), PLUM), ...[-0.4, -0.13, 0.13, 0.4].map((x) => fill(circle(x, 0.42, 0.05), CREAM)),
        ...[[-0.66, -0.2], [0, -0.42], [0.66, -0.2]].map(([x, y]) => fill(circle(x, y, 0.06), CREAM))],
    "glitter-freckles": () => scatter(34, 5, 0.75, 0.16).map(([x, y], k) => fill(circle(x, y + 0.08 * Math.abs(x), 0.012 + (k % 3) * 0.008), k % 4 ? GOLD : PALE_GOLD, 0.95, 0.02)),
    tears: () => [-0.42, 0.42].flatMap((cx) => [0, 1, 2, 3, 4].map((k) => fill(circle(cx + 0.02 * Math.sin(k), 0.05 + 0.17 * k, 0.07 - 0.009 * k), k % 2 ? SKY : [250, 200, 230], 0.9, 0.04))),
    "heart-pair": () => [-0.58, 0.58].map((cx) => fill(heart(cx, 0, 0.3), PINK, 0.55, 0.06)),
    "hearts-scatter": () => [[-0.7, -0.4, 0.16, BLUSH], [-0.45, -0.75, 0.11, PLUM], [0.6, -0.6, 0.15, BLUSH], [0.78, -0.15, 0.1, CREAM],
        [-0.8, 0.15, 0.1, PLUM], [0.2, -0.85, 0.09, CREAM], [0.75, 0.4, 0.12, BLUSH]].map(([x, y, s, c]) => fill(heart(x, y, s, x * 0.4), c, 0.95)),
    petal: () => [fill(ellipse(0, 0, 0.5, 0.75, 0.4), [244, 176, 190]), fill(ellipse(0.08, 0.3, 0.2, 0.25, 0.4), [226, 140, 160], 0.6)],
    blossom: () => flowerAt(0, 0, 0.55, [252, 246, 248]),
    snowflake: () => Array.from({ length: 6 }, (_, k) => {
        const a = Math.PI * k / 3, ex = 0.8 * Math.cos(a), ey = 0.8 * Math.sin(a), mx = 0.5 * Math.cos(a), my = 0.5 * Math.sin(a);
        return [fill(segment(0, 0, ex, ey, 0.05), WHITE, 1, 0.12), fill(segment(mx, my, mx + 0.22 * Math.cos(a + 0.8), my + 0.22 * Math.sin(a + 0.8), 0.035), WHITE),
            fill(segment(mx, my, mx + 0.22 * Math.cos(a - 0.8), my + 0.22 * Math.sin(a - 0.8), 0.035), WHITE)];
    }).flat(),
    beanie: () => [fill(above(ellipse(0, 0.4, 0.82, 0.75), 0.4), CREAM), fill(box(0, 0.5, 0.86, 0.16, 0.08), [236, 222, 204]),
        ...[-0.6, -0.3, 0, 0.3, 0.6].map((x) => fill(segment(x, 0.38, x, 0.62, 0.025), [214, 198, 178])), fill(circle(0, -0.42, 0.2), [244, 232, 218])],
    sparkle: () => [fill(star(0, 0, 0.9, 0.18, 4), PALE_GOLD, 1, 0.25), fill(circle(0, 0, 0.12), WHITE)],
    bubble: () => [fill(circle(0, 0, 0.8), SKY, 0.16), fill(ring(circle(0, 0, 0.8), 0.04), [220, 200, 250], 0.85),
        fill(ellipse(-0.35, -0.38, 0.18, 0.1, -0.7), WHITE, 0.8)],
    "butterfly-lavender": () => butterfly(0, 0.05, 0.85, LAVENDER, PLUM),
    "butterfly-blush": () => butterfly(0, 0.05, 0.85, BLUSH, PLUM),
    rainbow: () => [...[[250, 186, 186], [252, 214, 170], [250, 240, 180], [190, 228, 200], [190, 206, 244]]
            .map((c, k) => fill(ring(above(ellipse(0, 0.55, 0.88 - 0.09 * k, 0.88 - 0.09 * k), 0.55), 0.045), c, 0.9)),
        ...[-0.72, 0.72].flatMap((x) => [fill(circle(x - 0.1, 0.55, 0.12), WHITE), fill(circle(x + 0.1, 0.55, 0.12), WHITE), fill(circle(x, 0.47, 0.13), WHITE)])],
    rays: () => Array.from({ length: 18 }, (_, k) => {
        const a = 2 * Math.PI * k / 18, w = 0.06;
        return fill(tri(0.5 * Math.cos(a - w), 0.5 * Math.sin(a - w), 0.5 * Math.cos(a + w), 0.5 * Math.sin(a + w), 0.98 * Math.cos(a), 0.98 * Math.sin(a)), GOLD, 0.65, 0.03);
    }),
    "neon-frame": () => [fill(ring(box(0, 0, 0.72, 0.9, 0.3), 0.025), PINK, 1, 0.1),
        ...[[-0.72, -0.3], [0.72, 0.3], [0, -0.9], [0, 0.9]].map(([x, y]) => fill(heart(x, y, 0.12), VIOLET, 1, 0.06)),
        ...[[-0.72, 0.4], [0.72, -0.4]].map(([x, y]) => fill(star(x, y, 0.12, 0.05), VIOLET, 1, 0.06))],
    gloss: () => [fill(ellipse(-0.05, -0.12, 0.42, 0.07, -0.06), WHITE, 0.55, 0.12), fill(ellipse(0.12, 0.2, 0.18, 0.04, 0.05), WHITE, 0.4, 0.06)],
    lashes: () => [-0.44, 0.44].flatMap((cx) => Array.from({ length: 9 }, (_, k) => {
        const t = (k / 8) * Math.PI, x = cx - 0.24 * Math.cos(t), y = -0.02 - 0.09 * Math.sin(t), out = Math.sign(cx) * (k / 8 - 0.5);
        return fill(segment(x, y, x + 0.08 * out + 0.03 * Math.sign(cx) * k / 8, y - 0.14 - 0.04 * Math.sin(t), 0.012), INK);
    })),
    "moon-band": () => [fill(ring(above(ellipse(0, 0.85, 0.85, 0.6), 0.75), 0.025), PALE_GOLD),
        fill(minus(circle(0, 0.08, 0.2), circle(0.09, 0.03, 0.17)), PALE_GOLD, 1, 0.06),
        ...[[-0.38, 0.32, 0.06], [0.38, 0.32, 0.06], [-0.62, 0.55, 0.04], [0.62, 0.55, 0.04]].map(([x, y, r]) => fill(star(x, y, r, r * 0.45), GOLD))],
    star: () => [fill(star(0, 0.05, 0.75, 0.32), PALE_GOLD, 1, 0.2)],
};
const cache = new Map();
/** The drawn sprite for one fallback name (cached). */
export function drawnSprite(name, side = SPRITE_SIDE) {
    const key = `${name}@${side}`;
    const hit = cache.get(key);
    if (hit)
        return hit;
    const make = DRAWINGS[name];
    if (!make)
        throw new RangeError(`no drawn lens prop ${JSON.stringify(name)}`);
    const shapes = make(), data = new Uint8ClampedArray(side * side * 4), px = 2 / side;
    for (let j = 0; j < side; j++)
        for (let i = 0; i < side; i++) {
            const x = -1 + (i + 0.5) * px, y = -1 + (j + 0.5) * px;
            let r = 0, g = 0, b = 0, a = 0;
            for (const s of shapes) {
                const d = s.d(x, y);
                let cov = d <= -px / 2 ? 1 : d >= px / 2 ? 0 : 0.5 - d / px;
                if (s.glow && d > 0)
                    cov = Math.max(cov, 0.5 * Math.max(0, 1 - d / s.glow));
                const sa = cov * s.a;
                if (sa <= 0)
                    continue;
                const na = sa + a * (1 - sa);
                r = (s.c[0] * sa + r * a * (1 - sa)) / na;
                g = (s.c[1] * sa + g * a * (1 - sa)) / na;
                b = (s.c[2] * sa + b * a * (1 - sa)) / na;
                a = na;
            }
            const o = (j * side + i) * 4;
            data[o] = r;
            data[o + 1] = g;
            data[o + 2] = b;
            data[o + 3] = Math.round(a * 255);
        }
    const sprite = { side, data };
    cache.set(key, sprite);
    return sprite;
}
