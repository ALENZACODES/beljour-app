/** Full-beard estimate for Beard removal. When a beard hides the skin and the jaw line, remove.ts
 * refuses ("full_beard") because there is no visible skin under the hair to rebuild from. This path
 * paints an estimate instead and says so. In order:
 * 1. Where the beard is: inside the beard, moustache and neck area (grown a little past the jaw, the
 *    nose itself left out), every pixel that does not look like her skin is beard. Specks are
 *    cleaned, gaps closed, and the result grown, so the mouth corners and the chin are inside it.
 * 2. Low frequencies: smooth membrane fills (the Laplace equation, solved on a coarse grid): one for
 *    the face from her cheeks and lip line, on top of the side-to-side light fitted from them, and
 *    one for the neck from the neck. Deeper in, the face runs from her cheek tone (the cheek band
 *    above the beard, without the lit skin beside the nose wings) at the nose base most of the way
 *    to her neck tone at the chin, darkens a little toward the face outline as it turns away, and
 *    keeps a small share of the photo's own broad light and shadow there.
 * 3. The jaw: below the mouth, the face outline from the face points stands in for the jaw and chin
 *    under the hair. Past it is her neck (its width measured under the beard, darker at its sides)
 *    or the backdrop (filled from the backdrop around the beard); the shadow under the jaw comes in
 *    across a soft jaw edge and fades down the neck.
 * 4. Skin texture: her own (Texture Law). Min-cut quilting copies pores, fine lines and colour grain
 *    from her clean cheek and neck, one donor pixel per output pixel, preferring the same height and
 *    side; donor blocks never contain a mole. No generated noise. Refuses when no clean skin is seen.
 *    The lower-face form is lit by first-order light fitted to her own skin on the face-mesh normals.
 * 5. Finish (separate from coverage): light stubble at 0.3 (short hairs on blue-noise follicles in
 *    her own beard's local colour, so grey stays grey), a very faint shadow at 0.5, a clean shave at 1,
 *    where the jaw outline also comes in by the beard's estimated thickness (inward only).
 *    Stray stubble past the beard's edge, moustache tips over the lip, and hair tips on the nose's
 *    lower rim are lifted to the skin (or lip) around them.
 * 6. Mixed in full over the beard and faded over a wide band past it (about a sixth of the face
 *    width): her own skin there keeps its pores and lines and only its broad tone moves, and hairs
 *    the search missed close to the beard fade out with it, so there is no line at the old edge.
 * Shares and radii are ASSUMED,
 * tuned by eye on the synthetic sample. A rough visual estimate, not a grooming or medical
 * prediction. Runs in a window around the lower face and neck. Browser only; the stubble and
 * short-beard path stays byte-matched to the Python twin.
 * Author: John Khan.
 */
