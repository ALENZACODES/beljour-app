/** Skin smoothing and foundation, on the skin map of face-regions.ts.
 *
 * Both split lightness into three bands, the way a retoucher's frequency separation does:
 *   base  - an edge-preserving (guided filter) version of the skin: the face's shape and light;
 *   mid   - blur(L, fine) - base: blotches, spots, uneven texture and shine;
 *   fine  - L - blur(L, fine): pores and fine grain, about one pixel per 100 px of eye distance.
 * Smoothing turns the mid band down hard and the fine band down a little, so pores stay.
 * Foundation also pulls the skin's local colour toward her matched shade (her own measured skin
 * by default, never a lighter one unless she chose it) and evens patchy lightness while keeping
 * the broad light and shadow that give the face its shape.
 * Neither tool lifts the average lightness of her skin: any average rise is taken back.
 * Local simulation, not medical advice.
 * Author: John Khan.
 */
import { amountOf, blur, guided, maskedBlur, rgbToLab, writeLab } from "./photo-ops.js";
import { meshProblem, pt, skinMap, toFace, toPhoto } from "./face-regions.js";
/** Her neck colour just below the jaw, the place a foundation shade is matched, as median Lab;
 * null when that spot is off the photo or is not skin-like (a collar, a beard, a scarf). */
