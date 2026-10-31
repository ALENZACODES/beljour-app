/**
 * Layered posture compositing: soft colour matte -> foreground colour un-mixing -> clean background
 * plate -> warp foreground and alpha only -> composite -> audits.
 *
 * What this fixes in the round 1 patch:
 *  - its guided filter is GREY-guided; a light-blue shirt on a light-grey wall has nearly equal luma,
 *    so the matte cannot follow the edge. The colour guided filter (He et al. 2013) uses all 3 channels;
 *  - it warps the raw photo colour at the fringe. Fringe pixels are a MIX of shirt and old background,
 *    so the old background travels with the edge and shows as a light rim (the ghost band). Blur-fusion
 *    foreground estimation (Forte & Pitie 2020) separates F from B before warping;
 *  - its PatchMatch fill is pasted with a hard boundary; here the fill's low band is matched to the
 *    surrounding background (harmonic-style correction), so no tonal step;
 *  - its seam audit also counts the NEW silhouette's legitimate edge (0.59 with no ghost at all in my
 *    synthetic test), so its pass mark depends on how far the body moved. The audit here measures
 *    gradient ACROSS the OLD outline only, against the background's own edge statistics.
 */
import { clamp, gaussian, lstarOf, lumLin, srgbToLin } from "../core/bands.js";
function integralMean(src, w, h, r) {
    const S = new Float64Array((w + 1) * (h + 1));
    for (let y = 0; y < h; y++) {
        let row = 0;
        for (let x = 0; x < w; x++) {
            row += src[y * w + x];
            S[(y + 1) * (w + 1) + x + 1] = S[y * (w + 1) + x + 1] + row;
        }
    }
    const out = new Float64Array(w * h);
    for (let y = 0; y < h; y++) {
        const a = Math.max(0, y - r), b = Math.min(h, y + r + 1);
        for (let x = 0; x < w; x++) {
            const c = Math.max(0, x - r), d = Math.min(w, x + r + 1);
            out[y * w + x] = (S[b * (w + 1) + d] - S[a * (w + 1) + d] - S[b * (w + 1) + c] + S[a * (w + 1) + c]) / ((b - a) * (d - c));
        }
    }
    return out;
}
function cropBox(mask, w, h, pad, lo = 0.01, hi = 0.99) {
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            const v = mask[y * w + x];
            if (v > lo && v < hi) {
                if (x < x0)
                    x0 = x;
                if (x > x1)
                    x1 = x;
                if (y < y0)
                    y0 = y;
                if (y > y1)
                    y1 = y;
            }
        }
    if (x1 < 0)
        return null;
    return { x0: Math.max(0, x0 - pad), y0: Math.max(0, y0 - pad), x1: Math.min(w - 1, x1 + pad), y1: Math.min(h - 1, y1 + pad) };
}
/** Colour guided filter refinement of a coarse person mask (only inside the uncertain band). */
export function colourGuidedMatte(img, mask, radius, eps = 1e-3) {
    const { width: W, height: H, channels: ch } = img, n = W * H;
    const out = Float64Array.from(mask, (v) => clamp(v));
    const soft = gaussian(out, W, H, Math.max(1, radius / 2));
    const box = cropBox(soft, W, H, 2 * radius + 2);
    if (!box)
        return out;
    const w = box.x1 - box.x0 + 1, h = box.y1 - box.y0 + 1, m = w * h;
    const I = [new Float64Array(m), new Float64Array(m), new Float64Array(m)], P = new Float64Array(m);
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            const i = (y + box.y0) * W + x + box.x0, k = y * w + x;
            for (let c = 0; c < 3; c++)
                I[c][k] = img.data[i * ch + c] / 255;
            P[k] = out[i];
        }
    const mean = (a) => integralMean(a, w, h, radius);
    const mI = I.map(mean), mP = mean(P);
    const prod = (a, b) => Float64Array.from(a, (v, k) => v * b[k]);
    const mIP = I.map((c) => mean(prod(c, P)));
    const v = [[0, 0], [0, 1], [0, 2], [1, 1], [1, 2], [2, 2]].map(([a, b]) => mean(prod(I[a], I[b])));
    const A = [new Float64Array(m), new Float64Array(m), new Float64Array(m)], Bc = new Float64Array(m);
    for (let k = 0; k < m; k++) {
        // covariance (+eps) and its closed-form 3x3 inverse, allocation-free
        const a = v[0][k] - mI[0][k] * mI[0][k] + eps, b = v[1][k] - mI[0][k] * mI[1][k], c = v[2][k] - mI[0][k] * mI[2][k];
        const d = v[3][k] - mI[1][k] * mI[1][k] + eps, e = v[4][k] - mI[1][k] * mI[2][k], f = v[5][k] - mI[2][k] * mI[2][k] + eps;
        const i00 = d * f - e * e, i01 = c * e - b * f, i02 = b * e - c * d, i11 = a * f - c * c, i12 = b * c - a * e, i22 = a * d - b * b;
        const det = a * i00 + b * i01 + c * i02 || 1e-12;
        const c0 = mIP[0][k] - mI[0][k] * mP[k], c1 = mIP[1][k] - mI[1][k] * mP[k], c2 = mIP[2][k] - mI[2][k] * mP[k];
        A[0][k] = (i00 * c0 + i01 * c1 + i02 * c2) / det;
        A[1][k] = (i01 * c0 + i11 * c1 + i12 * c2) / det;
        A[2][k] = (i02 * c0 + i12 * c1 + i22 * c2) / det;
        Bc[k] = mP[k] - A[0][k] * mI[0][k] - A[1][k] * mI[1][k] - A[2][k] * mI[2][k];
    }
    const mA = A.map(mean), mB = mean(Bc);
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            const k = y * w + x, i = (y + box.y0) * W + x + box.x0;
            const s = soft[i];
            if (s <= 0.002 || s >= 0.998)
                continue; // certain pixels keep the mask value
            out[i] = clamp(mA[0][k] * I[0][k] + mA[1][k] * I[1][k] + mA[2][k] * I[2][k] + mB[k]);
        }
    void n;
    return out;
}
/** Blur-fusion foreground/background colour estimation (two scales). Values 0..255 floats, RGB. */
export function estimateForeground(img, alpha, r1, r2 = 3) {
    const { width: W, height: H, channels: ch } = img, n = W * H;
    const F = new Float64Array(n * 3), B = new Float64Array(n * 3);
    for (let i = 0; i < n; i++)
        for (let c = 0; c < 3; c++) {
            F[i * 3 + c] = img.data[i * ch + c];
            B[i * 3 + c] = img.data[i * ch + c];
        }
    const box = cropBox(alpha, W, H, r1 + 4);
    if (!box)
        return { F, B };
    const w = box.x1 - box.x0 + 1, h = box.y1 - box.y0 + 1, m = w * h;
    const a = new Float64Array(m), I = [new Float64Array(m), new Float64Array(m), new Float64Array(m)];
    const f = I.map(() => new Float64Array(m)), b = I.map(() => new Float64Array(m));
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            const k = y * w + x, i = (y + box.y0) * W + x + box.x0;
            a[k] = clamp(alpha[i]);
            for (let c = 0; c < 3; c++) {
                I[c][k] = img.data[i * ch + c];
                f[c][k] = I[c][k];
                b[c][k] = I[c][k];
            }
        }
    for (const r of [r1, r2]) {
        const ma = integralMean(a, w, h, r), m1a = Float64Array.from(ma, (v) => 1 - v);
        for (let c = 0; c < 3; c++) {
            const fa = integralMean(Float64Array.from(f[c], (v, k) => v * a[k]), w, h, r);
            const bb = integralMean(Float64Array.from(b[c], (v, k) => v * (1 - a[k])), w, h, r);
            for (let k = 0; k < m; k++) {
                const bf = ma[k] > 1e-5 ? fa[k] / ma[k] : f[c][k], bbk = m1a[k] > 1e-5 ? bb[k] / m1a[k] : b[c][k];
                const resid = I[c][k] - a[k] * bf - (1 - a[k]) * bbk;
                f[c][k] = clamp(bf + a[k] * resid, 0, 255);
                b[c][k] = clamp(bbk + (1 - a[k]) * resid, 0, 255);
            }
        }
    }
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            const k = y * w + x, i = (y + box.y0) * W + x + box.x0;
            for (let c = 0; c < 3; c++) {
                F[i * 3 + c] = f[c][k];
                B[i * 3 + c] = b[c][k];
            }
        }
    return { F, B };
}
/**
 * Match a filled region's low band to the surrounding untouched background so the fill has no tonal
 * step at its border. `filled` and `orig` are RGB(A) byte buffers; region = pixels that were filled.
 */
