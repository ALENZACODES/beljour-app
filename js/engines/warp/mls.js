/**
 * E06 moving least squares deformation: affine, similarity and rigid.
 *
 * Weights w_i = 1 / |p_i - v|^(2 alpha); centroids p*, q*; p^ = p - p*, q^ = q - q*, d = v - p*:
 *   affine      f(v) = d (sum w p^T p^)^-1 (sum w p^T q^) + q*
 *   similarity  f(v) = (1 / mu) sum w (q^x s - q^y c, q^x c + q^y s) + q*,  mu = sum w |p^|^2
 *   rigid       f(v) = |d| fr / |fr| + q*
 * with s = p^ . d and c = p^x d^y - p^y d^x. Concept: Schaefer, McPhail and Warren, "Image
 * deformation using moving least squares" (SIGGRAPH 2006); our own code. Mirrors
 * api/plumb_api/engines/warp/mls.py, including its validation rules.
 *
 * Author: John Khan.
 */
import { fromFunction } from "./field.js";
import { borderPins, checkPoints } from "./tps.js";
export const MODES = ["affine", "similarity", "rigid"];
export const HIT = 1e-12;
export const MAX_HANDLES = 4096;
function validate(p, q, mode, alpha) {
    if (!MODES.includes(mode))
        throw new RangeError(`mode must be one of ${MODES.join(", ")}`);
    checkPoints(p, "handles");
    checkPoints(q, "targets");
    if (p.length !== q.length || p.length < 1)
        throw new RangeError("handles and targets must be matching, non-empty lists");
    if (p.length > MAX_HANDLES)
        throw new RangeError(`at most ${MAX_HANDLES} handles`);
    if (!(Number.isFinite(alpha) && alpha >= 0.25 && alpha <= 4))
        throw new RangeError("alpha must be between 0.25 and 4");
    for (let i = 0; i < p.length; i++) {
        for (let j = i + 1; j < p.length; j++) {
            if ((p[i][0] - p[j][0]) ** 2 + (p[i][1] - p[j][1]) ** 2 <= HIT)
                throw new RangeError("handles must be distinct");
        }
    }
    if (mode === "affine" && p.length > 1) {
        let mx = 0, my = 0;
        for (const [x, y] of p) {
            mx += x;
            my += y;
        }
        mx /= p.length;
        my /= p.length;
        let sxx = 0, syy = 0, sxy = 0;
        for (const [x, y] of p) {
            sxx += (x - mx) ** 2;
            syy += (y - my) ** 2;
            sxy += (x - mx) * (y - my);
        }
        const total = sxx + syy;
        if (p.length < 3 || Math.abs(sxx * syy - sxy * sxy) <= 1e-9 * Math.max(1, total ** 2)) {
            throw new RangeError("affine needs at least three handles not all on one line");
        }
    }
}
/** A reusable deformer: handles p move onto targets q. */
export function deformer(handles, targets, mode = "similarity", alpha = 1) {
    validate(handles, targets, mode, alpha);
    const n = handles.length;
    if (n === 1) {
        const tx = targets[0][0] - handles[0][0], ty = targets[0][1] - handles[0][1];
        return (x, y) => [x + tx, y + ty];
    }
    const w = new Float64Array(n);
    return (x, y) => {
        for (let i = 0; i < n; i++) {
            const d2 = (handles[i][0] - x) ** 2 + (handles[i][1] - y) ** 2;
            if (d2 < HIT)
                return [targets[i][0], targets[i][1]];
            w[i] = 1 / d2 ** alpha;
        }
        let total = 0, psx = 0, psy = 0, qsx = 0, qsy = 0;
        for (let i = 0; i < n; i++) {
            total += w[i];
            psx += w[i] * handles[i][0];
            psy += w[i] * handles[i][1];
            qsx += w[i] * targets[i][0];
            qsy += w[i] * targets[i][1];
        }
        psx /= total;
        psy /= total;
        qsx /= total;
        qsy /= total;
        const dx = x - psx, dy = y - psy;
        if (mode === "affine") {
            let m00 = 0, m01 = 0, m11 = 0, b00 = 0, b01 = 0, b10 = 0, b11 = 0;
            for (let i = 0; i < n; i++) {
                const px = handles[i][0] - psx, py = handles[i][1] - psy;
                const qx = targets[i][0] - qsx, qy = targets[i][1] - qsy;
                m00 += w[i] * px * px;
                m01 += w[i] * px * py;
                m11 += w[i] * py * py;
                b00 += w[i] * px * qx;
                b01 += w[i] * px * qy;
                b10 += w[i] * py * qx;
                b11 += w[i] * py * qy;
            }
            const det = m00 * m11 - m01 * m01;
            // d M^-1 B with M^-1 = [[m11, -m01], [-m01, m00]] / det
            const ux = (dx * m11 - dy * m01) / det, uy = (-dx * m01 + dy * m00) / det;
            return [ux * b00 + uy * b10 + qsx, ux * b01 + uy * b11 + qsy];
        }
        let fx = 0, fy = 0, mu = 0;
        for (let i = 0; i < n; i++) {
            const px = handles[i][0] - psx, py = handles[i][1] - psy;
            const qx = targets[i][0] - qsx, qy = targets[i][1] - qsy;
            const s = px * dx + py * dy, c = px * dy - py * dx;
            fx += w[i] * (qx * s - qy * c);
            fy += w[i] * (qx * c + qy * s);
            mu += w[i] * (px * px + py * py);
        }
        if (mode === "similarity")
            return [fx / mu + qsx, fy / mu + qsy];
        const length = Math.hypot(fx, fy);
        const ratio = length > 0 ? Math.hypot(dx, dy) / length : 0;
        return [fx * ratio + qsx, fy * ratio + qsy];
    };
}
export function deform(points, handles, targets, mode = "similarity", alpha = 1) {
    checkPoints(points);
    const f = deformer(handles, targets, mode, alpha);
    return points.map(([x, y]) => f(x, y));
}
/** Backward field moving `movedFrom` to `movedTo`; pins hold still as handles. */
export function mlsField(width, height, movedFrom, movedTo, { mode = "similarity", alpha = 1, pins = [], step = 4, pinBorder = false } = {}) {
    checkPoints(movedFrom, "movedFrom");
    checkPoints(movedTo, "movedTo");
    checkPoints(pins, "pins");
    if (movedFrom.length !== movedTo.length)
        throw new RangeError("movedFrom and movedTo must have the same number of points");
    const fixed = pinBorder ? [...pins, ...borderPins(width, height)] : [...pins];
    const back = deformer([...movedTo, ...fixed], [...movedFrom, ...fixed], mode, alpha);
    return fromFunction(width, height, back, step);
}
//# sourceMappingURL=mls.js.map