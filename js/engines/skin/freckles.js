/**
 * Freckles: melanin added to the person's own skin, spaced like real freckles, never bunched.
 * - Placement: density-adaptive dart throwing on a sun-exposure map (nose bridge and cheek apples
 *   first, forehead light). Each freckle keeps a minimum distance that scales with the local density,
 *   so Clark-Evans R sits at 1.0-1.3 (not clumped, not a grid), plus a hard core of 1.15 x (ri + rj).
 * - The person's existing freckles are found first: they calibrate size, depth and hue, and new
 *   freckles keep their distance from them and from moles (identity marks are never covered).
 * - Pigment is optical density on linear RGB (multiplicative), so pores, shine and grain run through
 *   each freckle at their own contrast (Texture Law). Depth is lognormal (many faint, a few strong)
 *   and tied to hue; the darkest spots stay warm brown (blue/red absorbance >= 2.0, never grey-olive).
 * - Faint merged patches only inside dense clusters, faded on the person's own highlights.
 * - Strength adds freckles and depth; contrast per freckle rises gently, so 100 always reads at least
 *   as strong as 60 without turning into dark stamps.
 * The Python port's flat model is kept in freckles-flat.ts for byte parity.
 * Signature unchanged: freckles(image, skin, face, strength, density, seed). Author: John Khan.
 */
