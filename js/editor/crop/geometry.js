export const ASPECTS = ["free", "original", "1:1", "4:5", "5:4", "9:16", "16:9", "3:2", "2:3"];
/** The ratios the panel offers as buttons; their turned partners come from Swap or a quarter turn. */
export const ASPECT_BUTTONS = [
    { id: "free", label: "Free" }, { id: "original", label: "Original" }, { id: "1:1", label: "1:1" },
    { id: "4:5", label: "4:5" }, { id: "9:16", label: "9:16" }, { id: "16:9", label: "16:9" }, { id: "3:2", label: "3:2" },
];
export const MAX_ANGLE = 45;
export const KEYSTONE_GAIN = 0.35;
export const IDENTITY = Object.freeze({ aspect: "free", x: 0, y: 0, w: 1, h: 1, quarter: 0, flipH: false, flipV: false,
    angle: 0, vertical: 0, horizontal: 0, auto: true });
function num(p, key, fallback, lo, hi) {
    const v = p[key];
    return typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : fallback;
}
export function readGeometry(p) {
    const aspect = ASPECTS.includes(String(p.aspect)) ? p.aspect : "free";
    const q = Math.round(num(p, "quarter", 0, 0, 3));
    return { aspect, x: num(p, "x", 0, -0.5, 1.5), y: num(p, "y", 0, -0.5, 1.5), w: num(p, "w", 1, 0.02, 2), h: num(p, "h", 1, 0.02, 2),
        quarter: q, flipH: p.flip_h === true, flipV: p.flip_v === true, angle: num(p, "angle", 0, -MAX_ANGLE, MAX_ANGLE),
        vertical: num(p, "vertical", 0, -100, 100), horizontal: num(p, "horizontal", 0, -100, 100), auto: p.auto !== false };
}
const r4 = (v) => Math.round(v * 10000) / 10000;
/** Layer params for a geometry; defaults are left out. */
export function geometryParams(g) {
    const out = {};
    if (g.aspect !== "free")
        out.aspect = g.aspect;
    if (g.x !== 0)
        out.x = r4(g.x);
    if (g.y !== 0)
        out.y = r4(g.y);
    if (g.w !== 1)
        out.w = r4(g.w);
    if (g.h !== 1)
        out.h = r4(g.h);
    if (g.quarter)
        out.quarter = g.quarter;
    if (g.flipH)
        out.flip_h = true;
    if (g.flipV)
        out.flip_v = true;
    if (g.angle)
        out.angle = Math.round(g.angle * 10) / 10;
    if (g.vertical)
        out.vertical = Math.round(g.vertical);
    if (g.horizontal)
        out.horizontal = Math.round(g.horizontal);
    if (!g.auto)
        out.auto = false;
    return out;
}
export function isIdentity(g) {
    return g.quarter === 0 && !g.flipH && !g.flipV && g.angle === 0 && g.vertical === 0 && g.horizontal === 0
        && g.x === 0 && g.y === 0 && g.w === 1 && g.h === 1;
}
/** The turned frame's size in pixels. */
export function turnedSize(width, height, quarter) {
    return quarter % 2 ? [height, width] : [width, height];
}
/** Pixel width/height ratio of an aspect in a turned frame, or null for free. */
export function aspectRatio(aspect, tw, th) {
    if (aspect === "free")
        return null;
    if (aspect === "original")
        return tw / th;
    const [a, b] = aspect.split(":").map(Number);
    return a / b;
}
export function swapAspect(aspect) {
    if (aspect === "free" || aspect === "original" || aspect === "1:1")
        return aspect;
    const [a, b] = aspect.split(":");
    const turned = `${b}:${a}`;
    return ASPECTS.includes(turned) ? turned : aspect;
}
/** Forward and inverse maps between source pixels and turned-frame pixels (continuous). */
export class Transform {
    width;
    height;
    g;
    tw;
    th;
    cx;
    cy;
    s;
    a;
    b;
    cos;
    sin;
    constructor(width, height, g) {
        this.width = width;
        this.height = height;
        this.g = g;
        [this.tw, this.th] = turnedSize(width, height, g.quarter);
        this.cx = this.tw / 2;
        this.cy = this.th / 2;
        this.s = Math.max(this.tw, this.th) / 2;
        this.a = KEYSTONE_GAIN * g.vertical / 100;
        this.b = KEYSTONE_GAIN * g.horizontal / 100;
        const t = g.angle * Math.PI / 180;
        this.cos = Math.cos(t);
        this.sin = Math.sin(t);
    }
    /** Source -> turned frame (before keystone and straighten). */
    orient([x, y]) {
        const { width: W, height: H } = this;
        let o = this.g.quarter === 1 ? [H - y, x] : this.g.quarter === 2 ? [W - x, H - y] : this.g.quarter === 3 ? [y, W - x] : [x, y];
        if (this.g.flipH)
            o = [this.tw - o[0], o[1]];
        if (this.g.flipV)
            o = [o[0], this.th - o[1]];
        return o;
    }
    unorient([ox, oy]) {
        const { width: W, height: H } = this;
        if (this.g.flipH)
            ox = this.tw - ox;
        if (this.g.flipV)
            oy = this.th - oy;
        return this.g.quarter === 1 ? [oy, H - ox] : this.g.quarter === 2 ? [W - ox, H - oy] : this.g.quarter === 3 ? [W - oy, ox] : [ox, oy];
    }
    /** Source pixel position -> canvas (turned, tilted, straightened) position. */
    forward(p) {
        const [ox, oy] = this.orient(p);
        const u = (ox - this.cx) / this.s, v = (oy - this.cy) / this.s, w = 1 + this.a * v + this.b * u;
        const pu = u / w, pv = v / w;
        return [this.cx + this.s * (pu * this.cos - pv * this.sin), this.cy + this.s * (pu * this.sin + pv * this.cos)];
    }
    /** Canvas position -> source pixel position, or null outside the projective range. */
    inverse([x, y]) {
        const dx = (x - this.cx) / this.s, dy = (y - this.cy) / this.s;
        const pu = dx * this.cos + dy * this.sin, pv = -dx * this.sin + dy * this.cos;
        const den = 1 - this.a * pv - this.b * pu;
        if (den <= 1e-6)
            return null;
        return this.unorient([this.cx + this.s * pu / den, this.cy + this.s * pv / den]);
    }
    /** The transformed photo's outline in canvas pixels (convex, four corners). */
    quad() {
        return [[0, 0], [this.width, 0], [this.width, this.height], [0, this.height]].map((p) => this.forward(p));
    }
    /** Pure quarter turns and flips (with or without an untilted crop): whole-pixel copying. */
    get axisAligned() { return this.g.angle === 0 && this.g.vertical === 0 && this.g.horizontal === 0; }
}
function inside(quad, [x, y]) {
    let sign = 0;
    for (let i = 0; i < quad.length; i++) {
        const [ax, ay] = quad[i], [bx, by] = quad[(i + 1) % quad.length];
        const cross = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
        if (Math.abs(cross) < 1e-7)
            continue;
        const s = Math.sign(cross);
        if (sign === 0)
            sign = s;
        else if (s !== sign)
            return false;
    }
    return true;
}
const corners = (r) => [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]];
export function rectInside(quad, r, slack = 1e-6) {
    const shrink = { x: r.x + slack, y: r.y + slack, w: r.w - 2 * slack, h: r.h - 2 * slack };
    return corners(shrink).every((p) => inside(quad, p));
}
/** Shrink a rectangle about its centre (moving the centre in first if it is outside) until it
 * lies inside the quad. Aspect is kept. */
