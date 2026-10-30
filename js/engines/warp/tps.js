/**
 * E06 thin plate spline: exact interpolation of 2-D control points, with its Jacobian.
 *
 * f(p) = a0 + A p + sum_i w_i U(|p - c_i|^2), U(s) = s log s (U(0) = 0). Concept:
 * Bookstein, "Principal warps" (IEEE PAMI, 1989); our own code. The (n + 3) system is
 * solved by Gaussian elimination with partial pivoting. Repeated or all-collinear control
 * points are rejected before solving, as in api/plumb_api/engines/warp/tps.py.
 * Weights are rows [w_1 .. w_n, a0, a_x, a_y], each an (x, y) pair.
 *
 * Author: John Khan.
 */
import { fromFunction } from "./field.js";
export const MAX_CONTROL_POINTS = 2048;
export function kernel(r2) {
    return r2 > 0 ? r2 * Math.log(r2) : 0;
}
/** 2 (log r^2 + 1): multiply by (p - c) for the gradient of U; 0 at r = 0. */
export function kernelSlope(r2) {
    return r2 > 0 ? 2 * (Math.log(r2) + 1) : 0;
}
export function checkPoints(points, name = "points") {
    if (!Array.isArray(points))
        throw new RangeError(`${name} must be an array of (x, y) pairs`);
    for (const p of points) {
        if (!Array.isArray(p) || p.length < 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) {
            throw new RangeError(`${name} must be finite (x, y) pairs`);
        }
    }
}
/** True when two points coincide or all of them lie on one line. */
export function degenerate(points) {
    const n = points.length;
    let mx = 0, my = 0;
    for (const [x, y] of points) {
        mx += x;
        my += y;
    }
    mx /= n;
    my /= n;
    let sxx = 0, syy = 0, sxy = 0;
    for (const [x, y] of points) {
        sxx += (x - mx) ** 2;
        syy += (y - my) ** 2;
        sxy += (x - mx) * (y - my);
    }
    const scale2 = sxx + syy;
    if (scale2 === 0)
        return true;
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            if ((points[i][0] - points[j][0]) ** 2 + (points[i][1] - points[j][1]) ** 2 <= 1e-18 * scale2)
                return true;
        }
    }
    return sxx * syy - sxy * sxy <= 1e-12 * scale2 * scale2;
}
/** Solve A X = B (A is n x n, B is n x k), both row-major; A and B are overwritten. */
export function solveInPlace(a, b, n, k) {
    for (let col = 0; col < n; col++) {
        let pivot = col, best = Math.abs(a[col * n + col]);
        for (let r = col + 1; r < n; r++) {
            const v = Math.abs(a[r * n + col]);
            if (v > best) {
                best = v;
                pivot = r;
            }
        }
        if (!(best > 0))
            throw new RangeError("singular system");
        if (pivot !== col) {
            for (let c = 0; c < n; c++) {
                const t = a[col * n + c];
                a[col * n + c] = a[pivot * n + c];
                a[pivot * n + c] = t;
            }
            for (let c = 0; c < k; c++) {
                const t = b[col * k + c];
                b[col * k + c] = b[pivot * k + c];
                b[pivot * k + c] = t;
            }
        }
        const diag = a[col * n + col];
        for (let r = col + 1; r < n; r++) {
            const f = a[r * n + col] / diag;
            if (f === 0)
                continue;
            for (let c = col; c < n; c++)
                a[r * n + c] -= f * a[col * n + c];
            for (let c = 0; c < k; c++)
                b[r * k + c] -= f * b[col * k + c];
        }
    }
    const x = new Float64Array(n * k);
    for (let r = n - 1; r >= 0; r--) {
        for (let c = 0; c < k; c++) {
            let s = b[r * k + c];
            for (let j = r + 1; j < n; j++)
                s -= a[r * n + j] * x[j * k + c];
            x[r * k + c] = s / a[r * n + r];
        }
    }
    return x;
}
export class ThinPlateSpline {
    centres;
    weights;
    constructor(centres, weights) {
        this.centres = centres;
        this.weights = weights;
    }
    static fit(src, dst, smooth = 0) {
        checkPoints(src, "src");
        checkPoints(dst, "dst");
        const n = src.length;
        if (dst.length !== n)
            throw new RangeError("src and dst must have the same number of points");
        if (n < 3)
            throw new RangeError("a thin plate spline needs at least 3 points");
        if (n > MAX_CONTROL_POINTS)
            throw new RangeError(`at most ${MAX_CONTROL_POINTS} control points`);
        if (!(Number.isFinite(smooth) && smooth >= 0))
            throw new RangeError("smooth must be finite and non-negative");
        if (degenerate(src))
            throw new RangeError("control points are degenerate (repeated or all on one line)");
        const m = n + 3, a = new Float64Array(m * m), b = new Float64Array(m * 2);
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                const d2 = (src[i][0] - src[j][0]) ** 2 + (src[i][1] - src[j][1]) ** 2;
                a[i * m + j] = kernel(d2) + (i === j ? smooth : 0);
            }
            a[i * m + n] = 1;
            a[i * m + n + 1] = src[i][0];
            a[i * m + n + 2] = src[i][1];
            a[n * m + i] = 1;
            a[(n + 1) * m + i] = src[i][0];
            a[(n + 2) * m + i] = src[i][1];
            b[i * 2] = dst[i][0];
            b[i * 2 + 1] = dst[i][1];
        }
        let weights;
        try {
            weights = solveInPlace(a, b, m, 2);
        }
        catch {
            throw new RangeError("control points are degenerate (repeated or all on one line)");
        }
        if (!weights.every(Number.isFinite))
            throw new RangeError("control points are degenerate (repeated or all on one line)");
        return new ThinPlateSpline(src.map((p) => [p[0], p[1]]), weights);
    }
    get size() { return this.centres.length; }
    map(x, y) {
        const n = this.size, w = this.weights;
        let fx = w[n * 2] + x * w[(n + 1) * 2] + y * w[(n + 2) * 2];
        let fy = w[n * 2 + 1] + x * w[(n + 1) * 2 + 1] + y * w[(n + 2) * 2 + 1];
        for (let i = 0; i < n; i++) {
            const u = kernel((x - this.centres[i][0]) ** 2 + (y - this.centres[i][1]) ** 2);
            fx += u * w[i * 2];
            fy += u * w[i * 2 + 1];
        }
        return [fx, fy];
    }
    /** [[dfx/dx, dfx/dy], [dfy/dx, dfy/dy]] at (x, y). */
    jacobian(x, y) {
        const n = this.size, w = this.weights;
        let xx = w[(n + 1) * 2], xy = w[(n + 2) * 2], yx = w[(n + 1) * 2 + 1], yy = w[(n + 2) * 2 + 1];
        for (let i = 0; i < n; i++) {
            const dx = x - this.centres[i][0], dy = y - this.centres[i][1];
            const s = kernelSlope(dx * dx + dy * dy);
            xx += s * dx * w[i * 2];
            xy += s * dy * w[i * 2];
            yx += s * dx * w[i * 2 + 1];
            yy += s * dy * w[i * 2 + 1];
        }
        return [[xx, xy], [yx, yy]];
    }
    determinant(x, y) {
        const [[a, b], [c, d]] = this.jacobian(x, y);
        return a * d - b * c;
    }
    /** trace(W^T K W): zero for a pure affine map. */
    bendingEnergy() {
        const n = this.size, w = this.weights;
        let e = 0;
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                const k = kernel((this.centres[i][0] - this.centres[j][0]) ** 2 + (this.centres[i][1] - this.centres[j][1]) ** 2);
                e += k * (w[i * 2] * w[j * 2] + w[i * 2 + 1] * w[j * 2 + 1]);
            }
        }
        return e;
    }
}
/** Points along the image border that stay still (corners once). */
export function borderPins(width, height, perSide = 4) {
    if (!(width >= 2 && height >= 2 && perSide >= 1))
        throw new RangeError("border pins need an image of at least 2 x 2");
    const xs = [], ys = [];
    // NumPy linspace: k * (span / n), with the last value exactly the end
    for (let k = 0; k <= perSide; k++) {
        xs.push(k === perSide ? width - 1 : k * ((width - 1) / perSide));
        ys.push(k === perSide ? height - 1 : k * ((height - 1) / perSide));
    }
    const out = [];
    for (const x of xs)
        out.push([x, 0]);
    for (const x of xs)
        out.push([x, height - 1]);
    for (const y of ys.slice(1, -1))
        out.push([0, y]);
    for (const y of ys.slice(1, -1))
        out.push([width - 1, y]);
    return out;
}
/** Backward field moving `movedFrom` to `movedTo`; pins (and the border) stay put. */
export function tpsField(width, height, movedFrom, movedTo, { pins = [], step = 4, smooth = 0, pinBorder = true } = {}) {
    checkPoints(movedFrom, "movedFrom");
    checkPoints(movedTo, "movedTo");
    checkPoints(pins, "pins");
    if (movedFrom.length !== movedTo.length)
        throw new RangeError("movedFrom and movedTo must have the same number of points");
    const fixed = pinBorder ? [...pins, ...borderPins(width, height)] : [...pins];
    const back = ThinPlateSpline.fit([...movedTo, ...fixed], [...movedFrom, ...fixed], smooth);
    return fromFunction(width, height, (x, y) => back.map(x, y), step);
}
//# sourceMappingURL=tps.js.map