/**
 * E07 PatchMatch-lite (mirrors api/plumb_api/engines/fill/patchmatch.py byte for byte).
 *
 * Concept: Barnes et al., "PatchMatch: a randomized correspondence algorithm for
 * structural image editing" (SIGGRAPH 2009); our own single-scale code. Sources are
 * complete patches with no hole pixel; targets are centres within r of the hole; the
 * hole starts as an integer onion peel; random init (xorshift32), then alternating
 * sweeps of propagation and random search; voting by rounded integer means.
 *
 * Author: John Khan.
 */
import { requireColour, requireMask } from "../core/buffer.js";
export const MAX_PATCH_RADIUS = 8;
export const MAX_ITERATIONS = 32;
export class XorShift32 {
    state;
    constructor(seed) {
        if (!(Number.isSafeInteger(seed) && seed >= 0))
            throw new RangeError("seed must be a non-negative whole number");
        const low = seed >>> 0, high = Math.floor(seed / 4294967296) >>> 0;
        this.state = ((low ^ high ^ 0x9e3779b9) >>> 0) || 0x6d2b79f5;
    }
    next() {
        let x = this.state;
        x = (x ^ (x << 13)) >>> 0;
        x = (x ^ (x >>> 17)) >>> 0;
        x = (x ^ (x << 5)) >>> 0;
        this.state = x;
        return x;
    }
    below(n) { return this.next() % n; }
}
/** total / count rounded half to even (count > 0, total >= 0, both whole). */
export function roundDiv(total, count) {
    let q = Math.floor(total / count);
    const r = total - q * count;
    if (2 * r > count || (2 * r === count && q % 2 === 1))
        q += 1;
    return q;
}
/** Integer RGB copy (3 channels) with the hole filled inwards by 8-neighbour means. */
export function onionPeel(img, hole) {
    const { width: w, height: h, channels } = img;
    const work = new Int32Array(w * h * 3);
    for (let i = 0; i < w * h; i++)
        for (let c = 0; c < 3; c++)
            work[i * 3 + c] = img.data[i * channels + c];
    const unknown = Uint8Array.from(hole);
    let remaining = unknown.reduce((s, v) => s + v, 0);
    while (remaining > 0) {
        const layer = [];
        const values = [];
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const i = y * w + x;
                if (!unknown[i])
                    continue;
                let count = 0, r = 0, g = 0, b = 0;
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        if (!dx && !dy)
                            continue;
                        const nx = x + dx, ny = y + dy;
                        if (nx < 0 || nx >= w || ny < 0 || ny >= h)
                            continue;
                        const j = ny * w + nx;
                        if (unknown[j])
                            continue;
                        count++;
                        r += work[j * 3];
                        g += work[j * 3 + 1];
                        b += work[j * 3 + 2];
                    }
                }
                if (count) {
                    layer.push(i);
                    values.push(roundDiv(r, count), roundDiv(g, count), roundDiv(b, count));
                }
            }
        }
        if (!layer.length)
            throw new RangeError("the hole covers the whole image; nothing to fill from");
        layer.forEach((i, k) => { work[i * 3] = values[k * 3]; work[i * 3 + 1] = values[k * 3 + 1]; work[i * 3 + 2] = values[k * 3 + 2]; unknown[i] = 0; });
        remaining -= layer.length;
    }
    return work;
}
export function patchMatch(img, mask, { patchRadius = 3, iterations = 5, seed = 1, sourceMask } = {}) {
    requireColour(img);
    const { width: w, height: h, channels } = img;
    const r = patchRadius;
    if (!(Number.isInteger(r) && r >= 1 && r <= MAX_PATCH_RADIUS))
        throw new RangeError(`patch radius must be a whole number from 1 to ${MAX_PATCH_RADIUS}`);
    if (!(Number.isInteger(iterations) && iterations >= 1 && iterations <= MAX_ITERATIONS))
        throw new RangeError(`iterations must be a whole number from 1 to ${MAX_ITERATIONS}`);
    requireMask(mask, w, h);
    const hole = new Uint8Array(w * h);
    let any = false;
    for (let i = 0; i < hole.length; i++)
        if (mask.data[i] >= 0.5) {
            hole[i] = 1;
            any = true;
        }
    const copy = { width: w, height: h, channels, data: new Uint8Array(img.data) };
    if (!any)
        return { image: copy, targets: [], matches: [], meanDistance: [] };
    // near[i]: the (2r + 1)^2 box around pixel i touches the hole
    const near = new Uint8Array(w * h);
    for (let i = 0; i < hole.length; i++) {
        if (!hole[i])
            continue;
        const x = i % w, y = Math.floor(i / w);
        for (let yy = Math.max(0, y - r); yy <= Math.min(h - 1, y + r); yy++) {
            for (let xx = Math.max(0, x - r); xx <= Math.min(w - 1, x + r); xx++)
                near[yy * w + xx] = 1;
        }
    }
    const valid = new Uint8Array(w * h);
    const sources = [];
    if (sourceMask)
        requireMask(sourceMask, w, h);
    for (let y = r; y < h - r; y++) {
        for (let x = r; x < w - r; x++) {
            const i = y * w + x;
            if (near[i] || (sourceMask && !(sourceMask.data[i] >= 0.5)))
                continue;
            valid[i] = 1;
            sources.push([x, y]);
        }
    }
    if (!sources.length)
        throw new RangeError("no complete source patch outside the hole; use a smaller patch or a smaller hole");
    const targets = [];
    const targetIndex = new Int32Array(w * h).fill(-1);
    for (let i = 0; i < near.length; i++)
        if (near[i]) {
            targetIndex[i] = targets.length;
            targets.push([i % w, Math.floor(i / w)]);
        }
    const rng = new XorShift32(seed);
    const work = onionPeel(img, hole);
    const original = new Int32Array(w * h * 3);
    for (let i = 0; i < w * h; i++)
        for (let c = 0; c < 3; c++)
            original[i * 3 + c] = img.data[i * channels + c];
    const distance = (tx, ty, sx, sy) => {
        let d = 0;
        for (let y = Math.max(0, ty - r); y <= Math.min(h - 1, ty + r); y++) {
            for (let x = Math.max(0, tx - r); x <= Math.min(w - 1, tx + r); x++) {
                const a = (y * w + x) * 3, b = ((sy + y - ty) * w + (sx + x - tx)) * 3;
                for (let c = 0; c < 3; c++) {
                    const e = work[a + c] - original[b + c];
                    d += e * e;
                }
            }
        }
        return d;
    };
    const matches = targets.map(() => sources[rng.below(sources.length)]);
    let dist = targets.map(([tx, ty], k) => distance(tx, ty, matches[k][0], matches[k][1]));
    const span = Math.max(w, h);
    const meanDistance = [];
    for (let it = 0; it < iterations; it++) {
        const forward = it % 2 === 0, step = forward ? 1 : -1;
        for (let n = 0; n < targets.length; n++) {
            const k = forward ? n : targets.length - 1 - n;
            const [tx, ty] = targets[k];
            let [bx, by] = matches[k];
            let best = dist[k];
            for (const [nx, ny] of [[tx - step, ty], [tx, ty - step]]) {
                if (nx < 0 || nx >= w || ny < 0 || ny >= h)
                    continue;
                const m = targetIndex[ny * w + nx];
                if (m < 0)
                    continue;
                const cx = matches[m][0] + (tx - nx), cy = matches[m][1] + (ty - ny);
                if (cx >= 0 && cx < w && cy >= 0 && cy < h && valid[cy * w + cx] && (cx !== bx || cy !== by)) {
                    const d = distance(tx, ty, cx, cy);
                    if (d < best) {
                        best = d;
                        bx = cx;
                        by = cy;
                    }
                }
            }
            for (let radius = span; radius >= 1; radius = Math.floor(radius / 2)) {
                const cx = bx + rng.below(2 * radius + 1) - radius;
                const cy = by + rng.below(2 * radius + 1) - radius;
                if (cx >= 0 && cx < w && cy >= 0 && cy < h && valid[cy * w + cx] && (cx !== bx || cy !== by)) {
                    const d = distance(tx, ty, cx, cy);
                    if (d < best) {
                        best = d;
                        bx = cx;
                        by = cy;
                    }
                }
            }
            matches[k] = [bx, by];
            dist[k] = best;
        }
        const sums = new Float64Array(w * h * 3), counts = new Int32Array(w * h);
        targets.forEach(([tx, ty], k) => {
            const [sx, sy] = matches[k];
            for (let y = Math.max(0, ty - r); y <= Math.min(h - 1, ty + r); y++) {
                for (let x = Math.max(0, tx - r); x <= Math.min(w - 1, tx + r); x++) {
                    const i = y * w + x, b = ((sy + y - ty) * w + (sx + x - tx)) * 3;
                    counts[i]++;
                    for (let c = 0; c < 3; c++)
                        sums[i * 3 + c] += original[b + c];
                }
            }
        });
        for (let i = 0; i < hole.length; i++) {
            if (hole[i])
                for (let c = 0; c < 3; c++)
                    work[i * 3 + c] = roundDiv(sums[i * 3 + c], counts[i]);
        }
        dist = targets.map(([tx, ty], k) => distance(tx, ty, matches[k][0], matches[k][1]));
        meanDistance.push(dist.reduce((s, v) => s + v, 0) / dist.length);
    }
    for (let i = 0; i < w * h; i++)
        for (let c = 0; c < 3; c++)
            copy.data[i * channels + c] = work[i * 3 + c];
    return { image: copy, targets, matches, meanDistance };
}
//# sourceMappingURL=patchmatch.js.map