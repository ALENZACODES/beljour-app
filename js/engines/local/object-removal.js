/** #59 Object and photobomber removal: fill an area she marks with PatchMatch-lite.
 * Mirrors api/plumb_api/engines/repair/object_removal.py: brush discs at pixel centres, the
 * marked area grown by GROW px, filled by the fill engine (PatchMatch-lite by default) and
 * blended by strength; refusals for nothing marked, an area over MAX_AREA_SHARE of the photo
 * and any overlap with the face oval when face points are given. Alpha is kept, no learned
 * fill. MAX_AREA_SHARE is ASSUMED.
 * Inspiration: MediaPipe Face Landmarker (478-point mesh and iris points); concept only, no code copied.
 * Author: John Khan.
 */
import { floatImage } from "../core/buffer.js";
import { polygon } from "../core/mask.js";
import { CONTOURS } from "../../data/regions/index.js";
import { METHODS, fill, grownHole } from "../fill/fill.js";
import { blendBytes, checkPhoto, edited, meshPoints, meshRefusal, unchanged } from "./photo-fix.js";
export const MAX_AREA_SHARE = 0.25, GROW = 2;
export const LABEL = "Marked area filled from the rest of this photo; nothing new is drawn in.";
export function brushMask(height, width, taps, radius) {
    if (!(Number.isFinite(radius) && radius > 0))
        throw new RangeError("brush radius must be positive");
    const mask = floatImage(width, height, 1);
    for (const [x, y] of taps) {
        for (let yy = 0; yy < height; yy++)
            for (let xx = 0; xx < width; xx++) {
                const dx = xx + 0.5 - x, dy = yy + 0.5 - y;
                if (dx * dx + dy * dy <= radius * radius)
                    mask.data[yy * width + xx] = 1;
            }
    }
    return mask;
}
export function removeObject(image, mask, { landmarks = null, strength = 100, method = "patchmatch", seed = 1 } = {}) {
    checkPhoto(image, strength);
    if (!METHODS.includes(method))
        throw new RangeError(`method must be one of ${METHODS.join(", ")}`);
    const { width: w, height: h } = image, n = w * h;
    if (mask.width !== w || mask.height !== h || !Array.from(mask.data).every(Number.isFinite))
        throw new RangeError("the removal mask must be a finite plane matching the photo");
    if (strength === 0)
        return unchanged(image, "not_applicable", "zero_strength", LABEL);
    let marked = 0;
    for (const v of mask.data)
        if (v >= 0.5)
            marked++;
    if (!marked)
        return unchanged(image, "not_applicable", "nothing_marked", LABEL);
    const grown = grownHole(mask, w, h, GROW);
    let area = 0;
    for (const v of grown.data)
        if (v > 0)
            area++;
    const report = { marked_pixels: marked, area_share: Math.round(area / n * 1e6) / 1e6, method };
    if (area / n > MAX_AREA_SHARE)
        return unchanged(image, "refused", "area_too_large", LABEL, report);
    if (landmarks) {
        const pts = meshPoints(landmarks), code = meshRefusal(pts, h, w);
        if (code)
            return unchanged(image, "refused", code, LABEL, report);
        const oval = polygon(w, h, CONTOURS.face_oval.map((i) => [pts[i][0], pts[i][1]])).data;
        for (let i = 0; i < n; i++)
            if (grown.data[i] > 0 && oval[i] >= 0.5)
                return unchanged(image, "refused", "covers_face", LABEL, report);
    }
    const hole = floatImage(w, h, 1);
    for (let i = 0; i < n; i++)
        hole.data[i] = mask.data[i] >= 0.5 ? 1 : 0;
    const outcome = fill(image, hole, method, { grow: GROW, seed });
    const weight = new Float64Array(n);
    let filled = 0;
    for (let i = 0; i < n; i++)
        if (outcome.hole.data[i] > 0) {
            weight[i] = strength / 100;
            filled++;
        }
    report.filled_pixels = filled;
    return edited(blendBytes(image, outcome.image, weight), weight, LABEL, report);
}
//# sourceMappingURL=object-removal.js.map