import { checkPhoto, checkStrength, NOTE, unchanged } from "./common.js";
import { boxOf, clamp, cropImage, cropPlane, gaussian, highBand, labPlanesOf, linearPlanes, linToLabInto, lumLin, lstarOf, now, pasteImage, writeLinear } from "../core/bands.js";
import { applyOD, clarkEvans, clusterHaze, detectMarks, odForDeltaL, placeFrecklesSpaced, rasterFreckles, warmPheoFloor } from "../core/pigment.js";
export const MAX_FRECKLES = 1300; // placement saturates first (spacing and keep-out around own marks)
export const LABEL = "Freckle simulation: melanin added to your own skin; your own marks and pores kept. " + NOTE;
/** Sun-exposure zones in face coordinates (a across, b down, IOD units from between the pupils), weights. */
const ZONES = [
    [0, 0.44, 0.3, 1.0], [-0.54, 0.51, 0.36, 0.9], [0.54, 0.51, 0.36, 0.9], [-0.25, 0.18, 0.24, 0.3], [0.25, 0.18, 0.24, 0.3], [0, -0.55, 0.45, 0.18],
];
const NOSTRILS = [[-0.14, 0.62, 0.07], [0.14, 0.62, 0.07]];
const BASE_EXPOSURE = 0.1;
export function zoneWeight(a, b) {
    for (const [ca, cb, r] of NOSTRILS)
        if ((a - ca) ** 2 + (b - cb) ** 2 < r * r)
            return 0;
    let best = 0;
    for (const [ca, cb, r, wt] of ZONES)
        best = Math.max(best, wt * Math.max(0, 1 - ((a - ca) ** 2 + (b - cb) ** 2) / (r * r)) ** 1.5);
    return best > 0 ? BASE_EXPOSURE + (1 - BASE_EXPOSURE) * best : 0;
}
/** Pixel -> face coordinates (a across, b down), inverted from the frame's own point() so any frame works. */
function inverseFrame(face) {
    const p0 = face.point(0, 0), pa = face.point(1, 0), pb = face.point(0, 1);
    const m00 = pa[0] - p0[0], m01 = pb[0] - p0[0], m10 = pa[1] - p0[1], m11 = pb[1] - p0[1], det = m00 * m11 - m01 * m10 || 1e-9;
    return (x, y) => { const dx = x - p0[0], dy = y - p0[1]; return [(m11 * dx - m01 * dy) / det, (-m10 * dx + m00 * dy) / det]; };
}
const SPACING = 0.36, HARD_CORE = 1.15, CAP_RADIUS_IOD = 0.02, MEDIAN_DIAM_IOD = 0.024;
/** Prior depth range (L*) and pheomelanin range (light tan .. dark brown). */
const DEPTH = [4, 14], PHEO = [0.3, 0.75];
export function place(face, skin, width, height, density, seed) {
    if (!Number.isFinite(density) || density < 0 || density > 100)
        throw new RangeError("density must be 0..100");
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)
        throw new RangeError("seed must be an unsigned 32-bit integer");
    const inv = inverseFrame(face);
    const fs = placeFrecklesSpaced((x, y) => { const [a, b] = inv(x, y); return zoneWeight(a, b); }, (x, y) => skin[Math.floor(y) * width + Math.floor(x)] >= 0.95, { x0: 0, y0: 0, x1: width, y1: height }, face.iod, { count: Math.round(MAX_FRECKLES * density / 100), medianDiamIod: MEDIAN_DIAM_IOD, sigmaLog: 0.45, capRadiusIod: CAP_RADIUS_IOD, spacing: SPACING, hardCore: HARD_CORE, depthL: DEPTH, pheo: PHEO }, seed).freckles;
    return fs.map((f) => ({ ...f, radius: f.r, depth: f.dl }));
}
/** Earlier API: L* darkening field of placed freckles at `amount` (0..1). */
export function darkening(spots, width, height, amount) {
    if (!(Number.isFinite(amount) && amount >= 0 && amount <= 1))
        throw new RangeError("amount must be 0..1");
    return rasterFreckles(spots, width, height, amount).dL;
}
export function freckles(image, skin, face, strength = 30, density = 50, seed = 7) {
    const t0 = now();
    checkPhoto(image);
    const amount = checkStrength(strength);
    if (!Number.isFinite(density) || density < 0 || density > 100)
        throw new RangeError("density must be 0..100");
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)
        throw new RangeError("seed must be an unsigned 32-bit integer");
    const fullW = image.width, fullH = image.height;
    if (skin.length !== fullW * fullH)
        throw new RangeError("skin dimensions mismatch");
    if (amount === 0 || density === 0)
        return unchanged(image, LABEL, { freckles: 0 });
    // Work inside the skin box only (phone budget); the result is pasted back.
    const box = boxOf(skin, fullW, fullH, Math.max(4, 0.05 * face.iod), 0.5);
    if (box && (box.x1 - box.x0 + 1) * (box.y1 - box.y0 + 1) < 0.8 * fullW * fullH) {
        const sub = cropImage(image, box), subSkin = cropPlane(skin, fullW, box, (k) => new Float64Array(k));
        const subFace = { iod: face.iod, point: (a, b) => { const q = face.point(a, b); return [q[0] - box.x0, q[1] - box.y0]; } };
        const r = render(sub, subSkin, subFace, amount, density, seed);
        const data = Uint8Array.from(image.data), weight = new Float64Array(fullW * fullH);
        pasteImage(data, fullW, image.channels, r.image, box);
        const cw = box.x1 - box.x0 + 1;
        for (let y = box.y0; y <= box.y1; y++)
            for (let x = box.x0; x <= box.x1; x++)
                weight[y * fullW + x] = r.weight[(y - box.y0) * cw + x - box.x0];
        return { ...r, image: data, weight, metrics: { ...r.metrics, render_ms: Math.round(now() - t0) } };
    }
    const r = render(image, skin, face, amount, density, seed);
    return { ...r, metrics: { ...r.metrics, render_ms: Math.round(now() - t0) } };
}
function render(image, skin, face, amount, density, seed) {
    const { width: w, height: h } = image, n = w * h, iod = face.iod;
    const lin = linearPlanes(image);
    const [L, A, B] = labPlanesOf(lin), tmp = new Float64Array(3);
    // 1) the person's own marks: calibrate, and keep away from them
    const marks = detectMarks(L, A, B, skin, w, h, iod);
    const own = marks.filter((m) => !m.isMole), moles = marks.filter((m) => m.isMole);
    const sorted = (v) => v.slice().sort((x, y) => x - y), pct = (v, q) => v[Math.min(v.length - 1, Math.floor(q * v.length))];
    // Own freckles (>= 12 found, 4+ L* deep) pull the priors half-way: pores and faint grain never set the depth.
    const pigment = own.filter((m) => m.depthL >= 4);
    let medianDiamIod = MEDIAN_DIAM_IOD, depth = [...DEPTH], pheo = [...PHEO];
    if (pigment.length >= 12) {
        const d = sorted(pigment.map((m) => (2 * m.radius) / iod)), dl = sorted(pigment.map((m) => m.depthL));
        medianDiamIod = 0.5 * MEDIAN_DIAM_IOD + 0.5 * clamp(pct(d, 0.5), 0.012, 0.03);
        depth = [0.5 * DEPTH[0] + 0.5 * clamp(pct(dl, 0.25), 2, 6), 0.5 * DEPTH[1] + 0.5 * clamp(pct(dl, 0.9), 8, 14)];
        let skinHue = 0, frHue = 0;
        for (const m of pigment) {
            const i = m.y * w + m.x;
            frHue += m.hue;
            skinHue += Math.atan2(B[i - 3] ?? B[i], A[i - 3] ?? A[i]);
        }
        pheo = (frHue - skinHue) / pigment.length > 0.08 ? [0.45, 0.85] : [0.3, 0.75];
    }
    // 2) place on the exposure map; spacing also against existing marks
    const inv = inverseFrame(face);
    const exposure = (x, y) => { const [a, b] = inv(x, y); return zoneWeight(a, b); };
    const keepOut = marks.filter((m) => m.isMole || m.depthL >= 4);
    const allowed = (x, y) => {
        const i = Math.floor(y) * w + Math.floor(x);
        if (!(skin[i] >= 0.95))
            return false;
        for (const m of keepOut)
            if ((m.x - x) ** 2 + (m.y - y) ** 2 < (m.radius * (m.isMole ? 3 : 1.6) + 0.012 * iod) ** 2)
                return false;
        return true;
    };
    let bx0 = w, by0 = h, bx1 = 0, by1 = 0;
    for (let y = 0; y < h; y += 2)
        for (let x = 0; x < w; x += 2)
            if (skin[y * w + x] >= 0.95 && exposure(x, y) > 0.02) {
                bx0 = Math.min(bx0, x);
                by0 = Math.min(by0, y);
                bx1 = Math.max(bx1, x);
                by1 = Math.max(by1, y);
            }
    if (bx1 <= bx0)
        return unchanged(image, LABEL, { freckles: 0, reason: "no sun-exposed skin visible" });
    const wanted = Math.round(MAX_FRECKLES * (density / 100) * (0.4 + 0.6 * amount));
    const { freckles: placed, area } = placeFrecklesSpaced(exposure, allowed, { x0: bx0, y0: by0, x1: bx1 + 1, y1: by1 + 1 }, iod, {
        count: wanted, medianDiamIod, sigmaLog: 0.45, capRadiusIod: CAP_RADIUS_IOD, spacing: SPACING, hardCore: HARD_CORE, depthL: depth, pheo
    }, seed);
    if (!placed.length)
        return unchanged(image, LABEL, { freckles: 0 });
    // 3) render: per-freckle L* field plus cluster haze -> OD from the LOW-band colour (smooth), multiplicative
    const gain = 0.78 + 0.3 * amount; // plainly visible at the default strength
    const ras = rasterFreckles(placed, w, h, gain);
    const haze = clusterHaze(placed, L, skin, w, h, iod, 1.6 * gain);
    const warmHaze = Math.max(0.8, warmPheoFloor());
    let hazePx = 0;
    for (let i = 0; i < n; i++)
        if (haze[i] > 0.05 && haze[i] > ras.dL[i]) {
            ras.pheo[i] = warmHaze;
            ras.dL[i] = haze[i];
            hazePx++;
        }
    const lowLin = lin.map((p) => gaussian(p, w, h, Math.max(1, 0.02 * iod)));
    const od = new Float64Array(n), weight = new Float64Array(n), floor = warmPheoFloor();
    let edited = 0;
    for (let i = 0; i < n; i++) {
        if (ras.dL[i] < 0.05 || skin[i] <= 0)
            continue;
        const Lskin = lstarOf(lumLin(lowLin[0][i], lowLin[1][i], lowLin[2][i]));
        const adapt = 0.55 + 0.45 * clamp((Lskin - 25) / 45); // deeper skin: same pigment, smaller dL*
        ras.pheo[i] = Math.max(floor, ras.pheo[i]);
        od[i] = odForDeltaL(lowLin[0][i], lowLin[1][i], lowLin[2][i], ras.dL[i] * adapt, ras.pheo[i]) * clamp(skin[i]);
        weight[i] = clamp(skin[i]);
        edited++;
    }
    const before = highBand(L, w, h, 1.0);
    applyOD(lin, od, ras.pheo);
    const out = writeLinear(image, lin, weight);
    // 4) evidence: pores run through (1-px band kept inside freckles), variety, spacing
    const Lafter = Float64Array.from(L);
    for (let i = 0; i < n; i++)
        if (weight[i] > 0) {
            linToLabInto(lin[0][i], lin[1][i], lin[2][i], tmp);
            Lafter[i] = tmp[0];
        }
    const after = highBand(Lafter, w, h, 1.0);
    const interior = [];
    for (let y = 1; y < h - 1; y++)
        for (let x = 1; x < w - 1; x++) {
            const i = y * w + x;
            if (ras.dL[i] > 2 && Math.hypot(ras.dL[i + 1] - ras.dL[i - 1], ras.dL[i + w] - ras.dL[i - w]) < 1)
                interior.push(i);
        }
    const sd = (p) => { let s1 = 0, s2 = 0; for (const i of interior) {
        s1 += p[i];
        s2 += p[i] * p[i];
    } const m = s1 / Math.max(1, interior.length); return Math.sqrt(Math.max(0, s2 / Math.max(1, interior.length) - m * m)); };
    // Pore transfer: the regression slope of the after band on the before band inside freckles. The freckle's own
    // shape is uncorrelated with the pores, so it does not inflate this (a plain sd ratio counted freckle edges as pores).
    let cov = 0, vb = 0, mb = 0, ma = 0;
    for (const i of interior) {
        mb += before[i];
        ma += after[i];
    }
    mb /= Math.max(1, interior.length);
    ma /= Math.max(1, interior.length);
    for (const i of interior) {
        cov += (before[i] - mb) * (after[i] - ma);
        vb += (before[i] - mb) ** 2;
    }
    const poreKeep = interior.length >= 16 && sd(before) > 1e-6 ? cov / vb : 1;
    const spread = (v) => { const m = v.reduce((s, x) => s + x, 0) / v.length; return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / v.length); };
    let minGap = Infinity;
    for (let a = 0; a < placed.length; a++)
        for (let b = a + 1; b < placed.length; b++) {
            const d = Math.hypot(placed[a].x - placed[b].x, placed[a].y - placed[b].y) / (placed[a].r + placed[b].r);
            if (d < minGap)
                minGap = d;
        }
    const diam = placed.map((f) => (2 * f.r) / iod).sort((x, y) => x - y);
    return { image: out, weight, label: LABEL, metrics: {
            freckles: placed.length, existing_freckles: own.length, moles_protected: moles.length, seed, density, edited_pixels: edited,
            median_diam_iod: Math.round(diam[diam.length >> 1] * 1e4) / 1e4, max_diam_iod: Math.round(diam[diam.length - 1] * 1e4) / 1e4,
            min_gap_ratio: Math.round(minGap * 1000) / 1000, clark_evans: Math.round(clarkEvans(placed, area) * 1000) / 1000,
            pheo_sd: Math.round(spread(placed.map((f) => f.pheo)) * 1000) / 1000, depth_sd_l: Math.round(spread(placed.map((f) => f.dl)) * 100) / 100,
            haze_px: hazePx, pore_keep_inside: Math.round(poreKeep * 1000) / 1000, interior_px: interior.length,
            calibrated_from_own: pigment.length >= 12, texture_source: "own_photo"
        } };
}
