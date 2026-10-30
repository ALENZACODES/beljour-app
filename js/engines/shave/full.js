/** Full-beard estimate for Beard removal. When a beard hides the skin and the jaw line, remove.ts
 * refuses ("full_beard") because there is no visible skin under the hair to rebuild from. This path
 * paints an estimate instead and says so. In order:
 * 1. Where the beard is: inside the beard, moustache and neck area (grown a little past the jaw, the
 *    nose itself left out), every pixel that does not look like her skin is beard. Specks are
 *    cleaned, gaps closed, and the result grown, so the mouth corners and the chin are inside it.
 * 2. Low frequencies: smooth membrane fills (the Laplace equation, solved on a coarse grid): one for
 *    the face from her cheeks and lip line, on top of the side-to-side light fitted from them, and
 *    one for the neck from the neck. The face fill's mean L*, a*, b* is matched to the cheek band
 *    just above the beard, less a small darkening toward the jaw.
 * 3. The jaw: below the mouth, the face outline from the face points stands in for the jaw and chin
 *    under the hair. Past it is her neck (its width measured under the beard) or the backdrop
 *    (filled from the backdrop around the beard), with a soft shadow under the jaw.
 * 4. Skin texture: isotropic noise in octave bands, each scaled to the same band of her clean
 *    cheek, so the grain matches her photo with no streaks; a little colour mottling too.
 * 5. Finish (separate from coverage): light stubble at 0.3 (a shadow and single darker dots where
 *    the beard grew), a very faint shadow at 0.5, a clean shave at 1. Stray stubble past the beard's
 *    edge, and moustache tips over the lip and nostril rims, are lifted to the skin (or lip) around them.
 * 6. Mixed in with a distance feather outward from the beard, so there is no hard boundary.
 * Never lighter than her cheek (or, past the jaw, the backdrop). Shares and radii are ASSUMED,
 * tuned by eye on the synthetic sample. A rough visual estimate, not a grooming or medical
 * prediction. Runs in a window around the lower face and neck. Browser only; the stubble and
 * short-beard path stays byte-matched to the Python twin.
 * Author: John Khan.
 */
import { dilate, erode, feather, polygon, subtract, union } from "../core/mask.js";
import { CONTOURS } from "../../data/regions/index.js";
import { LANDMARKS } from "../../data/face/generated/anatomy.js";
import { beardArea } from "../local/beard.js";
import { encode, frame, labPlanes, maskedLowpass, median, skinMask, xy } from "../skin/common.js";
import { meshProblems, REASONS } from "../skin/studio.js";
import { KEEP_RADIUS, MESSAGES, MIN_REF_PIXELS, MODULE, REF_BELOW, REF_MARGIN } from "./remove.js";
export const FULL_SCOPE = "full_beard_estimate";
/** The nose's lower outline: wing tops, wings, wing bases, the base of the columella, and the tip. */
export const NOSE_OUTLINE = [49, 129, 64, 98, 97, 2, 326, 327, 294, 358, 279, 1];
/** Beard finding (shares of the inter-pupil distance unless noted). */
export const AREA_GROW = 0.12, CORNER_RADIUS = 0.12, NOSE_MARGIN = 0, HAIR_DROP_L = 16, SHADOW_DROP_L = 34, HUE_TOLERANCE = 0.45, SKIN_CHROMA_SHARE = 0.5, HAIR_CLOSE = 0.03, HAIR_GROW = 0.03, LIP_GAP = 0.012;
/** Fill, texture, shadows (L* units unless noted). */
export const GRID_SHARE = 0.035, SOLVE_ITERATIONS = 60, JAW_SHADOW_L = 8.0, JAW_SHADOW_REACH = 0.16;
/** Jaw silhouette: starts this far below the mouth corners, over this ramp; the jaw edge is this soft. */
export const SILHOUETTE_START = -0.15, SILHOUETTE_RAMP = 0.2, JAW_EDGE = 0.03, NECK_EDGE = 0.04, NECK_ROWS = [0.04, 0.2], NECK_SHARE = 0.8, BACKDROP_GAP = 0.04, BACKDROP_DROP_L = 15, COVER_GROW = 0.025;
/** Texture octaves (px) and stray stubble past the edge. */
export const BAND_SIGMAS = [1, 2, 4], BAND_GAINS = [1.0, 1.0, 0.6], STRAY_RADIUS = 0.04, STRAY_DROP_L = 6, STRAY_BAND = 0.12, LIP_TIP_RADIUS = 0.03, BORDER_PX = 2.5, NOSTRIL_DROP_L = 12;
export const TEXTURE_GAIN = 1.0, STUBBLE_L = 6, STUBBLE_B = 3;
export const EDGE_FEATHER = 0.14, FULL_CAP = 1.0, REF_KEEP_SHARE = 0.75;
/** Working window around the face outline (shares of the inter-pupil distance). */
export const WINDOW_SIDE = 0.6, WINDOW_TOP = 0.3, WINDOW_BELOW = 1.2;
/** Tone match: the cheek band just above the beard, how deep the correction reaches in, and the
 * small darkening kept toward the jaw (L*). */
export const CHEEK_BAND = 0.2, TONE_DEPTH = 0.15, JAW_DARKEN_L = 3, MOTTLE_GAIN = 0.3;
/** Finish: stubble left at finish 0.3 (fading to none at 1): shadow, and a share of her own hairs kept. */
export const STUBBLE_DOTS = 0.16, STUBBLE_DOT_L = 12;
export const FULL_LABEL = "Full-beard estimate: the skin under this beard cannot be seen, so it is estimated from your cheeks and neck around it. "
    + "A rough visual estimate, not a grooming or medical prediction.";
/** A repeatable 0..1 value per position (no random state), so the same photo always gets the same result. */
export function grain(x, y, salt = 0) {
    let v = (Math.imul(x + 1 + salt * 7919, 73856093) ^ Math.imul(y + 1, 19349663)) >>> 0;
    v = Math.imul(v ^ (v >>> 13), 1274126177) >>> 0;
    return ((v ^ (v >>> 16)) >>> 0) / 4294967296;
}
const smooth = (t) => { const u = Math.min(1, Math.max(0, t)); return u * u * (3 - 2 * u); };
const maskOf = (w, h, data) => ({ width: w, height: h, channels: 1, data: Float32Array.from(data) });
/** Fill the unknown cells of a grid from the known ones by the Laplace equation: Gauss-Seidel on a
 * pyramid (each level starts from the coarser level's answer), so wide gaps converge. */
