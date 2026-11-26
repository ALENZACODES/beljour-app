/**
 * E07 fast marching inpainting (mirrors api/plumb_api/engines/fill/fmm.py).
 *
 * Concept: Telea, "An image inpainting technique based on the fast marching method"
 * (2004); our own code. Hole pixels (mask >= 0.5) are reached in order of their arrival
 * time T (first-order eikonal, 4-neighbourhood, ties by pixel index) and take
 *   I(p) = sum w [I(q) + grad I(q) . (p - q)] / sum w over known q within `radius`,
 *   w = dir * dst * lev, dir = |grad T . (p - q)| / |p - q| (1e-6 when <= 0.01),
 *   dst = 1 / |p - q|^2, lev = 1 / (1 + |T(q) - T(p)|).
 * Values are float images with 1 to 4 interleaved channels.
 *
 * Author: John Khan.
 */
import { floatImage, requireMask } from "../core/buffer.js";
import { MinHeap } from "./heap.js";
export const KNOWN = 0, BAND = 1, INSIDE = 2;
export const MAX_RADIUS = 32;
export function holeOf(mask, width, height) {
    requireMask(mask, width, height);
    const hole = new Uint8Array(width * height);
    let all = true;
    for (let i = 0; i < hole.length; i++) {
        hole[i] = mask.data[i] >= 0.5 ? 1 : 0;
        if (!hole[i])
            all = false;
    }
    if (all)
        throw new RangeError("the hole covers the whole image; nothing to fill from");
    return hole;
}
export function checkValues(values) {
    if (!(values.channels >= 1 && values.channels <= 4))
        throw new RangeError("values need 1 to 4 channels");
    if (values.data.length !== values.width * values.height * values.channels)
        throw new RangeError("values do not match their size");
    for (let i = 0; i < values.data.length; i++)
        if (!Number.isFinite(values.data[i]))
            throw new RangeError("values must be finite");
}
export function fastMarching(values, mask, { radius = 5, gradient = true } = {}) {
    checkValues(values);
    const { width: w, height: h, channels } = values;
    if (!(Number.isInteger(radius) && radius >= 1 && radius <= MAX_RADIUS))
        throw new RangeError(`radius must be a whole number from 1 to ${MAX_RADIUS}`);
    const hole = holeOf(mask, w, h);
    const n = w * h;
    const flag = new Uint8Array(n), t = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        flag[i] = hole[i] ? INSIDE : KNOWN;
        t[i] = hole[i] ? Infinity : 0;
    }
    const planes = [];
    for (let c = 0; c < channels; c++) {
        const plane = new Float64Array(n);
        for (let i = 0; i < n; i++)
            plane[i] = values.data[i * channels + c];
        planes.push(plane);
    }
    const heap = new MinHeap();
    for (let i = 0; i < n; i++) {
        if (flag[i] !== KNOWN)
            continue;
        const x = i % w, y = Math.floor(i / w);
        if ((x > 0 && flag[i - 1] === INSIDE) || (x < w - 1 && flag[i + 1] === INSIDE) ||
            (y > 0 && flag[i - w] === INSIDE) || (y < h - 1 && flag[i + w] === INSIDE)) {
            flag[i] = BAND;
            heap.push(0, i);
        }
    }
    const offsets = [];
    for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
            const d2 = dx * dx + dy * dy;
            if (d2 > 0 && d2 <= radius * radius)
                offsets.push([dx, dy]);
        }
    }
    const diff = (get, i, step, loOk, hiOk) => {
        const lo = loOk && flag[i - step] !== INSIDE, hi = hiOk && flag[i + step] !== INSIDE;
        if (lo && hi)
            return (get[i + step] - get[i - step]) / 2;
        if (hi)
            return get[i + step] - get[i];
        if (lo)
            return get[i] - get[i - step];
        return 0;
    };
    const eikonal = (x, y) => {
        const i = y * w + x;
        let a = Infinity, b = Infinity;
        if (x > 0 && flag[i - 1] === KNOWN)
            a = t[i - 1];
        if (x < w - 1 && flag[i + 1] === KNOWN)
            a = Math.min(a, t[i + 1]);
        if (y > 0 && flag[i - w] === KNOWN)
            b = t[i - w];
        if (y < h - 1 && flag[i + w] === KNOWN)
            b = Math.min(b, t[i + w]);
        if (a === Infinity && b === Infinity)
            return Infinity;
        if (a === Infinity)
            return b + 1;
        if (b === Infinity)
            return a + 1;
        if (Math.abs(a - b) >= 1)
            return Math.min(a, b) + 1;
        return (a + b + Math.sqrt(2 - (a - b) * (a - b))) / 2;
    };
    const sums = new Float64Array(channels);
    const inpaint = (p) => {
        const px = p % w, py = Math.floor(p / w);
        const gtx = diff(t, p, 1, px > 0, px < w - 1), gty = diff(t, p, w, py > 0, py < h - 1);
        sums.fill(0);
        let total = 0;
        for (const [dx, dy] of offsets) {
            const qx = px + dx, qy = py + dy;
            if (qx < 0 || qx >= w || qy < 0 || qy >= h)
                continue;
            const q = qy * w + qx;
            if (flag[q] === INSIDE)
                continue;
            const rx = px - qx, ry = py - qy, len2 = rx * rx + ry * ry;
            let direction = Math.abs(rx * gtx + ry * gty) / Math.sqrt(len2);
            if (direction <= 0.01)
                direction = 1e-6;
            const weight = direction * (1 / len2) * (1 / (1 + Math.abs(t[q] - t[p])));
            total += weight;
            for (let c = 0; c < channels; c++) {
                const plane = planes[c];
                let value = plane[q];
                if (gradient)
                    value += diff(plane, q, 1, qx > 0, qx < w - 1) * rx + diff(plane, q, w, qy > 0, qy < h - 1) * ry;
                sums[c] += weight * value;
            }
        }
        if (total > 0)
            for (let c = 0; c < channels; c++)
                planes[c][p] = sums[c] / total;
    };
    const order = [];
    for (let top = heap.pop(); top; top = heap.pop()) {
        const [tp, i] = top;
        if (flag[i] === KNOWN || tp !== t[i])
            continue;
        flag[i] = KNOWN;
        const x = i % w, y = Math.floor(i / w);
        for (const [j, ok] of [[i - 1, x > 0], [i + 1, x < w - 1], [i - w, y > 0], [i + w, y < h - 1]]) {
            if (!ok || flag[j] === KNOWN)
                continue;
            const tj = eikonal(j % w, Math.floor(j / w));
            if (flag[j] === INSIDE) {
                t[j] = tj;
                inpaint(j);
                flag[j] = BAND;
                order.push(j);
                heap.push(tj, j);
            }
            else if (tj < t[j]) {
                t[j] = tj;
                heap.push(tj, j);
            }
        }
    }
    const image = floatImage(w, h, channels, true);
    for (let c = 0; c < channels; c++)
        for (let i = 0; i < n; i++)
            image.data[i * channels + c] = planes[c][i];
    const arrival = floatImage(w, h, 1, true);
    arrival.data.set(t);
    return { image, arrival, order };
}
//# sourceMappingURL=fmm.js.map