export function neckColour(image, mesh, map) {
    const f = map.frame, [, chinV] = toFace(f, ...pt(mesh, 152)), [cx, cy] = toPhoto(f, 0, chinV + 0.42), r = 0.14 * f.iod;
    const Ls = [], As = [], Bs = [];
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
        for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
            if (x < 0 || y < 0 || x >= image.width || y >= image.height || (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 > r * r)
                continue;
            const p = (y * image.width + x) * image.channels, lab = rgbToLab(image.data[p], image.data[p + 1], image.data[p + 2]);
            Ls.push(lab[0]);
            As.push(lab[1]);
            Bs.push(lab[2]);
        }
    if (Ls.length < 20)
        return null;
    const mid = (v) => v.sort((p, q) => p - q)[v.length >> 1];
    const neck = [mid(Ls), mid(As), mid(Bs)], st = map.stats;
    const skinLike = Math.abs(neck[0] - st.L) < 18 && Math.abs(neck[1] - st.a) < 3 * st.sa + 6 && Math.abs(neck[2] - st.b) < 3 * st.sb + 6;
    return skinLike ? neck : null;
}
export const SMOOTH_LABEL = "Skin smoothing simulation: pores and marks kept. Not medical advice.";
export const FOUNDATION_LABEL = "Foundation simulation in your matched shade, never lighter than your skin. Not medical advice.";
export function isRetouchRefusal(value) {
    return value.refused === true;
}
function bands(map) {
    const { rect, lab, frame } = map, n = rect.w * rect.h, g = new Float32Array(n);
    for (let i = 0; i < n; i++)
        g[i] = lab.L[i] / 100;
    const base = guided(g, g, rect.w, rect.h, Math.max(2, Math.round(0.075 * frame.iod)), 0.0028);
    const soft = blur(lab.L, rect.w, rect.h, Math.max(0.7, 0.009 * frame.iod));
    const mid = new Float32Array(n), fine = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        base[i] *= 100;
        mid[i] = soft[i] - base[i];
        fine[i] = lab.L[i] - soft[i];
    }
    return { base, mid, fine };
}
/** Takes back any rise of her skin's average lightness (weighted by the mask). */
function keepAverage(map, L) {
    let rise = 0, total = 0;
    for (let i = 0; i < L.length; i++) {
        rise += map.skin[i] * (L[i] - map.lab.L[i]);
        total += map.skin[i];
    }
    const mean = total > 0 ? rise / total : 0;
    if (mean > 0)
        for (let i = 0; i < L.length; i++)
            L[i] -= mean;
    return mean > 0 ? mean : 0;
}
function prepare(image, mesh, masks) {
    const problem = meshProblem(mesh, image.width, image.height);
    if (problem)
        return { refused: true, code: "mesh", message: problem };
    try {
        return skinMap(image, mesh, masks);
    }
    catch (error) {
        if (error instanceof RangeError)
            return { refused: true, code: "no_skin", message: error.message };
        throw error;
    }
}
/** Skin smoothing: strength 0..100. Spots and blotches fade, pores stay. */
export function smoothSkin(image, mesh, strength, masks = {}) {
    const e = amountOf(strength);
    if (e === 0)
        return { image: Uint8Array.from(image.data), label: SMOOTH_LABEL, metrics: { unchanged: true } };
    const map = prepare(image, mesh, masks);
    if ("refused" in map)
        return map;
    const { rect, lab, frame } = map, n = rect.w * rect.h, { base, mid, fine } = bands(map);
    const L = new Float32Array(n);
    for (let i = 0; i < n; i++)
        L[i] = base[i] + mid[i] * (1 - 0.92 * e) + fine[i] * (1 - 0.3 * e);
    // Colour noise and small red patches: chroma toward a softer version of itself.
    const sa = maskedBlur(lab.a, map.skin, rect.w, rect.h, 0.035 * frame.iod), sb = maskedBlur(lab.b, map.skin, rect.w, rect.h, 0.035 * frame.iod);
    const a = new Float32Array(n), b = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        a[i] = lab.a[i] + 0.7 * e * (sa[i] - lab.a[i]);
        b[i] = lab.b[i] + 0.7 * e * (sb[i] - lab.b[i]);
    }
    const taken = keepAverage(map, L);
    const out = writeLab(image, { rect, L, a, b }, map.skin);
    return { image: out, label: SMOOTH_LABEL, metrics: { amount: Math.round(e * 1000) / 1000, average_rise_removed: Math.round(taken * 1000) / 1000,
            skin_l: Math.round(map.stats.L * 10) / 10 } };
}
/** Foundation: strength is coverage, 0..100. */
export function applyFoundation(image, mesh, strength, options = {}) {
    const c = amountOf(strength);
    if (c === 0)
        return { image: Uint8Array.from(image.data), label: FOUNDATION_LABEL, metrics: { unchanged: true } };
    const map = prepare(image, mesh, options);
    if ("refused" in map)
        return map;
    const { rect, lab, frame, stats } = map, n = rect.w * rect.h, bandsNow = bands(map), { fine } = bandsNow;
    // The edge-keeping base can keep pore-scale detail on deep or high-contrast skin; then "mid" holds that detail
    // with its sign flipped and evening it SHARPENED the pores (texture 1.17 on the deep-skin sample, makeup workstream,
    // Oct 30). The base is softened a little so the mid band only ever holds blotches, never pores.
    const base = blur(bandsNow.base, rect.w, rect.h, 0.012 * frame.iod), mid = new Float32Array(n);
    for (let i = 0; i < n; i++)
        mid[i] = bandsNow.base[i] + bandsNow.mid[i] - base[i];
    const neck = options.shade ? null : neckColour(image, mesh, map);
    // Default shade: her own skin without its redness, half way to her neck when the neck shows.
    const shade = options.shade ?? (neck ? [stats.L, (stats.baseA + neck[1]) / 2, (stats.b + neck[2]) / 2] : [stats.L, stats.baseA, stats.b]);
    if (!shade.every(Number.isFinite))
        throw new RangeError("Foundation shade must be a Lab colour.");
    const lighter = shade[0] > stats.L && options.allowLighter === true;
    const targetL = lighter ? shade[0] : Math.min(shade[0], stats.L);
    const near = maskedBlur(lab.L, map.skin, rect.w, rect.h, 0.06 * frame.iod);
    const broad = maskedBlur(lab.L, map.skin, rect.w, rect.h, 0.4 * frame.iod);
    const la = maskedBlur(lab.a, map.skin, rect.w, rect.h, 0.06 * frame.iod), lb = maskedBlur(lab.b, map.skin, rect.w, rect.h, 0.06 * frame.iod);
    const L = new Float32Array(n), a = new Float32Array(n), b = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        // Patchy lightness (darker patches, shine) evened; broad light and shadow kept. Shine goes more.
        const patch = near[i] - broad[i];
        const even = patch > 0 ? 0.75 : 0.55;
        L[i] = base[i] + mid[i] * (1 - 0.7 * c) + fine[i] * (1 - 0.04 * c) - c * even * patch;
        // A shade other than her own moves the whole tone by its difference, at coverage.
        L[i] += c * 0.8 * (targetL - stats.L);
        a[i] = lab.a[i] + c * 0.65 * (shade[1] - la[i]);
        b[i] = lab.b[i] + c * 0.65 * (shade[2] - lb[i]);
    }
    const taken = lighter ? 0 : keepAverage(map, L);
    const out = writeLab(image, { rect, L, a, b }, map.skin);
    return { image: out, label: FOUNDATION_LABEL, metrics: { coverage: Math.round(c * 1000) / 1000,
            shade_l: Math.round(targetL * 10) / 10, shade_a: Math.round(shade[1] * 10) / 10, shade_b: Math.round(shade[2] * 10) / 10,
            measured_l: Math.round(stats.L * 10) / 10, neck_matched: neck !== null, average_rise_removed: Math.round(taken * 1000) / 1000, lighter_chosen: lighter } };
}
