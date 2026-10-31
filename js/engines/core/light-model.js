/**
 * Photo-fitted light model for relit geometry (Beard low band, Gender shading, Age creases and folds).
 * Normals come from the face mesh (MediaPipe z), the light is fitted to THIS photo's own skin shading
 * (first-order spherical harmonics), so every added shadow follows the light already in the photo.
 * Output is always a smooth multiplicative ratio; pores and grain ride through untouched.
 */
import { clamp, gaussian } from "./bands.js";
/** Accepts [x,y], [x,y,z] or {x,y,z}. z is NaN when the mesh carries no depth. */
export function toP3(p) {
    if (Array.isArray(p))
        return [Number(p[0]), Number(p[1]), p.length > 2 ? Number(p[2]) : NaN];
    const o = p;
    return [Number(o.x), Number(o.y), o.z === undefined ? NaN : Number(o.z)];
}
/** Symmetric 3x3 eigen-decomposition (Jacobi). Returns eigenvector of the smallest eigenvalue. */
function smallestEigenvector(c) {
    const a = c.map((r) => r.slice()), v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    for (let sweep = 0; sweep < 12; sweep++) {
        for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
            if (Math.abs(a[p][q]) < 1e-12)
                continue;
            const th = 0.5 * Math.atan2(2 * a[p][q], a[q][q] - a[p][p]), cs = Math.cos(th), sn = Math.sin(th);
            for (let k = 0; k < 3; k++) {
                const akp = a[k][p], akq = a[k][q];
                a[k][p] = cs * akp - sn * akq;
                a[k][q] = sn * akp + cs * akq;
            }
            for (let k = 0; k < 3; k++) {
                const apk = a[p][k], aqk = a[q][k];
                a[p][k] = cs * apk - sn * aqk;
                a[q][k] = sn * apk + cs * aqk;
            }
            for (let k = 0; k < 3; k++) {
                const vkp = v[k][p], vkq = v[k][q];
                v[k][p] = cs * vkp - sn * vkq;
                v[k][q] = sn * vkp + cs * vkq;
            }
        }
    }
    let m = 0;
    for (let k = 1; k < 3; k++)
        if (a[k][k] < a[m][m])
            m = k;
    return [v[0][m], v[1][m], v[2][m]];
}
/**
 * Per-landmark unit normals from local PCA of the 3-D mesh. Convention: +x right, +y down (image),
 * +z TOWARDS the camera. Returns null if the mesh has no depth (caller falls back to ellipsoidNormals).
 * zScale converts MediaPipe z to pixel units (MediaPipe z is roughly in x units; ASSUMED 1).
 */
export function landmarkNormals(pts, k = 10, zScale = 1) {
    if (pts.length < 468 || pts.some((p) => !Number.isFinite(p[2])))
        return null;
    const out = [];
    const dist = new Float64Array(pts.length);
    for (let i = 0; i < pts.length; i++) {
        for (let j = 0; j < pts.length; j++)
            dist[j] = (pts[j][0] - pts[i][0]) ** 2 + (pts[j][1] - pts[i][1]) ** 2 + ((pts[j][2] - pts[i][2]) * zScale) ** 2;
        const nn = Array.from(dist.keys()).sort((a, b) => dist[a] - dist[b]).slice(0, k + 1);
        const m = [0, 0, 0];
        for (const j of nn) {
            m[0] += pts[j][0];
            m[1] += pts[j][1];
            m[2] += pts[j][2] * zScale;
        }
        m[0] /= nn.length;
        m[1] /= nn.length;
        m[2] /= nn.length;
        const c = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
        for (const j of nn) {
            const d = [pts[j][0] - m[0], pts[j][1] - m[1], pts[j][2] * zScale - m[2]];
            for (let r = 0; r < 3; r++)
                for (let s = 0; s < 3; s++)
                    c[r][s] += d[r] * d[s];
        }
        let [x, y, z] = smallestEigenvector(c);
        if (z > 0) {
            x = -x;
            y = -y;
            z = -z;
        } // MediaPipe: smaller z = nearer the camera
        const len = Math.hypot(x, y, z) || 1;
        out.push([x / len, y / len, -z / len]);
    }
    return out;
}
/** Axes of the face from the mesh: centre, unit across/down vectors and half sizes. */
export function faceAxes(pts) {
    const r = pts[33], l = pts[263], chin = pts[152], top = pts[10];
    let ax = l[0] - r[0], ay = l[1] - r[1];
    const la = Math.hypot(ax, ay) || 1;
    ax /= la;
    ay /= la;
    const dx = -ay, dy = ax;
    const cx = (top[0] + chin[0]) / 2, cy = (top[1] + chin[1]) / 2;
    const halfH = Math.hypot(chin[0] - top[0], chin[1] - top[1]) / 2;
    const halfW = Math.hypot(pts[454][0] - pts[234][0], pts[454][1] - pts[234][1]) / 2;
    return { cx, cy, ax, ay, dx, dy, halfW, halfH };
}
/**
 * Dense normal image inside a box: Gaussian-weighted average of landmark normals on a coarse grid,
 * bilinear upsampled. Without depth, an ellipsoid head prior in face axes is used instead.
 */
