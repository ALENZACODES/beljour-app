/** Beard removal (Studio "Shave"), local, from the face points. Replaces the Studio's use of
 * remove.ts and full.ts, which edited about half of beardless faces and refused or flattened real
 * beards on synthetic test faces (web/scripts/beard: 19 of 43 beardless faces edited, 4 of 14
 * beards missed). In order:
 *
 * 1. Is there a beard? Region tests against her own cheek (between the eye line and the nose
 *    tip, away from the nose): the upper lip carries more fine detail and is darker (moustache), or
 *    the chin carries more fine detail and is less yellow (hair is less yellow than skin; shading
 *    keeps skin's hue), or the whole beard area and the chin are clearly less yellow (dense or
 *    dark beard). Chosen on 107 hand-labelled synthetic faces; on 54 more it found 7 of 7 beards
 *    and edited 1 of 47 beardless faces (a deep shadow under the nose).
 * 2. What would her skin be here? A smooth membrane (Laplace fill on a coarse grid) of L*, a*, b*
 *    from the skin around the beard and the bare skin between hairs, solved twice: once from the
 *    ring around the beard area, then again adding the skin it finds inside. The face (inside the
 *    face outline) and the neck below it are solved apart, so the neck keeps its own tone and the
 *    jaw keeps an edge; a soft shadow is laid under the jaw.
 * 3. Which pixels are hair? Darker than that expected skin, or less yellow (dark hair), or much
 *    less coloured at about the same lightness (grey hair).
 * 4. Fill: hair pixels move to the expected skin plus her own skin texture (pores and grain
 *    quilted from her clean cheeks and neck, quilt.ts: every pixel copied from one donor pixel).
 *    A dense beard is replaced over its whole area; stubble only where hair is, so the skin between
 *    hairs keeps its own detail. Edges fade over a few pixels.
 *
 * Shares and radii are ASSUMED, tuned on synthetic faces. A visual estimate, not a grooming or
 * medical prediction. Hair that grows past the face outline at the sides stays. Author: John Khan.
 */
import { dilate, distanceInside, erode, feather, polygon } from "../core/mask.js";
import { CONTOURS } from "../../data/regions/index.js";
import { beardArea } from "../local/beard.js";
import { labToSrgb, srgbToLab } from "../shade/colourspace.js";
import { frame, skinMask, xy } from "../skin/common.js";
import { meshProblems, REASONS } from "../skin/studio.js";
import { quiltOwnSkin } from "./quilt.js";
export const MODULE = "shave.clean";
export const LABEL = "Clean-shave visual estimate: the skin under the beard is estimated from your skin around it, "
    + "with your own skin texture. Not a grooming or medical prediction.";
export const MESSAGES = Object.freeze({
    zone_not_visible: "The beard area or the cheek beside it is not visible enough in this photo.",
    no_beard_found: "No beard or stubble was found, so nothing was changed.",
    no_clean_skin: "Not enough clear skin is visible around the beard to rebuild it from.",
});
/** Detection cut points (step 1). */
export const DETECT = Object.freeze({ lipDetail: 1.8, lipDarker: 5, chinDetail: 1.8, chinLessYellow: 1.5, lipNotLighter: -5,
    areaLessYellow: 3.5, chinLessYellowDense: 3.5 });
/** Hair map (step 3): L* and b* drops that start and complete "hair", and grey-hair chroma drop. */
export const HAIR = Object.freeze({ start: 5, full: 15, yellowWeight: 1.2, greyStart: 5, greyFull: 12 });
export const WINDOW_MARGIN = 0.3, GRID_SHARE = 0.03, RING = 0.07, ITERATIONS = 80, DENSE = 0.55;
export const NOSE_OUTLINE = [49, 129, 64, 98, 97, 2, 326, 327, 294, 358, 279, 1];
/** Around the mouth that counts as moustache area, how much of the lip edge is kept, how far past
 * the beard area hair is looked for, and the closing radius that joins hairs into one area. */
