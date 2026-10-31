/** Effect lenses: colour and light grades and overlays drawn by our own code, per pixel.
 *
 * Ten effects: film grain with a light leak, VHS lines, comic ink outline, pastel dream, golden
 * hour, rain on glass, a starfield behind her, bokeh hearts behind her, a mirror kaleidoscope
 * behind her, and a neon rim light around her. "Behind her" uses the person mask when the live
 * pipeline measured one, otherwise a head-and-shoulders estimate from the face frame (an
 * ellipse over the head and a widening shape below the chin; ASSUMED proportions).
 * Skin rule: every grade that could brighten (grain, leak, pastel lift, warm glow, posterize)
 * is limited on her (face outline plus the person area) so a pixel there is never lighter than it was, by scaling
 * its colour back to the original luminance; overlays (rain drops, stars, neon) are not grades
 * and sit on top. Grain, drops and twinkles depend on the frame time, so they move on video and
 * are fixed on a still. Constants are ASSUMED, chosen on drawn faces. Author: John Khan.
 */
import { floatImage } from "../engines/core/buffer.js";
import { boxMean } from "../engines/core/filters.js";
import { CONTOURS } from "../data/regions/index.js";
export const EFFECTS = ["film", "vhs", "comic", "pastel", "golden", "rain", "stars", "bokeh", "kaleido", "neon-rim"];
export const EFFECT_LABEL = "Effect lens: a colour, light or drawn overlay of our own. A simulation.";
const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
function hash(a, b, c) {
    let h = (Math.imul(a, 0x27d4eb2d) ^ Math.imul(b + 1, 0x165667b1) ^ Math.imul(c + 7, 0x9e3779b1)) >>> 0;
    h ^= h >>> 15;
    h = Math.imul(h, 0x2c1b3c6d) >>> 0;
    h ^= h >>> 12;
    return (h >>> 0) / 2 ** 32;
}
// Static textures, made once per frame size and reused (grain frames, light leak, scan lines).
const GRAIN_FRAMES = 8;
const textures = new Map();
function texturesFor(width, height) {
    const key = `${width}x${height}`;
    let hit = textures.get(key);
    if (!hit) {
        const grain = Array.from({ length: GRAIN_FRAMES }, (_, k) => {
            const g = new Int8Array(width * height);
            for (let i = 0; i < g.length; i++)
                g[i] = Math.round((hash(i % width, (i / width) | 0, k) - 0.5) * 34);
            return g;
        });
        const leak = new Float32Array(width * height);
        for (let y = 0; y < height; y++)
            for (let x = 0; x < width; x++)
                leak[y * width + x] = Math.max(0, 1 - Math.hypot(x / width, (y / height) * 1.3) / 0.75) * 0.55;
        hit = { grain, leak };
        if (textures.size > 6)
            textures.clear();
        textures.set(key, hit);
    }
    return hit;
}
/** 0..1 per pixel: how much of the person (head and shoulders) is at each pixel. */
export function personEstimate(f, width, height) {
    const out = new Float32Array(width * height), [cx, cy] = f.centre, w = f.width, hh = f.height;
    const chinV = 0.5 * hh;
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
            const dx = x - cx, dy = y - cy, du = dx * f.u[0] + dy * f.u[1], dv = dx * f.v[0] + dy * f.v[1];
            const head = (du / (0.68 * w)) ** 2 + ((dv + 0.12 * hh) / (0.72 * hh)) ** 2;
            let v = head < 1 ? 1 : head < 1.25 ? (1.25 - head) / 0.25 : 0;
            if (dv > chinV * 0.6) {
                const half = 0.33 * w + Math.max(0, dv - chinV) * 1.3, edge = half - Math.abs(du);
                v = Math.max(v, Math.max(0, Math.min(1, edge / (0.05 * w))));
            }
            out[y * width + x] = v;
        }
    return out;
}
/** The face outline (the mesh's face_oval contour, data/regions CONTOURS) filled by scanline,
 * one value per pixel: 1 inside, 0 outside. Fast enough to run on every live frame. */
