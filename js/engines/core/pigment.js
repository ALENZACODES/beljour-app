/**
 * Melanin pigment model shared by Freckles, Tan and Older (lentigines).
 * Pigment is optical density (OD) added to the skin's own albedo in linear light:
 *   rgb_out = rgb_in * 10^(-OD * spectrum)
 * so shading, highlights (partly) and pores are multiplied, never painted over.
 * Spectra are relative absorbance at sRGB primaries; ASSUMED approximations of published
 * melanin absorption curves (eumelanin falls with wavelength; pheomelanin is redder/yellower).
 */
import { clamp, gaussian, gaussRng, hash01, lstarOf, lumLin, rng, darkRidges, highBand } from "./bands.js";
export const EUMELANIN = [0.57, 0.8, 1.0]; // ASSUMED
export const PHEOMELANIN = [0.3, 0.66, 1.0]; // ASSUMED
export function spectrum(pheo) {
    const p = clamp(pheo);
    return [0, 1, 2].map((c) => EUMELANIN[c] * (1 - p) + PHEOMELANIN[c] * p);
}
/** Change in L* when OD is applied to a linear colour. */
export function deltaLstar(r, g, b, od, pheo) {
    const s = spectrum(pheo), k = (c) => Math.pow(10, -od * s[c]);
    return lstarOf(lumLin(r * k(0), g * k(1), b * k(2))) - lstarOf(lumLin(r, g, b));
}
/** OD that darkens this colour by `dL` L* units (dL > 0). Newton on a smooth monotone function. */
export function odForDeltaL(r, g, b, dL, pheo) {
    let od = 0.02;
    for (let it = 0; it < 6; it++) {
        const f = -deltaLstar(r, g, b, od, pheo) - dL, f2 = -deltaLstar(r, g, b, od + 1e-3, pheo) - dL;
        const slope = (f2 - f) / 1e-3;
        if (Math.abs(slope) < 1e-9)
            break;
        od = clamp(od - f / slope, 0, 1.5);
    }
    return od;
}
/** Apply an OD field (with per-pixel pheomelanin fraction) to linear planes in place. */
export function applyOD(planes, od, pheo, weight) {
    let touched = 0;
    for (let i = 0; i < od.length; i++) {
        const d = od[i] * (weight ? clamp(weight[i]) : 1);
        if (!(d > 1e-5))
            continue;
        const s = spectrum(pheo[i]);
        for (let c = 0; c < 3; c++)
            planes[c][i] *= Math.pow(10, -d * s[c]);
        touched++;
    }
    return touched;
}
/**
 * Small dark isotropic blobs on skin (DoG + Hessian anisotropy gate). Freckles: 2-12 L* deep and
 * small. Moles: deeper or larger. Both are identity features: never erased, never copied elsewhere.
 */
export function detectMarks(Lstar, a, b, skin, w, h, iod) {
    const marks = [];
    const s1 = Math.max(0.7, 0.006 * iod), hb = highBand(Lstar, w, h, 3 * s1), rid = darkRidges(Lstar, w, h, s1);
    // Pigment marks raise chroma relative to the surrounding skin; pores and fine shadows only dip L*.
    const C = Float64Array.from(a, (v, i) => Math.hypot(v, b[i]));
    const hc = highBand(C, w, h, 3 * s1);
    for (let y = 2; y < h - 2; y++)
        for (let x = 2; x < w - 2; x++) {
            const i = y * w + x;
            if (skin[i] < 0.9 || hb[i] > -2 || rid.anisotropy[i] > 0.55 || hc[i] < 0.8)
                continue;
            let isMin = true;
            for (let dy = -2; dy <= 2 && isMin; dy++)
                for (let dx = -2; dx <= 2; dx++)
                    if ((dx || dy) && hb[i + dy * w + dx] < hb[i]) {
                        isMin = false;
                        break;
                    }
            if (!isMin)
                continue;
            let r = 1;
            while (r < 0.06 * iod && x - r > 0 && x + r < w - 1 && hb[i + r] < hb[i] * 0.5)
                r++;
            const depth = -hb[i];
            marks.push({ x, y, radius: r, depthL: depth, hue: Math.atan2(b[i], a[i]), isMole: depth > 14 || r > 0.03 * iod });
        }
    return marks;
}
/**
 * Matérn-style cluster process with hard-core thinning: parents follow the sun-exposure map, offspring
 * cluster around them, and no two freckles may sit closer than hardCore*(ri+rj). That combination is
 * clustered but never bunched or stamped.
 */
