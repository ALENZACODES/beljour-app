/** W90 freckle preservation and procedural faux marks. Author: John Khan. */
import { alphaComposite } from "./masking.js";
export const defaultFreckles = { density: .3, radiusMin: 1, radiusMax: 2, opacityMin: .22, opacityMax: .55, seed: 0 };
function rng(seed) { let s = seed >>> 0; return () => { s = (1664525 * s + 1013904223) >>> 0; return s / 4294967296; }; }
export function validateFreckles(s) {
    if (s.density < 0 || s.density > 1)
        throw new Error("density out of range");
    if (s.radiusMin < 1 || s.radiusMax > 5 || s.radiusMin > s.radiusMax)
        throw new Error("radius out of range");
    if (s.opacityMin < 0 || s.opacityMax > 1 || s.opacityMin > s.opacityMax)
        throw new Error("opacity out of range");
    return s;
}
export function proceduralPoints(mask, w, h, spec) {
    validateFreckles(spec);
    const candidates = [];
    for (let i = 0; i < mask.length; i++)
        if (mask[i] > .5)
            candidates.push(i);
    const target = Math.max(0, Math.min(250, Math.round(candidates.length * spec.density / 160))), random = rng(spec.seed), points = [];
    for (let n = 0; n < target && candidates.length; n++) {
        const at = Math.floor(random() * candidates.length), idx = candidates.splice(at, 1)[0], r = spec.radiusMin + Math.floor(random() * (spec.radiusMax - spec.radiusMin + 1)), opacity = spec.opacityMin + random() * (spec.opacityMax - spec.opacityMin);
        points.push({ x: idx % w, y: Math.floor(idx / w), r, opacity });
    }
    return points;
}
export function freckleRaster(mask, w, h, spec) {
    const out = new Float32Array(mask.length);
    for (const p of proceduralPoints(mask, w, h, spec))
        for (let y = Math.max(0, p.y - p.r * 4); y < Math.min(h, p.y + p.r * 4 + 1); y++)
            for (let x = Math.max(0, p.x - p.r * 4); x < Math.min(w, p.x + p.r * 4 + 1); x++) {
                const d = (x - p.x) ** 2 + (y - p.y) ** 2, spot = Math.exp(-d / Math.max(1, 2 * p.r * p.r)) * p.opacity, i = y * w + x;
                out[i] = Math.max(out[i], spot * mask[i]);
            }
    return out;
}
export function applyFreckles(pixels, w, h, mask, spec, colour = [96, 62, 45]) { const marks = freckleRaster(mask, w, h, spec), out = alphaComposite(pixels, w, h, colour, marks, 1), count = proceduralPoints(mask, w, h, spec).length; return { pixels: out, metrics: { faux: true, seed: spec.seed, requestedDensity: spec.density, markCount: count, label: "SIMULATION" } }; }
export function preserveFreckles(pixels) { return { pixels: new Uint8ClampedArray(pixels), metrics: { faux: false, preserved: true, changedFraction: 0, label: "SIMULATION" } }; }
export function densityScore(marks, mask) {
    let n = 0, c = 0;
    for (let i = 0; i < mask.length; i++)
        if (mask[i] > .5) {
            n++;
            if (marks[i] > .05)
                c++;
        }
    return n ? c / n : 0;
}
