/** Browser smile renderer using checked annotations only. Author: John Khan. */
import { LABEL, parseSmileOptions } from "./contracts.js";
function polyMask(w, h, poly) {
    const m = new Float32Array(w * h);
    if (poly.length < 3)
        return m;
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            const px = (x + .5) / w, py = (y + .5) / h;
            let inside = false;
            for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
                const a = poly[i], b = poly[j];
                if ((a[1] > py) !== (b[1] > py) && px < (b[0] - a[0]) * (py - a[1]) / (b[1] - a[1] + 1e-12) + a[0])
                    inside = !inside;
            }
            m[y * w + x] = inside ? 1 : 0;
        }
    return m;
}
function shade(photo, data, m, c, op) {
    for (let i = 0; i < m.length; i++) {
        const a = m[i] * op, o = i * photo.channels;
        if (a <= 0)
            continue;
        for (let k = 0; k < 3; k++)
            data[o + k] = Math.round(data[o + k] * (1 - a) + c[k] * a);
    }
}
export function renderSmile(photo, raw) {
    const req = parseSmileOptions(raw);
    const ann = req.feature === "W58" ? req.frame_annotations[0] : req.annotation;
    const teeth = polyMask(photo.width, photo.height, ann.teeth), gum = polyMask(photo.width, photo.height, ann.gum), data = new Uint8ClampedArray(photo.data), coverage = new Float32Array(teeth.length);
    for (let i = 0; i < coverage.length; i++)
        coverage[i] = Math.max(teeth[i], gum[i]);
    if (req.feature === "W51" || req.feature === "W53")
        shade(photo, data, teeth, req.tooth_shade, .35 * req.amount);
    if (req.feature === "W50" || req.feature === "W53")
        shade(photo, data, gum, req.gum_shade, .12 * req.amount);
    if (req.amount === 0)
        for (let i = 0; i < data.length; i++)
            data[i] = photo.data[i];
    return { data, coverage, report: { feature: req.feature, label: LABEL, annotation_source: "user_checked", changed_fraction: coverage.reduce((a, b) => a + (b > 0 ? 1 : 0), 0) / coverage.length } };
}
export function sequenceStability(annotations) {
    annotations.forEach(a => {
        if (a.teeth.length < 3)
            throw new RangeError("teeth polygon required");
    });
    const centres = annotations.map(a => {
        let x = 0, y = 0;
        for (const p of a.teeth) {
            x += p[0];
            y += p[1];
        }
        return [x / a.teeth.length, y / a.teeth.length];
    });
    let max = 0;
    for (let i = 1; i < centres.length; i++)
        max = Math.max(max, Math.hypot(centres[i][0] - centres[i - 1][0], centres[i][1] - centres[i - 1][1]));
    return { frames: annotations.length, max_annotation_jump: max, label: LABEL };
}
