/** Original expression/art geometry; no independent region table. Author: John Khan. */
import { clamp01, smooth01 } from "./types.js";
export function faceFrame(points) {
    const left = points[468], right = points[473];
    let ax = right[0] - left[0], ay = right[1] - left[1];
    if (ax < 0) {
        ax = -ax;
        ay = -ay;
    }
    const iod = Math.hypot(ax, ay);
    ax /= iod;
    ay /= iod;
    return { centre: [(left[0] + right[0]) * 0.5, (left[1] + right[1]) * 0.5],
        across: [ax, ay], down: [-ay, ax], iod, roll: Math.atan2(ay, ax) };
}
export function quadratic(start, control, end, count = 33) {
    return Array.from({ length: count }, (_, i) => {
        const t = i / (count - 1), u = 1 - t;
        return [u * u * start[0] + 2 * u * t * control[0] + t * t * end[0],
            u * u * start[1] + 2 * u * t * control[1] + t * t * end[1]];
    });
}
export function pathDistance(width, height, points, maxDistance) {
    const n = width * height, best = new Float64Array(n).fill(Infinity), progress = new Float64Array(n);
    const lengths = points.slice(1).map((p, i) => Math.hypot(p[0] - points[i][0], p[1] - points[i][1]));
    const total = Math.max(1e-12, lengths.reduce((a, b) => a + b, 0));
    let before = 0;
    for (let segment = 0; segment < points.length - 1; segment++) {
        const a = points[segment], b = points[segment + 1], dx = b[0] - a[0], dy = b[1] - a[1];
        const denominator = Math.max(1e-12, dx * dx + dy * dy);
        const padding = (maxDistance ?? 0) + 1;
        const left = maxDistance === undefined ? 0 : Math.max(0, Math.floor(Math.min(a[0], b[0]) - padding));
        const right = maxDistance === undefined ? width : Math.min(width, Math.ceil(Math.max(a[0], b[0]) + padding));
        const top = maxDistance === undefined ? 0 : Math.max(0, Math.floor(Math.min(a[1], b[1]) - padding));
        const bottom = maxDistance === undefined ? height : Math.min(height, Math.ceil(Math.max(a[1], b[1]) + padding));
        for (let y = top; y < bottom; y++) {
            for (let x = left; x < right; x++) {
                const px = x + 0.5 - a[0], py = y + 0.5 - a[1], i = y * width + x;
                const t = clamp01((px * dx + py * dy) / denominator);
                const distance = (px - t * dx) ** 2 + (py - t * dy) ** 2;
                if (distance < best[i]) {
                    best[i] = distance;
                    progress[i] = (before + t * lengths[segment]) / total;
                }
            }
        }
        before += lengths[segment];
    }
    for (let i = 0; i < n; i++)
        best[i] = Math.sqrt(best[i]);
    return { distance: best, progress };
}
export function derivative(values, width, height, axis) {
    const out = new Float64Array(width * height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = y * width + x;
            if (axis === "x") {
                out[i] = x === 0 ? values[i + 1] - values[i]
                    : x === width - 1 ? values[i] - values[i - 1] : (values[i + 1] - values[i - 1]) / 2;
            }
            else {
                out[i] = y === 0 ? values[i + width] - values[i]
                    : y === height - 1 ? values[i] - values[i - width] : (values[i + width] - values[i - width]) / 2;
            }
        }
    }
    return out;
}
export function jacobian(dx, dy, width, height) {
    const xx = derivative(dx, width, height, "x"), xy = derivative(dx, width, height, "y");
    const yx = derivative(dy, width, height, "x"), yy = derivative(dy, width, height, "y");
    const out = new Float64Array(dx.length);
    for (let i = 0; i < out.length; i++)
        out[i] = (1 - xx[i]) * (1 - yy[i]) - xy[i] * yx[i];
    return out;
}
export function minValue(values) {
    let minimum = Infinity;
    for (let i = 0; i < values.length; i++)
        minimum = Math.min(minimum, values[i]);
    return minimum;
}
export function boundField(dx, dy, width, height, maximum, minimumJacobian = 0.75) {
    let size = 0;
    for (let i = 0; i < dx.length; i++)
        size = Math.max(size, Math.hypot(dx[i], dy[i]));
    let scale = Math.min(1, maximum / Math.max(size, 1e-12));
    const minimumAt = (s) => minValue(jacobian(dx.map((v) => v * s), dy.map((v) => v * s), width, height));
    if (minimumAt(scale) < minimumJacobian) {
        let lo = 0, hi = scale;
        for (let k = 0; k < 24; k++) {
            const mid = (lo + hi) / 2;
            if (minimumAt(mid) >= minimumJacobian)
                lo = mid;
            else
                hi = mid;
        }
        scale = lo;
    }
    return { dx: dx.map((v) => v * scale), dy: dy.map((v) => v * scale), scale };
}
export function ellipseAlpha(width, height, cx, cy, rx, ry, angle, feather = 0.28) {
    const out = new Float64Array(width * height), co = Math.cos(angle), si = Math.sin(angle);
    const radiusBound = Math.max(rx, ry) + 1;
    const left = Math.max(0, Math.floor(cx - radiusBound)), right = Math.min(width, Math.ceil(cx + radiusBound));
    const top = Math.max(0, Math.floor(cy - radiusBound)), bottom = Math.min(height, Math.ceil(cy + radiusBound));
    for (let y = top; y < bottom; y++) {
        for (let x = left; x < right; x++) {
            const px = x + 0.5 - cx, py = y + 0.5 - cy;
            const u = (px * co + py * si) / rx, v = (-px * si + py * co) / ry;
            out[y * width + x] = smooth01((1 - Math.hypot(u, v)) / feather);
        }
    }
    return out;
}
export function over(rgb, totalAlpha, colour, alpha) {
    for (let i = 0; i < totalAlpha.length; i++) {
        const a = clamp01(alpha[i]);
        for (let c = 0; c < 3; c++)
            rgb[i * 3 + c] = rgb[i * 3 + c] * (1 - a) + colour[c] * a;
        totalAlpha[i] = 1 - (1 - totalAlpha[i]) * (1 - a);
    }
}
//# sourceMappingURL=geometry.js.map