export function faceOval(f, width, height) {
    const out = new Uint8Array(width * height), poly = CONTOURS.face_oval.map((i) => f.points[i]);
    let top = Infinity, bottom = -Infinity;
    for (const p of poly) {
        top = Math.min(top, p[1]);
        bottom = Math.max(bottom, p[1]);
    }
    const xs = [];
    for (let y = Math.max(0, Math.floor(top)); y <= Math.min(height - 1, Math.ceil(bottom)); y++) {
        const yc = y + 0.5;
        xs.length = 0;
        for (let k = 0, m = poly.length - 1; k < poly.length; m = k++) {
            const [ax, ay] = poly[m], [bx, by] = poly[k];
            if ((ay > yc) !== (by > yc))
                xs.push(ax + (yc - ay) * (bx - ax) / (by - ay));
        }
        xs.sort((p, q) => p - q);
        for (let k = 0; k + 1 < xs.length; k += 2) {
            for (let x = Math.max(0, Math.ceil(xs[k] - 0.5)); x <= Math.min(width - 1, Math.floor(xs[k + 1] - 0.5)); x++)
                out[y * width + x] = 1;
        }
    }
    return out;
}
/** Undo any brightening on her (face outline, and the person mask or head-and-shoulders
 * estimate, so the neck is covered too): scale the colour back to the old luminance. */