function membrane(values, known, gw, gh, start, iterations) {
    let init;
    if (gw * gh <= 256 || gw < 4 || gh < 4)
        init = new Float64Array(gw * gh).fill(start);
    else {
        const cw = Math.ceil(gw / 2), chh = Math.ceil(gh / 2), cv = new Float64Array(cw * chh), cn = new Float64Array(cw * chh), ck = new Uint8Array(cw * chh);
        for (let y = 0; y < gh; y++)
            for (let x = 0; x < gw; x++)
                if (known[y * gw + x]) {
                    const c = (y >> 1) * cw + (x >> 1);
                    cv[c] += values[y * gw + x];
                    cn[c]++;
                }
        for (let c = 0; c < cw * chh; c++)
            if (cn[c]) {
                cv[c] /= cn[c];
                ck[c] = 1;
            }
        const coarse = membrane(cv, ck, cw, chh, start, iterations);
        init = new Float64Array(gw * gh);
        for (let y = 0; y < gh; y++)
            for (let x = 0; x < gw; x++)
                init[y * gw + x] = coarse[(y >> 1) * cw + (x >> 1)];
    }
    const out = Float64Array.from(values, (v, i) => (known[i] ? v : init[i]));
    const passes = gw * gh <= 256 ? iterations * 4 : iterations;
    for (let it = 0; it < passes; it++) {
        for (let y = 0; y < gh; y++)
            for (let x = 0; x < gw; x++) {
                const i = y * gw + x;
                if (known[i])
                    continue;
                let s = 0, c = 0;
                if (x > 0) {
                    s += out[i - 1];
                    c++;
                }
                if (x < gw - 1) {
                    s += out[i + 1];
                    c++;
                }
                if (y > 0) {
                    s += out[i - gw];
                    c++;
                }
                if (y < gh - 1) {
                    s += out[i + gw];
                    c++;
                }
                out[i] = s / c;
            }
    }
    return out;
}
const refuse = (code) => ({ refused: true, module: MODULE, code, message: MESSAGES[code] ?? REASONS[code] });
/** `strength` sets how much of the beard is covered; `finish` (0..1, default strength / 100) sets
 * how clean the shave is: 0.3 leaves light stubble, 0.5 a very faint shadow, 1 a clean shave. */
