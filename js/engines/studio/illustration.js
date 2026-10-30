/** Illustration looks on her own photo (features 67, 83, 84): cartoon, comic, watercolour
 * wash and painted portrait, drawn from her photo's pixels with this package's kernels. No
 * neural style transfer, costume or generated face; pixels never move. Cel bands follow her
 * shading relative to her own skin and never rise above it, and her own dark marks are drawn
 * back in, so every skin tone keeps its colour and freckles. Mirrors
 * api/plumb_api/filters/artistic/illustration.py. It sits beside the studio rather than in
 * web/src/filters, whose source digest pins the measured Proof Wall run. Author: John Khan.
 */
import { boxMean } from "../core/filters.js";
import { sobel } from "../../filters/artistic/ink.js";
import { kuwahara, paintTexture } from "../../filters/artistic/oil.js";
import { blend, hashNoise, luma, number, parameters, photo, result, rgbValues, smooth01 } from "../../filters/artistic/types.js";
export const LOOKS = Object.freeze({
    "sancerre-cartoon": { name: "Sancerre cartoon", row: 83 },
    "fougeres-comic": { name: "Fougères comic", row: 67 },
    "banyuls-wash": { name: "Banyuls wash", row: 67 },
    "chambord-portrait": { name: "Chambord portrait", row: 84 },
});
export const DEFAULTS = { amount: 1.0 };
export const LABEL = "Illustration filter on your own photo. Your face shape is unchanged; nothing is generated.";
export const HALFTONE_PITCH = 5.0;
export const VARNISH = [1.0, 0.93, 0.80];
export const MARK_RADIUS = 4;
const boxPlane = (v, w, h, r) => boxMean({ width: w, height: h, channels: 1, data: v }, r).data;
function lumaPlane(rgb, n, plus = 0) {
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++)
        out[i] = luma(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]) + plus;
    return out;
}
function cel(rgb, source, w, h, levels, ink, threshold) {
    const n = w * h, lum = lumaPlane(rgb, n, 1);
    const base = boxPlane(lum, w, h, Math.max(2, Math.floor(Math.min(h, w) / 16)));
    const rel = new Float64Array(n), half = new Float64Array(n), band = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        rel[i] = lum[i] / base[i];
        half[i] = rel[i] / 2;
        band[i] = Math.floor(Math.min(1, Math.max(0, rel[i])) * levels + 0.5) / levels;
    }
    const edge = sobel(half, w, h), src = lumaPlane(source, n), local = boxPlane(src, w, h, MARK_RADIUS);
    const out = new Float64Array(n * 3);
    for (let i = 0; i < n; i++) {
        const scale = band[i] / rel[i] * (1 - ink * smooth01((edge[i] - threshold) / 0.05));
        const mark = Math.min(0, src[i] - local[i]);
        for (let k = 0; k < 3; k++)
            out[i * 3 + k] = rgb[i * 3 + k] * scale + mark;
    }
    return { rgb: out, band };
}
function cartoon(rgb, w, h) {
    return cel(kuwahara(rgb, w, h, 2).rgb, rgb, w, h, 3, 0.8, 0.03).rgb;
}
function comic(rgb, w, h) {
    const { rgb: flat, band } = cel(rgb, rgb, w, h, 2, 0.9, 0.025);
    const c = Math.cos(Math.PI / 4), s = Math.sin(Math.PI / 4);
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            const i = y * w + x, px = x + 0.5, py = y + 0.5;
            const u = (px * c + py * s) / HALFTONE_PITCH, v = (-px * s + py * c) / HALFTONE_PITCH;
            const du = u - Math.floor(u) - 0.5, dv = v - Math.floor(v) - 0.5;
            const shadow = Math.min(1, Math.max(0, 1 - band[i]));
            const dot = 1 - smooth01((Math.sqrt(du * du + dv * dv) - 0.5 * shadow) / 0.08);
            const keep = 1 - 0.35 * dot * (shadow > 0 ? 1 : 0);
            for (let k = 0; k < 3; k++)
                flat[i * 3 + k] *= keep;
        }
    return flat;
}
function wash(rgb, w, h) {
    const painted = kuwahara(rgb, w, h, 2).rgb, n = w * h;
    const lum = lumaPlane(painted, n), unit = lum.map((v) => v / 255), edges = sobel(unit, w, h);
    const out = new Float64Array(n * 3);
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            const i = y * w + x;
            const paper = 1 - 0.06 * hashNoise(Math.floor((x + 0.5) / 2), Math.floor((y + 0.5) / 2), 41);
            const keep = paper * (1 - 0.22 * smooth01(edges[i] / 0.12));
            for (let k = 0; k < 3; k++)
                out[i * 3 + k] = (painted[i * 3 + k] * 0.9 + lum[i] * 0.1) * keep;
        }
    return out;
}
function portrait(rgb, w, h) {
    const painted = kuwahara(rgb, w, h, 4).rgb, canvas = paintTexture(w, h, 29, -0.6, 1.2);
    const out = new Float64Array(w * h * 3);
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            const i = y * w + x, px = x + 0.5, py = y + 0.5;
            const rx = (px - w / 2) / (0.75 * w), ry = (py - h * 0.42) / (0.75 * h);
            const r = Math.min(1, Math.max(0, Math.sqrt(rx * rx + ry * ry)));
            const vignette = 1 - 0.35 * r ** 2;
            for (let k = 0; k < 3; k++) {
                const p = painted[i * 3 + k], headroom = Math.min(p, 255 - p) / 127.5;
                out[i * 3 + k] = Math.min(255, Math.max(0, p * VARNISH[k] * vignette + 0.5 * canvas[i] * headroom));
            }
        }
    return out;
}
const DRAW = {
    "sancerre-cartoon": cartoon, "fougeres-comic": comic, "banyuls-wash": wash, "chambord-portrait": portrait,
};
export function illustrate(look, image, params) {
    if (!Object.hasOwn(LOOKS, look))
        throw new RangeError(`look must be one of ${Object.keys(LOOKS).join(", ")}`);
    const src = photo(image), n = src.width * src.height;
    const amount = number(parameters(params, DEFAULTS).amount, "amount", 0, 1);
    const drawn = DRAW[look](rgbValues(src), src.width, src.height).map((v) => Math.min(255, Math.max(0, v)));
    const support = new Float64Array(n).fill(amount);
    const out = blend(src, drawn, support);
    let before = 0, after = 0;
    for (let i = 0; i < n; i++) {
        const o = i * src.channels;
        before += luma(src.data[o], src.data[o + 1], src.data[o + 2]);
        after += luma(out[o], out[o + 1], out[o + 2]);
    }
    return result(look, src, out, support, LABEL, { geometry_displacement: 0, look, mean_luma_change: (after - before) / n }, ["Illustration of your own photo; no costume, body, face or background is generated."]);
}
//# sourceMappingURL=illustration.js.map