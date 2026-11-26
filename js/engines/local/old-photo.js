/** #51 Old photo restoration, reduced: scratch and dust fill, then the measured denoise and tone.
 * Mirrors api/plumb_api/engines/repair/old_photo.py: thin-line candidates (luma more than
 * LINE_CONTRAST above or below both pixels GAP px away along a row or column), kept as lines
 * (extent >= MIN_LINE) or, with face points and outside the face oval, specks (<= MAX_SPECK
 * px), grouped through each pixel's 3 x 3 neighbourhood; dark marks and specks inside the face
 * oval and the eye and lip openings are protected; filled with the biharmonic fill, then the
 * enhance pipeline (mode natural) under its condition gate. No face restorer, no model, alpha
 * kept. Thresholds are ASSUMED.
 * Inspiration: MediaPipe Face Landmarker (478-point mesh and iris points); concept only, no code copied.
 * Author: John Khan.
 */
import { floatImage } from "../core/buffer.js";
import { polygon } from "../core/mask.js";
import { CONTOURS } from "../../data/regions/index.js";
import { fill } from "../fill/fill.js";
import { components } from "../skin/local-zones.js";
import { enhance } from "./enhance.js";
import { SIDES, eyeCoverage } from "./eye-geometry.js";
import { checkPhoto, copyImage, edited, meshPoints, meshRefusal, unchanged } from "./photo-fix.js";
export const LINE_CONTRAST = 24, GAP = 2, MIN_LINE = 6, MAX_SPECK = 3, GROW = 1;
export const LABEL = "Old photo repair on this device: scratches and dust filled from the surrounding pixels, then measured noise and fading corrected. No face detail is invented.";
export function thinMarks(image) {
    const { width: w, height: h, channels: c, data } = image, n = w * h, y = new Float64Array(n);
    for (let i = 0; i < n; i++)
        y[i] = 0.299 * data[i * c] + 0.587 * data[i * c + 1] + 0.114 * data[i * c + 2];
    const at = (yy, xx) => y[Math.min(h - 1, Math.max(0, yy)) * w + Math.min(w - 1, Math.max(0, xx))];
    const bright = new Uint8Array(n), dark = new Uint8Array(n), t = LINE_CONTRAST;
    for (let yy = 0; yy < h; yy++)
        for (let xx = 0; xx < w; xx++) {
            const i = yy * w + xx, v = y[i], l = at(yy, xx - GAP), r = at(yy, xx + GAP), u = at(yy - GAP, xx), d = at(yy + GAP, xx);
            if ((v - l > t && v - r > t) || (v - u > t && v - d > t))
                bright[i] = 1;
            if ((l - v > t && r - v > t) || (u - v > t && d - v > t))
                dark[i] = 1;
        }
    return { bright, dark };
}
export function findScratches(image, pts) {
    const { width: w, height: h } = image, n = w * h, { bright, dark } = thinMarks(image), candidates = new Uint8Array(n);
    const face = new Uint8Array(n);
    if (pts) {
        const oval = polygon(w, h, CONTOURS.face_oval.map((i) => [pts[i][0], pts[i][1]])).data;
        const lips = polygon(w, h, CONTOURS.lips_outer.map((i) => [pts[i][0], pts[i][1]])).data;
        const features = new Uint8Array(n);
        for (const side of SIDES) {
            const cover = eyeCoverage(pts, side, h, w);
            for (let i = 0; i < n; i++)
                if (cover[i] > 0)
                    features[i] = 1;
        }
        for (let i = 0; i < n; i++) {
            if (lips[i] > 0)
                features[i] = 1;
            face[i] = oval[i] >= 0.5 ? 1 : 0;
            candidates[i] = (bright[i] || (dark[i] && !face[i])) && !features[i] ? 1 : 0;
        }
    }
    else
        candidates.set(bright);
    const grouped = new Uint8Array(n);
    for (let yy = 0; yy < h; yy++)
        for (let xx = 0; xx < w; xx++) {
            let any = 0;
            for (let dy = -1; dy <= 1 && !any; dy++)
                for (let dx = -1; dx <= 1; dx++) {
                    const y2 = yy + dy, x2 = xx + dx;
                    if (y2 >= 0 && y2 < h && x2 >= 0 && x2 < w && candidates[y2 * w + x2]) {
                        any = 1;
                        break;
                    }
                }
            grouped[yy * w + xx] = any;
        }
    const kept = new Uint8Array(n);
    for (const group of components(grouped, w, h)) {
        const members = group.filter((i) => candidates[i]);
        if (!members.length)
            continue;
        let y0 = Infinity, y1 = -Infinity, x0 = Infinity, x1 = -Infinity;
        for (const i of members) {
            const yy = Math.floor(i / w), xx = i % w;
            y0 = Math.min(y0, yy);
            y1 = Math.max(y1, yy);
            x0 = Math.min(x0, xx);
            x1 = Math.max(x1, xx);
        }
        const extent = Math.max(y1 - y0 + 1, x1 - x0 + 1);
        const speck = pts !== null && members.length <= MAX_SPECK && !members.some((i) => face[i]);
        if (extent >= MIN_LINE || speck)
            for (const i of members)
                kept[i] = 1;
    }
    return kept;
}
export function restoreOldPhoto(image, landmarks = null, { strength = 100 } = {}) {
    checkPhoto(image, strength);
    const { width: w, height: h, channels: c } = image, n = w * h;
    let pts = null;
    if (landmarks) {
        pts = meshPoints(landmarks);
        const code = meshRefusal(pts, h, w);
        if (code)
            return unchanged(image, "refused", code, LABEL);
    }
    if (strength === 0)
        return unchanged(image, "not_applicable", "zero_strength", LABEL);
    const marks = findScratches(image, pts), share = strength / 100;
    let count = 0;
    for (const v of marks)
        count += v;
    const report = { scratch_pixels: count, face_points: pts !== null };
    let work = copyImage(image);
    if (count) {
        const mask = floatImage(w, h, 1);
        for (let i = 0; i < n; i++)
            mask.data[i] = marks[i];
        const outcome = fill(image, mask, "biharmonic", { grow: GROW });
        let filled = 0;
        for (let i = 0; i < n; i++) {
            if (!(outcome.hole.data[i] > 0))
                continue;
            filled++;
            for (let k = 0; k < 3; k++) {
                const a = image.data[i * c + k], b = outcome.image.data[i * c + k];
                work.data[i * c + k] = Math.min(255, Math.max(0, Math.floor(a + share * (b - a) + 0.5)));
            }
        }
        report.filled_pixels = filled;
    }
    const toned = enhance(work, "natural", { strength: share });
    const out = toned.image;
    report.condition = toned.steps.condition;
    report.tone_applied = Boolean(toned.steps.tone_applied);
    report.denoise = String(toned.steps.denoise ?? "none");
    const alpha = new Float64Array(n);
    let moved = false;
    for (let i = 0; i < n; i++) {
        for (let k = 0; k < 3; k++)
            if (out.data[i * out.channels + k] !== image.data[i * c + k]) {
                alpha[i] = share;
                moved = true;
                break;
            }
    }
    if (!moved)
        return unchanged(image, "not_applicable", "no_scratches", LABEL, report);
    return edited({ ...out, data: Uint8ClampedArray.from(out.data) }, alpha, LABEL, report);
}
//# sourceMappingURL=old-photo.js.map