import { dilate, erode, feather, polygon, subtract, union } from "../core/mask.js";
import { CONTOURS } from "../../data/regions/index.js";
import { LANDMARKS } from "../../data/face/generated/anatomy.js";
import { beardArea } from "../local/beard.js";
import { quiltOwnSkin } from "./quilt.js";
import { renderStubble } from "./stubble.js";
import { detectMarks } from "../core/pigment.js";
import { jawTuck } from "./jaw-tuck.js";
import { fitLight, landmarkNormals, normalImage, shadeAt as lightAt, toP3 } from "../core/light-model.js";
import { lstarOf, maskedGaussian } from "../core/bands.js";
import { renderClock } from "../skin/texture-law.js";
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
export const SILHOUETTE_START = -0.15, SILHOUETTE_RAMP = 0.2, JAW_EDGE = 0.06, NECK_EDGE = 0.04, NECK_ROWS = [0.04, 0.2], NECK_SHARE = 0.8, BACKDROP_GAP = 0.04, BACKDROP_DROP_L = 15, COVER_GROW = 0.025;
/** Texture octaves (px) and stray stubble past the edge. */
export const BAND_SIGMAS = [1, 2, 4], BAND_GAINS = [1.0, 1.0, 0.6], STRAY_RADIUS = 0.04, STRAY_DROP_L = 6, STRAY_BAND = 0.12, LIP_TIP_RADIUS = 0.03, BORDER_PX = 2.5, NOSTRIL_DROP_L = 12;
/** Nose rim clean-up (round 4): band depth (inter-pupil shares) and the colour share that counts as grey. ASSUMED. */
/** Missed hairs past the beard are faded only below this line (inter-pupil distances under the eyes). ASSUMED. */
export const HAIR_RIM_V = 0.3, HAIR_RIM_DROP_L = 16, SKIN_LOW = 0.05;
export const RIM_DEPTH = 0.065, RIM_CHROMA = 0.8, RIM_CREASE_L = 6;
/** Soft ceiling: unchanged up to cap - 2 L*, then eased so it never passes cap. */
function knee(v, cap) {
    const k = cap - 2;
    return v <= k ? v : k + 2 * Math.tanh((v - k) / 2);
}
/** Eye distance (px) below which a pore is sub-pixel and there is no skin texture to copy. */
export const SUBPIXEL_IOD = 48;
export const TEXTURE_GAIN = 1.0, STUBBLE_L = 6, STUBBLE_B = 3;
export const EDGE_FEATHER = 0.14, FULL_CAP = 1.0, REF_KEEP_SHARE = 0.75;
/** Working window around the face outline (shares of the inter-pupil distance). */
export const WINDOW_SIDE = 0.6, WINDOW_TOP = 0.3, WINDOW_BELOW = 1.2;
/** Tone match: the cheek band just above the beard, how deep the correction reaches in, and the
 * small darkening kept toward the jaw (L*). */
export const CHEEK_BAND = 0.2, MOTTLE_GAIN = 0.3;
/** Shading (round 4): the cheek band skips skin this close to the nose wings (lit, brighter than the
 * cheek beside the beard); the patch runs from the cheek tone at the nose base to this share of the
 * way to her neck tone at the chin; the estimate gives way to the fill around it over BLEND_DEPTH in
 * from the beard's edge; the outer mix fades over EDGE_WIDE out from it (about 17% of the face width);
 * a share of the photo's own broad light and shadow under the beard is kept (SHADE_GAIN, at most
 * SHADE_MAX L*, blurred over SHADE_RADIUS so single hairs do not show). All ASSUMED, tuned by eye. */
