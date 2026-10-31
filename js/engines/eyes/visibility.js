import { EyeFrame, visibleCanvas } from "./geometry.js";
import { filled } from "./raster.js";
export const MIN_EYE_WIDTH = 6;
export const MIN_VISIBLE_CANVAS = .75;
export const MAX_OCCLUDED_EYE = .35;
export function occlusionField(value, width, height) {
    if (value == null)
        return new Float64Array(height * width);
    if (value.length !== width * height)
        throw new RangeError("occlusion mask must match the photo");
    const mask = Float64Array.from(value);
    for (const v of mask)
        if (!Number.isFinite(v) || v < 0 || v > 1)
            throw new RangeError("occlusion mask values must be in 0..1");
    return mask;
}
export function canvasVisibleFraction(frame, anatomy, width, height) {
    const vertices = visibleCanvas(frame, anatomy), samples = [...vertices];
    const half = Math.floor(vertices.length / 2);
    for (let i = 0; i < half; i++) {
        const a = vertices[i], b = vertices[vertices.length - i - 1];
        samples.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
    }
    return samples.filter(([x, y]) => x >= 0 && x < width && y >= 0 && y < height).length / samples.length;
}
export function visibilityReport(frames, options, width, height, occlusion, supplied) {
    const selected = [];
    const sides = [];
    for (const frame of frames) {
        const eye = filled(height, width, frame.contour.map(([u, v]) => frame.point(u, v)));
        let area = 0, coveredSum = 0;
        for (let i = 0; i < eye.length; i++) {
            area += eye[i];
            coveredSum += eye[i] * occlusion[i];
        }
        const covered = area > 0 ? coveredSum / area : 1;
        const visibleCanvasFraction = canvasVisibleFraction(frame, options.anatomy[frame.side], width, height);
        const warnings = [];
        if (!frame.visible)
            warnings.push("Eye is closed or the aperture is too small.");
        if (frame.width < MIN_EYE_WIDTH)
            warnings.push("Eye width is below the six-pixel preview minimum.");
        if (visibleCanvasFraction < MIN_VISIBLE_CANVAS)
            warnings.push("Too much of this eye's makeup area is outside the photo.");
        if (supplied && covered > MAX_OCCLUDED_EYE)
            warnings.push("The supplied occlusion mask covers too much of this eye.");
        const visible = warnings.length === 0;
        selected.push(new EyeFrame(frame.side, frame.origin, frame.axis, frame.up, frame.width, frame.aperture, frame.brow_space, frame.upper, frame.lower, frame.contour, frame.roll, frame.downturned, visible));
        sides.push({ side: frame.side, eligible: visible, eye_width_px: frame.width, visible_canvas_fraction: visibleCanvasFraction,
            occlusion_share: supplied ? covered : null, warnings });
    }
    return { frames: selected, report: { sides, mask_supplied: supplied, occlusion_detection: "not_inferred", thresholds_assumed: true } };
}
export function displaySupport(before, after, coverage, eyeFrames) {
    const centres = eyeFrames.map(frame => frame.point(.5, .15));
    const stats = eyeFrames.map(() => ({ count: 0, changed: 0, delta: 0, luminance: 0, black: 0, white: 0 }));
    for (let y = 0; y < before.height; y++) {
        for (let x = 0; x < before.width; x++) {
            const index = y * before.width + x;
            if (coverage[index] <= .01)
                continue;
            const distance = centres.map(([cx, cy]) => (x + .5 - cx) ** 2 + (y + .5 - cy) ** 2);
            const stat = stats[distance[0] <= distance[1] ? 0 : 1], offset = index * before.channels;
            const delta = [0, 1, 2].map(c => Math.abs(after[offset + c] - before.data[offset + c]));
            const lum = before.data[offset] * .2126 + before.data[offset + 1] * .7152 + before.data[offset + 2] * .0722;
            stat.count++;
            if (delta.some(d => d !== 0))
                stat.changed++;
            stat.delta += delta[0] + delta[1] + delta[2];
            stat.luminance += lum;
            if (lum < 12)
                stat.black++;
            if (lum > 243)
                stat.white++;
        }
    }
    return stats.map((s, i) => ({ side: eyeFrames[i].side, covered_pixels: s.count, changed_pixels: s.changed,
        mean_rgb_change: s.count ? s.delta / (s.count * 3) : null, source_luminance: s.count ? s.luminance / s.count : null,
        near_black_share: s.count ? s.black / s.count : null, near_white_share: s.count ? s.white / s.count : null,
        metric_kind: "display_support_only", realism_score: null }));
}
