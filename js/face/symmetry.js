/**
 * Facial symmetry from MediaPipe Face Mesh landmarks.
 * 1. Fit the facial midline through points on the nose, lips and chin (principal axis).
 * 2. Mirror each right side landmark across that line.
 * 3. Measure how far it lands from its left side partner, in units of the distance
 *    between the outer eye corners, so the score doesn't depend on photo size.
 * Wording in the UI is about symmetry only, never attractiveness.
 * Face-mapping credits (licences.json "concepts"): runtime MediaPipe Face Landmarker
 * (Bucket A); concept only, no code copied: dlib and OpenFace (left/right landmark
 * pairs grouped by facial part) and Farkas anthropometry (midline and paired
 * measurements), from their documentation and publications.
 * Author: John Khan.
 */
import { FEATURE_PAIRS, MIDLINE as ANATOMY_MIDLINE } from "../data/face/generated/anatomy.js";
// One copy of the landmark table: api/plumb_api/engines/proportions/anatomy.py (generated
// into data/face/generated/anatomy.ts by scripts/sync_r5_data.py).
export const MIDLINE = ANATOMY_MIDLINE;
export const REGIONS = Object.fromEntries(Object.entries(FEATURE_PAIRS).map(([name, pairs]) => [name, pairs.map(([r, l]) => [r, l])]));
/** Points are scaled to pixels with the image aspect so distances are true to the photo. */
export function toPixels(points, width, height) {
    return points.map((p) => [p.x * width, p.y * height]);
}
export function fitLine(pts) {
    const n = pts.length;
    const cx = pts.reduce((s, p) => s + p[0], 0) / n;
    const cy = pts.reduce((s, p) => s + p[1], 0) / n;
    let sxx = 0, syy = 0, sxy = 0;
    for (const [x, y] of pts) {
        sxx += (x - cx) ** 2;
        syy += (y - cy) ** 2;
        sxy += (x - cx) * (y - cy);
    }
    // principal eigenvector of the 2x2 covariance
    const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    let dx = Math.cos(theta), dy = Math.sin(theta);
    if (dy < 0) {
        dx = -dx;
        dy = -dy;
    } // point down the face
    return { cx, cy, dx, dy };
}
export function reflect(p, line) {
    const vx = p[0] - line.cx, vy = p[1] - line.cy;
    const along = vx * line.dx + vy * line.dy;
    const px = line.cx + along * line.dx, py = line.cy + along * line.dy;
    return [2 * px - p[0], 2 * py - p[1]];
}
/** Map a mean mirrored offset (in eye widths) to 0..100. An offset of 0.15 eye widths or more scores 0. */
export function offsetToScore(offset) {
    return Math.max(0, Math.min(100, Math.round(100 * (1 - offset / 0.15))));
}
export function symmetry(points, width, height) {
    if (points.length < 468)
        throw new Error("need the full face mesh");
    const px = toPixels(points, width, height);
    const line = fitLine(MIDLINE.map((i) => px[i]));
    const eyeSpan = Math.hypot(px[33][0] - px[263][0], px[33][1] - px[263][1]);
    const regions = Object.entries(REGIONS).map(([name, pairs]) => {
        const offsets = pairs.map(([r, l]) => {
            const m = reflect(px[r], line);
            return Math.hypot(m[0] - px[l][0], m[1] - px[l][1]) / eyeSpan;
        });
        const offset = offsets.reduce((s, v) => s + v, 0) / offsets.length;
        return { name, offset: Math.round(offset * 1000) / 1000, score: offsetToScore(offset) };
    });
    const mean = regions.reduce((s, r) => s + r.offset, 0) / regions.length;
    const tilt = (Math.atan2(line.dx, line.dy) * 180) / Math.PI;
    return { score: offsetToScore(mean), regions, midline: line, tiltDegrees: Math.round(tilt * 10) / 10 };
}
