import { extendVisibleSkin } from "../skin/full-skin.js";
import { boxOf, clamp, cropImage, cropPlane, darkRidges, gaussian, highBand, labPlanesOf, labToLinInto, linearPlanes, linToLabInto, now, pasteImage, smoothstep, bandStats, writeLinear } from "../core/bands.js";
import { bumpRatio, fitLight, landmarkNormals, normalImage, toP3 } from "../core/light-model.js";
import { applyOD, detectMarks, odForDeltaL, placeFreckles, rasterFreckles } from "../core/pigment.js";
/** Population priors: max crease depth in IOD at fraction 1 (ASSUMED; calibrate from donor statistics). */
export const AGE_PRIORS = { forehead: 0.009, glabella: 0.007, crow: 0.006, tearTrough: 0.01, nasolabial: 0.016, marionette: 0.009, neck: 0.008 };
const SAMPLES = [151, 9, 108, 337, 50, 280, 117, 346, 205, 425, 6, 199];
/** Add a groove (negative H) along a polyline; depth/sigma vary along t; optional raised lip on one side. */
function addGroove(H, w, h, line, depth, sigma, lip) {
    if (line.length < 2)
        return 0;
    const smax = Math.max(...line.map((_, k) => sigma(k / (line.length - 1)))), pad = 4 * smax;
    const xs = line.map((p) => p[0]), ys = line.map((p) => p[1]);
    let touched = 0;
    for (let y = Math.max(0, Math.floor(Math.min(...ys) - pad)); y <= Math.min(h - 1, Math.ceil(Math.max(...ys) + pad)); y++)
        for (let x = Math.max(0, Math.floor(Math.min(...xs) - pad)); x <= Math.min(w - 1, Math.ceil(Math.max(...xs) + pad)); x++) {
            let best = Infinity, bt = 0, sgn = 1;
            for (let k = 0; k < line.length - 1; k++) {
                const ax = line[k][0], ay = line[k][1], dx = line[k + 1][0] - ax, dy = line[k + 1][1] - ay, L2 = dx * dx + dy * dy || 1e-9;
                const t = clamp(((x - ax) * dx + (y - ay) * dy) / L2), ex = x - ax - t * dx, ey = y - ay - t * dy, d2 = ex * ex + ey * ey;
                if (d2 < best) {
                    best = d2;
                    bt = (k + t) / (line.length - 1);
                    sgn = dx * ey - dy * ex >= 0 ? 1 : -1;
                }
            }
            const s = sigma(bt), dep = depth(bt);
            if (dep === 0 || best > 16 * s * s)
                continue;
            const d = Math.sqrt(best) * sgn;
            let v = -dep * Math.exp(-(d * d) / (2 * s * s));
            if (lip && d * lip.side > 0)
                v += dep * lip.ratio * Math.exp(-((Math.abs(d) - 1.8 * s) ** 2) / (2 * s * s));
            H[y * w + x] += v;
            touched++;
        }
    return touched;
}
/** Smooth 1-D noise in [-1,1] along a line (sum of 3 sines with random phases). */
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
/** Synthetic age-typical creases on this mesh (only where the person shows none in that zone). */
export function renderAgeSurface(image, skin, points, o) {
    const t0 = now(), { width: W, height: H, channels: CH } = image;
    if (skin.data.length !== W * H || points.length < 468)
        throw new RangeError("age needs a matching skin mask and face mesh");
    // Work only inside the visible-skin box (+ margin): the phone budget depends on it.
    const extent = extendVisibleSkin(image, skin.data, o.excluded);
    const box = boxOf(extent.alpha, W, H, 0.15 * o.iod);
    const edit = new Float64Array(W * H);
    if (!box)
        return { image: { ...image, data: Uint8Array.from(image.data) }, edit, wrinklePixels: 0, wrinkleContrast: 0, spots: 0, poreRatio: 1,
            expandedSkin: 0, coverageVerified: false, renderMs: now() - t0, creaseEnergyRatio: 1, ownLineShare: 0, foreheadSpacingCV: 0, marksBefore: 0, marksAfter: 0, lightR2: 0 };
    const sub = cropImage(image, box), sup = cropPlane(extent.alpha, W, box, (k) => new Float64Array(k));
    const shift = (q) => { const t = toP3(q); return [t[0] - box.x0, t[1] - box.y0, t[2]]; };
    const r = renderAgeCore(sub, sup, points.map((q) => { const t = shift(q); return [t[0], t[1]]; }), { ...o, mesh3: (o.mesh3 ?? points).map(shift),
        keepMarks: o.keepMarks?.map((m) => ({ x: m.x - box.x0, y: m.y - box.y0, radius: m.radius })) });
    const data = Uint8Array.from(image.data);
    pasteImage(data, W, CH, r.data, box);
    const cw = box.x1 - box.x0 + 1;
    for (let y = box.y0; y <= box.y1; y++)
        for (let x = box.x0; x <= box.x1; x++)
            edit[y * W + x] = r.edit[(y - box.y0) * cw + x - box.x0];
    return { ...r.metrics, image: { ...image, data }, edit, expandedSkin: extent.expandedPixels, coverageVerified: extent.coverageComplete, renderMs: now() - t0 };
}
function renderAgeCore(image, support, points, o) {
    const { width: w, height: h, channels: ch } = image, n = w * h;
    const frac = clamp(o.fraction), iod = o.iod;
    const p = (o.mesh3 && o.mesh3.length >= 468 ? o.mesh3 : points).map(toP3).map((q, k) => [points[k][0], points[k][1], q[2]]);
    const lin = linearPlanes(image);
    const [L, A, B] = labPlanesOf(lin);
    const tmp = new Float64Array(3);
    const supIdx = [];
    for (let i = 0; i < n; i++)
        if (support[i] >= 0.9)
            supIdx.push(i);
    const marks = detectMarks(L, A, B, support, w, h, iod);
    const markMask = new Float64Array(n);
    for (const m of marks)
        for (let y = Math.max(0, m.y - m.radius - 2); y <= Math.min(h - 1, m.y + m.radius + 2); y++)
            for (let x = Math.max(0, m.x - m.radius - 2); x <= Math.min(w - 1, m.x + m.radius + 2); x++)
                markMask[y * w + x] = 1;
    // own creases (anisotropic ridges at two scales); pores are isotropic and excluded
    const scales = [1.2, 2.2, 3.5].map((s) => Math.max(0.8, s * iod / 100));
    const crease = new Float64Array(n);
    for (const s of scales) {
        const rd = darkRidges(L, w, h, s);
        for (let i = 0; i < n; i++)
            if (rd.anisotropy[i] >= 0.6 && support[i] > 0.3)
                crease[i] = Math.max(crease[i], rd.strength[i] * smoothstep(0.6, 0.85, rd.anisotropy[i]));
    }
    const box = { x0: Math.min(...p.slice(0, 468).map((q) => q[0])) - 0.3 * iod, y0: Math.min(...p.slice(0, 468).map((q) => q[1])) - 0.3 * iod,
        x1: Math.max(...p.slice(0, 468).map((q) => q[0])) + 0.3 * iod, y1: Math.max(...p.slice(0, 468).map((q) => q[1])) + 1.1 * iod };
    const N = normalImage(w, h, p, landmarkNormals(p), iod, box);
    const lowY = gaussian(Float64Array.from(L, (v) => ((v + 16) / 116) ** 3), w, h, Math.max(1, 0.03 * iod));
    const samp = [];
    const rad = Math.max(2, Math.round(0.1 * iod));
    for (const k of SAMPLES)
        for (let dy = -rad; dy <= rad; dy += 2)
            for (let dx = -rad; dx <= rad; dx += 2) {
                const x = Math.round(p[k][0] + dx), y = Math.round(p[k][1] + dy);
                if (x >= 0 && y >= 0 && x < w && y < h && support[y * w + x] > 0.9)
                    samp.push(y * w + x);
            }
    const light = fitLight(lowY, N, samp);
    const mid = (a, b) => [(p[a][0] + p[b][0]) / 2, (p[a][1] + p[b][1]) / 2];
    const fh = mid(107, 336);
    const edit = new Float64Array(n);
    let wrinklePixels = 0, wrinkleContrast = 0, spotsN = 0, spacingCV = 0;
    const creaseBand = (Lp) => { const g1 = gaussian(Lp, w, h, 0.8), g2 = gaussian(Lp, w, h, 4); let s = 0; for (let i = 0; i < n; i++)
        if (crease[i] > 1.5)
            s += Math.abs(g1[i] - g2[i]); return s; };
    const creaseBefore = creaseBand(L);
    if (o.older) {
        // Nothing that draws a line goes in (John, 7:03 PM: drawn creases "look way too fake"). No own-crease
        // deepening, no placed creases, no fold, band or ring grooves. The fine and crepe bands are the person's own,
        // raised in smoothCrepe (younger-structure.ts); here only the low-frequency colour and broad volume loss.
        // colour: sallow (less saturated, slightly yellower, capped), own mottling amplified (3-12 px band)
        const mA = gaussian(A, w, h, 3), MA = gaussian(A, w, h, 12), mB = gaussian(B, w, h, 3), MB = gaussian(B, w, h, 12), mL = gaussian(L, w, h, 3), ML = gaussian(L, w, h, 12);
        const col = clamp(o.colour) * frac;
        for (let i = 0; i < n; i++) {
            const s = support[i];
            if (s < 0.002)
                continue;
            let r = lin[0][i], gg = lin[1][i], b = lin[2][i];
            if (col > 0) {
                linToLabInto(r, gg, b, tmp);
                const keep = 1 - markMask[i];
                // sallowTone (workstream 01): desaturate plus a small red->yellow shift instead of a global warm cast; the
                // broad colour move is capped at Delta-E 3, her own mottling (3-12 px band) rides on top.
                let da = -0.16 * MA[i] * col, db = -0.1 * MB[i] * col + 1.0 * col;
                const de = Math.hypot(da, db);
                if (de > 3) {
                    da *= 3 / de;
                    db *= 3 / de;
                }
                labToLinInto(tmp[0] + 0.35 * col * (mL[i] - ML[i]) * s * keep, tmp[1] + (da + 0.5 * col * (mA[i] - MA[i]) * keep) * s, tmp[2] + (db + 0.5 * col * (mB[i] - MB[i]) * keep) * s, tmp);
                r = tmp[0];
                gg = tmp[1];
                b = tmp[2];
            }
            lin[0][i] = r;
            lin[1][i] = gg;
            lin[2][i] = b;
            edit[i] = s;
        }
        // Volume loss as broad soft shading only (no grooves): temple and submalar hollows, each a wide Gaussian
        // well over a tenth of the eye distance across, a few L* deep at the most. The person's own high band rides on top.
        if (o.lines > 0) {
            // Self-conditioned volume loss: broad lobes over the temple, infraorbital, submalar and jowl fat pads, each
            // deepened more where HER photo already has a broad shadow there (her low band below her broad level) and less
            // where her lighting is flat, so the change follows her own light instead of imposing one.
            const amp = 5.5 * Math.pow(frac, 0.7) * clamp(o.lines);
            const P = (ids) => [ids.reduce((a, k) => a + p[k][0], 0) / ids.length, ids.reduce((a, k) => a + p[k][1], 0) / ids.length];
            const blobs = [];
            for (const [ids, rx, ry, k] of [
                [[54, 21, 162], 0.24, 0.3, 0.7], [[284, 251, 389], 0.24, 0.3, 0.7],
                [[111, 117, 118], 0.22, 0.13, 0.55], [[340, 346, 347], 0.22, 0.13, 0.55],
                [[187, 207, 147], 0.26, 0.24, 1], [[411, 427, 376], 0.26, 0.24, 1],
                [[172, 136, 150], 0.18, 0.2, 0.6], [[397, 365, 379], 0.18, 0.2, 0.6]
            ]) {
                const c = P(ids);
                blobs.push([c[0], c[1], rx * iod, ry * iod, k]);
            }
            const ownLow = gaussian(L, w, h, Math.max(2, 0.09 * iod)), ownBroad = gaussian(L, w, h, Math.max(4, 0.28 * iod));
            for (let i = 0; i < n; i++) {
                const s = support[i];
                if (s < 0.002)
                    continue;
                const x = i % w, y = (i - x) / w;
                let d = 0;
                for (const [cx, cy, rx, ry, k] of blobs) {
                    const q = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
                    if (q < 9)
                        d += k * Math.exp(-0.5 * q);
                }
                if (d < 0.01)
                    continue;
                const ownShadow = clamp((ownBroad[i] - ownLow[i]) / 4);
                linToLabInto(lin[0][i], lin[1][i], lin[2][i], tmp);
                labToLinInto(tmp[0] - amp * Math.min(1, d) * (0.35 + 0.65 * ownShadow) * s, tmp[1], tmp[2], tmp);
                lin[0][i] = tmp[0];
                lin[1][i] = tmp[1];
                lin[2][i] = tmp[2];
                edit[i] = Math.max(edit[i], s);
            }
        }
        // lentigines: fewer, larger, browner, irregular; never over existing marks
        if (o.spots > 0) {
            const zones = [[p[127][0], p[127][1], 0.25 * iod], [p[356][0], p[356][1], 0.25 * iod], [p[117][0], p[117][1], 0.22 * iod], [p[346][0], p[346][1], 0.22 * iod], [fh[0], fh[1] - 0.35 * iod, 0.4 * iod]];
            const exposure = (x, y) => Math.max(...zones.map(([cx, cy, rr]) => Math.max(0, 1 - ((x - cx) ** 2 + (y - cy) ** 2) / (rr * rr))));
            const allowed = (x, y) => { const i = Math.floor(y) * w + Math.floor(x); return support[i] > 0.95 && markMask[i] === 0; };
            const sp = placeFreckles(exposure, allowed, { x0: Math.max(0, box.x0), y0: Math.max(0, box.y0), x1: Math.min(w, box.x1), y1: Math.min(h, box.y1) }, iod, { count: Math.round(16 * frac * clamp(o.spots)), medianDiamIod: 0.035, sigmaLog: 0.4, capDiamIod: 0.07, hardCore: 1.4, clusterSpreadIod: 0.15, depthL: [3.5, 8], pheo: [0.15, 0.4] }, o.seed + 17);
            const ras = rasterFreckles(sp, w, h, 1);
            const od = new Float64Array(n);
            for (let i = 0; i < n; i++)
                if (ras.dL[i] > 0.05) {
                    od[i] = odForDeltaL(lin[0][i], lin[1][i], lin[2][i], ras.dL[i], ras.pheo[i]) * support[i];
                    edit[i] = Math.max(edit[i], support[i]);
                }
            applyOD(lin, od, ras.pheo);
            spotsN = sp.length;
        }
    }
    else {
        // YOUNGER: lift only the crease band (0.8-4 px) on elongated ridges; relight folds shallower.
        const lineAmt = Math.min(1, 1.8 * clamp(o.lines) * frac);
        const H = new Float64Array(n);
        const nScale = AGE_PRIORS.nasolabial * iod * frac * 1.1, tScale = AGE_PRIORS.tearTrough * iod * frac * 1.1;
        const P2 = (k) => [p[k][0], p[k][1]];
        for (const [ala, corner] of [[129, 61], [358, 291]])
            addGroove(H, w, h, [P2(ala), lerp(P2(ala), P2(corner), 0.5), P2(corner)], (t) => -nScale * Math.sin(Math.PI * clamp(0.1 + 0.85 * t)), () => 0.03 * iod);
        for (const [inner, m, outer] of [[133, 230, 31], [362, 450, 261]])
            addGroove(H, w, h, [P2(inner), P2(m), P2(outer)], (t) => -tScale * Math.sin(Math.PI * t), () => 0.022 * iod);
        // under-eye bags: the bulge just above the trough is flattened (its lit top and shadowed foot both relit)
        for (const [inner, m, outer] of [[133, 230, 31], [362, 450, 261]]) {
            const up = (q) => [q[0], q[1] - 0.035 * iod];
            addGroove(H, w, h, [up(P2(inner)), up(P2(m)), up(P2(outer))], (t) => 0.5 * tScale * Math.sin(Math.PI * t), () => 0.03 * iod);
        }
        // marionette folds filled (mouth corner down toward the jaw), by relighting, not blur
        const mScale = AGE_PRIORS.marionette * iod * frac * 1.1;
        for (const [corner, side] of [[61, -1], [291, 1]]) {
            const c0 = [P2(corner)[0] + side * 0.01 * iod, P2(corner)[1] + 0.02 * iod], c1 = [P2(corner)[0] + side * 0.05 * iod, P2(corner)[1] + 0.3 * iod];
            addGroove(H, w, h, [c0, lerp(c0, c1, 0.5), c1], (t) => -mScale * (1 - t) ** 0.7, () => 0.024 * iod);
        }
        // slack under the chin and neck rings: the submental fold and horizontal neck creases relit shallower
        const chinPt = P2(152), sub = [];
        for (let q = 0; q <= 8; q++) {
            const u = (q / 8 - 0.5) * 1.1 * iod;
            sub.push([chinPt[0] + u, chinPt[1] + 0.16 * iod - 0.08 * iod * Math.cos(Math.PI * (q / 8 - 0.5))]);
        }
        addGroove(H, w, h, sub, (t) => -AGE_PRIORS.neck * iod * frac * 1.4 * Math.sin(Math.PI * t), () => 0.06 * iod);
        const ratio = bumpRatio(gaussian(H, w, h, 0.6), N, light, w, h, { slopeGain: 1, cavity: 0, min: 0.8, max: 1.25 });
        // Crease scale follows the face size: pores are ~1% of the eye distance, so the lifted band starts above
        // that (Younger keeps >= 98% of the 1 px band; measured per render).
        const g08 = gaussian(L, w, h, Math.max(0.8, 0.012 * iod)), g4 = gaussian(L, w, h, Math.max(5, 0.055 * iod));
        const mA = gaussian(A, w, h, 2), MA = gaussian(A, w, h, 10), mB = gaussian(B, w, h, 2), MB = gaussian(B, w, h, 10), mL = gaussian(L, w, h, 2), ML = gaussian(L, w, h, 10);
        const even = 0.65 * clamp(o.colour) * frac;
        const aVals = supIdx.filter((_, k) => k % 7 === 0).map((i) => A[i]).sort((x, y) => x - y), medA = aVals.length ? aVals[aVals.length >> 1] : 0;
        // nostril rims and the alar groove are anatomy, not lines: never lifted (lifting them paints pale nostrils)
        const nose = new Float64Array(n), nr = 0.075 * iod;
        // eyelid margins and lashes: anatomy too (lifting around lashes leaves dark flecks)
        for (const k of [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246, 263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466]) {
            const cx = p[k][0], cy = p[k][1], er = 0.045 * iod;
            for (let y = Math.max(0, Math.floor(cy - 2 * er)); y <= Math.min(h - 1, Math.ceil(cy + 2 * er)); y++)
                for (let x = Math.max(0, Math.floor(cx - 2 * er)); x <= Math.min(w - 1, Math.ceil(cx + 2 * er)); x++)
                    nose[y * w + x] = Math.max(nose[y * w + x], 1 - smoothstep(er, 2 * er, Math.hypot(x - cx, y - cy)));
        }
        for (const k of [98, 327, 64, 294, 2, 94, 240, 460, 75, 305, 79, 309]) {
            const cx = p[k][0], cy = p[k][1];
            for (let y = Math.max(0, Math.floor(cy - 2 * nr)); y <= Math.min(h - 1, Math.ceil(cy + 2 * nr)); y++)
                for (let x = Math.max(0, Math.floor(cx - 2 * nr)); x <= Math.min(w - 1, Math.ceil(cx + 2 * nr)); x++)
                    nose[y * w + x] = Math.max(nose[y * w + x], 1 - smoothstep(nr, 2 * nr, Math.hypot(x - cx, y - cy)));
        }
        // Only real marks (moles, pigment >= 3.5 L* deep) are held; faint isotropic specks under a line may lift with it.
        // Marks are held twice: tightly against the line lift (radius + 2.5 px, so lines over specks still lift) and more
        // widely against the colour evening (radius + 3 px, whose 2-10 px band would otherwise fade a freckle's halo).
        // A detected mark sitting in a strong crease is mostly crease shading: held at half, or it stays a dark dot in
        // the lifted crease. Marks the photo check counts (keepMarks) are held at 0.6: it calls a mark kept at half its contrast, and some
        // of them are crease shading that would read as a new dark dot if held fully inside lifted skin.
        const roundMask = (pad) => {
            const hard = new Float64Array(n);
            const all = [...marks.map((m) => ({ ...m, hold: 1 - 0.5 * smoothstep(0.8, 1.6, crease[Math.round(m.y) * w + Math.round(m.x)] ?? 0) })), ...(o.keepMarks ?? []).map((k) => ({ x: Math.round(k.x), y: Math.round(k.y), radius: k.radius, hold: 0.6 }))];
            for (const m of all) {
                const rr = m.radius + pad;
                for (let y = Math.max(0, Math.floor(m.y - rr)); y <= Math.min(h - 1, Math.ceil(m.y + rr)); y++)
                    for (let x = Math.max(0, Math.floor(m.x - rr)); x <= Math.min(w - 1, Math.ceil(m.x + rr)); x++)
                        if ((x - m.x) ** 2 + (y - m.y) ** 2 <= rr * rr)
                            hard[y * w + x] = Math.max(hard[y * w + x], m.hold);
            }
            return gaussian(hard, w, h, 1.0).map((v, i) => Math.max(v, hard[i])); // round, feathered: no square patches
        };
        const realMark = roundMask(2.5), colourMark = roundMask(3);
        // wide lines (neck rings, neck bands, fold edges): a second, wider crease band, lifted at 0.7 of the line amount
        const wideS = Math.max(2.5, 0.045 * iod), rdW = darkRidges(L, w, h, wideS);
        const g10 = gaussian(L, w, h, Math.max(10, 0.11 * iod));
        // Marks are not frozen (a frozen mark in lifted skin reads as a grey patch): inside each mark the change is
        // filled in from the skin around it, so the mark moves with its neighbourhood and keeps its own contrast.
        // Crease ends turn isotropic (the anisotropy gate drops them) and stay as dark dots once the rest of the crease
        // is lifted: both crease masks are spread by about one crease width so the ends lift with the line.
        const wideRaw = new Float64Array(n);
        for (let i = 0; i < n; i++)
            wideRaw[i] = rdW.anisotropy[i] >= 0.55 ? smoothstep(0.4, 1.6, rdW.strength[i]) * smoothstep(0.55, 0.8, rdW.anisotropy[i]) : 0;
        const wideSpread = gaussian(wideRaw, w, h, wideS), creaseSpread = gaussian(crease, w, h, Math.max(2, 0.03 * iod));
        // beard, stubble and brow hair are not lines or folds: lifts and fills act on skin-tone pixels only
        const lsY = supIdx.filter((_, q) => q % 5 === 0).map((i) => L[i]).sort((x, y) => x - y), medLY = lsY.length ? lsY[lsY.length >> 1] : 50;
        // A beard is a large share of dark pixels on the lower face (below the nose); only then is the lower face gated,
        // so the deep folds and neck shadows of a face without a beard are still lifted.
        const LLy = gaussian(L, w, h, Math.max(2, 0.025 * iod)), noseY = p[2][1];
        let low = 0, dark = 0;
        for (const i of supIdx)
            if (Math.floor(i / w) > noseY) {
                low++;
                if (LLy[i] < medLY - 15)
                    dark++;
            }
        const bearded = low > 0 && dark / low > 0.25;
        // Brows (and lashes) are hair on every face: the upper face is always gated, a little looser so crow's feet and
        // forehead lines still lift.
        // Both gates are local and soft: the brow gate only around the brows, the beard gate faded in across the nose
        // line (a hard row split left a straight step on a side-lit cheek).
        const browPts = [70, 63, 105, 66, 107, 336, 296, 334, 293, 300].map((k) => P2(k)), rBr = 0.1 * iod;
        const skinTone = Float64Array.from(LLy, (v, i) => {
            const x = i % w, y = (i - x) / w;
            let near = 0;
            for (const q of browPts) {
                const d2 = (x - q[0]) ** 2 + (y - q[1]) ** 2;
                if (d2 < 9 * rBr * rBr)
                    near = Math.max(near, Math.exp(-d2 / (2 * rBr * rBr)));
            }
            const browGate = 1 - near * (1 - smoothstep(medLY - 28, medLY - 16, v));
            const lowW = bearded ? smoothstep(noseY - 0.1 * iod, noseY + 0.1 * iod, y) : 0;
            return browGate * (1 - lowW * (1 - smoothstep(medLY - 22, medLY - 10, v)));
        });
        const dLf = new Float64Array(n), dAf = new Float64Array(n), dBf = new Float64Array(n), liftF = new Float64Array(n);
        for (let i = 0; i < n; i++) {
            const s = support[i];
            if (s < 0.002)
                continue;
            const keepN = 1 - nose[i];
            const wideBand = g4[i] - g10[i], wideMask = Math.max(wideRaw[i], Math.min(1, 1.6 * wideSpread[i]));
            const liftW = wideBand < 0 ? -wideBand * wideMask * 0.7 * lineAmt * keepN : 0;
            const band = g08[i] - g4[i]; // crease-scale band (pores < 0.8 px are not in it)
            const lift = band < 0 ? -band * smoothstep(0.35, 1.6, Math.max(crease[i], 1.3 * creaseSpread[i])) * lineAmt * keepN : 0;
            liftF[i] = (lift + liftW) * skinTone[i];
            // low-frequency only: dark spots lifted more than light ones are lowered, redness above the face median eased
            const dLm = mL[i] - ML[i], spotLift = 0.5;
            const red = 0.35 * clamp(o.colour) * frac * Math.max(0, MA[i] - medA);
            dLf[i] = -even * spotLift * dLm * keepN;
            dAf[i] = -(even * (mA[i] - MA[i]) + red) * keepN;
            dBf[i] = -even * (mB[i] - MB[i]) * keepN;
        }
        // Volume back: the person's own low-frequency fold shadows (nasolabial, marionette, tear trough, jowl, submalar,
        // neck rings) are filled by a share of their measured depth below the surrounding skin. Only shadow that is
        // there is lifted (no light stripes on a face without folds); the high band is untouched.
        {
            const Z = new Float64Array(n), Zn = new Float64Array(n), toward = (a, b, d) => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [a[0] + (b[0] - a[0]) / l * d, a[1] + (b[1] - a[1]) / l * d]; };
            const centre = P2(4), one = (t) => Math.sin(Math.PI * clamp(0.05 + 0.9 * t));
            for (const [ala, corner, side, edge] of [[129, 61, 1, 234], [358, 291, -1, 454]]) {
                const a = P2(ala), c = P2(corner), cEnd = [c[0] - side * 0.04 * iod, c[1] + 0.06 * iod];
                addGroove(Zn, w, h, [a, lerp(a, cEnd, 0.5), cEnd], (t) => -one(t), () => 0.06 * iod);
                const m0 = [c[0] - side * 0.015 * iod, c[1] + 0.03 * iod], m1 = [c[0] - side * 0.07 * iod, c[1] + 0.36 * iod];
                addGroove(Z, w, h, [m0, lerp(m0, m1, 0.5), m1], (t) => -one(t), () => 0.055 * iod);
                const jaw = (side > 0 ? [172, 136, 150, 149] : [397, 365, 379, 378]).map((k) => toward(P2(k), centre, 0.05 * iod));
                addGroove(Z, w, h, jaw, (t) => -one(t), () => 0.07 * iod);
                const e = P2(edge), s0 = lerp(e, c, 0.18), s1 = lerp(e, c, 0.62);
                addGroove(Z, w, h, [[s0[0], s0[1] + 0.06 * iod], [s1[0], s1[1] - 0.02 * iod]], (t) => -one(t), () => 0.09 * iod);
            }
            for (const [inner, mm, outer] of [[133, 230, 31], [362, 450, 261]]) {
                const dn = (q) => [q[0], q[1] + 0.03 * iod];
                addGroove(Zn, w, h, [dn(P2(inner)), dn(P2(mm)), dn(P2(outer))], (t) => -one(t), () => 0.055 * iod);
            }
            const chin = P2(152);
            for (const dy of [0.16, 0.5, 0.78]) {
                const ring = [];
                for (let q = 0; q <= 8; q++) {
                    const u = (q / 8 - 0.5) * 1.1 * iod;
                    ring.push([chin[0] + u, chin[1] + dy * iod - 0.08 * iod * Math.cos(Math.PI * (q / 8 - 0.5))]);
                }
                addGroove(Z, w, h, ring, (t) => -one(t), () => 0.06 * iod);
            }
            const LL = gaussian(L, w, h, Math.max(2, 0.025 * iod)), LR = gaussian(L, w, h, Math.max(8, 0.12 * iod)), vZ = valleyDepth(LL, w, h, Math.max(4, 0.1 * iod));
            const k = Math.min(0.85, 2.2 * frac);
            // beard, stubble and brow hair are not fold shadow: only skin-tone pixels are filled
            for (let i = 0; i < n; i++)
                if (Z[i] > 0.01 && support[i] >= 0.002)
                    dLf[i] += Math.min(1, Z[i]) * Math.min(7, k * Math.min(Math.max(0, LR[i] - LL[i]), vZ[i])) * (1 - nose[i]) * skinTone[i];
            // the nasolabial fold keeps filling past the default: up to the full measured depth at 100
            const kn = Math.min(1, 0.55 + 0.7 * frac);
            for (let i = 0; i < n; i++)
                if (Zn[i] > 0.01 && support[i] >= 0.002)
                    dLf[i] += Math.min(1, Zn[i]) * Math.min(11, kn * Math.min(Math.max(0, LR[i] - LL[i]), vZ[i])) * (1 - nose[i]) * skinTone[i];
        }
        const fillIn = (f, m, sigma) => {
            const wgt = Float64Array.from(m, (v) => 1 - v), num = gaussian(Float64Array.from(f, (v, i) => v * wgt[i]), w, h, sigma), den = gaussian(wgt, w, h, sigma);
            return Float64Array.from(f, (v, i) => m[i] > 0 ? v * (1 - m[i]) + (den[i] > 1e-6 ? num[i] / den[i] : 0) * m[i] : v);
        };
        // A lift only brings skin up toward its own surroundings: never above them, never more than 8 L*. The photo's
        // own light (a side-lit cheek, the shadow under the nose) is not a fold and is not flattened.
        // "Its own surroundings" is a valley test: lighter on BOTH sides along some direction. A light-to-shadow edge
        // (one side darker) has no valley depth and is not lifted.
        const capLL = gaussian(L, w, h, Math.max(1.5, 0.015 * iod)), valley = valleyDepth(capLL, w, h, Math.max(3, 0.07 * iod));
        const liftK = fillIn(liftF, realMark, 4), dLk = fillIn(dLf, colourMark, 4), dAk = fillIn(dAf, colourMark, 4), dBk = fillIn(dBf, colourMark, 4);
        for (let i = 0; i < n; i++) {
            const s = support[i];
            if (s < 0.002)
                continue;
            const lift = liftK[i];
            const up = (lift + dLk[i]) * s, cap = Math.min(8, valley[i] + 1);
            labToLinInto(L[i] + (up > cap ? cap : up), A[i] + dAk[i] * s, B[i] + dBk[i] * s, tmp);
            let r = tmp[0], g = tmp[1], b = tmp[2];
            const rt = 1 + (ratio[i] - 1) * s;
            r *= rt;
            g *= rt;
            b *= rt;
            if (lift > 0.3) {
                wrinklePixels++;
                wrinkleContrast += lift;
            }
            lin[0][i] = r;
            lin[1][i] = g;
            lin[2][i] = b;
            edit[i] = s;
        }
    }
    const out = writeLinear(image, lin, edit);
    const [L2] = labPlanesOf(linearPlanes({ width: w, height: h, channels: ch, data: out }));
    // 1-px band measured on skin NOT under a new crease (creases are new structure, not grain)
    const plain = o.older ? supIdx.filter((i) => Math.abs(L2[i] - L[i]) < 1.2) : supIdx;
    const before1 = bandStats(highBand(L, w, h, 0.8), plain), after1 = bandStats(highBand(L2, w, h, 0.8), plain);
    // marks kept: each detected mark must keep >= 70% of its local contrast (no second detector run)
    const hbA = highBand(L, w, h, 2), hbB = highBand(L2, w, h, 2);
    let marksAfter = 0;
    for (const m of marks) {
        const i = m.y * w + m.x;
        if (hbB[i] <= 0.7 * hbA[i])
            marksAfter++;
    }
    let ownShare = 0;
    for (let i = 0; i < n; i++)
        if (crease[i] > 1.5)
            ownShare++;
    return { data: out, edit, metrics: { wrinklePixels, wrinkleContrast: wrinklePixels ? wrinkleContrast / wrinklePixels : 0, spots: spotsN,
            poreRatio: before1.sd > 0 ? after1.sd / before1.sd : 1, creaseEnergyRatio: creaseBefore > 0 ? creaseBand(L2) / creaseBefore : 1,
            ownLineShare: supIdx.length ? ownShare / supIdx.length : 0, foreheadSpacingCV: spacingCV, marksBefore: marks.length, marksAfter, lightR2: light.r2 } };
}
/** Valley depth: max over 4 directions of (the lighter-side minimum of the two neighbours at +-d) - centre, >= 0. */
function valleyDepth(P, w, h, d) {
    const out = new Float64Array(w * h), r = Math.round(d), q = Math.round(d * 0.7071);
    const dirs = [[r, 0], [0, r], [q, q], [q, -q]];
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            const i = y * w + x, c = P[i];
            let best = 0;
            for (const [dx, dy] of dirs) {
                const xa = Math.min(w - 1, Math.max(0, x + dx)), ya = Math.min(h - 1, Math.max(0, y + dy));
                const xb = Math.min(w - 1, Math.max(0, x - dx)), yb = Math.min(h - 1, Math.max(0, y - dy));
                const v = Math.min(P[ya * w + xa], P[yb * w + xb]) - c;
                if (v > best)
                    best = v;
            }
            out[i] = best;
        }
    return out;
}
