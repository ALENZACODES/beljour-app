/**
 * Own-skin texture quilting with minimum-error boundary cuts (Efros & Freeman 2001), high band only.
 * Replaces donorPoreField's overlap-ADD (which averages 2-4 unrelated patches per pixel and makes
 * pores less sparse: measured excess kurtosis 10.1 -> 6.9 on a synthetic sparse-pore field).
 * Here every output pixel comes from exactly ONE donor pixel; seams follow the path of least
 * difference, and neighbouring blocks prefer continuing the same donor region (PatchMatch-style
 * propagation), so pores keep their shape, size and sparsity.
 * Donors: unoccluded skin of THIS photo only (Texture Law; Donor Rule: no other person's surface).
 */
import { clamp, maskedGaussian, rng, bandStats } from "../core/bands.js";
export function quiltOwnSkin(planes, donor, target, tone, w, h, iod, opts = {}) {
    const t0 = typeof performance !== "undefined" ? performance.now() : Date.now(), n = w * h;
    if (planes.some((p) => p.length !== n) || donor.length !== n || target.length !== n || tone.length !== n)
        throw new RangeError("quilt: size mismatch");
    const B = Math.round(clamp(0.1 * iod, 8, 18)), O = Math.max(2, Math.round(B / 4)), step = B - O;
    const sigma = (opts.lowSigmaIod ?? 0.035) * iod;
    const lows = planes.map((p) => maskedGaussian(p, donor, w, h, sigma));
    const highs = planes.map((p, c) => Float64Array.from(p, (v, i) => v - lows[c][i]));
    // donor block corners: whole BxB inside clean donor skin (integral image of "bad" pixels)
    const bad = new Float64Array((w + 1) * (h + 1));
    for (let y = 0; y < h; y++) {
        let row = 0;
        for (let x = 0; x < w; x++) {
            row += donor[y * w + x] < 0.99 ? 1 : 0;
            bad[(y + 1) * (w + 1) + x + 1] = bad[y * (w + 1) + x + 1] + row;
        }
    }
    const badIn = (x, y) => bad[(y + B) * (w + 1) + x + B] - bad[y * (w + 1) + x + B] - bad[(y + B) * (w + 1) + x] + bad[y * (w + 1) + x];
    const pool = [];
    for (let y = 0; y + B <= h; y += 2)
        for (let x = 0; x + B <= w; x += 2)
            if (badIn(x, y) === 0)
                pool.push(y * w + x);
    if (pool.length < 24)
        return null;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let i = 0; i < n; i++)
        if (target[i] > 0.01) {
            const x = i % w, y = (i - x) / w;
            if (x < x0)
                x0 = x;
            if (x > x1)
                x1 = x;
            if (y < y0)
                y0 = y;
            if (y > y1)
                y1 = y;
        }
    const out = [new Float64Array(n), new Float64Array(n), new Float64Array(n)];
    const filled = new Uint8Array(n);
    if (x1 < 0)
        return { bands: out, filled, blocks: 0, donors: pool.length, holesShare: 0, sdRatio: 1, kurtRatio: 1, ms: 0 };
    const sdL = Math.max(0.3, bandStats(highs[0], pool.slice(0, 4000).map((p) => p + (B >> 1) * w + (B >> 1))).sd);
    const r = rng(opts.seed ?? 37), K = opts.candidates ?? 48;
    const gx0 = x0 - O, gy0 = y0 - O, cols = Math.ceil((x1 - gx0 + 1) / step), rows = Math.ceil((y1 - gy0 + 1) / step);
    const chosen = new Int32Array(cols * rows).fill(-1);
    let blocks = 0;
    const err = new Float64Array(B * B), keepNew = new Uint8Array(B * B);
    for (let by = 0; by < rows; by++)
        for (let bx = 0; bx < cols; bx++) {
            const tx = gx0 + bx * step, ty = gy0 + by * step;
            let any = false;
            for (let y = Math.max(0, ty); y < Math.min(h, ty + B) && !any; y++)
                for (let x = Math.max(0, tx); x < Math.min(w, tx + B); x++)
                    if (target[y * w + x] > 0.01) {
                        any = true;
                        break;
                    }
            if (!any)
                continue;
            const cands = [];
            for (let k = 0; k < K; k++)
                cands.push(pool[Math.floor(r() * pool.length)]);
            const shiftOk = (c, dx, dy) => {
                const cx = (c % w) + dx, cy = Math.floor(c / w) + dy;
                return cx >= 0 && cy >= 0 && cx + B <= w && cy + B <= h && badIn(cx, cy) === 0 ? cy * w + cx : -1;
            };
            if (bx > 0 && chosen[by * cols + bx - 1] >= 0) {
                const c = shiftOk(chosen[by * cols + bx - 1], step, 0);
                if (c >= 0)
                    cands.push(c, c, c);
            }
            if (by > 0 && chosen[(by - 1) * cols + bx] >= 0) {
                const c = shiftOk(chosen[(by - 1) * cols + bx], 0, step);
                if (c >= 0)
                    cands.push(c, c, c);
            }
            const tc = clamp(ty + (B >> 1), 0, h - 1) * w + clamp(tx + (B >> 1), 0, w - 1);
            let best = cands[0], bestCost = Infinity;
            for (const c of cands) {
                const cx = c % w, cy = (c - cx) / w;
                let ssd = 0, cnt = 0;
                for (let y = 0; y < B; y++)
                    for (let x = 0; x < B; x++) {
                        if (x >= O && y >= O)
                            continue;
                        const X = tx + x, Y = ty + y;
                        if (X < 0 || Y < 0 || X >= w || Y >= h || !filled[Y * w + X])
                            continue;
                        const dlt = out[0][Y * w + X] - highs[0][(cy + y) * w + cx + x];
                        ssd += dlt * dlt;
                        cnt++;
                    }
                const centre = (cy + (B >> 1)) * w + cx + (B >> 1);
                const toneCost = ((lows[0][centre] - tone[tc]) / 6) ** 2;
                // SSD alone prefers smooth (pore-poor) patches, because they match any overlap; this term keeps each
                // block's own texture energy at the donor skin's level (measured bias without it: kurtosis x1.45).
                let e = 0;
                for (let y = 0; y < B; y += 2)
                    for (let x = 0; x < B; x += 2)
                        e += highs[0][(cy + y) * w + cx + x] ** 2;
                const sdC = Math.sqrt(e / Math.ceil(B / 2) ** 2), energyCost = ((sdC - sdL) / sdL) ** 2;
                const cost = (cnt ? ssd / cnt / (sdL * sdL) : 0) + 0.6 * toneCost + 1.5 * energyCost + (opts.prior ? opts.prior(centre, tc) : 0);
                if (cost < bestCost) {
                    bestCost = cost;
                    best = c;
                }
            }
            chosen[by * cols + bx] = best;
            const cx = best % w, cy = (best - cx) / w;
            // error surface on overlaps, then min-cut paths (vertical through left overlap, horizontal through top)
            keepNew.fill(1);
            for (let y = 0; y < B; y++)
                for (let x = 0; x < B; x++) {
                    const X = tx + x, Y = ty + y;
                    err[y * B + x] = X >= 0 && Y >= 0 && X < w && Y < h && filled[Y * w + X] ? (out[0][Y * w + X] - highs[0][(cy + y) * w + cx + x]) ** 2 : 0;
                }
            const cut = (vertical) => {
                const len = B, span = O, cost = new Float64Array(len * span), from = new Int8Array(len * span);
                const e = (a, s) => (vertical ? err[a * B + s] : err[s * B + a]);
                for (let s = 0; s < span; s++)
                    cost[s] = e(0, s);
                for (let a = 1; a < len; a++)
                    for (let s = 0; s < span; s++) {
                        let m = cost[(a - 1) * span + s], f = 0;
                        if (s > 0 && cost[(a - 1) * span + s - 1] < m) {
                            m = cost[(a - 1) * span + s - 1];
                            f = -1;
                        }
                        if (s < span - 1 && cost[(a - 1) * span + s + 1] < m) {
                            m = cost[(a - 1) * span + s + 1];
                            f = 1;
                        }
                        cost[a * span + s] = m + e(a, s);
                        from[a * span + s] = f;
                    }
                let s = 0;
                for (let k = 1; k < span; k++)
                    if (cost[(len - 1) * span + k] < cost[(len - 1) * span + s])
                        s = k;
                for (let a = len - 1; a >= 0; a--) {
                    for (let q = 0; q < s; q++) {
                        if (vertical)
                            keepNew[a * B + q] = 0;
                        else
                            keepNew[q * B + a] = 0;
                    }
                    s += from[a * span + s];
                }
            };
            if (bx > 0)
                cut(true);
            if (by > 0)
                cut(false);
            for (let y = 0; y < B; y++)
                for (let x = 0; x < B; x++) {
                    const X = tx + x, Y = ty + y;
                    if (X < 0 || Y < 0 || X >= w || Y >= h)
                        continue;
                    const i = Y * w + X;
                    if (filled[i] && !keepNew[y * B + x])
                        continue;
                    const j = (cy + y) * w + cx + x;
                    for (let c = 0; c < 3; c++)
                        out[c][i] = highs[c][j];
                    filled[i] = 1;
                }
            blocks++;
        }
    let holes = 0, tgt = 0;
    const tIdx = [];
    for (let i = 0; i < n; i++)
        if (target[i] > 0.5) {
            tgt++;
            if (!filled[i])
                holes++;
            else
                tIdx.push(i);
        }
    if (!tgt || holes > 0.005 * tgt)
        return null;
    const sIdx = pool.slice(0, 6000).map((p) => p + (B >> 1) * w + (B >> 1));
    const so = bandStats(out[0], tIdx), ss = bandStats(highs[0], sIdx);
    return { bands: out, filled, blocks, donors: pool.length, holesShare: holes / tgt,
        sdRatio: ss.sd > 1e-9 ? so.sd / ss.sd : 0, kurtRatio: ss.exKurt > 0.25 ? so.exKurt / ss.exKurt : 1,
        ms: (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0 };
}
