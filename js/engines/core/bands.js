/**
 * BELJOUR shared band machinery (Texture Law substrate).
 * Gaussian band split, linear-light colour, ridge and flow analysis, texture statistics.
 * Pure TypeScript, no model, no external pixels. Every function is deterministic.
 */
export const clamp = (v, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
export const smoothstep = (e0, e1, x) => {
    const t = clamp((x - e0) / (e1 - e0));
    return t * t * (3 - 2 * t);
};
export const toByte = (v) => (v <= 0 ? 0 : v >= 255 ? 255 : Math.round(v));
export const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
/* ---------------- PRNG: mulberry32 (better low bits than an LCG) ---------------- */
export function rng(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
export function gaussRng(r) {
    return () => Math.sqrt(-2 * Math.log(Math.max(1e-12, r()))) * Math.cos(2 * Math.PI * r());
}
/** Stateless hash in [0,1) for per-pixel or per-object jitter. */
export function hash01(x, y, seed) {
    let h = (Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b9)) >>> 0;
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/* ---------------- Gaussian blur (separable; three-box for large sigma) ---------------- */
function boxPass(src, dst, w, h, r, horizontal) {
    const len = horizontal ? w : h, lines = horizontal ? h : w;
    const stride = horizontal ? 1 : w, lineStep = horizontal ? w : 1;
    const inv = 1 / (2 * r + 1);
    for (let l = 0; l < lines; l++) {
        const base = l * lineStep;
        let acc = 0;
        for (let k = -r; k <= r; k++)
            acc += src[base + clamp(k, 0, len - 1) * stride];
        for (let i = 0; i < len; i++) {
            dst[base + i * stride] = acc * inv;
            const add = clamp(i + r + 1, 0, len - 1), sub = clamp(i - r, 0, len - 1);
            acc += src[base + add * stride] - src[base + sub * stride];
        }
    }
}
function kernelPass(src, dst, w, h, k, horizontal) {
    const r = (k.length - 1) >> 1, len = horizontal ? w : h, lines = horizontal ? h : w, stride = horizontal ? 1 : w, step = horizontal ? w : 1;
    for (let l = 0; l < lines; l++) {
        const base = l * step;
        for (let i = 0; i < len; i++) {
            let s = 0;
            if (i >= r && i < len - r) {
                const o = base + (i - r) * stride;
                for (let t = 0; t < k.length; t++)
                    s += k[t] * src[o + t * stride];
            }
            else
                for (let t = -r; t <= r; t++)
                    s += k[t + r] * src[base + Math.min(len - 1, Math.max(0, i + t)) * stride];
            dst[base + i * stride] = s;
        }
    }
}
/** Gaussian blur with edge clamping. sigma <= 0 returns a copy. */
export function gaussian(src, w, h, sigma) {
    if (src.length !== w * h)
        throw new RangeError("gaussian: plane size mismatch");
    const out = Float64Array.from(src);
    if (!(sigma > 0.05))
        return out;
    const tmp = new Float64Array(w * h);
    if (sigma > 2.5) {
        // Three box passes approximate a Gaussian (Wells 1986); O(n) whatever the sigma.
        const wIdeal = Math.sqrt((12 * sigma * sigma) / 3 + 1), r = Math.max(1, Math.round((wIdeal - 1) / 2));
        for (let p = 0; p < 3; p++) {
            boxPass(out, tmp, w, h, r, true);
            boxPass(tmp, out, w, h, r, false);
        }
        return out;
    }
    const r = Math.max(1, Math.ceil(3 * sigma)), k = new Float64Array(2 * r + 1);
    let s = 0;
    for (let t = -r; t <= r; t++) {
        k[t + r] = Math.exp(-(t * t) / (2 * sigma * sigma));
        s += k[t + r];
    }
    for (let t = 0; t < k.length; t++)
        k[t] /= s;
    kernelPass(out, tmp, w, h, k, true);
    kernelPass(tmp, out, w, h, k, false);
    return out;
}
/** Normalised convolution: Gaussian mean of src over pixels with weight m (0..1). */
export function maskedGaussian(src, m, w, h, sigma) {
    const n = w * h, num = new Float64Array(n), den = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        const q = clamp(m[i]);
        num[i] = src[i] * q;
        den[i] = q;
    }
    const a = gaussian(num, w, h, sigma), b = gaussian(den, w, h, sigma), out = new Float64Array(n);
    for (let i = 0; i < n; i++)
        out[i] = b[i] > 1e-6 ? a[i] / b[i] : src[i];
    return out;
}
/* ---------------- Colour ---------------- */
const LIN = new Float64Array(256);
for (let i = 0; i < 256; i++) {
    const c = i / 255;
    LIN[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
export const srgbToLin = (v) => {
    if (Number.isInteger(v) && v >= 0 && v <= 255)
        return LIN[v];
    const c = clamp(v / 255);
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
export const linToSrgb = (c) => {
    const v = clamp(c);
    return 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
};
export const lumLin = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
/** CIE L* from linear luminance (D65 white = 1). */
export const lstarOf = (y) => (y > 216 / 24389 ? 116 * Math.cbrt(y) - 16 : (24389 / 27) * y);
export function linToLab(r, g, b) {
    const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
    const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
    const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
    const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
    const fx = f(x), fy = f(y), fz = f(z);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
export function labToLin(L, a, b) {
    const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
    const inv = (t) => (t ** 3 > 216 / 24389 ? t ** 3 : (116 * t - 16) / (24389 / 27));
    const x = inv(fx) * 0.95047, y = inv(fy), z = inv(fz) * 1.08883;
    return [3.2404542 * x - 1.5371385 * y - 0.4985314 * z, -0.969266 * x + 1.8760108 * y + 0.041556 * z,
        0.0556434 * x - 0.2040259 * y + 1.0572252 * z];
}
const fLab = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
/** Allocation-free linear RGB -> Lab into out[o..o+2]. */
export function linToLabInto(r, g, b, out, o = 0) {
    const fx = fLab((0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047), fy = fLab(0.2126729 * r + 0.7151522 * g + 0.072175 * b);
    const fz = fLab((0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883);
    out[o] = 116 * fy - 16;
    out[o + 1] = 500 * (fx - fy);
    out[o + 2] = 200 * (fy - fz);
}
/** Allocation-free Lab -> linear RGB into out[o..o+2]. */
export function labToLinInto(L, a, b, out, o = 0) {
    const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200, e = 216 / 24389, k = 24389 / 27;
    const x = (fx ** 3 > e ? fx ** 3 : (116 * fx - 16) / k) * 0.95047, y = fy ** 3 > e ? fy ** 3 : (116 * fy - 16) / k, z = (fz ** 3 > e ? fz ** 3 : (116 * fz - 16) / k) * 1.08883;
    out[o] = 3.2404542 * x - 1.5371385 * y - 0.4985314 * z;
    out[o + 1] = -0.969266 * x + 1.8760108 * y + 0.041556 * z;
    out[o + 2] = 0.0556434 * x - 0.2040259 * y + 1.0572252 * z;
}
/** Lab planes of an image (one pass). */
export function labPlanesOf(lin) {
    const n = lin[0].length, L = new Float64Array(n), A = new Float64Array(n), B = new Float64Array(n), t = new Float64Array(3);
    for (let i = 0; i < n; i++) {
        linToLabInto(lin[0][i], lin[1][i], lin[2][i], t);
        L[i] = t[0];
        A[i] = t[1];
        B[i] = t[2];
    }
    return [L, A, B];
}
/** Split an RGB(A) image into three linear-light planes. */
export function linearPlanes(img) {
    const n = img.width * img.height, r = new Float64Array(n), g = new Float64Array(n), b = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        const j = i * img.channels;
        r[i] = srgbToLin(img.data[j]);
        g[i] = srgbToLin(img.data[j + 1]);
        b[i] = srgbToLin(img.data[j + 2]);
    }
    return [r, g, b];
}
export function lstarPlane(img) {
    const [r, g, b] = linearPlanes(img), out = new Float64Array(r.length);
    for (let i = 0; i < out.length; i++)
        out[i] = lstarOf(lumLin(r[i], g[i], b[i]));
    return out;
}
/** Write linear planes back into a copy of `like` (alpha preserved), only where weight > 0. */
export function writeLinear(like, planes, weight) {
    const out = Uint8Array.from(like.data), ch = like.channels, n = like.width * like.height;
    for (let i = 0; i < n; i++) {
        if (weight && !(weight[i] > 0))
            continue;
        const j = i * ch;
        out[j] = toByte(linToSrgb(planes[0][i]));
        out[j + 1] = toByte(linToSrgb(planes[1][i]));
        out[j + 2] = toByte(linToSrgb(planes[2][i]));
    }
    return out;
}
/**
 * Scale-normalised Hessian ridge detector for DARK valleys (creases).
 * strength = sigma^2 * max(0, lambda1); anisotropy in 0..1 (1 = line, 0 = blob such as a pore).
 * (nx, ny) is the unit normal ACROSS the crease.
 */
export function darkRidges(L, w, h, sigma) {
    const g = gaussian(L, w, h, sigma), n = w * h;
    const strength = new Float64Array(n), anisotropy = new Float64Array(n), nx = new Float64Array(n), ny = new Float64Array(n);
    const s2 = sigma * sigma;
    for (let y = 1; y < h - 1; y++)
        for (let x = 1; x < w - 1; x++) {
            const i = y * w + x;
            const dxx = g[i + 1] - 2 * g[i] + g[i - 1], dyy = g[i + w] - 2 * g[i] + g[i - w];
            const dxy = 0.25 * (g[i + w + 1] - g[i + w - 1] - g[i - w + 1] + g[i - w - 1]);
            const tr = dxx + dyy, det = dxx * dyy - dxy * dxy, disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
            const l1 = tr / 2 + disc, l2 = tr / 2 - disc; // l1 >= l2
            if (l1 <= 0)
                continue;
            strength[i] = s2 * l1;
            anisotropy[i] = clamp((l1 - Math.abs(l2)) / (l1 + Math.abs(l2) + 1e-9));
            // eigenvector of l1
            let vx = dxy, vy = l1 - dxx;
            if (Math.abs(vx) + Math.abs(vy) < 1e-12) {
                vx = l1 - dyy;
                vy = dxy;
            }
            const m = Math.hypot(vx, vy) || 1;
            nx[i] = vx / m;
            ny[i] = vy / m;
        }
    return { strength, anisotropy, nx, ny };
}
/** Structure-tensor flow: (tx,ty) runs ALONG strands; coherence 0..1. */
export function flowField(L, w, h, gradSigma = 1, intSigma = 3) {
    const g = gaussian(L, w, h, gradSigma), n = w * h;
    const jxx = new Float64Array(n), jyy = new Float64Array(n), jxy = new Float64Array(n);
    for (let y = 1; y < h - 1; y++)
        for (let x = 1; x < w - 1; x++) {
            const i = y * w + x, gx = 0.5 * (g[i + 1] - g[i - 1]), gy = 0.5 * (g[i + w] - g[i - w]);
            jxx[i] = gx * gx;
            jyy[i] = gy * gy;
            jxy[i] = gx * gy;
        }
    const a = gaussian(jxx, w, h, intSigma), b = gaussian(jyy, w, h, intSigma), c = gaussian(jxy, w, h, intSigma);
    const tx = new Float64Array(n), ty = new Float64Array(n), coherence = new Float64Array(n), energy = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        const tr = a[i] + b[i], d = Math.hypot(a[i] - b[i], 2 * c[i]);
        coherence[i] = tr > 1e-9 ? d / tr : 0;
        energy[i] = tr;
        const theta = 0.5 * Math.atan2(2 * c[i], a[i] - b[i]) + Math.PI / 2; // gradient-normal = strand direction
        tx[i] = Math.cos(theta);
        ty[i] = Math.sin(theta);
    }
    return { tx, ty, coherence, energy };
}
/**
 * Fill flow into regions without reliable texture (e.g. a parting) from surrounding hair, using
 * coherence-weighted normalised convolution of the doubled-angle vector at growing scales.
 */
export function inpaintFlow(f, support, w, h, sigmas = [3, 6, 12, 24]) {
    const n = w * h, c2 = new Float64Array(n), s2 = new Float64Array(n), wt = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        const q = clamp(support[i]) * f.coherence[i];
        const ang = Math.atan2(f.ty[i], f.tx[i]) * 2;
        c2[i] = Math.cos(ang) * q;
        s2[i] = Math.sin(ang) * q;
        wt[i] = q;
    }
    const tx = Float64Array.from(f.tx), ty = Float64Array.from(f.ty), coh = Float64Array.from(f.coherence);
    const done = new Uint8Array(n);
    for (let i = 0; i < n; i++)
        if (clamp(support[i]) * f.coherence[i] > 0.35)
            done[i] = 1;
    for (const s of sigmas) {
        const C = gaussian(c2, w, h, s), S = gaussian(s2, w, h, s), W = gaussian(wt, w, h, s);
        for (let i = 0; i < n; i++) {
            if (done[i] || W[i] < 0.02)
                continue;
            const ang = 0.5 * Math.atan2(S[i], C[i]);
            tx[i] = Math.cos(ang);
            ty[i] = Math.sin(ang);
            coh[i] = clamp(Math.hypot(C[i], S[i]) / W[i]);
            done[i] = 1;
        }
    }
    return { tx, ty, coherence: coh, energy: f.energy };
}
export function bandStats(values, idx, maxSamples = 20000) {
    const step = Math.max(1, Math.floor(idx.length / maxSamples));
    let s = 0, c = 0;
    for (let k = 0; k < idx.length; k += step) {
        s += values[idx[k]];
        c++;
    }
    if (c < 16)
        return { sd: 0, exKurt: 0, count: c };
    const m = s / c;
    let v = 0, q = 0;
    for (let k = 0; k < idx.length; k += step) {
        const d = values[idx[k]] - m;
        v += d * d;
        q += d * d * d * d;
    }
    v /= c;
    q /= c;
    return { sd: Math.sqrt(v), exKurt: v > 1e-12 ? q / (v * v) - 3 : 0, count: c };
}
/** High band of a plane: x - G_sigma(x). */
export function highBand(L, w, h, sigma) {
    const g = gaussian(L, w, h, sigma), out = new Float64Array(w * h);
    for (let i = 0; i < out.length; i++)
        out[i] = L[i] - g[i];
    return out;
}
/** Indices where mask >= t. */
export function where(mask, t = 0.5) {
    const out = [];
    for (let i = 0; i < mask.length; i++)
        if (mask[i] >= t)
            out.push(i);
    return out;
}
/**
 * Texture-match metric: compare the 1-2 px band of an edited region with a reference region of the
 * person's own untreated skin. Returns sdRatio (target 0.9..1.1) and kurtosis ratio (pores are sparse:
 * ratio < 0.7 means the texture went Gaussian, i.e. "film grain on plaster").
 */
export function textureMatch(L, w, h, edited, reference, sigma = 1.2) {
    const hb = highBand(L, w, h, sigma), a = bandStats(hb, edited), b = bandStats(hb, reference);
    return {
        sdRatio: b.sd > 1e-9 ? a.sd / b.sd : 0,
        kurtRatio: b.exKurt > 0.25 ? clamp(a.exKurt / b.exKurt, 0, 5) : 1,
        edited: a, reference: b,
    };
}
/** Fraction of the 1-2 px band energy that survived an edit, measured in the same region (Younger, Tan, Teeth). */
export function fineBandRetention(before, after, w, h, region, sigma = 1.0) {
    const a = bandStats(highBand(before, w, h, sigma), region), b = bandStats(highBand(after, w, h, sigma), region);
    return a.sd > 1e-9 ? b.sd / a.sd : 1;
}
/* ---------------- Morphology and distance ---------------- */
export function dilateBinary(m, w, h, r, t = 0.5) {
    const n = w * h, out = new Uint8Array(n), d = chamfer(m, w, h, t);
    for (let i = 0; i < n; i++)
        out[i] = d[i] <= r ? 1 : 0;
    return out;
}
/** Two-pass chamfer (3-4) distance in px to the nearest pixel with m >= t. */
export function chamfer(m, w, h, t = 0.5) {
    const n = w * h, d = new Float64Array(n), INF = 1e9;
    for (let i = 0; i < n; i++)
        d[i] = m[i] >= t ? 0 : INF;
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            const i = y * w + x;
            if (x > 0)
                d[i] = Math.min(d[i], d[i - 1] + 1);
            if (y > 0) {
                d[i] = Math.min(d[i], d[i - w] + 1);
                if (x > 0)
                    d[i] = Math.min(d[i], d[i - w - 1] + 1.4142);
                if (x < w - 1)
                    d[i] = Math.min(d[i], d[i - w + 1] + 1.4142);
            }
        }
    for (let y = h - 1; y >= 0; y--)
        for (let x = w - 1; x >= 0; x--) {
            const i = y * w + x;
            if (x < w - 1)
                d[i] = Math.min(d[i], d[i + 1] + 1);
            if (y < h - 1) {
                d[i] = Math.min(d[i], d[i + w] + 1);
                if (x < w - 1)
                    d[i] = Math.min(d[i], d[i + w + 1] + 1.4142);
                if (x > 0)
                    d[i] = Math.min(d[i], d[i + w - 1] + 1.4142);
            }
        }
    return d;
}
/* ---------------- Poisson-disk (blue-noise) sampling ---------------- */
/**
 * Bridson Poisson-disk sampling inside `allowed` with a spatially varying minimum distance.
 * Blue noise is what stops follicles, freckles and fibres reading as a grid or as clumps.
 */
export function poissonDisk(w, h, minDist, allowed, seed, maxPoints = 50000, tries = 20, box) {
    const r = rng(seed), b = box ?? { x0: 0, y0: 0, x1: w, y1: h };
    let dmin = Infinity;
    for (let k = 0; k < 64; k++)
        dmin = Math.min(dmin, minDist(b.x0 + r() * (b.x1 - b.x0), b.y0 + r() * (b.y1 - b.y0)));
    const cell = Math.max(0.5, dmin / Math.SQRT2), gw = Math.ceil((b.x1 - b.x0) / cell) + 1, gh = Math.ceil((b.y1 - b.y0) / cell) + 1;
    const grid = new Int32Array(gw * gh).fill(-1), pts = [], active = [];
    const reach = 12; // cells; covers minDist up to ~8x the smallest spacing
    const ok = (x, y, d) => {
        const gx = Math.floor((x - b.x0) / cell), gy = Math.floor((y - b.y0) / cell), span = Math.min(reach, Math.ceil(d / cell) + 1);
        for (let yy = Math.max(0, gy - span); yy <= Math.min(gh - 1, gy + span); yy++)
            for (let xx = Math.max(0, gx - span); xx <= Math.min(gw - 1, gx + span); xx++) {
                const k = grid[yy * gw + xx];
                if (k >= 0) {
                    const p = pts[k];
                    if ((p[0] - x) ** 2 + (p[1] - y) ** 2 < d * d)
                        return false;
                }
            }
        return true;
    };
    const add = (x, y) => {
        const gx = Math.floor((x - b.x0) / cell), gy = Math.floor((y - b.y0) / cell);
        if (grid[gy * gw + gx] >= 0)
            return false;
        grid[gy * gw + gx] = pts.length;
        pts.push([x, y]);
        active.push(pts.length - 1);
        return true;
    };
    for (let k = 0; k < 400 && pts.length === 0; k++) {
        const x = b.x0 + r() * (b.x1 - b.x0), y = b.y0 + r() * (b.y1 - b.y0);
        if (allowed(x, y))
            add(x, y);
    }
    // Scatter extra seeds so disconnected allowed regions are reached.
    for (let k = 0; k < 2000; k++) {
        const x = b.x0 + r() * (b.x1 - b.x0), y = b.y0 + r() * (b.y1 - b.y0);
        if (allowed(x, y) && ok(x, y, minDist(x, y)))
            add(x, y);
    }
    while (active.length && pts.length < maxPoints) {
        const ai = Math.floor(r() * active.length), p = pts[active[ai]], d = minDist(p[0], p[1]);
        let placed = false;
        for (let t = 0; t < tries; t++) {
            const ang = 2 * Math.PI * r(), rad = d * (1 + r());
            const x = p[0] + rad * Math.cos(ang), y = p[1] + rad * Math.sin(ang);
            if (x < b.x0 || y < b.y0 || x >= b.x1 || y >= b.y1 || !allowed(x, y))
                continue;
            if (ok(x, y, minDist(x, y)) && add(x, y)) {
                placed = true;
                break;
            }
        }
        if (!placed) {
            active[ai] = active[active.length - 1];
            active.pop();
        }
    }
    return pts;
}
export function boxOf(mask, w, h, pad, t = 0.002) {
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++)
            if (mask[y * w + x] > t) {
                if (x < x0)
                    x0 = x;
                if (x > x1)
                    x1 = x;
                if (y < y0)
                    y0 = y;
                if (y > y1)
                    y1 = y;
            }
    if (x1 < 0)
        return null;
    return { x0: Math.max(0, Math.floor(x0 - pad)), y0: Math.max(0, Math.floor(y0 - pad)), x1: Math.min(w - 1, Math.ceil(x1 + pad)), y1: Math.min(h - 1, Math.ceil(y1 + pad)) };
}
export function cropPlane(src, w, b, make) {
    const cw = b.x1 - b.x0 + 1, chh = b.y1 - b.y0 + 1, out = make(cw * chh);
    for (let y = 0; y < chh; y++)
        for (let x = 0; x < cw; x++)
            out[y * cw + x] = src[(y + b.y0) * w + x + b.x0];
    return out;
}
export function cropImage(img, b) {
    const cw = b.x1 - b.x0 + 1, chh = b.y1 - b.y0 + 1, ch = img.channels, data = new Uint8Array(cw * chh * ch);
    for (let y = 0; y < chh; y++)
        for (let k = 0, o = ((y + b.y0) * img.width + b.x0) * ch, q = y * cw * ch; k < cw * ch; k++)
            data[q + k] = img.data[o + k];
    return { width: cw, height: chh, channels: ch, data };
}
export function pasteImage(dst, dstWidth, ch, src, b) {
    const cw = b.x1 - b.x0 + 1, chh = b.y1 - b.y0 + 1;
    for (let y = 0; y < chh; y++)
        for (let k = 0, o = ((y + b.y0) * dstWidth + b.x0) * ch, q = y * cw * ch; k < cw * ch; k++)
            dst[o + k] = src[q + k];
}
