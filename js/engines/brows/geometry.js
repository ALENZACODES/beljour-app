/** Independent brow frames using the existing topology. Author: John Khan. */
import { CONTOURS, convexHull, pixelPoints } from "../../data/regions/index.js";
import { polygon } from "../core/mask.js";
export function pointAt(frame, u, v) {
    return [frame.inner[0] + frame.across[0] * u * frame.width + frame.up[0] * v * frame.width,
        frame.inner[1] + frame.across[1] * u * frame.width + frame.up[1] * v * frame.width];
}
export function project(frame, x, y) {
    const dx = x - frame.inner[0], dy = y - frame.inner[1];
    return [(dx * frame.across[0] + dy * frame.across[1]) / frame.width,
        (dx * frame.up[0] + dy * frame.up[1]) / frame.width];
}
export function browFrames(landmarks, width, height) {
    if (!Array.isArray(landmarks) || landmarks.length < 468 || landmarks.length > 478)
        throw new RangeError("brow placement needs 468..478 face points");
    const pts = pixelPoints(landmarks, width, height);
    if (pts.some(p => p.some(v => v < -0.5 * Math.max(width, height) || v > 1.5 * Math.max(width, height)))) {
        throw new RangeError("brow landmarks fall outside the supported frame");
    }
    const ex = pts[263][0] - pts[33][0], ey = pts[263][1] - pts[33][1];
    const iod = Math.hypot(ex, ey);
    if (iod < 6)
        throw new RangeError("eye line is too small for a brow preview");
    const rx = ex / iod, ry = ey / iod;
    const faceUp = [ry, -rx];
    const nose = pts[168];
    const frames = [];
    for (const side of ["right", "left"]) {
        const indices = CONTOURS[`${side}_brow`];
        const contour = convexHull(indices.map(i => pts[i]));
        if (contour.length < 3)
            throw new RangeError("brow contour is degenerate");
        const projections = contour.map(p => p[0] * rx + p[1] * ry);
        const endpoints = [contour[projections.indexOf(Math.min(...projections))], contour[projections.indexOf(Math.max(...projections))]];
        if (Math.hypot(endpoints[0][0] - nose[0], endpoints[0][1] - nose[1]) > Math.hypot(endpoints[1][0] - nose[0], endpoints[1][1] - nose[1]))
            endpoints.reverse();
        const [inner, tail] = endpoints;
        const dx = tail[0] - inner[0], dy = tail[1] - inner[1];
        const browWidth = Math.hypot(dx, dy);
        if (browWidth < 3 || browWidth > iod * 1.2)
            throw new RangeError("brow width cannot support a reliable preview");
        const across = [dx / browWidth, dy / browWidth];
        let up = [-across[1], across[0]];
        if (up[0] * faceUp[0] + up[1] * faceUp[1] < 0)
            up = [-up[0], -up[1]];
        const vertical = contour.map(p => (p[0] - inner[0]) * up[0] + (p[1] - inner[1]) * up[1]);
        const browHeight = Math.max(...vertical) - Math.min(...vertical);
        if (browHeight < 0.25 || browHeight > browWidth)
            throw new RangeError("brow thickness is degenerate");
        const mask = Float64Array.from(polygon(width, height, contour, 2).data);
        const centre = [contour.reduce((s, p) => s + p[0], 0) / contour.length,
            contour.reduce((s, p) => s + p[1], 0) / contour.length];
        frames.push({ side, inner, tail, across, up, width: browWidth, height: browHeight, centre, contour, mask });
    }
    return [frames[0], frames[1]];
}
export function union(frames) {
    const result = frames[0].mask.slice();
    for (let i = 0; i < result.length; i++)
        result[i] = Math.max(result[i], frames[1].mask[i]);
    return result;
}
export function frameSummary(frame) {
    return { side: frame.side, width_px: frame.width, height_px: frame.height,
        inner: [...frame.inner], tail: [...frame.tail], centre: [...frame.centre] };
}
export function curvePoints(frame, arch, peak, tail, steps = 33) {
    const result = [];
    for (let i = 0; i < steps; i++) {
        const u = i / (steps - 1);
        const rise = arch * (1 - ((u - peak) / (u <= peak ? peak : 1 - peak)) ** 2);
        result.push(pointAt(frame, u * (1 + tail), rise));
    }
    return result;
}
export function drawPath(alpha, width, height, points, strokeWidth, opacity, clip) {
    for (let k = 0; k + 1 < points.length; k++) {
        const a = points[k], b = points[k + 1];
        const dx = b[0] - a[0], dy = b[1] - a[1];
        const length2 = dx * dx + dy * dy, radius = strokeWidth / 2;
        const xmin = Math.max(0, Math.floor(Math.min(a[0], b[0]) - radius - 1));
        const xmax = Math.min(width - 1, Math.ceil(Math.max(a[0], b[0]) + radius + 1));
        const ymin = Math.max(0, Math.floor(Math.min(a[1], b[1]) - radius - 1));
        const ymax = Math.min(height - 1, Math.ceil(Math.max(a[1], b[1]) + radius + 1));
        for (let y = ymin; y <= ymax; y++) {
            for (let x = xmin; x <= xmax; x++) {
                const t = length2 === 0 ? 0 : Math.min(1, Math.max(0, ((x + 0.5 - a[0]) * dx + (y + 0.5 - a[1]) * dy) / length2));
                const distance = Math.hypot(x + 0.5 - a[0] - t * dx, y + 0.5 - a[1] - t * dy);
                let value = Math.min(1, Math.max(0, radius + 0.5 - distance)) * opacity;
                if (clip)
                    value *= clip[y * width + x];
                const i = y * width + x;
                alpha[i] = Math.max(alpha[i], value);
            }
        }
    }
}
