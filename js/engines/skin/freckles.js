/** Freckles: drawn, seeded freckles across the nose bridge and upper cheeks.
 * Mirrors api/plumb_api/engines/skin/freckles.py: same generator, same placement
 * arithmetic, same freckles. Only darkens and warms; her own marks are untouched.
 * Author: John Khan.
 */
import { checkPhoto, checkStrength, encode, labPlanes, lcg, NOTE, noLighten, unchanged } from "./common.js";
export const MAX_FRECKLES = 90;
export const ATTEMPTS_PER_FRECKLE = 12;
const BOX = [-1.15, 1.15, 0.05, 0.95];
const ZONE = [[0.0, 0.50, 0.42], [-0.62, 0.50, 0.48], [0.62, 0.50, 0.48]];
const RADIUS_IOD = [0.014, 0.016];
const DEPTH_L = [5.0, 7.0];
const WARM = [0.15, 0.35];
export const LABEL = "Freckle simulation: drawn freckles added, your own marks kept. " + NOTE;
export function zoneWeight(a, b) {
    let best = 0;
    for (const [ca, cb, r] of ZONE) {
        const d2 = ((a - ca) * (a - ca) + (b - cb) * (b - cb)) / (r * r);
        if (d2 < 1)
            best = Math.max(best, (1 - d2) * (1 - d2));
    }
    return best;
}
export function place(face, skin, width, height, density, seed) {
    if (!Number.isFinite(density) || density < 0 || density > 100)
        throw new RangeError("density must be 0..100");
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)
        throw new RangeError("seed must be an unsigned 32-bit integer");
    const wanted = Math.floor(density / 100 * MAX_FRECKLES + 0.5);
    const [a0, a1, b0, b1] = BOX;
    const out = [];
    let state = seed;
    for (let attempt = 0; attempt < wanted * ATTEMPTS_PER_FRECKLE && out.length < wanted; attempt++) {
        state = lcg(state);
        const a = a0 + (a1 - a0) * (state / 4294967296);
        state = lcg(state);
        const b = b0 + (b1 - b0) * (state / 4294967296);
        state = lcg(state);
        const keep = state / 4294967296;
        state = lcg(state);
        const size = state / 4294967296;
        state = lcg(state);
        const depth = state / 4294967296;
        if (zoneWeight(a, b) <= keep)
            continue;
        const [x, y] = face.point(a, b), col = Math.floor(x), row = Math.floor(y);
        if (col < 0 || col >= width || row < 0 || row >= height || skin[row * width + col] < 0.5)
            continue;
        out.push({ x, y, radius: Math.max(0.6, face.iod * (RADIUS_IOD[0] + RADIUS_IOD[1] * size)), depth: DEPTH_L[0] + DEPTH_L[1] * depth });
    }
    return out;
}
/** Per-pixel L* drop; the deepest freckle wins where two overlap. */
export function darkening(freckles, width, height, amount) {
    const dark = new Float64Array(width * height);
    for (const f of freckles) {
        const x0 = Math.max(0, Math.floor(f.x - 3 * f.radius)), x1 = Math.min(width, Math.floor(f.x + 3 * f.radius) + 1);
        const y0 = Math.max(0, Math.floor(f.y - 3 * f.radius)), y1 = Math.min(height, Math.floor(f.y + 3 * f.radius) + 1);
        for (let y = y0; y < y1; y++)
            for (let x = x0; x < x1; x++) {
                const d2 = (x + 0.5 - f.x) * (x + 0.5 - f.x) + (y + 0.5 - f.y) * (y + 0.5 - f.y);
                const spot = amount * f.depth * Math.exp(-d2 / (2 * f.radius * f.radius));
                const i = y * width + x;
                if (spot > dark[i])
                    dark[i] = spot;
            }
    }
    return dark;
}
export function freckles(image, skin, face, strength = 30, density = 50, seed = 7) {
    checkPhoto(image);
    const amount = checkStrength(strength);
    const { width: w, height: h } = image;
    const placed = place(face, skin, w, h, density, seed);
    if (amount === 0 || placed.length === 0)
        return unchanged(image, LABEL, { freckles: 0 });
    const dark = darkening(placed, w, h, amount), weight = new Float64Array(w * h), lab = labPlanes(image);
    for (let i = 0; i < dark.length; i++) {
        dark[i] *= skin[i];
        weight[i] = dark[i] > 1e-3 ? skin[i] : 0;
        lab.L[i] -= dark[i];
        lab.a[i] += WARM[0] * dark[i];
        lab.b[i] += WARM[1] * dark[i];
    }
    const out = encode(image, lab, weight);
    const guarded = noLighten(image, out, weight);
    return { image: out, weight, label: LABEL, metrics: { freckles: placed.length, seed, density, guarded_pixels: guarded } };
}
//# sourceMappingURL=freckles.js.map