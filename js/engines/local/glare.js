/** #55 Glasses glare removal: find bright lens reflections beside the eyes and fill them.
 * Mirrors api/plumb_api/engines/repair/glare.py: a lens box around each eye from the mesh,
 * the eye opening (any coverage) excluded so the whites and catchlights never change; glare
 * = near-white pixels whose luma rises GLARE_RISE above the lens median; grown by GROW px,
 * filled with the biharmonic fill (engines/fill) and blended by strength. Alpha is kept.
 * Thresholds are ASSUMED.
 * Inspiration: MediaPipe Face Landmarker (478-point mesh and iris points); concept only, no code copied.
 * Author: John Khan.
 */
import { floatImage } from "../core/buffer.js";
import { fill } from "../fill/fill.js";
import { EYE_LIDS, SIDES, eyeCoverage, eyeWidth } from "./eye-geometry.js";
import { blendBytes, checkPhoto, edited, meshPoints, meshRefusal, unchanged } from "./photo-fix.js";
export const LENS_HALF_WIDTH = 0.85, LENS_HALF_HEIGHT = 0.6, GLARE_MIN = 215, GLARE_SPREAD = 40, GLARE_RISE = 35, GROW = 1;
export const LABEL = "Glasses glare softened from the surrounding pixels; the eyes themselves are not changed.";
export function lensBox(pts, side, height, width) {
    const [, , a, b] = EYE_LIDS[side];
    const cx = (pts[a][0] + pts[b][0]) / 2, cy = (pts[a][1] + pts[b][1]) / 2, ew = eyeWidth(pts, side);
    return [Math.max(0, Math.floor(cx - LENS_HALF_WIDTH * ew)), Math.max(0, Math.floor(cy - LENS_HALF_HEIGHT * ew)),
        Math.min(width, Math.ceil(cx + LENS_HALF_WIDTH * ew)), Math.min(height, Math.ceil(cy + LENS_HALF_HEIGHT * ew))];
}
export function median(values) {
    const s = values.slice().sort((x, y) => x - y), m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
export function findGlare(image, pts) {
    const { width, height, channels: c, data } = image, n = width * height;
    const y = new Float64Array(n), lo = new Int32Array(n), hi = new Int32Array(n);
    for (let i = 0; i < n; i++) {
        const r = data[i * c], g = data[i * c + 1], b = data[i * c + 2];
        y[i] = 0.299 * r + 0.587 * g + 0.114 * b;
        lo[i] = Math.min(r, g, b);
        hi[i] = Math.max(r, g, b);
    }
    const exclude = new Uint8Array(n), glare = new Uint8Array(n), counts = {};
    for (const side of SIDES) {
        const cover = eyeCoverage(pts, side, height, width);
        for (let i = 0; i < n; i++)
            if (cover[i] > 0)
                exclude[i] = 1;
    }
    for (const side of SIDES) {
        const [left, top, right, bottom] = lensBox(pts, side, height, width), lens = [];
        for (let yy = top; yy < bottom; yy++)
            for (let xx = left; xx < right; xx++) {
                const i = yy * width + xx;
                if (!exclude[i])
                    lens.push(i);
            }
        if (!lens.length) {
            counts[side] = 0;
            continue;
        }
        const mid = median(lens.map((i) => y[i]));
        let count = 0;
        for (const i of lens)
            if (lo[i] >= GLARE_MIN && hi[i] - lo[i] <= GLARE_SPREAD && y[i] >= mid + GLARE_RISE) {
                glare[i] = 1;
                count++;
            }
        counts[side] = count;
    }
    return { glare, exclude, counts };
}
export function removeGlare(image, landmarks, { strength = 100 } = {}) {
    checkPhoto(image, strength);
    const pts = meshPoints(landmarks), { width, height } = image;
    const code = meshRefusal(pts, height, width);
    if (code)
        return unchanged(image, "refused", code, LABEL);
    if (strength === 0)
        return unchanged(image, "not_applicable", "zero_strength", LABEL);
    const { glare, exclude, counts } = findGlare(image, pts);
    const report = { glare_pixels: counts };
    if (!glare.some((v) => v))
        return unchanged(image, "not_applicable", "no_glare", LABEL, report);
    const mask = floatImage(width, height, 1);
    for (let i = 0; i < glare.length; i++)
        mask.data[i] = glare[i];
    const outcome = fill(image, mask, "biharmonic", { grow: GROW });
    const weight = new Float64Array(width * height);
    let filled = 0;
    for (let i = 0; i < weight.length; i++)
        if (outcome.hole.data[i] > 0 && !exclude[i]) {
            weight[i] = strength / 100;
            filled++;
        }
    report.filled_pixels = filled;
    return edited(blendBytes(image, outcome.image, weight), weight, LABEL, report);
}