export function keepSkinNoLighter(original, out, f, person = null) {
    const oval = faceOval(f, out.width, out.height), c = out.channels;
    const body = person && person.length === oval.length ? person : personEstimate(f, out.width, out.height);
    const src = original.data, d = out.data;
    for (let i = 0; i < out.width * out.height; i++) {
        const weight = oval[i] ? 1 : body[i];
        if (weight <= 0)
            continue;
        const o = i * c;
        if (d[o] <= src[o] && d[o + 1] <= src[o + 1] && d[o + 2] <= src[o + 2])
            continue; // nothing got lighter
        const before = 0.2126 * src[o] + 0.7152 * src[o + 1] + 0.0722 * src[o + 2];
        const after = 0.2126 * d[o] + 0.7152 * d[o + 1] + 0.0722 * d[o + 2];
        if (after <= before || after <= 0)
            continue;
        const k = 1 - weight * (1 - before / after);
        d[o] = Math.floor(d[o] * k);
        d[o + 1] = Math.floor(d[o + 1] * k);
        d[o + 2] = Math.floor(d[o + 2] * k);
    }
}
function blend(out, i, rgb, a, mode = "over") {
    if (a <= 0)
        return;
    const o = i * out.channels;
    for (let q = 0; q < 3; q++) {
        const v = out.data[o + q];
        const t = mode === "screen" ? 255 - (255 - v) * (255 - rgb[q]) / 255 : mode === "multiply" ? v * rgb[q] / 255 : rgb[q];
        out.data[o + q] = clamp(Math.round(v + Math.min(1, a) * (t - v)));
    }
}
function heartInside(x, y) {
    const yy = -y * 1.1 + 0.25;
    return (x * x + yy * yy - 1) ** 3 - x * x * yy ** 3 <= 0;
}
/** Apply one effect at `share` (0..1) at frame time `t`. */
export function applyEffect(image, f, kind, share, t = 0, person = null) {
    if (!EFFECTS.includes(kind))
        throw new RangeError(`no effect lens ${JSON.stringify(kind)}`);
    const out = { ...image, data: new Uint8ClampedArray(image.data) };
    if (share <= 0)
        return out;
    const { width: W, height: H, channels: c } = image, n = W * H, frameNo = Math.floor(t * 12);
    const body = () => person && person.length === n ? person : personEstimate(f, W, H);
    const src = image.data;
    switch (kind) {
        case "film": {
            const tex = texturesFor(W, H), grain = tex.grain[frameNo % GRAIN_FRAMES], leak = tex.leak, d = out.data;
            for (let i = 0; i < n; i++) {
                const o = i * c, g = grain[i] * share, a = leak[i] * share;
                // grain, then a warm light leak screened on: v + a * (screen(v) - v)
                let r = src[o] + g, gg = src[o + 1] + g, b = src[o + 2] + g;
                r = r < 0 ? 0 : r > 255 ? 255 : r;
                gg = gg < 0 ? 0 : gg > 255 ? 255 : gg;
                b = b < 0 ? 0 : b > 255 ? 255 : b;
                d[o] = r + a * (255 - (255 - r) * 0.0 - r);
                d[o + 1] = gg + a * ((255 - (255 - gg) * (105 / 255)) - gg);
                d[o + 2] = b + a * ((255 - (255 - b) * (185 / 255)) - b);
            }
            keepSkinNoLighter(image, out, f, person);
            break;
        }
        case "vhs": {
            const shift = Math.max(1, Math.round(0.006 * W * share)), band = (t * 0.25) % 1, grain = texturesFor(W, H).grain[frameNo % GRAIN_FRAMES];
            const fade = 0.2 * share, d = out.data, b0 = Math.floor((band - 0.03) * H), b1 = Math.ceil((band + 0.03) * H);
            for (let y = 0; y < H; y++) {
                const line = y % 3 === 0 ? 1 - 0.22 * share : 1, noisy = y >= b0 && y <= b1 ? 1.5 * share : 0;
                for (let x = 0; x < W; x++) {
                    const i = y * W + x, o = i * c, xr = x + shift < W ? x + shift : W - 1, xb = x - shift >= 0 ? x - shift : 0;
                    const r = src[(y * W + xr) * c], g = src[o + 1], b = src[(y * W + xb) * c + 2];
                    const m = 0.2126 * r + 0.7152 * g + 0.0722 * b, noise = noisy ? grain[i] * noisy : 0;
                    d[o] = (r + (m - r) * fade) * line + noise;
                    d[o + 1] = (g + (m - g) * fade) * line + noise;
                    d[o + 2] = (b + (m - b) * fade) * line + noise;
                }
            }
            keepSkinNoLighter(image, out, f, person);
            break;
        }
        case "comic": {
            // Ink lines on the edges, and the brightness (not the hue) stepped into five levels, so a
            // face keeps its own skin colour on every tone instead of breaking into colour bands.
            const L = new Float32Array(n), d = out.data, step = 255 / 4;
            for (let i = 0; i < n; i++)
                L[i] = 0.2126 * src[i * c] + 0.7152 * src[i * c + 1] + 0.0722 * src[i * c + 2];
            for (let y = 1; y < H - 1; y++)
                for (let x = 1; x < W - 1; x++) {
                    const i = y * W + x, o = i * c;
                    const gx = L[i - W + 1] + 2 * L[i + 1] + L[i + W + 1] - L[i - W - 1] - 2 * L[i - 1] - L[i + W - 1];
                    const gy = L[i + W - 1] + 2 * L[i + W] + L[i + W + 1] - L[i - W - 1] - 2 * L[i - W] - L[i - W + 1];
                    const mag = Math.sqrt(gx * gx + gy * gy), edge = mag <= 90 ? 0 : mag >= 230 ? 1 : (mag - 90) / 140;
                    const l = L[i], stepped = Math.max(step / 2, Math.round(l / step) * step);
                    const scale = (l > 1 ? 1 + share * 0.6 * (stepped / l - 1) : 1) * (1 - 0.85 * share * edge);
                    d[o] = src[o] * scale;
                    d[o + 1] = src[o + 1] * scale;
                    d[o + 2] = src[o + 2] * scale;
                }
            keepSkinNoLighter(image, out, f, person);
            break;
        }
        case "pastel": {
            // Mostly on the background: on her (face outline and person area) only a quarter of the
            // wash, so skin keeps its own colour instead of going grey on deep or fair skin alike.
            const oval = faceOval(f, W, H), m0 = body();
            for (let i = 0; i < n; i++) {
                const o = i * c, m = lum(src[o], src[o + 1], src[o + 2]), on = oval[i] ? 1 : m0[i], k = share * (1 - 0.75 * on);
                const tintRgb = [248, 214, 232];
                for (let q = 0; q < 3; q++) {
                    const soft = src[o + q] + (m - src[o + q]) * 0.35; // less saturated
                    const lifted = 40 + soft * (215 / 255); // lower contrast
                    const mixed = lifted * 0.85 + tintRgb[q] * 0.15;
                    out.data[o + q] = clamp(Math.round(src[o + q] + k * (mixed - src[o + q])));
                }
            }
            keepSkinNoLighter(image, out, f, person);
            break;
        }
        case "golden": {
            for (let y = 0; y < H; y++)
                for (let x = 0; x < W; x++) {
                    const i = y * W + x, o = i * c;
                    out.data[o] = clamp(Math.round(src[o] * (1 + 0.08 * share)));
                    out.data[o + 1] = clamp(Math.round(src[o + 1] * (1 + 0.02 * share)));
                    out.data[o + 2] = clamp(Math.round(src[o + 2] * (1 - 0.14 * share)));
                    const glow = Math.max(0, 1 - Math.hypot((x - W) / W, y / H) / 0.9) * 0.45 * share;
                    blend(out, i, [255, 190, 110], glow, "screen");
                }
            keepSkinNoLighter(image, out, f, person);
            break;
        }
        case "rain": {
            for (let i = 0; i < n; i++)
                for (let q = 0; q < 3; q++)
                    out.data[i * c + q] = clamp(Math.round(src[i * c + q] * (1 - 0.1 * share) + (q === 2 ? 6 * share : 0)));
            const drops = Math.round(70 * share);
            for (let k = 0; k < drops; k++) {
                const r = (0.008 + 0.022 * hash(k, 3, 5)) * W, x0 = hash(k, 1, 9) * W;
                const y0 = ((hash(k, 2, 9) + t * (0.02 + 0.06 * hash(k, 4, 1))) % 1) * H;
                for (let y = Math.max(0, Math.floor(y0 - r)); y <= Math.min(H - 1, Math.ceil(y0 + r * 1.2)); y++) {
                    for (let x = Math.max(0, Math.floor(x0 - r)); x <= Math.min(W - 1, Math.ceil(x0 + r)); x++) {
                        const dx = (x - x0) / r, dy = (y - y0) / (r * 1.2), d2 = dx * dx + dy * dy;
                        if (d2 > 1)
                            continue;
                        // A drop is a tiny lens: it shows the scene flipped and shrunk, with a rim and a glint.
                        const sx = Math.round(Math.min(W - 1, Math.max(0, x0 - dx * r * 2.5))), sy = Math.round(Math.min(H - 1, Math.max(0, y0 - dy * r * 2.5)));
                        const i = y * W + x, s = (sy * W + sx) * c;
                        blend(out, i, [src[s], src[s + 1], src[s + 2]], 0.9);
                        if (d2 > 0.75)
                            blend(out, i, [40, 50, 60], 0.35 * share);
                        if ((dx + 0.35) ** 2 + (dy + 0.4) ** 2 < 0.05)
                            blend(out, i, [255, 255, 255], 0.75);
                    }
                }
            }
            break;
        }
        case "stars": {
            const m = body();
            for (let i = 0; i < n; i++) {
                const bg = (1 - m[i]) * share;
                blend(out, i, [22, 24, 52], bg * 0.88, "over");
            }
            const count = Math.round(W * H / 900);
            for (let k = 0; k < count; k++) {
                const x = Math.floor(hash(k, 7, 1) * W), y = Math.floor(hash(k, 8, 2) * H), i = y * W + x;
                const twinkle = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(2 * Math.PI * (t * 0.8 + hash(k, 9, 3))));
                const a = (1 - m[i]) * share * twinkle, big = hash(k, 5, 5) > 0.92;
                blend(out, i, [255, 250, 230], a);
                if (big)
                    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                        const xx = x + dx, yy = y + dy;
                        if (xx >= 0 && yy >= 0 && xx < W && yy < H)
                            blend(out, yy * W + xx, [255, 240, 210], a * 0.6);
                    }
            }
            break;
        }
        case "bokeh": {
            const m = body(), count = 16;
            for (let k = 0; k < count; k++) {
                const r = (0.03 + 0.05 * hash(k, 1, 2)) * W, x0 = hash(k, 2, 3) * W;
                const y0 = (hash(k, 3, 4) * H + Math.sin(2 * Math.PI * (t * 0.15 + hash(k, 4, 5))) * 0.02 * H);
                const colour = [[248, 160, 190], [252, 214, 150], [220, 170, 240]][k % 3];
                for (let y = Math.max(0, Math.floor(y0 - r)); y <= Math.min(H - 1, Math.ceil(y0 + r)); y++) {
                    for (let x = Math.max(0, Math.floor(x0 - r)); x <= Math.min(W - 1, Math.ceil(x0 + r)); x++) {
                        if (!heartInside((x - x0) / r, (y - y0) / r))
                            continue;
                        const i = y * W + x;
                        blend(out, i, colour, 0.38 * share * (1 - m[i]), "screen");
                    }
                }
            }
            break;
        }
        case "kaleido": {
            // The kaleidoscope sampling is smooth, so it is worked out on every second pixel and
            // shared by the 2 x 2 block; only the background (1 - person) is blended in.
            const m = body(), cx = W / 2, cy = H / 2, sectors = 6, wedge = Math.PI / sectors, d = out.data;
            for (let y = 0; y < H; y += 2)
                for (let x = 0; x < W; x += 2) {
                    let any = false;
                    for (let q = 0; q < 4; q++) {
                        const xx = x + (q & 1), yy = y + (q >> 1);
                        if (xx < W && yy < H && m[yy * W + xx] < 1) {
                            any = true;
                            break;
                        }
                    }
                    if (!any)
                        continue;
                    let ang = Math.atan2(y + 0.5 - cy, x + 0.5 - cx) + t * 0.2;
                    ang = ((ang % (2 * wedge)) + 2 * wedge) % (2 * wedge);
                    if (ang > wedge)
                        ang = 2 * wedge - ang;
                    const rad = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
                    // Sample a wedge of the upper corners of the picture, where the background is.
                    const sx = Math.round(Math.min(W - 1, Math.max(0, rad * Math.cos(ang) * 0.9))), sy = Math.round(Math.min(H - 1, Math.max(0, rad * Math.sin(ang) * 0.9)));
                    const s0 = (sy * W + sx) * c;
                    for (let q = 0; q < 4; q++) {
                        const xx = x + (q & 1), yy = y + (q >> 1);
                        if (xx >= W || yy >= H)
                            continue;
                        const i = yy * W + xx, a = (1 - m[i]) * share;
                        if (a <= 0)
                            continue;
                        const o = i * c;
                        for (let k = 0; k < 3; k++)
                            d[o + k] = src[o + k] + a * (src[s0 + k] - src[o + k]);
                    }
                }
            break;
        }
        case "neon-rim": {
            const m = body(), mask = floatImage(W, H, 1);
            mask.data.set(m);
            const blur = boxMean(mask, Math.max(1, Math.min(32, Math.round(0.02 * W))));
            for (let y = 0; y < H; y++)
                for (let x = 0; x < W; x++) {
                    const i = y * W + x, rim = Math.max(0, Math.min(1, (blur.data[i] - m[i]) * 4)) * share;
                    if (rim <= 0)
                        continue;
                    blend(out, i, y / H < 0.5 ? [255, 80, 200] : [150, 90, 255], rim, "screen");
                }
            break;
        }
    }
    return out;
}