export function fitInside(quad, r) {
    if (rectInside(quad, r))
        return r;
    let cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    if (!inside(quad, [cx, cy])) {
        const mx = quad.reduce((s, p) => s + p[0], 0) / quad.length, my = quad.reduce((s, p) => s + p[1], 0) / quad.length;
        let lo = 0, hi = 1;
        for (let i = 0; i < 40; i++) {
            const t = (lo + hi) / 2;
            if (inside(quad, [mx + (cx - mx) * t, my + (cy - my) * t]))
                lo = t;
            else
                hi = t;
        }
        cx = mx + (cx - mx) * lo * 0.98;
        cy = my + (cy - my) * lo * 0.98;
    }
    let lo = 0, hi = 1;
    for (let i = 0; i < 40; i++) {
        const t = (lo + hi) / 2, cand = { x: cx - r.w * t / 2, y: cy - r.h * t / 2, w: r.w * t, h: r.h * t };
        if (rectInside(quad, cand))
            lo = t;
        else
            hi = t;
    }
    return { x: cx - r.w * lo / 2, y: cy - r.h * lo / 2, w: r.w * lo, h: r.h * lo };
}
/** The largest rectangle of pixel ratio `ratio` centred at (cx, cy) inside the quad. */
export function largestInside(quad, cx, cy, ratio, limit) {
    const w0 = ratio >= 1 ? limit : limit * ratio, h0 = w0 / ratio;
    return fitInside(quad, { x: cx - w0 / 2, y: cy - h0 / 2, w: w0, h: h0 });
}
/** The crop rectangle in canvas pixels of a width x height render, fitted inside the photo. */
export function cropRect(width, height, g) {
    const t = new Transform(width, height, g);
    const r = fitInside(t.quad(), { x: g.x * t.tw, y: g.y * t.th, w: g.w * t.tw, h: g.h * t.th });
    if (!t.axisAligned)
        return r;
    // Untilted: whole pixels, so the crop is an exact copy at every size; a fixed ratio keeps its
    // exact shape in whole pixels (a 1:1 crop is square at every size).
    const ratio = aspectRatio(g.aspect, t.tw, t.th);
    let [w, h] = outputSize(r.w, r.h, ratio);
    if (w > t.tw || h > t.th) {
        const k = Math.min(t.tw / w, t.th / h);
        [w, h] = outputSize(Math.floor(w * k), Math.floor(h * k), ratio);
    }
    w = Math.min(w, t.tw);
    h = Math.min(h, t.th);
    const x0 = Math.min(t.tw - w, Math.max(0, Math.round(r.x + (r.w - w) / 2))), y0 = Math.min(t.th - h, Math.max(0, Math.round(r.y + (r.h - h) / 2)));
    return { x: x0, y: y0, w, h };
}
/** Whole-pixel output size for a rectangle; with a fixed ratio the height follows the width. */
export function outputSize(w, h, ratio) {
    const ow = Math.max(1, Math.round(w));
    return [ow, Math.max(1, ratio ? Math.round(ow / ratio) : Math.round(h))];
}
/** The geometry after a change of tilt, turn or ratio, with the rectangle refitted:
 * while `auto`, the largest rectangle of the ratio around the frame centre; otherwise hers,
 * shrunk only as much as needed. */