export function placeFreckles(exposure, allowed, box, iod, p, seed) {
    const r = rng(seed), g = gaussRng(r), out = [];
    const cell = Math.max(1, p.capDiamIod * iod), gw = Math.ceil((box.x1 - box.x0) / cell) + 1, gh = Math.ceil((box.y1 - box.y0) / cell) + 1;
    const grid = Array.from({ length: gw * gh }, () => []);
    const parents = [];
    for (let k = 0; k < 6000 && parents.length < Math.max(4, Math.round(p.count / 14)); k++) {
        const x = box.x0 + r() * (box.x1 - box.x0), y = box.y0 + r() * (box.y1 - box.y0);
        if (allowed(x, y) && r() < exposure(x, y))
            parents.push([x, y]);
    }
    if (!parents.length)
        return out;
    const fits = (x, y, rad) => {
        const gx = Math.floor((x - box.x0) / cell), gy = Math.floor((y - box.y0) / cell);
        for (let yy = Math.max(0, gy - 2); yy <= Math.min(gh - 1, gy + 2); yy++)
            for (let xx = Math.max(0, gx - 2); xx <= Math.min(gw - 1, gx + 2); xx++) {
                for (const k of grid[yy * gw + xx]) {
                    const f = out[k];
                    if ((f.x - x) ** 2 + (f.y - y) ** 2 < (p.hardCore * (f.r + rad)) ** 2)
                        return false;
                }
            }
        return true;
    };
    for (let t = 0; t < p.count * 30 && out.length < p.count; t++) {
        const par = parents[Math.floor(r() * parents.length)], s = p.clusterSpreadIod * iod * (0.6 + 0.8 * r());
        const x = par[0] + g() * s, y = par[1] + g() * s * 0.8;
        if (x < box.x0 || y < box.y0 || x >= box.x1 || y >= box.y1 || !allowed(x, y) || r() > exposure(x, y))
            continue;
        const diam = Math.min(p.capDiamIod, p.medianDiamIod * Math.exp(p.sigmaLog * g())) * iod, rad = Math.max(0.45, diam / 2);
        if (!fits(x, y, rad))
            continue;
        // Bigger freckles are slightly darker (real sun response), with independent jitter.
        const depthT = clamp(0.35 * (diam / (p.medianDiamIod * iod) - 1) + r() * 0.8);
        out.push({ x, y, r: rad, dl: p.depthL[0] + (p.depthL[1] - p.depthL[0]) * depthT, pheo: p.pheo[0] + (p.pheo[1] - p.pheo[0]) * r(),
            aspect: 0.7 + 0.55 * r(), angle: Math.PI * r(), shape: Math.floor(r() * 1e9), rim: 0.5 + 0.5 * r() });
        const gx = Math.floor((x - box.x0) / cell), gy = Math.floor((y - box.y0) / cell);
        grid[gy * gw + gx].push(out.length - 1);
    }
    return out;
}
/**
 * Rasterise freckles to a dL* field and pheomelanin field. Irregular outline (angular harmonics with
 * per-freckle phases), 0.5-1 px rim, slight interior unevenness. dL is converted to OD per pixel by
 * the caller (OD depends on the local skin colour, so deeper skin gets a smaller dL for the same pigment).
 */