export function normalImage(w, h, pts, normals, iod, box) {
    const n = w * h, nx = new Float64Array(n), ny = new Float64Array(n), nz = new Float64Array(n).fill(1);
    const x0 = Math.max(0, Math.floor(box.x0)), y0 = Math.max(0, Math.floor(box.y0));
    const x1 = Math.min(w - 1, Math.ceil(box.x1)), y1 = Math.min(h - 1, Math.ceil(box.y1));
    const out = { nx, ny, nz, x0, y0, x1, y1 };
    if (x1 <= x0 || y1 <= y0)
        return out;
    if (!normals) {
        const f = faceAxes(pts);
        for (let y = y0; y <= y1; y++)
            for (let x = x0; x <= x1; x++) {
                const px = x - f.cx, py = y - f.cy;
                const u = (px * f.ax + py * f.ay) / (f.halfW * 1.05), v = (px * f.dx + py * f.dy) / (f.halfH * 1.1);
                const r2 = Math.min(0.97, u * u + v * v), zc = Math.sqrt(1 - r2);
                // back to image axes
                const ix = u * f.ax + v * f.dx, iy = u * f.ay + v * f.dy, len = Math.hypot(ix, iy, zc);
                const i = y * w + x;
                nx[i] = ix / len;
                ny[i] = iy / len;
                nz[i] = zc / len;
            }
        return out;
    }
    const cell = Math.max(2, Math.round(0.03 * iod)), gw = Math.ceil((x1 - x0 + 1) / cell) + 1, gh = Math.ceil((y1 - y0 + 1) / cell) + 1;
    const sig = 0.09 * iod, inv = 1 / (2 * sig * sig), cut = 9 * sig * sig;
    const G = [new Float64Array(gw * gh), new Float64Array(gw * gh), new Float64Array(gw * gh)];
    for (let gy = 0; gy < gh; gy++)
        for (let gx = 0; gx < gw; gx++) {
            const px = x0 + gx * cell, py = y0 + gy * cell;
            let sx = 0, sy = 0, sz = 0, sw = 0, best = Infinity, bi = 0;
            for (let k = 0; k < normals.length; k++) {
                const d2 = (pts[k][0] - px) ** 2 + (pts[k][1] - py) ** 2;
                if (d2 < best) {
                    best = d2;
                    bi = k;
                }
                if (d2 > cut)
                    continue;
                const wt = Math.exp(-d2 * inv);
                sx += wt * normals[k][0];
                sy += wt * normals[k][1];
                sz += wt * normals[k][2];
                sw += wt;
            }
            if (sw < 1e-6) {
                sx = normals[bi][0];
                sy = normals[bi][1];
                sz = normals[bi][2];
            }
            const len = Math.hypot(sx, sy, sz) || 1, g = gy * gw + gx;
            G[0][g] = sx / len;
            G[1][g] = sy / len;
            G[2][g] = sz / len;
        }
    for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
            const fx = (x - x0) / cell, fy = (y - y0) / cell, ix = Math.min(gw - 2, Math.floor(fx)), iy = Math.min(gh - 2, Math.floor(fy));
            const tx = fx - ix, ty = fy - iy, i = y * w + x;
            const v = [0, 1, 2].map((c) => {
                const a = G[c][iy * gw + ix], b = G[c][iy * gw + ix + 1], d = G[c][(iy + 1) * gw + ix], e = G[c][(iy + 1) * gw + ix + 1];
                return (a * (1 - tx) + b * tx) * (1 - ty) + (d * (1 - tx) + e * tx) * ty;
            });
            const len = Math.hypot(v[0], v[1], v[2]) || 1;
            nx[i] = v[0] / len;
            ny[i] = v[1] / len;
            nz[i] = v[2] / len;
        }
    return out;
}
/**
 * Fit Y ≈ c0 + c1 nx + c2 ny + c3 nz on clean skin (albedo folded in; skin albedo is near-constant
 * at low frequency). Two passes with outlier trimming. r2 < 0.25 => flat/ambiguous light: callers
 * use a frontal default and must keep added shading small.
 */