export function refit(width, height, g) {
    const t = new Transform(width, height, g), quad = t.quad();
    const ratioOf = aspectRatio(g.aspect, t.tw, t.th) ?? (g.w * t.tw) / (g.h * t.th);
    let r;
    if (g.auto)
        r = largestInside(quad, t.tw / 2, t.th / 2, ratioOf, Math.max(t.tw, t.th));
    else {
        const cx = (g.x + g.w / 2) * t.tw, cy = (g.y + g.h / 2) * t.th, area = g.w * t.tw * g.h * t.th;
        const w = Math.sqrt(area * ratioOf), h = w / ratioOf;
        r = fitInside(quad, { x: cx - w / 2, y: cy - h / 2, w, h });
    }
    // A ratio rectangle is also capped to the turned frame, so "Original" never grows past it.
    const capped = capToFrame(r, t.tw, t.th);
    return { ...g, x: capped.x / t.tw, y: capped.y / t.th, w: capped.w / t.tw, h: capped.h / t.th };
}
function capToFrame(r, tw, th) {
    const k = Math.min(1, tw / r.w, th / r.h), w = r.w * k, h = r.h * k;
    const cx = Math.min(tw - w / 2, Math.max(w / 2, r.x + r.w / 2)), cy = Math.min(th - h / 2, Math.max(h / 2, r.y + r.h / 2));
    return { x: cx - w / 2, y: cy - h / 2, w, h };
}
/** Quarter turn clockwise (1) or anticlockwise (-1): the rectangle and the ratio turn too. */
export function turn(g, dir) {
    const quarter = (((g.quarter + dir) % 4) + 4) % 4;
    const rect = dir === 1 ? { x: 1 - g.y - g.h, y: g.x, w: g.h, h: g.w } : { x: g.y, y: 1 - g.x - g.w, w: g.h, h: g.w };
    // A flip stays a flip of the picture as she sees it: turning swaps which axis it is on.
    return { ...g, ...rect, quarter, aspect: swapAspect(g.aspect), flipH: g.flipV, flipV: g.flipH,
        vertical: dir === 1 ? g.horizontal : -g.horizontal, horizontal: dir === 1 ? -g.vertical : g.vertical };
}
export function flip(g, axis) {
    return axis === "h" ? { ...g, flipH: !g.flipH, x: 1 - g.x - g.w, angle: -g.angle, horizontal: -g.horizontal }
        : { ...g, flipV: !g.flipV, y: 1 - g.y - g.h, angle: -g.angle, vertical: -g.vertical };
}
/** Bilinear sample of a byte image at continuous source position (sx, sy), edge clamped. */
function sample(img, sx, sy, out, at) {
    const { width, height, channels: ch, data } = img;
    const fx = Math.min(width - 1, Math.max(0, sx - 0.5)), fy = Math.min(height - 1, Math.max(0, sy - 0.5));
    const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(width - 1, x0 + 1), y1 = Math.min(height - 1, y0 + 1);
    const tx = fx - x0, ty = fy - y0;
    for (let c = 0; c < 3; c++) {
        const a = data[(y0 * width + x0) * ch + c], b = data[(y0 * width + x1) * ch + c];
        const d = data[(y1 * width + x0) * ch + c], e = data[(y1 * width + x1) * ch + c];
        const top = a + (b - a) * tx, bottom = d + (e - d) * tx;
        out[at + c] = Math.round(top + (bottom - top) * ty);
    }
}
/** Render the geometry: the crop of the transformed photo, at this image's resolution. With
 * `whole`, the full transformed frame is drawn instead (the crop panel's view), and pixels
 * outside the photo get `outside`. */