export function rasterFreckles(fs, w, h, amount) {
    const dL = new Float64Array(w * h), ph = new Float64Array(w * h), pw = new Float64Array(w * h);
    for (const f of fs) {
        const ext = f.r * 1.6 + 1.5, ca = Math.cos(f.angle), sa = Math.sin(f.angle);
        const p1 = 6.283 * hash01(f.shape, 1, 3), p2 = 6.283 * hash01(f.shape, 2, 5), p3 = 6.283 * hash01(f.shape, 3, 7);
        for (let y = Math.max(0, Math.floor(f.y - ext)); y <= Math.min(h - 1, Math.ceil(f.y + ext)); y++)
            for (let x = Math.max(0, Math.floor(f.x - ext)); x <= Math.min(w - 1, Math.ceil(f.x + ext)); x++) {
                // 2x2 supersampling of the outline
                let cover = 0;
                for (const [ox, oy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
                    const dx = x + ox - f.x, dy = y + oy - f.y, rx = ca * dx + sa * dy, ry = (-sa * dx + ca * dy) / f.aspect;
                    const th = Math.atan2(ry, rx), rr = f.r * (1 + 0.16 * Math.sin(2 * th + p1) + 0.1 * Math.sin(3 * th + p2) + 0.06 * Math.sin(5 * th + p3));
                    cover += 1 - clamp((Math.hypot(rx, ry) - rr + f.rim / 2) / f.rim);
                }
                cover /= 4;
                if (cover <= 0.01)
                    continue;
                // Pigment varies smoothly across a freckle (one side slightly deeper), never per pixel:
                // per-pixel random variation would be generated high-frequency texture (Texture Law).
                const gx = (x + 0.5 - f.x) / (f.r + 0.5), gy = (y + 0.5 - f.y) / (f.r + 0.5);
                const inner = 0.9 + 0.1 * (gx * Math.cos(p3) + gy * Math.sin(p3));
                const i = y * w + x, v = amount * f.dl * cover * inner;
                dL[i] += v * (1 - clamp(dL[i] / 14)); // optical densities add; soft ceiling keeps rare overlaps natural
                ph[i] += f.pheo * v;
                pw[i] += v;
            }
    }
    for (let i = 0; i < ph.length; i++)
        ph[i] = pw[i] > 0 ? ph[i] / pw[i] : 0.4;
    return { dL, pheo: ph };
}
/** Clark-Evans aggregation index R = mean NN distance / expected for random (R<1 clustered, >1 regular). */
export function clarkEvans(pts, area) {
    if (pts.length < 3 || area <= 0)
        return 1;
    let s = 0;
    for (let i = 0; i < pts.length; i++) {
        let best = Infinity;
        for (let j = 0; j < pts.length; j++)
            if (i !== j)
                best = Math.min(best, (pts[i].x - pts[j].x) ** 2 + (pts[i].y - pts[j].y) ** 2);
        s += Math.sqrt(best);
    }
    return s / pts.length / (0.5 / Math.sqrt(pts.length / area));
}
/* ---------------- Spaced freckle field (no bunching) ---------------- */
/** Blue/red absorbance ratio floor: below ~1.7 the darkest spots read grey-olive, 2.0 keeps them warm brown. */
export const WARM_RATIO = 2.0;
/** Smallest pheomelanin share whose spectrum keeps blue/red >= WARM_RATIO. */
export function warmPheoFloor(ratio = WARM_RATIO) {
    // spectrum(p)[2] / spectrum(p)[0] = (E2 (1-p) + P2 p) / (E0 (1-p) + P0 p), solved for p.
    const E0 = EUMELANIN[0], E2 = EUMELANIN[2], P0 = PHEOMELANIN[0], P2 = PHEOMELANIN[2];
    const p = (ratio * E0 - E2) / ((P2 - E2) - ratio * (P0 - E0));
    return clamp(p);
}
/**
 * Density-adaptive dart throwing: freckles follow the sun-exposure map, but each keeps a minimum
 * distance that scales with the local density. Dense where the sun falls, never bunched, never a
 * grid. Per-freckle depth is lognormal (many faint, a few strong) and tied to hue: darker spots are
 * browner, but never below the warm floor.
 */
export function placeFrecklesSpaced(exposure, allowed, box, iod, p, seed) {
    const r = rng(seed), g = gaussRng(r), out = [];
    // exposure mass over allowed pixels (sampled every 2 px)
    let mass = 0, peak = 0, area = 0;
    for (let y = box.y0; y < box.y1; y += 2)
        for (let x = box.x0; x < box.x1; x += 2) {
            if (!allowed(x + 0.5, y + 0.5))
                continue;
            const e = exposure(x + 0.5, y + 0.5);
            if (e > 0.02)
                area += 4;
            mass += 4 * e;
            peak = Math.max(peak, e);
        }
    if (!(mass > 0) || p.count <= 0)
        return { freckles: out, area };
    const lambda = (e) => Math.max(1e-9, e / mass * p.count); // freckles per px^2
    const minAt = (e) => p.spacing / Math.sqrt(lambda(e));
    const cell = Math.max(2, minAt(peak)), gw = Math.ceil((box.x1 - box.x0) / cell) + 1, gh = Math.ceil((box.y1 - box.y0) / cell) + 1;
    const grid = Array.from({ length: gw * gh }, () => []);
    const floor = warmPheoFloor(), capR = p.capRadiusIod * iod;
    for (let t = 0; t < p.count * 80 && out.length < p.count; t++) {
        const x = box.x0 + r() * (box.x1 - box.x0), y = box.y0 + r() * (box.y1 - box.y0);
        if (!allowed(x, y))
            continue;
        const e = exposure(x, y);
        if (r() * peak > e)
            continue;
        const rad = clamp(0.5 * p.medianDiamIod * iod * Math.exp(p.sigmaLog * g()), 0.45, Math.max(0.45, capR));
        const dmin = minAt(e), gx = Math.floor((x - box.x0) / cell), gy = Math.floor((y - box.y0) / cell);
        const k = Math.ceil(Math.max(dmin, p.hardCore * (rad + capR)) / cell);
        let ok = true;
        for (let yy = Math.max(0, gy - k); yy <= Math.min(gh - 1, gy + k) && ok; yy++)
            for (let xx = Math.max(0, gx - k); xx <= Math.min(gw - 1, gx + k) && ok; xx++)
                for (const q of grid[yy * gw + xx]) {
                    const f = out[q], d2 = (f.x - x) ** 2 + (f.y - y) ** 2;
                    if (d2 < dmin * dmin || d2 < (p.hardCore * (f.r + rad)) ** 2) {
                        ok = false;
                        break;
                    }
                }
        if (!ok)
            continue;
        // hue t: 0 light tan .. 1 dark brown (Beta-like, mean ~0.42); depth lognormal, deeper when browner
        const tHue = clamp(Math.pow((r() + r()) / 2, 1.2));
        const depthT = clamp(Math.exp(-0.85 + 0.55 * g()) * (0.7 + 0.6 * tHue));
        const pheo = Math.max(floor, p.pheo[1] - (p.pheo[1] - p.pheo[0]) * tHue);
        out.push({ x, y, r: rad, dl: p.depthL[0] + (p.depthL[1] - p.depthL[0]) * depthT, pheo,
            aspect: 1 / (1 + 0.8 * r()), angle: Math.PI * r(), shape: Math.floor(r() * 1e9), rim: 0.6 + 0.9 * r() * rad });
        grid[gy * gw + gx].push(out.length - 1);
    }
    return { freckles: out, area };
}
/**
 * Faint merged patches, only inside dense clusters (a spot with >= 3 neighbours within 0.03 IOD):
 * the summed spot depths, blurred wide, at a few L* at most, faded on the person's own highlights
 * (low band brighter than its surround) so the nose ridge never fogs. Returns an L* drop field.
 */
export function clusterHaze(fs, L, support, w, h, iod, peakL = 1.6) {
    const dep = new Float64Array(w * h), rad = 0.03 * iod;
    let any = false;
    for (const f of fs) {
        let c = 0;
        for (const q of fs)
            if (q !== f && (q.x - f.x) ** 2 + (q.y - f.y) ** 2 < rad * rad)
                c++;
        if (c < 3)
            continue;
        const xi = Math.min(w - 1, Math.max(0, Math.round(f.x))), yi = Math.min(h - 1, Math.max(0, Math.round(f.y)));
        dep[yi * w + xi] += f.dl;
        any = true;
    }
    const out = new Float64Array(w * h);
    if (!any)
        return out;
    const blur = gaussian(dep, w, h, 0.03 * iod), vals = [];
    for (let i = 0; i < blur.length; i++)
        if (support[i] > 0.5 && blur[i] > 0)
            vals.push(blur[i]);
    vals.sort((a, b) => a - b);
    const top = vals.length ? vals[Math.min(vals.length - 1, Math.floor(0.995 * vals.length))] : 0;
    if (!(top > 0))
        return out;
    const near = gaussian(L, w, h, Math.max(1, 0.02 * iod)), far = gaussian(L, w, h, Math.max(1, 0.08 * iod));
    for (let i = 0; i < out.length; i++) {
        if (!(blur[i] > 0))
            continue;
        const hl = clamp((near[i] - far[i]) / 4);
        out[i] = peakL * Math.pow(clamp(blur[i] / top), 1.8) * clamp(support[i]) * (1 - hl);
    }
    return out;
}