export function harmonicSeam(filled, orig, region, W, H, ch, sigma) {
    const n = W * H, ring = new Float64Array(n), diff = [new Float64Array(n), new Float64Array(n), new Float64Array(n)];
    let ringCount = 0;
    for (let y = 1; y < H - 1; y++)
        for (let x = 1; x < W - 1; x++) {
            const i = y * W + x;
            if (region[i] < 0.5)
                continue;
            const nb = [i - 1, i + 1, i - W, i + W].filter((j) => region[j] < 0.5);
            if (!nb.length)
                continue;
            ring[i] = 1;
            ringCount++;
            for (let c = 0; c < 3; c++) {
                let s = 0;
                for (const j of nb)
                    s += orig[j * ch + c];
                diff[c][i] = s / nb.length - filled[i * ch + c];
            }
        }
    if (!ringCount)
        return 0;
    const wsm = gaussian(ring, W, H, sigma), corr = diff.map((d) => gaussian(d, W, H, sigma));
    let maxCorr = 0;
    for (let i = 0; i < n; i++) {
        if (region[i] < 0.5 || wsm[i] < 1e-4)
            continue;
        for (let c = 0; c < 3; c++) {
            const v = corr[c][i] / wsm[i];
            maxCorr = Math.max(maxCorr, Math.abs(v));
            filled[i * ch + c] = Math.max(0, Math.min(255, Math.round(filled[i * ch + c] + v)));
        }
    }
    return maxCorr;
}
const lstarAt = (d, i, ch) => lstarOf(lumLin(srgbToLin(d[i * ch]), srgbToLin(d[i * ch + 1]), srgbToLin(d[i * ch + 2])));
/** Ghost-line audit: gradient ACROSS the old outline (where it is now background) vs background edges. */
export function ghostAudit(out, alphaOld, alphaNew) {
    const { width: W, height: H, channels: ch } = out, n = W * H;
    const L = new Float64Array(n);
    for (let i = 0; i < n; i++)
        L[i] = lstarAt(out.data, i, ch);
    const aO = gaussian(alphaOld, W, H, 1), aNsoft = gaussian(alphaNew, W, H, 2.5);
    const ghost = [], ctl = [];
    for (let y = 2; y < H - 2; y++)
        for (let x = 2; x < W - 2; x++) {
            const i = y * W + x;
            const gx = 0.5 * (aO[i + 1] - aO[i - 1]), gy = 0.5 * (aO[i + W] - aO[i - W]), g = Math.hypot(gx, gy);
            const lx = 0.5 * (L[i + 1] - L[i - 1]), ly = 0.5 * (L[i + W] - L[i - W]);
            if (g > 0.08 && aNsoft[i] < 0.02)
                ghost.push(Math.abs((lx * gx + ly * gy) / g));
            else if (alphaOld[i] < 0.005 && aNsoft[i] < 0.005 && g < 1e-3 && (x + 3 * y) % 5 === 0)
                ctl.push(Math.hypot(lx, ly) / Math.SQRT2);
        }
    if (ghost.length < 8)
        return { score: 0, p90Score: 0, samples: ghost.length, pass: true };
    const q = (a, p) => { const s = a.slice().sort((u, v) => u - v); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
    const base = Math.max(0.35, q(ctl, 0.5)), base90 = Math.max(0.6, q(ctl, 0.9));
    const score = q(ghost, 0.5) / base, p90Score = q(ghost, 0.9) / base90;
    return { score, p90Score, samples: ghost.length, pass: score <= 1.6 && p90Score <= 1.8 };
}
/**
 * Stair-step metric on the NEW silhouette: mean |second difference| of sub-pixel edge positions (px),
 * measured along rows for steep edges and along columns for flat ones (each edge on its natural axis).
 */
export function edgeRoughness(alpha, W, H) {
    const run = (U, V, at) => {
        let sum = 0, cnt = 0;
        const chains = [];
        let prev = new Map();
        for (let v = 0; v < V; v++) {
            const cur = new Map();
            for (let u = 0; u < U - 1; u++) {
                const a = at(u, v), b = at(u + 1, v);
                if ((a - 0.5) * (b - 0.5) >= 0 || a === b)
                    continue;
                const us = u + (0.5 - a) / (b - a), key = Math.round(us);
                let chain;
                for (let d = 0; d <= 6 && !chain; d++)
                    for (const k of d ? [key - d, key + d] : [key]) {
                        chain = prev.get(k);
                        if (chain) {
                            prev.delete(k);
                            break;
                        }
                    }
                if (!chain) {
                    chain = [];
                    chains.push(chain);
                }
                chain.push(us);
                cur.set(key, chain);
            }
            prev = cur;
        }
        for (const c of chains) {
            if (c.length < 8)
                continue;
            let slope = 0;
            for (let k = 1; k < c.length; k++)
                slope += Math.abs(c[k] - c[k - 1]);
            if (slope / (c.length - 1) > 1.5)
                continue; // this edge belongs to the other axis
            for (let k = 1; k < c.length - 1; k++) {
                sum += Math.abs(c[k + 1] - 2 * c[k] + c[k - 1]);
                cnt++;
            }
        }
        return [sum, cnt];
    };
    const [s1, c1] = run(W, H, (u, v) => alpha[v * W + u]), [s2, c2] = run(H, W, (u, v) => alpha[u * W + v]);
    return c1 + c2 ? (s1 + s2) / (c1 + c2) : 0;
}
/** Halo: mean L* in a 1-3 px ring outside the new silhouette minus a 6-10 px ring (same side). */
export function haloStep(out, alphaNew) {
    const { width: W, height: H, channels: ch } = out;
    const inside = Float64Array.from(alphaNew, (v) => (v >= 0.5 ? 1 : 0));
    const near = gaussian(inside, W, H, 1.5), far = gaussian(inside, W, H, 6);
    let a = 0, na = 0, b = 0, nb = 0;
    for (let i = 0; i < W * H; i++) {
        if (alphaNew[i] > 0.02)
            continue;
        const L = lstarAt(out.data, i, ch);
        if (near[i] > 0.05) {
            a += L;
            na++;
        }
        else if (far[i] > 0.01 && far[i] < 0.08) {
            b += L;
            nb++;
        }
    }
    return na && nb ? a / na - b / nb : 0;
}