export const NOSE_CLEAR = 0.1, CHIN_NECK = 0.6, BLEND_DEPTH = 0.3, EDGE_WIDE = 0.36, SHADE_GAIN = 0.25, SHADE_MAX = 4, SHADE_RADIUS = 0.1;
/** The face turning away toward the jaw and the face edge: up to FORM_L darker at the outline, over FORM_REACH in. */
export const FORM_L = 4, FORM_REACH = 0.3;
/** Finish: stubble left at finish 0.3 (fading to none at 1): shadow, and a share of her own hairs kept. */
export const STUBBLE_DOTS = 0.16, STUBBLE_DOT_L = 12, DENSITY_SOFT = 0.07, GHOST_SOFT = 0.12;
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
    const started = renderClock();
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
    const zs = points.map((p) => toP3(p)[2]);
    const r = estimateWindow({ width: w, height: h, channels: ch, data: sub }, all.map(([x, y]) => [x - x0, y - y0]), strength, keep.map(([kx, ky]) => [kx - x0, ky - y0]), clean, zs);
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
    // Clean shave: the beard's thickness comes off the jaw outline (inward only; checked by beardJawCheck).
    let tuck = { maxShiftPx: 0, meanShiftPx: 0, minJacobian: 1 };
    if (clean >= 0.7) {
        const near = (x, y) => {
            let s = 0, c = 0;
            for (let dy = -3; dy <= 3; dy++)
                for (let dx = -3; dx <= 3; dx++) {
                    const xx = Math.round(x) + dx, yy = Math.round(y) + dy;
                    if (xx >= 0 && yy >= 0 && xx < W && yy < H) {
                        s += weight[yy * W + xx];
                        c++;
                    }
                }
            return c ? s / c : 0;
        };
        const t = jawTuck({ width: W, height: H, channels: ch, data: out }, all, f.iod, near, (clean - 0.7) / 0.3);
        // Pixels the tuck moved outside the beard weight are backdrop pulled in over the old jaw edge: report them.
        for (let i = 0; i < W * H; i++) {
            if (weight[i] > 0)
                continue;
            for (let c = 0; c < Math.min(ch, 3); c++)
                if (t.data[i * ch + c] !== out[i * ch + c]) {
                    weight[i] = 1e-3;
                    backdrop[i] = 1;
                    break;
                }
        }
        out.set(t.data);
        tuck = t;
    }
    return { ...r, image: out, weight, backdrop, metrics: { ...r.metrics, window: `${w}x${h}`, render_ms: Math.round(renderClock() - started),
            jaw_tuck_px: Math.round(tuck.meanShiftPx * 100) / 100, jaw_tuck_min_jacobian: Math.round(tuck.minJacobian * 1000) / 1000 } };
}
function estimateWindow(image, pts, strength, keep, finish, zs = []) {
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
    const original = [Float64Array.from(lab.L), Float64Array.from(lab.a), Float64Array.from(lab.b)];
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
    const refChroma = Math.hypot(ref[1], ref[2]), topL = Math.max(...sideL);
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
    // A feather straddling the beard's edge: used for the box worked in and the stray-speck band. The
    // mix itself is full on the beard (no half-covered last hairs) and fades out over EDGE_WIDE past it.
    const edge = feather(region, Math.max(1, EDGE_FEATHER * iod), "centered").data;
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
    const margin = Math.round(Math.max(0.25, EDGE_WIDE + 0.05) * iod); // the box holds the whole outer band
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
    // Tone: the cheek band just above the beard, without the lit skin beside the nose wings (that
    // skin is brighter than the cheek next to the beard, and made the patch too light).
    const bandMask = dilate(region, CHEEK_BAND * iod).data;
    const wingU = [face.local(...pts[LANDMARKS.right_ala])[0], face.local(...pts[LANDMARKS.left_ala])[0]];
    const noseLo = Math.min(...wingU) - NOSE_CLEAR, noseHi = Math.max(...wingU) + NOSE_CLEAR;
    const cheekBand = [], nearNose = [], inner = [];
    for (let i = 0; i < n; i++) {
        const v = V[i];
        if (bandMask[i] >= 0.5 && coreArea[i] < 0.5 && oval[i] >= 0.5 && skin[i] >= 0.5 && skinLike(i) && v < vMouth && lips[i] < 0.5) {
            if (U[i] > noseLo && U[i] < noseHi)
                nearNose.push(i);
            else
                cheekBand.push(i);
        }
        else if (coreArea[i] >= 0.5 && oval[i] >= 0.5)
            inner.push(i);
    }
    const planes = [lab.L, lab.a, lab.b];
    const bandTone = (idx) => planes.map((pl) => (idx.length ? median(idx.map((i) => pl[i])) : NaN));
    const toneCheek = cheekBand.length >= MIN_REF_PIXELS ? bandTone(cheekBand) : bandTone([...cheekBand, ...nearNose]);
    const toneNose = bandTone(nearNose), toneBefore = bandTone(inner);
    if (!toneCheek.every(Number.isFinite))
        toneCheek.splice(0, 3, ...ref);
    const chinV = face.local(...pts[LANDMARKS.chin])[1], vNose = face.local(...pts[LANDMARKS.subnasale])[1];
    const vBottomFace = chinV > vMouth ? chinV : vMouth + 0.5;
    const chinRamp = (v) => smooth((v - vNose) / Math.max(1e-6, vBottomFace - vNose));
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
    // Her neck tone: visible neck skin just under the beard, inside the neck's width.
    const hairClear = dilate(region, BACKDROP_GAP * iod).data, neckIdx = [];
    {
        const inset = 0.15 * (neckR - neckL);
        for (let i = 0; i < n; i++)
            if (V[i] >= vBottom + NECK_ROWS[0] && V[i] <= vBottom + 2 * NECK_ROWS[1] && U[i] > neckL + inset && U[i] < neckR - inset
                && hairClear[i] < 0.5 && oval[i] < 0.5 && skinLike(i))
                neckIdx.push(i);
    }
    const toneNeck = neckIdx.length >= MIN_REF_PIXELS ? bandTone(neckIdx) : [toneCheek[0] - JAW_SHADOW_L, toneCheek[1], toneCheek[2]]; // ASSUMED fallback
    // The face under the beard: the cheek tone at the nose base, running CHIN_NECK of the way to the
    // neck tone at the chin, with the side-to-side light fitted from her cheeks, and a share of the
    // photo's own broad light and shadow there (blurred well past single hairs, centred on zero).
    // Lower-face form from THIS photo's light: mesh normals (MediaPipe z) lit by first-order SH fitted to the
    // person's clean skin. Replaces fixed chin-ball/sub-lip/dimple Gaussians (same on every face, any light).
    const p3 = pts.map(([x, y], k) => [x, y, zs[k] ?? NaN]);
    const N = normalImage(w, h, p3, landmarkNormals(p3), iod, { x0: bx0, y0: Math.max(0, by0 - Math.round(0.6 * iod)), x1: bx1, y1: by1 });
    const lowY = maskedGaussian(Float64Array.from(lab.L, (v) => ((v + 16) / 116) ** 3), new Float64Array(n).fill(1), w, h, Math.max(1, 0.04 * iod));
    const lightIdx = refIdx.filter((i) => skinLike(i) && i % w >= N.x0 && i % w <= N.x1 && Math.floor(i / w) >= N.y0 && Math.floor(i / w) <= N.y1);
    const light = fitLight(lowY, N, lightIdx.length > 6000 ? lightIdx.filter((_, k) => k % Math.ceil(lightIdx.length / 6000) === 0) : lightIdx);
    let shadeRef = 0;
    for (const i of lightIdx)
        shadeRef += lightAt(light, N.nx[i], N.ny[i], N.nz[i]);
    shadeRef = lightIdx.length ? shadeRef / lightIdx.length : 1;
    const yCheek = ((toneCheek[0] + 16) / 116) ** 3;
    const shadeAt = (i) => {
        const ratio = Math.max(0.2, lightAt(light, N.nx[i], N.ny[i], N.nz[i])) / Math.max(1e-4, shadeRef);
        const dl = lstarOf(yCheek * ratio) - toneCheek[0];
        return Math.max(light.reliable ? -9 : -3, Math.min(light.reliable ? 6 : 2, dl));
    };
    const formL = light.reliable ? 0.35 * FORM_L : FORM_L; // the fitted normals already darken the jaw underside
    // How far in from the beard's edge the estimate takes over from the fill around it.
    const blendIn = feather(region, Math.max(1, BLEND_DEPTH * iod), "inside").data;
    const formIn = feather(maskOf(w, h, oval), Math.max(1, FORM_REACH * iod), "inside").data;
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
    // 4. Skin texture from her own clean skin (Texture Law): min-cut quilting copies each pixel's pores,
    // fine lines and colour grain from exactly one donor pixel of her cheek and neck (no averaging, no
    // generated noise). The broad Lab surface still comes from the membrane model above.
    const refMask = new Float64Array(n);
    for (const i of refIdx)
        if (skinLike(i))
            refMask[i] = 1;
    const poreDonors = erode(maskOf(w, h, refMask), Math.max(2, Math.round(0.027 * iod))).data;
    // Mole guard: her moles and deep marks are identity features; donor blocks never contain one, so no
    // copied mole appears on the shaved skin.
    const marks = detectMarks(lab.L, lab.a, lab.b, refMask, w, h, iod).filter((m) => m.isMole || m.depthL >= 8);
    for (const m of marks) {
        const r = Math.ceil(m.radius * 2.5 + 0.02 * iod);
        for (let y = Math.max(0, m.y - r); y <= Math.min(h - 1, m.y + r); y++)
            for (let x = Math.max(0, m.x - r); x <= Math.min(w - 1, m.x + r); x++)
                if ((x - m.x) ** 2 + (y - m.y) ** 2 <= r * r)
                    poreDonors[y * w + x] = 0;
    }
    const poreTone = new Float64Array(n);
    for (let y = by0; y <= by1; y++)
        for (let x = bx0; x <= bx1; x++)
            poreTone[y * w + x] = sample(fillGrid[0], x, y);
    // Donors at a similar height on the same side of the face are preferred.
    const quilt = quiltOwnSkin([lab.L, lab.a, lab.b], poreDonors, coreArea, poreTone, w, h, iod, {
        seed: 37, prior: (d, t) => 0.8 * Math.abs(V[d] - V[t]) + (Math.sign(U[d]) !== Math.sign(U[t]) && Math.abs(U[t]) > 0.25 ? 0.15 : 0)
    });
    // No clean skin of her own to copy from: refuse, never invent. Below SUBPIXEL_IOD a pore is under a pixel, so
    // the photo has no resolvable skin texture to copy; the smooth fill alone is then the honest answer.
    if (!quilt && iod >= SUBPIXEL_IOD)
        return refuse("zone_not_visible");
    const quiltOr = quilt ?? { bands: [new Float64Array(n), new Float64Array(n), new Float64Array(n)], sdRatio: 0, kurtRatio: 0, blocks: 0, ms: 0 };
    const texture = quiltOr.bands, texGain = TEXTURE_GAIN;
    const cheekGrain = quiltOr.sdRatio;
    const grainSd = [quiltOr.sdRatio, quiltOr.kurtRatio, quiltOr.blocks];
    const stubbleVis = new Float64Array(n);
    // 5. Shaving shadow: where the beard was, softened.
    // (two passes over DENSITY_SOFT, so the shadow fades out at the beard's edge instead of stopping)
    const densityR = Math.max(1, Math.round(DENSITY_SOFT * iod));
    const density = maskedLowpass(maskedLowpass(Float64Array.from(clean), ones, w, h, densityR), ones, w, h, densityR);
    // Wider still for the share of her own beard left showing below full coverage.
    const ghost = maskedLowpass(density, ones, w, h, Math.max(1, Math.round(GHOST_SOFT * iod)));
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
    // The nose's lower rim: a thin band in from its outline, below the tip.
    const rimNose = feather(noseMask, Math.max(1, RIM_DEPTH * iod), "inside").data, vTip = face.local(...pts[LANDMARKS.nose_tip])[1];
    // The skin estimate at a pixel: the face (cheek-to-neck shading, given way to the fill near the
    // beard's edge) and the neck fill, split at the jaw.
    const skinAt = (x, y, i) => {
        const fs = faceShare[i] + neckShare[i] > 1e-6 ? faceShare[i] / (faceShare[i] + neckShare[i]) : 1;
        const ramp = CHIN_NECK * chinRamp(V[i]), b = blendIn[i];
        return [0, 1, 2].map((c) => {
            const model = toneCheek[c] + ramp * (toneNeck[c] - toneCheek[c]) + fits[c][1] * (U[i] - chinU) + (c === 0 ? shadeAt(i) - formL * (1 - formIn[i]) : 0);
            // The neck turns away at its sides too.
            const neckSide = c === 0 ? FORM_L * (1 - smooth(Math.min(U[i] - neckL, neckR - U[i]) / FORM_REACH)) : 0;
            return fs * ((1 - b) * sample(fillGrid[c], x, y) + b * model) + (1 - fs) * (sample(neckGrid[c], x, y) - neckSide);
        });
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
    // The outer mix: full on the beard, fading over a wide band out from its edge, so no line shows.
    const wide = feather(region, Math.max(1, EDGE_WIDE * iod), "outside").data;
    // Her skin's own broad tone around each pixel (skin past the beard only): in the band the estimate
    // moves her skin's tone, and her pores and lines stay; and hairs darker than it are found.
    const skinPx = new Float64Array(n);
    for (let y = by0; y <= by1; y++)
        for (let x = bx0; x <= bx1; x++) {
            const i = y * w + x;
            if (coreArea[i] < 0.5 && skinLike(i))
                skinPx[i] = 1;
        }
    const lowR = Math.max(2, Math.round(SKIN_LOW * iod)), skinCover = maskedLowpass(skinPx, ones, w, h, lowR);
    const skinLow = [lab.L, lab.a, lab.b].map((pl) => maskedLowpass(pl, skinPx, w, h, lowR));
    let strayPx = 0, backdropPx = 0;
    for (let y = by0; y <= by1; y++)
        for (let x = bx0; x <= bx1; x++) {
            const i = y * w + x;
            if (spared[i])
                continue;
            if (kept.data[i] >= 0.5 && keptInner[i] < 1 && hairNear[i] >= 0.5) {
                // The border blend: part of the estimate, fading to nothing a few pixels in.
                const t = (1 - keptInner[i]) * amount;
                const est = skinAt(x, y, i), fill = [knee(est[0] + TEXTURE_GAIN * texture[0][i], topL), est[1], est[2]];
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
                const rim = V[i] > vTip ? 1 - rimNose[i] : 0;
                if (!(hairNear[i] >= 0.5) && !(rim > 0))
                    continue;
                const c = Math.hypot(lab.a[i], lab.b[i]), cLocal = Math.hypot(localA[i], localB[i]);
                // Dark grey hairs, or light grey ones (not as dark as the nostril openings).
                const grey = smooth((0.6 * cLocal - c) / Math.max(1, 0.3 * cLocal));
                let tip = hairNear[i] >= 0.5 ? grey * Math.max(smooth((localL[i] - lab.L[i] - STRAY_DROP_L / 2) / STRAY_DROP_L), lab.L[i] >= localL[i] - NOSTRIL_DROP_L ? 1 : 0) : 0;
                // On the nose's lower rim (a thin band in from its outline) the skin around is the shaded
                // underside of the nose, as grey as the hair tips, so they are measured against the estimate
                // just below instead, and lifted to it less a soft crease (RIM_CREASE_L), fading in from the outline.
                if (rim > 0 && tip < 1) {
                    let yy = y;
                    while (yy < h - 1 && coreArea[yy * w + x] < 0.5 && yy - y < 3 * RIM_DEPTH * iod)
                        yy++;
                    const est = skinAt(x, yy, yy * w + x), cEst = Math.hypot(est[1], est[2]), lift = rim * smooth((RIM_CHROMA * cEst - c) / Math.max(1, 0.3 * cEst));
                    const goal = est[0] - RIM_CREASE_L;
                    if (lift > 0 && lab.L[i] < goal) {
                        const t = lift * amount;
                        lab.L[i] += t * (goal - lab.L[i]);
                        lab.a[i] += t * (est[1] - lab.a[i]);
                        lab.b[i] += t * (est[2] - lab.b[i]);
                        weight[i] = Math.max(weight[i], t);
                        strayPx++;
                    }
                }
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
            if (onBeard)
                wt = 1;
            const lowOk = skinCover[i] >= 0.2, toneOnly = !onBeard && wide[i] > 0 && skinLike(i) && lowOk;
            if (!onBeard && wide[i] > 0 && skinLike(i))
                wt = wide[i];
            // Beard hairs the search missed just past its edge on the face (a strip along the cheek line, the
            // sideburn's foot): well darker than her skin around them (or her cheek), faded out with the same band, so no
            // dark rim or straight cut is left.
            else if (!onBeard && wide[i] > 0 && oval[i] >= 0.5 && lab.L[i] < (lowOk ? Math.min(skinLow[0][i], toneCheek[0]) : toneCheek[0]) - HAIR_RIM_DROP_L) {
                // only close to the beard (the cube of the band), and faded in below the cheekbones
                wt = wide[i] ** 3 * smooth((V[i] - HAIR_RIM_V) / 0.15);
            }
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
            // Below full coverage a share of her own beard shows through; it fades out with the beard's
            // (softened) density, so the ghost has no hard edge where the hairs stopped.
            // Strength is a grooming finish: 30 removes the beard mass before stubble is added, instead of
            // blending 70% of the original hair back in.
            const removal = smooth(amount / 0.28);
            wt *= onBeard ? removal : removal * (0.55 + 0.45 * (1 - Math.min(1, ghost[i])));
            const d = Math.min(1, density[i]) * stubble;
            // Under the jaw: the shadow comes in across the soft jaw edge, then fades down the neck.
            const shade = JAW_SHADOW_L * smooth(jawShadow[i]) * (1 - jawIn[i]);
            const est = skinAt(x, y, i);
            const skinL = est[0] + texGain * texture[0][i] - STUBBLE_L * d;
            const skinT = toneOnly
                // Her own skin in the band: only its broad tone moves to the estimate's.
                ? [baseL + est[0] - STUBBLE_L * d - skinLow[0][i] - shade, baseA + est[1] - 0.3 * STUBBLE_B * d - skinLow[1][i], baseB + est[2] - STUBBLE_B * d - skinLow[2][i]]
                : [skinL - shade, est[1] + texture[1][i] - 0.3 * STUBBLE_B * d, est[2] + texture[2][i] - STUBBLE_B * d];
            // Never lighter than her brightest cheek (or this pixel's own value): a soft knee, not a flat clip, so the
            // copied pores still read in the highlights.
            skinT[0] = knee(skinT[0], toneOnly ? Math.max(baseL, topL) : topL);
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
            if ((onBeard || wide[i] > 0) && d > 0 && bgShare < 0.5)
                stubbleVis[i] = wt * Math.min(1, d / Math.max(1e-6, stubble));
            weight[i] = Math.max(wt, stray > 0 ? stray * amount : 0);
        }
    // Stubble as hairs from the person's own beard colour, on blue-noise follicles (see stubble.ts).
    const stub = renderStubble({ L: lab.L, a: lab.a, b: lab.b, original, visibility: stubbleVis, hairMask: clean, w, h, iod,
        chin: pts[LANDMARKS.chin], across: [face.ux, face.uy], down: [-face.uy, face.ux], finish, seed: 911, shadow: false });
    const toneAfter = [lab.L, lab.a, lab.b].map((pl) => inner.length ? inner.reduce((t, i) => t + pl[i], 0) / inner.length : 0);
    // The patch's top and bottom thirds (inside the jaw), after, to compare with the cheek and neck.
    let vLo = Infinity, vHi = -Infinity;
    for (const i of inner) {
        vLo = Math.min(vLo, V[i]);
        vHi = Math.max(vHi, V[i]);
    }
    const third = (vHi - vLo) / 3, mean3 = (idx) => [lab.L, lab.a, lab.b].map((pl) => (idx.length ? idx.reduce((t, i) => t + pl[i], 0) / idx.length : 0));
    const toneTop = mean3(inner.filter((i) => V[i] <= vLo + third)), toneBottom = mean3(inner.filter((i) => V[i] >= vHi - third));
    let edited = 0;
    for (let i = 0; i < n; i++)
        if (weight[i] > 0)
            edited++;
    Object.assign(metrics, { edited_pixels: edited, grain_l: grainSd.map(r3).join("/"), grid: `${gw}x${gh}`, stray_pixels: strayPx, backdrop_pixels: backdropPx,
        backdrop_l_max: r3(bgMaxL), finish: r3(finish), stubble: r3(stubble), tex_gain: r3(texGain), cheek_grain: r3(cheekGrain),
        tone_before: toneBefore.map(r3).join("/"), tone_cheek: toneCheek.map(r3).join("/"), tone_after: toneAfter.map(r3).join("/"),
        tone_nose: toneNose.map(r3).join("/"), tone_neck: toneNeck.map(r3).join("/"), tone_top: toneTop.map(r3).join("/"), tone_bottom: toneBottom.map(r3).join("/"), neck_u: `${r3(neckL)}..${r3(neckR)}`, known_cells: r4(known.reduce((s, v) => s + v, 0) / known.length),
        texture_sd_ratio: r4(quiltOr.sdRatio), texture_kurtosis_ratio: r4(quiltOr.kurtRatio), quilt_blocks: quiltOr.blocks, quilt_ms: r3(quiltOr.ms),
        texture_source: quilt ? "own_skin_quilt" : "none_subpixel",
        light_r2: r3(light.r2), light_reliable: light.reliable, follicles: stub.follicles, follicle_nn_cv: r3(stub.nnCV),
        stubble_grey_share: r3(stub.greyShare), donor_marks_excluded: marks.length });
    return { image: encode(image, lab, weight), weight, backdrop, label: FULL_LABEL, metrics };
}