export function fitLight(Y, N, samples) {
    const solve = (idx) => {
        const A = Array.from({ length: 4 }, () => new Float64Array(4)), b = new Float64Array(4);
        for (const i of idx) {
            const f = [1, N.nx[i], N.ny[i], N.nz[i]];
            for (let r = 0; r < 4; r++) {
                b[r] += f[r] * Y[i];
                for (let s = 0; s < 4; s++)
                    A[r][s] += f[r] * f[s];
            }
        }
        for (let r = 0; r < 4; r++)
            A[r][r] += 1e-6 * idx.length;
        // Gaussian elimination
        const M = A.map((row, r) => [...row, b[r]]);
        for (let p = 0; p < 4; p++) {
            let piv = p;
            for (let r = p + 1; r < 4; r++)
                if (Math.abs(M[r][p]) > Math.abs(M[piv][p]))
                    piv = r;
            [M[p], M[piv]] = [M[piv], M[p]];
            const d = M[p][p] || 1e-12;
            for (let r = 0; r < 4; r++)
                if (r !== p) {
                    const f = M[r][p] / d;
                    for (let s = p; s < 5; s++)
                        M[r][s] -= f * M[p][s];
                }
        }
        return [M[0][4] / (M[0][0] || 1), M[1][4] / (M[1][1] || 1), M[2][4] / (M[2][2] || 1), M[3][4] / (M[3][3] || 1)];
    };
    const pred = (c, i) => c[0] + c[1] * N.nx[i] + c[2] * N.ny[i] + c[3] * N.nz[i];
    if (samples.length < 64)
        return { c: [0, 0, 0, 1], r2: 0, reliable: false, samples: samples.length };
    let c = solve(samples);
    const res = samples.map((i) => Y[i] - pred(c, i)), sd = Math.sqrt(res.reduce((s, v) => s + v * v, 0) / res.length);
    const kept = samples.filter((_, k) => Math.abs(res[k]) < 2.5 * sd);
    c = solve(kept);
    let mean = 0;
    for (const i of kept)
        mean += Y[i];
    mean /= kept.length;
    let ssr = 0, sst = 0;
    for (const i of kept) {
        ssr += (Y[i] - pred(c, i)) ** 2;
        sst += (Y[i] - mean) ** 2;
    }
    const r2 = sst > 1e-12 ? 1 - ssr / sst : 0;
    const reliable = r2 >= 0.25 && c[3] > 0;
    return { c: reliable ? c : [mean * 0.35, 0, 0, mean * 0.65], r2, reliable, samples: kept.length };
}
export const shadeAt = (L, nx, ny, nz) => L.c[0] + L.c[1] * nx + L.c[2] * ny + L.c[3] * nz;
/**
 * Multiplicative shading ratio for a height bump h (pixels of relief per pixel). Positive h = raised
 * (brow ridge, cheekbone), negative = groove (crease, fold). Includes a cavity term so grooves darken
 * even under flat frontal light. Returns 1 outside the normal box.
 */
export function bumpRatio(hgt, N, L, w, h, opts = {}) {
    const gain = opts.slopeGain ?? 1, cav = opts.cavity ?? 0.04, lo = opts.min ?? 0.55, hi = opts.max ?? 1.35;
    const out = new Float64Array(w * h).fill(1);
    const smoothH = gaussian(hgt, w, h, opts.cavitySigma ?? 3);
    for (let y = Math.max(1, N.y0); y <= Math.min(h - 2, N.y1); y++)
        for (let x = Math.max(1, N.x0); x <= Math.min(w - 2, N.x1); x++) {
            const i = y * w + x;
            const hx = 0.5 * (hgt[i + 1] - hgt[i - 1]) * gain, hy = 0.5 * (hgt[i + w] - hgt[i - w]) * gain;
            if (hx === 0 && hy === 0 && hgt[i] === smoothH[i])
                continue;
            const bx = N.nx[i], by = N.ny[i], bz = N.nz[i];
            // perturb: n' = n - grad(h) projected into the surface (small-slope approximation)
            let px = bx - hx * bz, py = by - hy * bz, pz = bz + hx * bx + hy * by;
            const len = Math.hypot(px, py, pz) || 1;
            px /= len;
            py /= len;
            pz /= len;
            const s0 = Math.max(1e-4, shadeAt(L, bx, by, bz)), s1 = Math.max(1e-4, shadeAt(L, px, py, pz));
            const cavity = 1 + cav * Math.min(0, hgt[i] - smoothH[i]);
            out[i] = clamp((s1 / s0) * clamp(cavity, 0.6, 1), lo, hi);
        }
    return out;
}