export function applyGeometry(img, g, options = {}) {
    const t = new Transform(img.width, img.height, g);
    if (!options.whole && isIdentity(g))
        return { width: img.width, height: img.height, channels: 3, data: rgbCopy(img) };
    const rect = options.whole ? { x: 0, y: 0, w: t.tw, h: t.th } : cropRect(img.width, img.height, g);
    let [ow, oh] = outputSize(rect.w, rect.h, options.whole ? null : aspectRatio(g.aspect, t.tw, t.th));
    if (options.maxSide && Math.max(ow, oh) > options.maxSide) {
        const k = options.maxSide / Math.max(ow, oh);
        ow = Math.max(1, Math.round(ow * k));
        oh = Math.max(1, Math.round(oh * k));
    }
    const out = new Uint8Array(ow * oh * 3), sx = rect.w / ow, sy = rect.h / oh, fill = options.outside ?? [0, 0, 0];
    for (let j = 0; j < oh; j++)
        for (let i = 0; i < ow; i++) {
            const src = t.inverse([rect.x + (i + 0.5) * sx, rect.y + (j + 0.5) * sy]), at = (j * ow + i) * 3;
            if (!src || (options.whole && (src[0] < 0 || src[1] < 0 || src[0] > img.width || src[1] > img.height))) {
                out[at] = fill[0];
                out[at + 1] = fill[1];
                out[at + 2] = fill[2];
                continue;
            }
            sample(img, src[0], src[1], out, at);
        }
    return { width: ow, height: oh, channels: 3, data: out };
}
function rgbCopy(img) {
    if (img.channels === 3)
        return Uint8Array.from(img.data);
    const out = new Uint8Array(img.width * img.height * 3);
    for (let i = 0; i < img.width * img.height; i++)
        for (let c = 0; c < 3; c++)
            out[i * 3 + c] = img.data[i * img.channels + c];
    return out;
}
/** The source position, as shares of the photo (0..1), under a point given as shares of the
 * rendered output: the inverse of what applyGeometry draws there. Tools that take input on the
 * cropped picture (the retouch brushes) store positions in source shares. Null outside the photo. */
export function outputShareToSource(width, height, g, [u, v]) {
    if (isIdentity(g))
        return [u, v];
    const t = new Transform(width, height, g), rect = cropRect(width, height, g);
    const src = t.inverse([rect.x + u * rect.w, rect.y + v * rect.h]);
    if (!src)
        return null;
    const x = src[0] / width, y = src[1] / height;
    return x < -1e-6 || y < -1e-6 || x > 1 + 1e-6 || y > 1 + 1e-6 ? null : [Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y))];
}
/** Where a source pixel position lands in the output (for tests and the panel's markers). */
export function mapToOutput(width, height, g, p) {
    const t = new Transform(width, height, g), rect = cropRect(width, height, g), q = t.forward(p);
    return [q[0] - rect.x, q[1] - rect.y];
}
