export const MAX_POINTS = 16;
export const IDENTITY = [[0, 0], [1, 1]];
export function checkPoints(points) {
    if (!Array.isArray(points) || points.length < 2 || points.length > MAX_POINTS)
        throw new RangeError(`a curve needs 2 to ${MAX_POINTS} points`);
    const out = [];
    for (const p of points) {
        if (!Array.isArray(p) || p.length !== 2)
            throw new RangeError("curve points are [x, y] pairs");
        const x = Number(p[0]), y = Number(p[1]);
        if (!(Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= 1 && y >= 0 && y <= 1))
            throw new RangeError("curve points must lie in [0, 1]");
        if (out.length && x <= out[out.length - 1][0])
            throw new RangeError("curve x values must strictly increase");
        out.push([x, y]);
    }
    return out;
}
export function tangents(points) {
    const n = points.length;
    const d = [];
    for (let k = 0; k < n - 1; k++)
        d.push((points[k + 1][1] - points[k][1]) / (points[k + 1][0] - points[k][0]));
    const m = new Array(n).fill(0);
    m[0] = d[0];
    m[n - 1] = d[n - 2];
    for (let k = 1; k < n - 1; k++)
        m[k] = d[k - 1] * d[k] > 0 ? (d[k - 1] + d[k]) / 2 : 0;
    for (let k = 0; k < n - 1; k++) {
        if (d[k] === 0) {
            m[k] = 0;
            m[k + 1] = 0;
            continue;
        }
        const alpha = m[k] / d[k], beta = m[k + 1] / d[k];
        const norm = alpha * alpha + beta * beta;
        if (norm > 9) {
            const tau = 3 / Math.sqrt(norm);
            m[k] = tau * alpha * d[k];
            m[k + 1] = tau * beta * d[k];
        }
    }
    return m;
}
/** A prepared curve: evaluate many values without recomputing tangents. */
export class Curve {
    xs;
    ys;
    m;
    identity;
    constructor(points) {
        this.xs = Float64Array.from(points, (p) => p[0]);
        this.ys = Float64Array.from(points, (p) => p[1]);
        this.m = Float64Array.from(tangents(points));
        this.identity = points.every(([x, y]) => Math.abs(x - y) < 1e-15);
    }
    at(v) {
        const { xs, ys, m } = this, n = xs.length;
        if (v <= xs[0])
            return ys[0];
        if (v >= xs[n - 1])
            return ys[n - 1];
        let k = 0;
        while (k < n - 2 && xs[k + 1] <= v)
            k++;
        const x0 = xs[k], h = xs[k + 1] - x0;
        let t = (v - x0) / h;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const t2 = t * t, t3 = t * t * t;
        return (2 * t3 - 3 * t2 + 1) * ys[k] + (t3 - 2 * t2 + t) * h * m[k] + (-2 * t3 + 3 * t2) * ys[k + 1] + (t3 - t2) * h * m[k + 1];
    }
}
export function evaluate(points, values) {
    const c = new Curve(points);
    return Array.from(values, (v) => c.at(v));
}
/** Each point's y moved `fraction` of the way from x (identity) to its target. */
export function atStrength(points, fraction) {
    return points.map(([x, y]) => [x, x + (y - x) * fraction]);
}