export const MOUTH_RING = 0.28, LIP_KEEP = 0.008, ZONE_GROW = 0.2, CLOSE = 0.025;
/** The face turns away toward its outline: L* drop at the outline and how far in it reaches. */
/** Share of plain darkness that still counts as hair under the jaw. */
export const NECK_DARK_SHARE = 0.6;
/** Share of the neck width (jaw corners 58 and 288) kept clear at each side below the jaw. */
export const NECK_INSET = 0.08;
export const FORM_L = 7, FORM_REACH = 0.14, ALPHA_SOFT = 0.012;
export const JAW_SHADOW_L = 5, JAW_SHADOW_REACH = 0.1, EDGE_FEATHER = 0.09, TEXTURE_GAIN = 0.85;
const smooth = (v, a, b) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
const median = (v) => { if (!v.length)
    return NaN; const s = Float64Array.from(v).sort(); return s[s.length >> 1]; };
/** Coarse-grid Laplace fill. `region` separates areas that must not be averaged across (0 = skip). */
function membrane(values, known, region, gw, gh) {
    const out = Float64Array.from(values);
    // start every unknown cell at its region's mean of known cells
    const sum = new Map();
    for (let i = 0; i < gw * gh; i++)
        if (known[i] && region[i]) {
            const s = sum.get(region[i]) ?? [0, 0];
            s[0] += values[i];
            s[1]++;
            sum.set(region[i], s);
        }
    for (let i = 0; i < gw * gh; i++)
        if (!known[i] && region[i]) {
            const s = sum.get(region[i]);
            out[i] = s ? s[0] / s[1] : 0;
        }
    for (let it = 0; it < ITERATIONS * 3; it++) {
        for (let y = 0; y < gh; y++)
            for (let x = 0; x < gw; x++) {
                const i = y * gw + x, r = region[i];
                if (!r || known[i])
                    continue;
                let s = 0, c = 0;
                if (x > 0 && region[i - 1] === r) {
                    s += out[i - 1];
                    c++;
                }
                if (x < gw - 1 && region[i + 1] === r) {
                    s += out[i + 1];
                    c++;
                }
                if (y > 0 && region[i - gw] === r) {
                    s += out[i - gw];
                    c++;
                }
                if (y < gh - 1 && region[i + gw] === r) {
                    s += out[i + gw];
                    c++;
                }
                if (c)
                    out[i] = s / c;
            }
    }
    return out;
}
/** Step 1 on full-photo Lab planes. */
export function beardEvidence(L, A, B, w, h, pts, zone, skin) {
    const n = w * h, blur = new Float64Array(n);
    for (let y = 2; y < h - 2; y++)
        for (let x = 2; x < w - 2; x++) {
            let s = 0;
            for (let dy = -2; dy <= 2; dy++)
                for (let dx = -2; dx <= 2; dx++)
                    s += L[(y + dy) * w + x + dx];
            blur[y * w + x] = s / 25;
        }
    const eyeY = (pts[468][1] + pts[473][1]) / 2, noseY = pts[1][1], noseX = pts[1][0], x0 = pts[234][0], x1 = pts[454][0], fw = x1 - x0;
    const lipTop = pts[0][1], lipBot = pts[17][1], noseBase = pts[2][1];
    const ref = [], all = [], lip = [], chin = [];
    for (let y = 2; y < h - 2; y++)
        for (let x = 2; x < w - 2; x++) {
            const i = y * w + x;
            if (zone[i] && skin[i] >= 0.5) {
                all.push(i);
                if (y > noseBase && y < lipTop && Math.abs(x - noseX) < 0.22 * fw)
                    lip.push(i);
                if (y > lipBot)
                    chin.push(i);
            }
            else if (skin[i] >= 0.5 && y > eyeY + 0.25 * (noseY - eyeY) && y < noseY && x > x0 + 0.1 * fw && x < x1 - 0.1 * fw
                && Math.abs(x - noseX) > 0.12 * fw)
                ref.push(i);
        }
    if (ref.length < 40 || all.length < 40)
        return null;
    const detail = (idx) => Math.sqrt(idx.reduce((s, i) => s + (L[i] - blur[i]) ** 2, 0) / Math.max(1, idx.length));
    const refDetail = Math.max(0.3, detail(ref)), rL = median(ref.map((i) => L[i])), rB = median(ref.map((i) => B[i]));
    const lipDetail = lip.length >= 30 ? detail(lip) / refDetail : 0, lipDarker = lip.length >= 30 ? rL - median(lip.map((i) => L[i])) : 0;
    const chinDetail = chin.length >= 30 ? detail(chin) / refDetail : 0, chinLessYellow = chin.length >= 30 ? rB - median(chin.map((i) => B[i])) : 0;
    const areaLessYellow = rB - median(all.map((i) => B[i]));
    const d = DETECT;
    const beard = (lipDetail > d.lipDetail && lipDarker > d.lipDarker)
        || (chinDetail > d.chinDetail && chinLessYellow > d.chinLessYellow && lipDarker > d.lipNotLighter)
        || (areaLessYellow > d.areaLessYellow && chinLessYellow > d.chinLessYellowDense);
    void A;
    return { beard, lipDetail, lipDarker, chinDetail, chinLessYellow, areaLessYellow };
}
export function cleanShave(image, points, strength = 100, detectOnly = false) {
    const { width: W, height: H, channels: ch } = image;
    if (!Number.isInteger(W) || !Number.isInteger(H) || Math.min(W, H) < 8 || (ch !== 3 && ch !== 4) || image.data.length !== W * H * ch)
        throw new RangeError("beard removal needs an RGB or RGBA photo of at least 8 x 8");
    if (!Number.isFinite(strength) || strength < 0 || strength > 100)
        throw new RangeError("strength must be 0..100");
    const refuse = (code) => ({ refused: true, module: MODULE, code, message: MESSAGES[code] ?? REASONS[code] });
    const problems = meshProblems(points, W, H);
    if (problems.length)
        return refuse(problems[0]);
    const full = points.map(xy);
    const iod = frame(points).iod;
    // window around the lower face
    let area;
    try {
        area = beardArea(full, W, H);
    }
    catch {
        return refuse("zone_not_visible");
    }
    let bx0 = W, by0 = H, bx1 = -1, by1 = -1;
    for (let i = 0; i < W * H; i++)
        if (area.hard.data[i] >= 0.5) {
            const x = i % W, y = (i - x) / W;
            bx0 = Math.min(bx0, x);
            bx1 = Math.max(bx1, x);
            by0 = Math.min(by0, y);
            by1 = Math.max(by1, y);
        }
    if (bx1 < 0)
        return refuse("zone_not_visible");
    const m = Math.round(WINDOW_MARGIN * iod), eyeTop = Math.round(Math.min(full[468][1], full[473][1]));
    const X0 = Math.max(0, bx0 - m), X1 = Math.min(W - 1, bx1 + m), Y0 = Math.max(0, Math.min(by0 - m, eyeTop)), Y1 = Math.min(H - 1, by1 + m);
    const w = X1 - X0 + 1, h = Y1 - Y0 + 1, n = w * h;
    const pts = full.map(([x, y]) => [x - X0, y - Y0]);
    const skin = skinMask(pts.map(([x, y]) => [x, y, 0]), w, h);
    // beard area, plus the upper lip and around the mouth (the moustache), grown a little; never the
    // lips themselves or the nose
    const lipPoly = polygon(w, h, CONTOURS.lips_outer.map((i) => pts[i]), 2);
    const nose = polygon(w, h, NOSE_OUTLINE.map((k) => pts[k]), 2);
    const mouthRing = dilate(lipPoly, MOUTH_RING * iod), lipCore = dilate(lipPoly, LIP_KEEP * iod);
    const baseArea = beardArea(pts, w, h).hard, grownArea = dilate(baseArea, ZONE_GROW * iod);
    const zone = new Uint8Array(n), zoneF = new Float64Array(n);
    // below the face outline only the neck itself, not the backdrop or collar beside it
    const ovalBelow = polygon(w, h, CONTOURS.face_oval.map((i) => pts[i]), 2);
    const nl = Math.min(pts[58][0], pts[288][0]), nr = Math.max(pts[58][0], pts[288][0]), nInset = NECK_INSET * (nr - nl);
    for (let i = 0; i < n; i++) {
        const x = i % w;
        const neckOk = ovalBelow.data[i] >= 0.5 || (x > nl + nInset && x < nr - nInset);
        const inArea = neckOk && (grownArea.data[i] >= 0.5 || mouthRing.data[i] >= 0.5);
        zone[i] = inArea && lipCore.data[i] < 0.5 && nose.data[i] < 0.5 ? 1 : 0;
        zoneF[i] = zone[i];
    }
    const zoneMask = { hard: { width: w, height: h, channels: 1, data: zoneF } };
    const L = new Float64Array(n), A = new Float64Array(n), B = new Float64Array(n);
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            const o = ((y + Y0) * W + x + X0) * ch, l = srgbToLab([image.data[o], image.data[o + 1], image.data[o + 2]]), i = y * w + x;
            L[i] = l[0];
            A[i] = l[1];
            B[i] = l[2];
        }
    // detection uses the plain beard area it was chosen on
    const baseZone = Uint8Array.from(baseArea.data, (v) => (v >= 0.5 ? 1 : 0));
    const ev = beardEvidence(L, A, B, w, h, pts, baseZone, skin);
    // 5x5 mean of L*, for the fine-detail test
    const lp = new Float64Array(n);
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            let s = 0, c = 0;
            for (let dy = -2; dy <= 2; dy++)
                for (let dx = -2; dx <= 2; dx++) {
                    const yy = y + dy, xx = x + dx;
                    if (yy >= 0 && yy < h && xx >= 0 && xx < w) {
                        s += L[yy * w + xx];
                        c++;
                    }
                }
            lp[y * w + x] = s / c;
        }
    if (!ev)
        return refuse("zone_not_visible");
    const evidence = { lip_detail: +ev.lipDetail.toFixed(3), lip_darker: +ev.lipDarker.toFixed(3), chin_detail: +ev.chinDetail.toFixed(3),
        chin_less_yellow: +ev.chinLessYellow.toFixed(3), area_less_yellow: +ev.areaLessYellow.toFixed(3) };
    if (!ev.beard)
        return { ...refuse("no_beard_found"), ...{ metrics: evidence } };
    if (detectOnly)
        return { image: Uint8Array.from(image.data), weight: new Float64Array(W * H), label: LABEL, metrics: { ...evidence, beard: true } };
    // regions: 1 = face (inside the face outline), 2 = neck (below it)
    const oval = polygon(w, h, CONTOURS.face_oval.map((i) => pts[i]), 2);
    const lips = dilate(lipPoly, 0.03 * iod);
    const region = new Uint8Array(n);
    for (let i = 0; i < n; i++)
        region[i] = oval.data[i] >= 0.5 ? 1 : 2;
    // reference skin colour (cheeks) for the "looks like skin" test
    const ref = [];
    const eyeY = (pts[468][1] + pts[473][1]) / 2, noseY = pts[1][1], noseX = pts[1][0], fw = pts[454][0] - pts[234][0];
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            const i = y * w + x;
            if (skin[i] >= 0.5 && !zone[i] && y > eyeY + 0.25 * (noseY - eyeY) && y < noseY && Math.abs(x - noseX) > 0.12 * fw)
                ref.push(i);
        }
    const rL = median(ref.map((i) => L[i])), rA = median(ref.map((i) => A[i])), rB = median(ref.map((i) => B[i]));
    const rHue = Math.atan2(rB, rA), rC = Math.hypot(rA, rB);
    const skinLike = (i) => {
        const c = Math.hypot(A[i], B[i]), hue = Math.atan2(B[i], A[i]);
        return c > 0.45 * rC && Math.abs(hue - rHue) < 0.45 && L[i] > rL - 32 && L[i] < rL + 22;
    };
    // the neck under the jaw is often in shadow: same hue as her skin, much darker
    const neckLike = (i) => {
        const c = Math.hypot(A[i], B[i]), hue = Math.atan2(B[i], A[i]);
        return c > 0.25 * rC && Math.abs(hue - rHue) < 0.6 && L[i] > rL - 48 && L[i] < rL + 10;
    };
    // grid
    const cell = Math.max(2, Math.round(GRID_SHARE * iod)), gw = Math.ceil(w / cell), gh = Math.ceil(h / cell), gn = gw * gh;
    const ring = dilate(zoneMask.hard, RING * iod);
    const solve = (knownPx) => {
        const sums = [new Float64Array(gn), new Float64Array(gn), new Float64Array(gn)], cnt = new Float64Array(gn * 3);
        // cell value per region: count separately by region (a cell on the jaw belongs to its majority)
        const cellRegion = new Uint8Array(gn), votes = new Float64Array(gn * 2);
        for (let i = 0; i < n; i++) {
            const x = i % w, y = (i - x) / w, c = Math.floor(y / cell) * gw + Math.floor(x / cell);
            votes[c * 2 + region[i] - 1]++;
        }
        for (let c = 0; c < gn; c++)
            cellRegion[c] = votes[c * 2] >= votes[c * 2 + 1] ? 1 : 2;
        for (let i = 0; i < n; i++) {
            if (!knownPx[i])
                continue;
            const x = i % w, y = (i - x) / w, c = Math.floor(y / cell) * gw + Math.floor(x / cell);
            if (cellRegion[c] !== region[i])
                continue;
            sums[0][c] += L[i];
            sums[1][c] += A[i];
            sums[2][c] += B[i];
            cnt[c]++;
        }
        const known = new Uint8Array(gn);
        for (let c = 0; c < gn; c++)
            if (cnt[c] >= Math.max(2, cell * cell * 0.3)) {
                known[c] = 1;
                for (let k = 0; k < 3; k++)
                    sums[k][c] /= cnt[c];
            }
        // a region with no known skin borrows the face's solution (darkened a little for the neck)
        const grid = sums.map((v) => membrane(v, known, cellRegion, gw, gh));
        let neckKnown = 0;
        for (let c = 0; c < gn; c++)
            if (known[c] && cellRegion[c] === 2)
                neckKnown++;
        if (neckKnown < 3) {
            const merged = new Uint8Array(gn).fill(1);
            const faceOnly = sums.map((v) => membrane(v, known, merged, gw, gh));
            for (let c = 0; c < gn; c++)
                if (cellRegion[c] === 2) {
                    for (let k = 0; k < 3; k++)
                        grid[k][c] = faceOnly[k][c];
                    grid[0][c] -= JAW_SHADOW_L;
                }
        }
        // bilinear to pixels
        const E = [new Float64Array(n), new Float64Array(n), new Float64Array(n)];
        for (let y = 0; y < h; y++)
            for (let x = 0; x < w; x++) {
                const gx = Math.min(gw - 1, Math.max(0, (x + 0.5) / cell - 0.5)), gy = Math.min(gh - 1, Math.max(0, (y + 0.5) / cell - 0.5));
                const ix = Math.floor(gx), iy = Math.floor(gy), fx = gx - ix, fy = gy - iy, jx = Math.min(gw - 1, ix + 1), jy = Math.min(gh - 1, iy + 1);
                const i = y * w + x, own = region[i];
                for (let k = 0; k < 3; k++) {
                    const g = grid[k];
                    // only blend corners in the same region, so the jaw edge stays sharp
                    let s = 0, wt = 0;
                    for (const [cx, cy, cw] of [[ix, iy, (1 - fx) * (1 - fy)], [jx, iy, fx * (1 - fy)], [ix, jy, (1 - fx) * fy], [jx, jy, fx * fy]]) {
                        const c = cy * gw + cx;
                        if (cellRegion[c] === own || !cw) {
                            s += g[c] * cw;
                            wt += cw;
                        }
                    }
                    E[k][i] = wt > 1e-9 ? s / wt : g[iy * gw + ix];
                }
            }
        return E;
    };
    const known0 = new Uint8Array(n);
    let ringSkin = 0;
    for (let i = 0; i < n; i++) {
        if (lips.data[i] >= 0.5)
            continue;
        const inRing = ring.data[i] >= 0.5 && !zone[i] && (skin[i] >= 0.5 || region[i] === 2);
        if (inRing && (skinLike(i) || (region[i] === 2 && neckLike(i)))) {
            known0[i] = 1;
            ringSkin++;
        }
        else if (zone[i] && skinLike(i) && L[i] > rL - 10 && B[i] > rB - 4)
            known0[i] = 1;
    }
    if (ringSkin < 60)
        return refuse("no_clean_skin");
    let E = solve(known0);
    const hairOf = (Ek) => {
        const hair = new Float64Array(n);
        for (let i = 0; i < n; i++) {
            if (!zone[i])
                continue;
            const dL = Ek[0][i] - L[i], dB = Ek[2][i] - B[i];
            let dark = smooth(dL + HAIR.yellowWeight * Math.max(0, dB), HAIR.start, HAIR.full);
            if (region[i] === 2) {
                // under the jaw a shadow darkens skin but keeps its hue: b* falls with L*. Hair is less
                // yellow than that, or carries fine detail.
                const shadedB = Ek[2][i] * Math.max(0.2, L[i] / Math.max(1, Ek[0][i]));
                const chromatic = smooth(shadedB - B[i], 2, 6), detail = smooth(Math.abs(L[i] - lp[i]), 2.5, 6);
                dark *= Math.max(chromatic, detail, NECK_DARK_SHARE);
            }
            const cE = Math.hypot(Ek[1][i], Ek[2][i]), c = Math.hypot(A[i], B[i]);
            const grey = L[i] > Ek[0][i] - 6 ? smooth(cE - c, HAIR.greyStart, HAIR.greyFull) : 0;
            hair[i] = Math.max(dark, grey);
        }
        return hair;
    };
    let hair = hairOf(E);
    const known1 = Uint8Array.from(known0);
    for (let i = 0; i < n; i++)
        if (zone[i] && hair[i] < 0.08 && lips.data[i] < 0.5 && skinLike(i))
            known1[i] = 1;
    E = solve(known1);
    hair = hairOf(E);
    // coverage and scope
    let zn = 0, hs = 0;
    for (let i = 0; i < n; i++)
        if (zone[i] && baseArea.data[i] >= 0.5) {
            zn++;
            hs += hair[i] > 0.5 ? 1 : 0;
        }
    const coverage = hs / Math.max(1, zn), dense = coverage >= DENSE;
    const scope = coverage < 0.3 ? "stubble" : dense ? "full_beard" : "short_beard";
    // jaw shadow: just below the face outline, fading down the neck
    const dOval = new Float64Array(n);
    {
        const inside = new Uint8Array(n);
        for (let i = 0; i < n; i++)
            inside[i] = oval.data[i] >= 0.5 ? 1 : 0;
        // distance below the outline, approximated column by column
        for (let x = 0; x < w; x++) {
            let last = -1;
            for (let y = 0; y < h; y++) {
                const i = y * w + x;
                if (inside[i])
                    last = y;
                else
                    dOval[i] = last >= 0 ? y - last : 1e9;
            }
        }
    }
    const reach = JAW_SHADOW_REACH * iod;
    // texture from her clean skin
    const target = new Float64Array(n), donor = new Float64Array(n), tone = new Float64Array(n);
    const want = new Float64Array(n);
    // hair joined into areas (dilate then erode), so a dense beard is replaced as a whole and the
    // skin between scattered stubble hairs keeps its own detail
    const hairBin = { width: w, height: h, channels: 1, data: Float64Array.from(hair, (v, i) => (zone[i] && v > 0.4 ? 1 : 0)) };
    const closeR = Math.max(1, (dense ? 2 : 1) * CLOSE * iod);
    const closed = erode(dilate(hairBin, closeR), closeR);
    for (let i = 0; i < n; i++) {
        want[i] = zone[i] ? Math.max(hair[i], closed.data[i]) : 0;
        target[i] = want[i] > 0.02 ? 1 : 0;
        // donors: her cheeks between the eye line and the nose base, and bare neck skin; not the forehead
        const yy = Math.floor(i / w);
        const cheekBand = yy > eyeY + 0.35 * (noseY - eyeY) && skin[i] >= 0.99;
        donor[i] = cheekBand && !zone[i] && ring.data[i] < 0.5 && lips.data[i] < 0.5 && skinLike(i) ? 1 : 0;
        tone[i] = E[0][i];
    }
    // grow the stubble map a little so each hair is covered with its soft edge
    const grown = feather(dilate({ width: w, height: h, channels: 1, data: Float64Array.from(want, (v) => (v > 0.35 ? 1 : 0)) }, 1), 1.5, "outside");
    for (let i = 0; i < n; i++)
        if (zone[i])
            want[i] = Math.max(want[i], grown.data[i]);
    const quilt = quiltOwnSkin([L, A, B], donor, target, tone, w, h, iod, { seed: 7 });
    const edge = feather(zoneMask.hard, Math.max(1.5, EDGE_FEATHER * iod), "inside");
    const soft = feather({ width: w, height: h, channels: 1, data: Float64Array.from(want, (v) => Math.min(1, v)) }, Math.max(1, ALPHA_SOFT * iod), "outside");
    const inside = distanceInside(oval), formReach = FORM_REACH * iod;
    const amount = strength / 100, weight = new Float64Array(W * H);
    const out = Uint8Array.from(image.data);
    let changed = 0;
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            const i = y * w + x, a = Math.min(1, Math.max(want[i], soft.data[i])) * edge.data[i] * amount;
            if (!(a > 0.002))
                continue;
            let tL = E[0][i], tA = E[1][i], tB = E[2][i];
            if (region[i] === 2 && dOval[i] < 4 * reach)
                tL -= JAW_SHADOW_L * Math.exp(-dOval[i] / reach);
            if (region[i] === 1)
                tL -= FORM_L * Math.exp(-inside.data[i] / formReach);
            if (quilt && quilt.filled[i]) {
                tL += TEXTURE_GAIN * quilt.bands[0][i];
                tA += quilt.bands[1][i];
                tB += quilt.bands[2][i];
            }
            // dark hair and visible skin are never made darker; only grey hair (lighter than her skin) may be
            if (L[i] <= E[0][i] || hair[i] < 0.3)
                tL = Math.max(tL, L[i] - 1.5);
            const lab = [L[i] + a * (tL - L[i]), A[i] + a * (tA - A[i]), B[i] + a * (tB - B[i])];
            const rgb = labToSrgb(lab), o = ((y + Y0) * W + x + X0) * ch;
            for (let k = 0; k < 3; k++)
                out[o + k] = Math.max(0, Math.min(255, Math.round(rgb[k])));
            weight[(y + Y0) * W + x + X0] = a;
            changed++;
        }
    return { image: out, weight, label: LABEL, metrics: { ...evidence, scope, coverage: +coverage.toFixed(3), texture: quilt ? "own skin" : "none",
            changed_pixels: changed, strength } };
}
/** Is there a beard, moustache or stubble? The detection step alone (fast). */
export function hasBeard(image, points) {
    const r = cleanShave(image, points, 0, true);
    return !r.refused;
}
//# sourceMappingURL=clean.js.map