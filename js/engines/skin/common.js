/** Shared pieces of the local skin tools: the landmark skin mask, the face frame,
 * skin-only low-pass planes, the Lab round trip and the no-lightening byte guard.
 * Mirrors api/plumb_api/engines/skin/common.py with the same operation order, so
 * both ports give the same bytes (within one step where pow/exp differ in the last bit).
 * Author: John Khan.
 */
import { boxMean } from "../core/filters.js";
import { labToSrgb, srgbToLab, toByte } from "../shade/colourspace.js";
import { regionMask } from "../../data/regions/index.js";
export const SKIN_SUPERSAMPLE = 2;
export const MIN_SKIN_PIXELS = 900;
export const NOTE = "Simulation, not medical advice.";
/** The face's own axes: origin between the pupils, unit = inter-pupil distance. */
export class Frame {
    ox;
    oy;
    ux;
    uy;
    iod;
    constructor(ox, oy, ux, uy, iod) {
        this.ox = ox;
        this.oy = oy;
        this.ux = ux;
        this.uy = uy;
        this.iod = iod;
    }
    point(a, b) {
        return [this.ox + this.iod * (a * this.ux - b * this.uy), this.oy + this.iod * (a * this.uy + b * this.ux)];
    }
    local(x, y) {
        const dx = (x - this.ox) / this.iod, dy = (y - this.oy) / this.iod;
        return [dx * this.ux + dy * this.uy, -dx * this.uy + dy * this.ux];
    }
}
export function xy(p) {
    return Array.isArray(p) ? [Number(p[0]), Number(p[1])] : [Number(p.x), Number(p.y)];
}
export function frame(points) {
    const [rx, ry] = xy(points[468]), [lx, ly] = xy(points[473]);
    const dx = lx - rx, dy = ly - ry, iod = Math.sqrt(dx * dx + dy * dy);
    return new Frame((rx + lx) / 2, (ry + ly) / 2, dx / iod, dy / iod, iod);
}
export function skinMask(points, width, height) {
    const mask = regionMask("skin", points, width, height, { normalized: false, supersample: SKIN_SUPERSAMPLE });
    return Float64Array.from(mask.data);
}
export function radius(iod, share, minimum = 1) {
    return Math.max(minimum, Math.floor(iod * share + 0.5));
}
function box(plane, width, height, r) {
    return boxMean({ width, height, channels: 1, data: plane }, r).data;
}
/** Mean of `plane` over skin only, so the background never bleeds into the skin. */
export function maskedLowpass(plane, mask, width, height, r) {
    const product = new Float64Array(plane.length);
    for (let i = 0; i < plane.length; i++)
        product[i] = plane[i] * mask[i];
    const num = box(product, width, height, r), den = box(mask, width, height, r);
    const out = new Float64Array(plane.length);
    for (let i = 0; i < plane.length; i++)
        out[i] = num[i] / Math.max(den[i], 1e-6);
    return out;
}
export function checkPhoto(image) {
    if (!Number.isInteger(image.width) || !Number.isInteger(image.height) || Math.min(image.width, image.height) < 8
        || (image.channels !== 3 && image.channels !== 4) || image.data.length !== image.width * image.height * image.channels) {
        throw new RangeError("skin tools need an RGB or RGBA photo of at least 8 x 8 pixels");
    }
}
export function checkStrength(strength) {
    if (!Number.isFinite(strength) || strength < 0 || strength > 100)
        throw new RangeError("strength must be 0..100");
    return strength / 100;
}
export function copyOf(image) { return Uint8Array.from(image.data); }
export function labPlanes(image) {
    const n = image.width * image.height, ch = image.channels;
    const L = new Float64Array(n), a = new Float64Array(n), b = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        const lab = srgbToLab([image.data[i * ch], image.data[i * ch + 1], image.data[i * ch + 2]]);
        L[i] = lab[0];
        a[i] = lab[1];
        b[i] = lab[2];
    }
    return { L, a, b };
}
function lightness(data, ch, i) {
    return srgbToLab([data[i * ch], data[i * ch + 1], data[i * ch + 2]])[0];
}
/** Write revised Lab back to bytes inside `weight > 0`; every other byte, and alpha, is copied. */
export function encode(image, lab, weight) {
    const out = copyOf(image), ch = image.channels;
    for (let i = 0; i < weight.length; i++) {
        if (!(weight[i] > 0))
            continue;
        const rgb = labToSrgb([lab.L[i], lab.a[i], lab.b[i]]);
        for (let c = 0; c < 3; c++)
            out[i * ch + c] = toByte(rgb[c]);
    }
    return out;
}
/** Any edited pixel whose L* rose in rounding moves one byte darker on every channel;
 * if it still rose, it is restored. Returns the number of pixels touched. */
export function noLighten(image, out, weight) {
    const ch = image.channels;
    let touched = 0;
    for (let i = 0; i < weight.length; i++) {
        if (!(weight[i] > 0))
            continue;
        const before = lightness(image.data, ch, i);
        if (!(lightness(out, ch, i) > before))
            continue;
        touched++;
        for (let c = 0; c < 3; c++)
            if (out[i * ch + c] > 0)
                out[i * ch + c] -= 1;
        if (lightness(out, ch, i) > before)
            for (let c = 0; c < 3; c++)
                out[i * ch + c] = image.data[i * ch + c];
    }
    return touched;
}
/** The repo's 32-bit linear congruential step (engines/skin/glow-tan.ts). */
export function lcg(state) { return (Math.imul(1664525, state) + 1013904223) >>> 0; }
/** Smooth bump (1 - d^2/r^2)^2 at face coordinates (a, b), r in IOD units, at pixel centres. */
export function blob(face, width, height, a, b, r) {
    const out = new Float64Array(width * height);
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
            const [la, lb] = face.local(x + 0.5, y + 0.5);
            const d2 = ((la - a) * (la - a) + (lb - b) * (lb - b)) / (r * r);
            out[y * width + x] = d2 >= 1 ? 0 : (1 - d2) * (1 - d2);
        }
    return out;
}
export function median(values) {
    const sorted = [...values].sort((p, q) => p - q), n = sorted.length;
    return n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
}
export function unchanged(image, label, metrics = {}) {
    return { image: copyOf(image), weight: new Float64Array(image.width * image.height), label, metrics: { ...metrics, unchanged: true } };
}
//# sourceMappingURL=common.js.map