export function estimateFullBeard(image, points, strength = 30, keep = [], finish) {
    const { width: W, height: H, channels: ch } = image;
    if (!Number.isInteger(W) || !Number.isInteger(H) || Math.min(W, H) < 8 || (ch !== 3 && ch !== 4) || image.data.length !== W * H * ch) {
        throw new RangeError("beard removal needs an RGB or RGBA photo of at least 8 x 8");
    }
    if (!Number.isFinite(strength) || strength < 0 || strength > 100)
        throw new RangeError("strength must be 0..100");
    const clean = finish === undefined ? strength / 100 : finish;
    if (!Number.isFinite(clean) || clean < 0 || clean > 1)
        throw new RangeError("finish must be 0..1");
    const problems = meshProblems(points, W, H);
    if (problems.length)
        return refuse(problems[0]);
    // Work in a window around the lower face and neck only (the rest of the photo never changes).
    const all = points.map(xy), f = frame(all), ov = CONTOURS.face_oval.map((k) => all[k]);
    const x0 = Math.max(0, Math.floor(Math.min(...ov.map((p) => p[0])) - WINDOW_SIDE * f.iod));
    const x1 = Math.min(W, Math.ceil(Math.max(...ov.map((p) => p[0])) + WINDOW_SIDE * f.iod));
    const y0 = Math.max(0, Math.floor(Math.min(all[LANDMARKS.right_pupil][1], all[LANDMARKS.left_pupil][1]) - WINDOW_TOP * f.iod));
    const y1 = Math.min(H, Math.ceil(Math.max(...ov.map((p) => p[1])) + WINDOW_BELOW * f.iod));
    const w = x1 - x0, h = y1 - y0;
    if (w < 8 || h < 8)
        return refuse("zone_not_visible");
    const sub = new Uint8Array(w * h * ch);
    for (let y = 0; y < h; y++)
        for (let k = 0, o = ((y + y0) * W + x0) * ch, q = y * w * ch; k < w * ch; k++)
            sub[q + k] = image.data[o + k];
    const r = estimateWindow({ width: w, height: h, channels: ch, data: sub }, all.map(([x, y]) => [x - x0, y - y0]), strength, keep.map(([kx, ky]) => [kx - x0, ky - y0]), clean);
    if ("refused" in r)
        return r;
    const out = new Uint8Array(image.data), weight = new Float64Array(W * H), backdrop = new Float64Array(W * H);
    for (let y = 0; y < h; y++) {
        for (let k = 0, o = ((y + y0) * W + x0) * ch, q = y * w * ch; k < w * ch; k++)
            out[o + k] = r.image[q + k];
        weight.set(r.weight.subarray(y * w, (y + 1) * w), (y + y0) * W + x0);
        if (r.backdrop)
            backdrop.set(r.backdrop.subarray(y * w, (y + 1) * w), (y + y0) * W + x0);
    }
    return { ...r, image: out, weight, backdrop, metrics: { ...r.metrics, window: `${w}x${h}` } };
}
function estimateWindow(image, pts, strength, keep, finish) {
    const { width: w, height: h } = image;
    let full, lip;
    try {
        full = beardArea(pts, w, h, { neckline: "low" });
        lip = beardArea(pts, w, h, { region: "moustache" });
    }
    catch {
        return refuse("zone_not_visible");
    }
    const face = frame(pts), n = w * h, iod = face.iod, skin = skinMask(pts, w, h);
    // Face-frame position of every pixel centre (across, down; in inter-pupil distances), computed once.
    const U = new Float32Array(n), V = new Float32Array(n);
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            const dx = (x + 0.5 - face.ox) / iod, dy = (y + 0.5 - face.oy) / iod;
            U[y * w + x] = dx * face.ux + dy * face.uy;
            V[y * w + x] = -dx * face.uy + dy * face.ux;
        }
    const lipMask = dilate(polygon(w, h, CONTOURS.lips_outer.map((k) => pts[k]), 2), LIP_GAP * iod), lips = lipMask.data;
    const oval = polygon(w, h, CONTOURS.face_oval.map((k) => pts[k]), 2).data;
    const hard = union(full.hard, lip.hard);
    // The search area: the beard, moustache and neck outline grown well past its edge (the beard's own
    // edge decides, not the outline), with discs at the mouth corners, and the nose and lips left out.
    const corners = new Float32Array(n);
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            const i = y * w + x;
            for (const k of [LANDMARKS.right_mouth, LANDMARKS.left_mouth])
                if ((x + 0.5 - pts[k][0]) ** 2 + (y + 0.5 - pts[k][1]) ** 2 <= (CORNER_RADIUS * iod) ** 2)
                    corners[i] = 1;
        }
    // The nose itself (tip, wings and nostrils) stays out; the hair right under it is searched.
    const noseMask = dilate(polygon(w, h, NOSE_OUTLINE.map((k) => pts[k]), 2), NOSE_MARGIN * iod);
    const area = subtract(subtract(union(dilate(hard, AREA_GROW * iod), maskOf(w, h, corners)), noseMask), lipMask).data;
    // Her cheek above the beard: the reference colour, the light on each side, and the grain source.
    const grown = dilate(hard, REF_MARGIN * iod).data, lab = labPlanes(image);
    const refIdx = [];
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            const i = y * w + x;
            if (skin[i] >= 0.5 && !(grown[i] >= 0.5) && V[i] >= REF_BELOW)
                refIdx.push(i);
        }
    let areaPx = 0;
    for (let i = 0; i < n; i++)
        if (area[i] >= 0.5)
            areaPx++;
    if (areaPx < MIN_REF_PIXELS || refIdx.length < MIN_REF_PIXELS)
        return refuse("zone_not_visible");
    const lighter = [...refIdx].sort((p, q) => lab.L[q] - lab.L[p]).slice(0, Math.max(MIN_REF_PIXELS, Math.floor(refIdx.length * REF_KEEP_SHARE)));
    const ref = [lab.L, lab.a, lab.b].map((plane) => median(lighter.map((i) => plane[i])));
    const across = (i) => U[i];
    const sideL = [lighter.filter((i) => across(i) < 0), lighter.filter((i) => across(i) >= 0)]
        .map((side) => side.length >= MIN_REF_PIXELS / 2 ? median(side.map((i) => lab.L[i])) : ref[0]);
    const top = Math.max(...sideL), refChroma = Math.hypot(ref[1], ref[2]);
    // Classify on a lightly blurred copy, so pores and single hairs do not speckle the result.
    const ones = new Float64Array(n).fill(1), br = Math.max(1, Math.round(0.012 * iod));
    const sL = maskedLowpass(lab.L, ones, w, h, br), sa = maskedLowpass(lab.a, ones, w, h, br), sb = maskedLowpass(lab.b, ones, w, h, br);
    // Skin, lit or in shadow (the neck under the jaw is much darker than the cheek): her hue and enough
    // colour, at most SHADOW_DROP_L darker. Beard hairs are grey or near-black, so they fail the colour test;
    // in the lit face a pixel well darker than the cheek also counts as hair.
    const refHue = Math.atan2(ref[2], ref[1]);
    const skinLike = (i) => {
        const c = Math.hypot(sa[i], sb[i]), dh = Math.abs(Math.atan2(Math.sin(Math.atan2(sb[i], sa[i]) - refHue), Math.cos(Math.atan2(sb[i], sa[i]) - refHue)));
        const floor = oval[i] >= 0.5 ? ref[0] - HAIR_DROP_L : ref[0] - SHADOW_DROP_L;
        return sL[i] >= floor && sL[i] <= ref[0] + 25 && c >= SKIN_CHROMA_SHARE * refChroma * Math.min(1, sL[i] / ref[0] + 0.15) && dh <= HUE_TOLERANCE;
    };
    // 1. Where the beard is.
    const raw = new Float32Array(n);
    for (let i = 0; i < n; i++)
        if (area[i] >= 0.5 && !skinLike(i))
            raw[i] = 1;
    const despeckled = maskedLowpass(Float64Array.from(raw), ones, w, h, Math.max(1, Math.round(0.01 * iod)));
    const clean = new Float32Array(n);
    for (let i = 0; i < n; i++)
        clean[i] = despeckled[i] >= 0.4 ? 1 : 0;
    const closed = erode(dilate(maskOf(w, h, clean), HAIR_CLOSE * iod), HAIR_CLOSE * iod);
    const core = subtract(subtract(dilate(closed, HAIR_GROW * iod), lipMask), noseMask);
    const coreArea = new Float32Array(n);
    let corePx = 0;
    for (let i = 0; i < n; i++)
        if (core.data[i] >= 0.5 && area[i] >= 0.5 || (core.data[i] >= 0.5 && oval[i] >= 0.5 && !(lips[i] >= 0.5))) {
            coreArea[i] = 1;
            corePx++;
        }
    // Holes: skin-looking gaps the beard surrounds (lit skin between hairs) are beard too, so no
    // patch of the old shade is left inside the estimate. Anything reachable from the window's edge,
    // the lips or the nose without crossing the beard is not a hole.
    {
        const seen = new Uint8Array(n), stack = [];
        const push = (i) => { if (!seen[i] && !coreArea[i]) {
            seen[i] = 1;
            stack.push(i);
        } };
        for (let x = 0; x < w; x++) {
            push(x);
            push((h - 1) * w + x);
        }
        for (let y = 0; y < h; y++) {
            push(y * w);
            push(y * w + w - 1);
        }
        for (let i = 0; i < n; i++)
            if (lips[i] >= 0.5 || noseMask.data[i] >= 0.5)
                push(i);
        while (stack.length) {
            const i = stack.pop(), x = i % w;
            if (x > 0)
                push(i - 1);
            if (x < w - 1)
                push(i + 1);
            if (i >= w)
                push(i - w);
            if (i < n - w)
                push(i + w);
        }
        for (let i = 0; i < n; i++)
            if (!seen[i] && !coreArea[i]) {
                coreArea[i] = 1;
                corePx++;
            }
    }
    const r4 = (v) => Math.round(v * 1e4) / 1e4, r3 = (v) => Math.round(v * 1e3) / 1e3;
    const metrics = { scope: FULL_SCOPE, estimated: true, cheek_l: r3(ref[0]), cheek_l_right: r3(sideL[0]), cheek_l_left: r3(sideL[1]),
        beard_pixels: corePx, kept_taps: keep.length, amount_cap: FULL_CAP };
    if (corePx < MIN_REF_PIXELS)
        return refuse("no_beard_found");
    if (strength === 0)
        return { image: new Uint8Array(image.data), weight: new Float64Array(n), label: FULL_LABEL, metrics: { ...metrics, unchanged: true } };
    const region = maskOf(w, h, coreArea);
    // The feather straddles the beard's edge: half inside (the last hairs fade out) and half outside.
    const edge = feather(region, Math.max(1, EDGE_FEATHER * iod), "centered").data;
    // Where the beard meets the nose or the lips it is not a hair edge: no fade there (the hairs
    // touching them come off fully), so the mix uses the feather of the beard with them included.
    const edgeMix = feather(union(union(region, noseMask), lipMask), Math.max(1, EDGE_FEATHER * iod), "centered").data;
    // A short blend just inside the nose and lip outlines, so the estimate meets them without a cut.
    const kept = union(noseMask, lipMask), keptInner = feather(kept, BORDER_PX, "inside").data;
    const vMouth = (face.local(...pts[LANDMARKS.right_mouth])[1] + face.local(...pts[LANDMARKS.left_mouth])[1]) / 2;
    // 2. Low frequencies: membrane fills on a coarse grid over the beard's box, one for the face (from
    // her cheeks and lip line) and one for the neck (from the neck), so the neck's shade stays below the jaw.
    let bx0 = w, by0 = h, bx1 = -1, by1 = -1;
    for (let i = 0; i < n; i++)
        if (edge[i] > 0) {
            const x = i % w, y = (i - x) / w;
            bx0 = Math.min(bx0, x);
            bx1 = Math.max(bx1, x);
            by0 = Math.min(by0, y);
            by1 = Math.max(by1, y);
        }
    const margin = Math.round(0.25 * iod);
    bx0 = Math.max(0, bx0 - margin);
    by0 = Math.max(0, by0 - margin);
    bx1 = Math.min(w - 1, bx1 + margin);
    by1 = Math.min(h - 1, by1 + margin);
    const cell = Math.max(2, Math.round(GRID_SHARE * iod)), gw = Math.ceil((bx1 - bx0 + 1) / cell), gh = Math.ceil((by1 - by0 + 1) / cell);
    const sums = [new Float64Array(gw * gh), new Float64Array(gw * gh), new Float64Array(gw * gh)], count = new Float64Array(gw * gh), total = new Float64Array(gw * gh);
    const blocked = new Uint8Array(gw * gh);
    for (let y = by0; y <= by1; y++)
        for (let x = bx0; x <= bx1; x++) {
            const i = y * w + x, g = Math.floor((y - by0) / cell) * gw + Math.floor((x - bx0) / cell);
            total[g]++;
            if (edge[i] >= 0.5)
                blocked[g] = 1;
            if (edge[i] > 0 || lips[i] >= 0.5 || !skinLike(i))
                continue;
            sums[0][g] += lab.L[i];
            sums[1][g] += lab.a[i];
            sums[2][g] += lab.b[i];
            count[g]++;
        }
    const known = new Uint8Array(gw * gh);
    for (let g = 0; g < gw * gh; g++)
        known[g] = !blocked[g] && count[g] >= 0.5 * total[g] ? 1 : 0;
    const faceCell = new Uint8Array(gw * gh);
    for (let gy = 0; gy < gh; gy++)
        for (let gx = 0; gx < gw; gx++) {
            const x = Math.min(w - 1, bx0 + Math.floor((gx + 0.5) * cell)), y = Math.min(h - 1, by0 + Math.floor((gy + 0.5) * cell));
            faceCell[gy * gw + gx] = oval[y * w + x] >= 0.5 || V[y * w + x] < vMouth + SILHOUETTE_START ? 1 : 0;
        }
    const means = sums.map((s) => Float64Array.from(s, (v, g) => (count[g] ? v / count[g] : 0)));
    const knownFace = Uint8Array.from(known, (v, g) => (v && faceCell[g] ? 1 : 0)), knownNeck = Uint8Array.from(known, (v, g) => (v && !faceCell[g] ? 1 : 0));
    // The light across her face (lit side to shaded side) is fitted as a straight line across the face
    // from the known skin; the membrane fills what is left, so the side lighting carries across the beard.
    const cellU = new Float64Array(gw * gh);
    for (let gy = 0; gy < gh; gy++)
        for (let gx = 0; gx < gw; gx++) {
            const x = Math.min(w - 1, bx0 + Math.floor((gx + 0.5) * cell)), y = Math.min(h - 1, by0 + Math.floor((gy + 0.5) * cell));
            cellU[gy * gw + gx] = U[y * w + x];
        }
    const fits = means.map((m) => {
        let s0 = 0, s1 = 0, s2 = 0, t0 = 0, t1 = 0;
        for (let g = 0; g < gw * gh; g++)
            if (knownFace[g]) {
                const u = cellU[g];
                s0++;
                s1 += u;
                s2 += u * u;
                t0 += m[g];
                t1 += u * m[g];
            }
        const det = s0 * s2 - s1 * s1;
        if (s0 < 4 || Math.abs(det) < 1e-9)
            return [s0 ? t0 / s0 : 0, 0];
        const slope = (s0 * t1 - s1 * t0) / det;
        return [(t0 - slope * s1) / s0, slope];
    });
    const fillGrid = means.map((m, c) => {
        const [a0, a1] = fits[c], resid = Float64Array.from(m, (v, g) => v - (a0 + a1 * cellU[g]));
        const solved = membrane(resid, knownFace, gw, gh, 0, SOLVE_ITERATIONS);
        for (let g = 0; g < gw * gh; g++)
            solved[g] += a0 + a1 * cellU[g];
        return solved;
    });
    const neckGrid = knownNeck.some((v) => v === 1) ? means.map((m, c) => membrane(m, knownNeck, gw, gh, ref[c], SOLVE_ITERATIONS)) : fillGrid;
    const sample = (grid, x, y) => {
        const gx = Math.min(gw - 1, Math.max(0, (x - bx0 + 0.5) / cell - 0.5)), gy = Math.min(gh - 1, Math.max(0, (y - by0 + 0.5) / cell - 0.5));
        const x0 = Math.floor(gx), y0 = Math.floor(gy), x1 = Math.min(gw - 1, x0 + 1), y1 = Math.min(gh - 1, y0 + 1), fx = gx - x0, fy = gy - y0;
        return (grid[y0 * gw + x0] * (1 - fx) + grid[y0 * gw + x1] * fx) * (1 - fy) + (grid[y1 * gw + x0] * (1 - fx) + grid[y1 * gw + x1] * fx) * fy;
    };
    // Tone match: the estimate's mean L*, a*, b* over the beard (inside the jaw) is brought to the
    // cheek band just above it, less a small darkening toward the jaw. The correction is zero at the
    // beard's edge (where the fill already meets her skin) and full TONE_DEPTH inside it.
    const toneDepth = feather(region, Math.max(1, TONE_DEPTH * iod), "inside").data;
    const bandMask = dilate(region, CHEEK_BAND * iod).data;
    const cheekBand = [], inner = [];
    for (let i = 0; i < n; i++) {
        const v = V[i];
        if (bandMask[i] >= 0.5 && coreArea[i] < 0.5 && oval[i] >= 0.5 && skin[i] >= 0.5 && skinLike(i) && v < vMouth && lips[i] < 0.5)
            cheekBand.push(i);
        else if (coreArea[i] >= 0.5 && oval[i] >= 0.5 && toneDepth[i] > 0)
            inner.push(i);
    }
    const tone = [0, 0, 0], chinV = face.local(...pts[LANDMARKS.chin])[1], vBottomFace = chinV > vMouth ? chinV : vMouth + 0.5;
    const jawRamp = (v) => smooth((v - vMouth) / Math.max(1e-6, vBottomFace - vMouth));
    const toneBefore = [0, 0, 0], toneCheek = [0, 0, 0];
    if (cheekBand.length >= MIN_REF_PIXELS && inner.length >= MIN_REF_PIXELS) {
        const planes = [lab.L, lab.a, lab.b];
        for (let c = 0; c < 3; c++) {
            toneCheek[c] = median(cheekBand.map((i) => planes[c][i]));
            let sf = 0, sd = 0;
            for (const i of inner) {
                const x = i % w, y = (i - x) / w;
                sf += sample(fillGrid[c], x, y) - (c === 0 ? JAW_DARKEN_L * jawRamp(V[i]) : 0);
                sd += toneDepth[i];
            }
            toneBefore[c] = sf / inner.length;
            tone[c] = sd > 0 ? (toneCheek[c] - toneBefore[c]) * inner.length / sd : 0;
        }
    }
    // 3. The jaw under the beard. The face outline from the face points follows the jaw and chin
    // under the hair, so below the mouth the beard's own silhouette is taken back to that outline:
    // past it is neck (her neck's width, measured under the beard) or the backdrop (filled from the
    // backdrop around it), with a soft shadow under the jaw. Above the mouth nothing moves.
    const jawIn = feather(maskOf(w, h, oval), Math.max(1, JAW_EDGE * iod), "centered").data;
    const jawShadow = feather(maskOf(w, h, oval), Math.max(1, JAW_SHADOW_REACH * iod), "outside").data;
    const [chinU] = face.local(...pts[LANDMARKS.chin]);
    let vBottom = -Infinity;
    for (let i = 0; i < n; i++)
        if (coreArea[i] >= 0.5) {
            if (Math.abs(U[i] - chinU) < 0.4)
                vBottom = Math.max(vBottom, V[i]);
        }
    // Neck width: skin runs on rows just under the beard, either side of the chin.
    const lefts = [], rights = [];
    for (let y = 0; y < h; y++) {
        const cx = Math.round(pts[LANDMARKS.chin][0] + (y - pts[LANDMARKS.chin][1]) * (face.ux === 0 ? 0 : -face.uy / face.ux));
        if (cx < 1 || cx >= w - 1)
            continue;
        const v = V[y * w + cx];
        if (v < vBottom + NECK_ROWS[0] || v > vBottom + NECK_ROWS[1] || !skinLike(y * w + cx))
            continue;
        const run = (step) => { let x = cx, miss = 0; while (x + step >= 0 && x + step < w && miss < 3) {
            x += step;
            miss = skinLike(y * w + x) ? 0 : miss + 1;
        } return x - step * miss; };
        lefts.push(U[y * w + run(-1)]);
        rights.push(U[y * w + run(1)]);
    }
    let neckL, neckR;
    if (lefts.length >= 3) {
        neckL = median(lefts);
        neckR = median(rights);
    }
    else {
        let lo = Infinity, hi = -Infinity;
        for (let i = 0; i < n; i++)
            if (oval[i] >= 0.5) {
                if (Math.abs(V[i] - vMouth) < 0.05) {
                    lo = Math.min(lo, U[i]);
                    hi = Math.max(hi, U[i]);
                }
            }
        neckL = chinU + NECK_SHARE * (lo - chinU);
        neckR = chinU + NECK_SHARE * (hi - chinU);
    }
    const edgeSoft = Math.max(1, NECK_EDGE * iod) / iod;
    // Shares of each pixel: face (inside the jaw, or above the mouth), neck, backdrop.
    const faceShare = new Float64Array(n), neckShare = new Float64Array(n);
    for (let y = by0; y <= by1; y++)
        for (let x = bx0; x <= bx1; x++) {
            const i = y * w + x, u = U[i], v = V[i];
            const lower = smooth((v - vMouth - SILHOUETTE_START) / SILHOUETTE_RAMP);
            faceShare[i] = 1 - lower * (1 - jawIn[i]);
            neckShare[i] = (1 - faceShare[i]) * smooth(0.5 + (u - neckL) / (2 * edgeSoft)) * smooth(0.5 + (neckR - u) / (2 * edgeSoft));
        }
    // Backdrop fill: a second membrane from the backdrop pixels around the beard (not skin, not hair).
    const hairNear = dilate(region, BACKDROP_GAP * iod).data;
    // The backdrop's own level beside the beard; much darker pixels (clothes, shadow) are not used.
    const bgSeen = [];
    for (let y = by0; y <= by1; y += 2)
        for (let x = bx0; x <= bx1; x += 2) {
            const i = y * w + x;
            if (hairNear[i] < 0.5 && oval[i] < 0.5 && !skinLike(i) && faceShare[i] <= 0.5 && neckShare[i] <= 0.05)
                bgSeen.push(lab.L[i]);
        }
    bgSeen.sort((p, q) => p - q);
    const bgFloor = bgSeen.length ? bgSeen[Math.floor(0.75 * (bgSeen.length - 1))] - BACKDROP_DROP_L : 0;
    const bgSums = [new Float64Array(gw * gh), new Float64Array(gw * gh), new Float64Array(gw * gh)], bgCount = new Float64Array(gw * gh), bgBlocked = new Uint8Array(gw * gh);
    let bgMaxL = 0;
    for (let y = by0; y <= by1; y++)
        for (let x = bx0; x <= bx1; x++) {
            const i = y * w + x, g = Math.floor((y - by0) / cell) * gw + Math.floor((x - bx0) / cell);
            if (hairNear[i] >= 0.5) {
                bgBlocked[g] = 1;
                continue;
            }
            if (oval[i] >= 0.5 || skinLike(i) || faceShare[i] > 0.5 || neckShare[i] > 0.05)
                continue;
            if (lab.L[i] < bgFloor)
                continue;
            bgSums[0][g] += lab.L[i];
            bgSums[1][g] += lab.a[i];
            bgSums[2][g] += lab.b[i];
            bgCount[g]++;
        }
    const bgKnown = new Uint8Array(gw * gh);
    for (let g = 0; g < gw * gh; g++)
        bgKnown[g] = !bgBlocked[g] && bgCount[g] >= 0.5 * total[g] ? 1 : 0;
    const hasBackdrop = bgKnown.some((v) => v === 1);
    const bgGrid = hasBackdrop ? bgSums.map((s, c) => membrane(Float64Array.from(s, (v, g) => (bgCount[g] ? v / bgCount[g] : 0)), bgKnown, gw, gh, ref[c], SOLVE_ITERATIONS)) : null;
    if (bgGrid)
        for (let g = 0; g < gw * gh; g++)
            bgMaxL = Math.max(bgMaxL, bgGrid[0][g]);
    // Full cover over the hair where the backdrop or neck shows through (the fill matches what is around it).
    const cover = feather(dilate(region, COVER_GROW * iod), Math.max(1, COVER_GROW * iod), "outside").data;
    // 4. Skin texture: isotropic noise split into octave bands (1, 2, 4, 8 px), each band scaled to the
    // same band of her clean cheek, so pores and mottling match her photo's scale with no streaks.
    const refMask = new Float64Array(n);
    for (const i of refIdx)
        if (skinLike(i))
            refMask[i] = 1;
    // Worked in a window around the beard and the cheek patches only.
    let wx0 = bx0, wy0 = by0, wx1 = bx1, wy1 = by1;
    for (const k of refIdx) {
        const x = k % w, y = (k - x) / w;
        wx0 = Math.min(wx0, x);
        wx1 = Math.max(wx1, x);
        wy0 = Math.min(wy0, y);
        wy1 = Math.max(wy1, y);
    }
    const pad = 3 * BAND_SIGMAS[BAND_SIGMAS.length - 1];
    wx0 = Math.max(0, wx0 - pad);
    wy0 = Math.max(0, wy0 - pad);
    wx1 = Math.min(w - 1, wx1 + pad);
    wy1 = Math.min(h - 1, wy1 + pad);
    const cw = wx1 - wx0 + 1, chh = wy1 - wy0 + 1, cn = cw * chh;
    const crop = (plane) => { const out = new Float64Array(cn); for (let y = 0; y < chh; y++)
        for (let x = 0; x < cw; x++)
            out[y * cw + x] = plane[(y + wy0) * w + x + wx0]; return out; };
    // Two box passes per blur (close enough to a Gaussian for grain).
    const gauss = (plane, mask, sigma) => {
        const r = Math.max(1, Math.round(sigma * 1.2));
        return maskedLowpass(maskedLowpass(plane, mask, cw, chh, r), mask, cw, chh, r);
    };
    // Octave bands from `first` up: band k is blur(sigma k-1) - blur(sigma k), band 0 starts at the plane.
    const bands = (plane, mask, first) => {
        const out = [];
        let prev = first === 0 ? plane : gauss(plane, mask, BAND_SIGMAS[first - 1]);
        for (let k = 0; k < BAND_SIGMAS.length; k++) {
            if (k < first) {
                out.push(null);
                continue;
            }
            const next = gauss(plane, mask, BAND_SIGMAS[k]), band = new Float64Array(cn);
            for (let q = 0; q < cn; q++)
                band[q] = prev[q] - next[q];
            out.push(band);
            prev = next;
        }
        return out;
    };
    const cheekMask = crop(refMask), cropOnes = new Float64Array(cn).fill(1);
    const calmMask = erode(maskOf(cw, chh, cheekMask), Math.max(2, 2 * BAND_SIGMAS[BAND_SIGMAS.length - 1])).data;
    const calmIdx = [];
    for (let q = 0; q < cn; q++)
        if (calmMask[q] >= 0.5)
            calmIdx.push(q);
    // A robust spread (1.4826 x median absolute deviation) on at most ~4000 evenly spread samples.
    const thin = (idx) => { const step = Math.max(1, Math.floor(idx.length / 4000)); return step === 1 ? idx : idx.filter((_, k) => k % step === 0); };
    const robustSd = (plane, idx) => { if (idx.length < 16)
        return 0; const t = thin(idx); const m = median(t.map((q) => plane[q])); return 1.4826 * median(t.map((q) => Math.abs(plane[q] - m))); };
    const noiseIdx = [];
    for (let y = by0; y <= by1; y += 3)
        for (let x = bx0; x <= bx1; x += 3)
            noiseIdx.push((y - wy0) * cw + x - wx0);
    const texture = [new Float64Array(n), new Float64Array(n), new Float64Array(n)];
    const grainSd = [];
    [lab.L, lab.a, lab.b].forEach((plane, c) => {
        const first = c === 0 ? 0 : BAND_SIGMAS.length - 1; // colour mottling only at the coarsest scale
        const cheekBands = bands(crop(plane), cheekMask, first);
        const white = new Float64Array(cn);
        for (let y = 0; y < chh; y++)
            for (let x = 0; x < cw; x++)
                white[y * cw + x] = grain(x + wx0, y + wy0, 21 + c) + grain(x + wx0, y + wy0, 31 + c) + grain(x + wx0, y + wy0, 41 + c) - 1.5;
        const noiseBands = bands(white, cropOnes, first);
        noiseBands.forEach((band, k) => {
            if (!band)
                return;
            const want = robustSd(cheekBands[k], calmIdx), have = robustSd(band, noiseIdx);
            if (c === 0)
                grainSd.push(want);
            if (!(want > 0) || !(have > 0))
                return;
            const gain = (c === 0 ? BAND_GAINS[k] : MOTTLE_GAIN) * want / have, tex = texture[c];
            for (let y = by0; y <= by1; y++)
                for (let x = bx0; x <= bx1; x++)
                    tex[y * w + x] += gain * band[(y - wy0) * cw + x - wx0];
        });
    });
    // Variance match: the estimate's grain over the beard is scaled to the cheek band's own fine detail.
    let texGain = TEXTURE_GAIN, cheekGrain = 0, estGrain = 0;
    if (cheekBand.length >= MIN_REF_PIXELS && inner.length >= MIN_REF_PIXELS) {
        const lowL = maskedLowpass(lab.L, refMask, w, h, Math.max(1, BAND_SIGMAS[BAND_SIGMAS.length - 1]));
        const calmFull = [];
        for (const q of calmIdx)
            calmFull.push((Math.floor(q / cw) + wy0) * w + (q % cw) + wx0);
        const hpBand = new Float64Array(n);
        for (const i of calmFull)
            hpBand[i] = lab.L[i] - lowL[i];
        cheekGrain = robustSd(hpBand, calmFull);
        estGrain = robustSd(texture[0], inner);
        if (cheekGrain > 0 && estGrain > 0)
            texGain = Math.min(1.5, Math.max(0.5, cheekGrain / estGrain));
    }
    // 5. Shaving shadow: where the beard was, softened.
    const density = maskedLowpass(Float64Array.from(clean), ones, w, h, Math.max(1, Math.round(0.03 * iod)));
    // Stray stubble just past the beard's edge: dark specks against her local skin are lifted to it.
    const faceSkin = new Float64Array(n);
    for (let i = 0; i < n; i++)
        faceSkin[i] = oval[i] >= 0.5 && skinLike(i) && coreArea[i] < 0.5 ? 1 : 0;
    const sr = Math.max(2, Math.round(STRAY_RADIUS * iod)), firstL = maskedLowpass(lab.L, faceSkin, w, h, sr);
    const calmSkin = Float64Array.from(faceSkin, (v, i) => (v && lab.L[i] >= firstL[i] - STRAY_DROP_L / 2 ? 1 : 0));
    const localL = maskedLowpass(lab.L, calmSkin, w, h, sr), localA = maskedLowpass(lab.a, calmSkin, w, h, sr), localB = maskedLowpass(lab.b, calmSkin, w, h, sr);
    const strayBand = feather(region, Math.max(1, STRAY_BAND * iod), "outside").data;
    // Moustache tips over the upper lip's edge: grey-dark specks there lifted to the lip around them.
    const lipCalm = new Float64Array(n), lipAll = Float64Array.from(lips, (v) => (v >= 0.5 ? 1 : 0));
    const lr = Math.max(2, Math.round(LIP_TIP_RADIUS * iod)), lipFirst = maskedLowpass(lab.L, lipAll, w, h, lr);
    for (let i = 0; i < n; i++)
        lipCalm[i] = lipAll[i] && lab.L[i] >= lipFirst[i] - STRAY_DROP_L / 2 ? 1 : 0;
    const lipL = maskedLowpass(lab.L, lipCalm, w, h, lr), lipA = maskedLowpass(lab.a, lipCalm, w, h, lr), lipB = maskedLowpass(lab.b, lipCalm, w, h, lr);
    const vStomion = face.local(...pts[LANDMARKS.stomion_upper])[1];
    // The skin estimate at a pixel: face fill (tone-matched) and neck fill, split at the jaw.
    const skinAt = (x, y, i) => {
        const fs = faceShare[i] + neckShare[i] > 1e-6 ? faceShare[i] / (faceShare[i] + neckShare[i]) : 1;
        const v = V[i];
        return [0, 1, 2].map((c) => fs * (sample(fillGrid[c], x, y) + tone[c] * toneDepth[i] - (c === 0 ? JAW_DARKEN_L * jawRamp(v) : 0))
            + (1 - fs) * sample(neckGrid[c], x, y));
    };
    // Finish: 1 at 0.3 and below (light stubble), about a third at 0.5, none at 1.
    const stubble = Math.min(1, Math.max(0, (1 - finish) / 0.7)) ** 3;
    // 6. Mix: beard and its feathered edge to the estimate; stray specks past it lifted.
    const spared = new Uint8Array(n), keepR2 = (KEEP_RADIUS * iod) ** 2;
    for (const [kx, ky] of keep)
        for (let y = 0; y < h; y++)
            for (let x = 0; x < w; x++) {
                if ((x + 0.5 - kx) ** 2 + (y + 0.5 - ky) ** 2 <= keepR2)
                    spared[y * w + x] = 1;
            }
    const weight = new Float64Array(n), backdrop = new Float64Array(n), amount = FULL_CAP * (strength / 100);
    let strayPx = 0, backdropPx = 0;
    for (let y = by0; y <= by1; y++)
        for (let x = bx0; x <= bx1; x++) {
            const i = y * w + x;
            if (spared[i])
                continue;
            if (kept.data[i] >= 0.5 && keptInner[i] < 1 && hairNear[i] >= 0.5) {
                // The border blend: part of the estimate, fading to nothing a few pixels in.
                const t = (1 - keptInner[i]) * amount;
                const est = skinAt(x, y, i), fill = [Math.min(top, est[0] + TEXTURE_GAIN * texture[0][i]), est[1], est[2]];
                lab.L[i] += t * (fill[0] - lab.L[i]);
                lab.a[i] += t * (fill[1] - lab.a[i]);
                lab.b[i] += t * (fill[2] - lab.b[i]);
                weight[i] = Math.max(weight[i], t);
            }
            if (lips[i] >= 0.5) {
                if (!(hairNear[i] >= 0.5) || V[i] >= vStomion)
                    continue;
                const c = Math.hypot(lab.a[i], lab.b[i]), cLocal = Math.hypot(lipA[i], lipB[i]);
                const tip = smooth((lipL[i] - lab.L[i] - STRAY_DROP_L / 2) / STRAY_DROP_L) * smooth((cLocal - c) / Math.max(1, 0.4 * cLocal));
                if (!(tip > 0))
                    continue;
                const t = tip * amount;
                lab.L[i] += t * (lipL[i] - lab.L[i]);
                lab.a[i] += t * (lipA[i] - lab.a[i]);
                lab.b[i] += t * (lipB[i] - lab.b[i]);
                weight[i] = Math.max(weight[i], t);
                strayPx++;
                continue;
            }
            if (noseMask.data[i] >= 0.5) {
                // Moustache hairs over the nostril rims: grey specks lifted to the skin around them (the
                // nostrils are dark but warm, so they stay).
                if (!(hairNear[i] >= 0.5))
                    continue;
                const c = Math.hypot(lab.a[i], lab.b[i]), cLocal = Math.hypot(localA[i], localB[i]);
                // Dark grey hairs, or light grey ones (not as dark as the nostril openings).
                const grey = smooth((0.6 * cLocal - c) / Math.max(1, 0.3 * cLocal));
                const tip = grey * Math.max(smooth((localL[i] - lab.L[i] - STRAY_DROP_L / 2) / STRAY_DROP_L), lab.L[i] >= localL[i] - NOSTRIL_DROP_L ? 1 : 0);
                if (!(tip > 0))
                    continue;
                const t = tip * amount;
                lab.L[i] += t * (localL[i] - lab.L[i]);
                lab.a[i] += t * (localA[i] - lab.a[i]);
                lab.b[i] += t * (localB[i] - lab.b[i]);
                weight[i] = Math.max(weight[i], t);
                strayPx++;
                continue;
            }
            const onBeard = coreArea[i] >= 0.5 || edge[i] >= 0.5;
            const bgShare = bgGrid ? (1 - faceShare[i]) - neckShare[i] : 0, outerShare = bgShare + neckShare[i];
            // Skin past the beard: the feather ramp, and stray specks lifted to the skin around them.
            let wt = 0;
            if (edge[i] > 0 && (onBeard || skinLike(i)))
                wt = smooth(onBeard ? edgeMix[i] : edge[i]);
            wt = Math.max(wt, outerShare * cover[i]);
            let baseL = lab.L[i], baseA = lab.a[i], baseB = lab.b[i];
            const stray = oval[i] >= 0.5 && edge[i] < 0.95 && (faceSkin[i] || onBeard) && strayBand[i] > 0 ? smooth((localL[i] - lab.L[i] - STRAY_DROP_L / 2) / STRAY_DROP_L) * smooth(strayBand[i] / 0.5) : 0;
            if (stray > 0) {
                baseL += stray * (localL[i] - baseL);
                baseA += stray * (localA[i] - baseA);
                baseB += stray * (localB[i] - baseB);
                strayPx++;
            }
            if (!(wt > 0) && !(stray > 0))
                continue;
            wt *= amount;
            const d = Math.min(1, density[i]) * stubble;
            const shade = JAW_SHADOW_L * smooth(jawShadow[i]) * (oval[i] >= 0.5 ? 0 : 1);
            const est = skinAt(x, y, i);
            const skinL = Math.min(top, est[0] + texGain * texture[0][i] - STUBBLE_L * d);
            const skinT = [skinL - shade, est[1] + texture[1][i] - 0.3 * STUBBLE_B * d, est[2] + texture[2][i] - STUBBLE_B * d];
            const target = bgGrid && bgShare > 0
                ? skinT.map((v, c) => (1 - bgShare) * v + bgShare * sample(bgGrid[c], x, y))
                : skinT;
            if (bgShare > 0.01 && wt > 0) {
                backdrop[i] = bgShare;
                backdropPx++;
            }
            const keepW = stray > 0 ? amount : 1;
            lab.L[i] = lab.L[i] + keepW * (baseL - lab.L[i]);
            lab.a[i] = lab.a[i] + keepW * (baseA - lab.a[i]);
            lab.b[i] = lab.b[i] + keepW * (baseB - lab.b[i]);
            lab.L[i] += wt * (target[0] - lab.L[i]);
            lab.a[i] += wt * (target[1] - lab.a[i]);
            lab.b[i] += wt * (target[2] - lab.b[i]);
            // Stubble (at a low finish): short hairs as single darker, greyer dots where the beard grew.
            if (onBeard && d > 0 && bgShare < 0.5 && grain(x, y, 11) < STUBBLE_DOTS * d) {
                lab.L[i] -= wt * STUBBLE_DOT_L * Math.sqrt(d);
                lab.a[i] -= wt * 0.4 * lab.a[i] * Math.sqrt(d);
                lab.b[i] -= wt * 0.4 * lab.b[i] * Math.sqrt(d);
            }
            weight[i] = Math.max(wt, stray > 0 ? stray * amount : 0);
        }
    const toneAfter = [lab.L, lab.a, lab.b].map((pl) => inner.length ? inner.reduce((t, i) => t + pl[i], 0) / inner.length : 0);
    let edited = 0;
    for (let i = 0; i < n; i++)
        if (weight[i] > 0)
            edited++;
    Object.assign(metrics, { edited_pixels: edited, grain_l: grainSd.map(r3).join("/"), grid: `${gw}x${gh}`, stray_pixels: strayPx, backdrop_pixels: backdropPx,
        backdrop_l_max: r3(bgMaxL), finish: r3(finish), stubble: r3(stubble), tex_gain: r3(texGain), cheek_grain: r3(cheekGrain),
        tone_before: toneBefore.map(r3).join("/"), tone_cheek: toneCheek.map(r3).join("/"), tone_after: toneAfter.map(r3).join("/"), neck_u: `${r3(neckL)}..${r3(neckR)}`, known_cells: r4(known.reduce((s, v) => s + v, 0) / known.length) });
    return { image: encode(image, lab, weight), weight, backdrop, label: FULL_LABEL, metrics };
}
//# sourceMappingURL=full.js.map