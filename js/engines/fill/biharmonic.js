/**
 * E07 biharmonic fill (mirrors api/plumb_api/engines/fill/biharmonic.py).
 *
 * Inside the hole's bounding box grown by 2 px, minimise |L u|^2 (L the crop's
 * 4-neighbour graph Laplacian) with the known pixels fixed, by conjugate gradients from an
 * onion-peel average. Smooth surfaces with Delta^2 u = 0 (up to cubic terms) come back
 * exactly. Concept: Damelin and Hoang, "On surface completion and image inpainting by
 * biharmonic functions" (2018); our own code.
 *
 * Author: John Khan.
 */
import { floatImage } from "../core/buffer.js";
import { checkValues, holeOf } from "./fmm.js";
export const MAX_CG_ITERATIONS = 20000;
/** Graph Laplacian on a w x h plane: sum over in-plane 4-neighbours of (u - neighbour). */
export function laplacian(u, w, h, out = new Float64Array(w * h)) {
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = y * w + x, v = u[i];
            let s = 0;
            if (x > 0)
                s += v - u[i - 1];
            if (x < w - 1)
                s += v - u[i + 1];
            if (y > 0)
                s += v - u[i - w];
            if (y < h - 1)
                s += v - u[i + w];
            out[i] = s;
        }
    }
    return out;
}
/** Float onion peel on a plane: each layer takes the mean of its known 8-neighbours. */
export function onionMean(plane, hole, w, h) {
    const out = Float64Array.from(plane);
    const unknown = Uint8Array.from(hole);
    for (;;) {
        const layer = [], values = [];
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const i = y * w + x;
                if (!unknown[i])
                    continue;
                let count = 0, total = 0;
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        const nx = x + dx, ny = y + dy;
                        if ((!dx && !dy) || nx < 0 || nx >= w || ny < 0 || ny >= h || unknown[ny * w + nx])
                            continue;
                        count++;
                        total += out[ny * w + nx];
                    }
                }
                if (count) {
                    layer.push(i);
                    values.push(total / count);
                }
            }
        }
        if (!layer.length)
            break;
        layer.forEach((i, k) => { out[i] = values[k]; unknown[i] = 0; });
    }
    if (unknown.some((v) => v))
        throw new RangeError("the hole covers the whole image; nothing to fill from");
    return out;
}
export function biharmonic(values, mask, { tolerance = 1e-10, maxIterations = 4000 } = {}) {
    checkValues(values);
    const { width: w, height: h, channels } = values;
    const hole = holeOf(mask, w, h);
    if (!(Number.isFinite(tolerance) && tolerance > 0))
        throw new RangeError("tolerance must be positive");
    if (!(Number.isInteger(maxIterations) && maxIterations >= 1 && maxIterations <= MAX_CG_ITERATIONS)) {
        throw new RangeError(`maxIterations must be 1..${MAX_CG_ITERATIONS}`);
    }
    const image = floatImage(w, h, channels, true);
    image.data.set(values.data);
    let left = w, top = h, right = -1, bottom = -1;
    for (let i = 0; i < hole.length; i++) {
        if (!hole[i])
            continue;
        const x = i % w, y = Math.floor(i / w);
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
    }
    if (right < 0)
        return { image, iterations: new Array(channels).fill(0), residual: new Array(channels).fill(0), box: [0, 0, 0, 0], converged: true };
    left = Math.max(0, left - 2);
    top = Math.max(0, top - 2);
    right = Math.min(w - 1, right + 2);
    bottom = Math.min(h - 1, bottom + 2);
    const cw = right - left + 1, ch = bottom - top + 1;
    const subHole = new Uint8Array(cw * ch), unknowns = [];
    for (let y = 0; y < ch; y++)
        for (let x = 0; x < cw; x++) {
            if (hole[(top + y) * w + left + x]) {
                subHole[y * cw + x] = 1;
                unknowns.push(y * cw + x);
            }
        }
    const m = unknowns.length;
    const u = new Float64Array(cw * ch), l1 = new Float64Array(cw * ch), l2 = new Float64Array(cw * ch);
    const operator = (x, out) => {
        u.fill(0);
        for (let k = 0; k < m; k++)
            u[unknowns[k]] = x[k];
        laplacian(laplacian(u, cw, ch, l1), cw, ch, l2);
        for (let k = 0; k < m; k++)
            out[k] = l2[unknowns[k]];
    };
    const dot = (a, b) => { let s = 0; for (let k = 0; k < m; k++)
        s += a[k] * b[k]; return s; };
    const iterations = [], residual = [];
    for (let c = 0; c < channels; c++) {
        const crop = new Float64Array(cw * ch);
        for (let y = 0; y < ch; y++)
            for (let x = 0; x < cw; x++)
                crop[y * cw + x] = image.data[((top + y) * w + left + x) * channels + c];
        const fixed = crop.map((v, i) => (subHole[i] ? 0 : v));
        laplacian(laplacian(fixed, cw, ch, l1), cw, ch, l2);
        const b = new Float64Array(m);
        for (let k = 0; k < m; k++)
            b[k] = -l2[unknowns[k]];
        const start = onionMean(crop, subHole, cw, ch);
        const x = new Float64Array(m);
        for (let k = 0; k < m; k++)
            x[k] = start[unknowns[k]];
        const r = new Float64Array(m), p = new Float64Array(m), ap = new Float64Array(m);
        operator(x, ap);
        for (let k = 0; k < m; k++) {
            r[k] = b[k] - ap[k];
            p[k] = r[k];
        }
        let rs = dot(r, r);
        const normB = Math.max(1, Math.sqrt(dot(b, b)));
        let it = 0;
        while (it < maxIterations && Math.sqrt(rs) > tolerance * normB) {
            operator(p, ap);
            const alpha = rs / dot(p, ap);
            for (let k = 0; k < m; k++) {
                x[k] += alpha * p[k];
                r[k] -= alpha * ap[k];
            }
            const next = dot(r, r);
            for (let k = 0; k < m; k++)
                p[k] = r[k] + (next / rs) * p[k];
            rs = next;
            it++;
        }
        for (let k = 0; k < m; k++) {
            const i = unknowns[k], y = Math.floor(i / cw), xx = i % cw;
            image.data[((top + y) * w + left + xx) * channels + c] = x[k];
        }
        iterations.push(it);
        residual.push(Math.sqrt(rs) / normB);
    }
    return { image, iterations, residual, box: [left, top, right, bottom], converged: residual.every((v) => v <= 1e-6) };
}
//# sourceMappingURL=biharmonic.js.map