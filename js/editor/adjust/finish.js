/** Finishing effects of the Adjust tool: vignette, grain and fade. They run last, after the crop,
 * so the vignette frames the picture she exports and the grain is never resampled or smoothed
 * by a later tool. Sizes are shares of the output's short side, so preview and export match.
 * Grain is a fixed-seed value noise: the same settings give the same grain every time.
 * Author: John Khan.
 */
import { LUMA, clamp01, shoulder, smoothstep, toEnc, toLin } from "./colour.js";
export function finishIsNeutral(v) {
    return v.vignette === 0 && v.grain === 0 && v.fade === 0;
}
/** Distance from the centre, 0 at the centre and 1 at the corners, shaped by roundness
 * (-1 squarer, 0 follows the frame, 1 a circle). */
export function vignetteDistance(x, y, width, height, roundness) {
    const u = (x + 0.5 - width / 2) / (width / 2), v = (y + 0.5 - height / 2) / (height / 2);
    if (roundness >= 0) {
        const ellipse = Math.sqrt(u * u + v * v) / Math.SQRT2;
        const dx = x + 0.5 - width / 2, dy = y + 0.5 - height / 2;
        const circle = Math.sqrt(dx * dx + dy * dy) / Math.sqrt((width / 2) ** 2 + (height / 2) ** 2);
        return ellipse + (circle - ellipse) * roundness;
    }
    const p = 2 - 6 * roundness;
    return Math.pow(Math.pow(Math.abs(u), p) + Math.pow(Math.abs(v), p), 1 / p) / Math.pow(2, 1 / p);
}
/** Vignette weight (0 inside, rising to the corners); midpoint 0..1 moves where it starts. */
export function vignetteWeight(d, midpoint) {
    return smoothstep(0.2 + 0.75 * midpoint, 1.15, d);
}
/** 32-bit integer hash to [-1, 1] (fixed seed). */
export function hash2(x, y, seed) {
    let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1);
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    h ^= h >>> 16;
    return ((h >>> 0) / 4294967295) * 2 - 1;
}
/** Smooth value noise at (x, y) in cell units. */
export function valueNoise(x, y, seed) {
    const x0 = Math.floor(x), y0 = Math.floor(y), tx = x - x0, ty = y - y0;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const a = hash2(x0, y0, seed), b = hash2(x0 + 1, y0, seed), c = hash2(x0, y0 + 1, seed), d = hash2(x0 + 1, y0 + 1, seed);
    return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy;
}
export const GRAIN_SEED = 1931;
/** Grain cell in pixels for an output whose short side is `short`. */
export function grainCell(short, size) {
    return Math.max(0.5, (0.6 + 3.4 * size) * short / 600);
}
/** Apply vignette, grain and fade to an interleaved encoded RGB float image, in place.
 * Values are the -1..1 / 0..1 forms (strength already applied); opacity mixes in linear light. */
export function finish(rgb, width, height, v, opacity = 1) {
    if (finishIsNeutral(v) || opacity <= 0)
        return;
    const short = Math.min(width, height), cell = grainCell(short, v.grain_size), rough = 0.7 * v.grain_rough;
    const fadeBlack = 0.16 * v.fade, fadeTop = 1 - 0.05 * v.fade, fadeChroma = 1 - 0.15 * v.fade;
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 3, r0 = rgb[i], g0 = rgb[i + 1], b0 = rgb[i + 2];
            let r = r0, g = g0, b = b0;
            if (v.vignette !== 0) {
                const t = vignetteWeight(vignetteDistance(x, y, width, height, v.vignette_round), v.vignette_mid);
                const stops = 1.6 * v.vignette * t, gain = Math.pow(2, stops), roll = clamp01(stops);
                r = toEnc(clamp01(shoulder(toLin(r) * gain, roll)));
                g = toEnc(clamp01(shoulder(toLin(g) * gain, roll)));
                b = toEnc(clamp01(shoulder(toLin(b) * gain, roll)));
            }
            if (v.grain > 0) {
                const fine = valueNoise(x / cell, y / cell, GRAIN_SEED), coarse = valueNoise(x / (cell * 0.5), y / (cell * 0.5), GRAIN_SEED + 1);
                const n = (fine * (1 - rough) + coarse * rough) / Math.sqrt((1 - rough) ** 2 + rough * rough);
                const yv = LUMA[0] * r + LUMA[1] * g + LUMA[2] * b;
                const dy = v.grain * 0.1 * n * (0.25 + 0.75 * clamp01(4 * yv * (1 - yv)));
                r = clamp01(r + dy);
                g = clamp01(g + dy);
                b = clamp01(b + dy);
            }
            if (v.fade > 0) {
                const yv = LUMA[0] * r + LUMA[1] * g + LUMA[2] * b;
                r = yv + (r - yv) * fadeChroma;
                g = yv + (g - yv) * fadeChroma;
                b = yv + (b - yv) * fadeChroma;
                r = fadeBlack + r * (fadeTop - fadeBlack);
                g = fadeBlack + g * (fadeTop - fadeBlack);
                b = fadeBlack + b * (fadeTop - fadeBlack);
            }
            if (opacity < 1) {
                r = toEnc(toLin(r0) + (toLin(r) - toLin(r0)) * opacity);
                g = toEnc(toLin(g0) + (toLin(g) - toLin(g0)) * opacity);
                b = toEnc(toLin(b0) + (toLin(b) - toLin(b0)) * opacity);
            }
            rgb[i] = r;
            rgb[i + 1] = g;
            rgb[i + 2] = b;
        }
}
//# sourceMappingURL=finish.js.map