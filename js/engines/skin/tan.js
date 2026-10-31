/**
 * Tan: melanin optical density on the full visible skin, applied to the DIFFUSE part only.
 * Keeps from the earlier round: the full-skin extension (extendVisibleSkin, hair/beard/lip/eye exclusions), the
 * opt-in rule for lightening, and the low-band-only edit. Changes:
 *  - additive Lab offset (L -= 10·a) -> multiplicative melanin OD in linear light, so the change scales
 *    with the skin's own albedo (deep skin is not pushed toward orange) and shading ratios survive;
 *  - specular highlights are separated and NOT darkened (melanin sits under the surface reflection);
 *  - a sun-exposure map from mesh normals (forehead, nose, cheekbones a little more; under the jaw a little
 *    less), blurred wide so no boundary can show; neck/ears/chest share the same base;
 *  - the change is low-frequency colour only (lowBandOnly): the person's own high band is carried through;
 *  - render-time hue-band check: mean skin hue may move <= 6 degrees, chroma may rise <= 30%.
 * The flat model the Python port mirrors is kept in tan-flat.ts. Author: John Khan.
 */
import { SHIFTS } from "./glow-tan.js";
import { checkPhoto, checkStrength, NOTE, unchanged } from "./common.js";
import { extendVisibleSkin } from "./full-skin.js";
import { lowBandOnly } from "./texture-law.js";
import { clamp, gaussian, linearPlanes, linToLab, lumLin, lstarOf, now, writeLinear } from "../core/bands.js";
import { landmarkNormals, normalImage, toP3 } from "../core/light-model.js";
import { odForDeltaL, spectrum } from "../core/pigment.js";
export const DIRECTIONS = ["add", "remove"];
export const REMOVE_L = 3.0;
export const ADD_DEPTH_L = 9.0; // L* at strength 100 on mid-tone skin (before exposure map)
export const ADD_SHIFT_SCALE = 2.0; // kept for API compatibility (unused by the melanin model)
export const ADD_LABEL = "Tan simulation; not a UV exposure guide. Skin texture and highlights retained. " + NOTE;
export const REMOVE_LABEL = "Tan removal simulation, chosen by you: this lightens skin. " + NOTE;
export const LIGHTENING_CODE = "lightening_needs_opt_in";
export class LighteningNotChosen extends RangeError {
    code = LIGHTENING_CODE;
    constructor() { super("Tan removal lightens skin, so it runs only when you turn it on."); }
}
/** Undertone -> pheomelanin fraction (ASSUMED mapping; "warm" is redder/yellower melanin). */
const PHEO = { neutral: 0.3, warm: 0.42, olive: 0.25, cool: 0.2 };
export function tan(image, skin, direction = "add", strength = 30, undertone = "neutral", allowLightening = false, context = {}) {
    const t0 = now();
    checkPhoto(image);
    const amount = checkStrength(strength), { width: w, height: h } = image, n = w * h;
    if (skin.length !== n)
        throw new RangeError("skin mask dimensions mismatch");
    if (!DIRECTIONS.includes(direction))
        throw new RangeError("direction must be add or remove");
    if (!(undertone in SHIFTS))
        throw new RangeError("undertone must be olive, cool, warm or neutral");
    if (direction === "remove" && allowLightening !== true)
        throw new LighteningNotChosen();
    if (amount === 0)
        return unchanged(image, direction === "add" ? ADD_LABEL : REMOVE_LABEL, { direction, render_ms: now() - t0 });
    const exclusions = new Float64Array(n);
    for (const mask of [context.hair, context.beard, context.lips, context.eyes])
        if (mask) {
            if (mask.length !== n)
                throw new RangeError("tan exclusion mask dimensions mismatch");
            for (let i = 0; i < n; i++)
                exclusions[i] = Math.max(exclusions[i], clamp(mask[i]));
        }
    const extent = extendVisibleSkin(image, skin, exclusions);
    const alpha = extent.alpha;
    const lin = linearPlanes(image);
    // diffuse / specular split: bright, low-chroma excess over the local low band is surface reflection
    const Y = new Float64Array(n);
    for (let i = 0; i < n; i++)
        Y[i] = lumLin(lin[0][i], lin[1][i], lin[2][i]);
    let iod = Math.min(w, h) / 6;
    let exposure = new Float64Array(n).fill(1);
    let faceMid = -1, chinY = -1;
    if (context.mesh && context.mesh.length >= 468) {
        const p = context.mesh.map(toP3);
        iod = Math.hypot(p[263][0] - p[33][0], p[263][1] - p[33][1]);
        const N = normalImage(w, h, p, landmarkNormals(p), iod, { x0: 0, y0: 0, x1: w - 1, y1: h - 1 });
        const sun = [0, -0.45, 0.89]; // from above and in front (ASSUMED typical sun exposure)
        const raw = new Float64Array(n);
        for (let i = 0; i < n; i++)
            raw[i] = 0.8 + 0.35 * clamp(N.nx[i] * sun[0] + N.ny[i] * sun[1] + N.nz[i] * sun[2]);
        exposure = gaussian(raw, w, h, Math.max(2, 0.15 * iod));
        faceMid = p[1][1];
        chinY = p[152][1];
    }
    const lowY = gaussian(Y, w, h, Math.max(1.5, 0.03 * iod));
    const lowLin = lin.map((pl) => gaussian(pl, w, h, Math.max(1.5, 0.03 * iod)));
    const pheo = PHEO[undertone] ?? 0.3, spec = spectrum(pheo);
    const sign = direction === "add" ? 1 : -1, targetL = direction === "add" ? ADD_DEPTH_L : REMOVE_L;
    // OD field computed on the smooth low band, so it is smooth itself (no texture is created)
    // OD per unit ΔL* as a function of skin L* (LUT on the person's median skin chromaticity): one Newton
    // solve per L* level instead of per pixel, so the phone budget holds.
    const med = [0, 0, 0];
    let mc = 0;
    for (let i = 0; i < n; i += 5)
        if (alpha[i] > 0.9) {
            med[0] += lowLin[0][i];
            med[1] += lowLin[1][i];
            med[2] += lowLin[2][i];
            mc++;
        }
    if (!mc)
        return unchanged(image, direction === "add" ? ADD_LABEL : REMOVE_LABEL, { direction, reason: "no skin", render_ms: now() - t0 });
    const medY = lumLin(med[0] / mc, med[1] / mc, med[2] / mc) || 1e-4;
    const slope = new Float64Array(101);
    for (let Ls = 0; Ls <= 100; Ls++) {
        const yv = Ls > 8 ? ((Ls + 16) / 116) ** 3 : Ls / (24389 / 27), k = yv / medY;
        slope[Ls] = Ls < 3 ? 0 : odForDeltaL(med[0] / mc * k, med[1] / mc * k, med[2] / mc * k, 4, pheo) / 4;
    }
    const odRaw = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        if (alpha[i] < 0.002)
            continue;
        const Ls = Math.max(0, Math.min(100, Math.round(lstarOf(lowY[i]))));
        odRaw[i] = slope[Ls] * targetL * amount * exposure[i] * alpha[i];
    }
    const od = gaussian(odRaw, w, h, 1.0);
    const labBefore = { a: 0, b: 0, c: 0, n: 0 }, labAfter = { a: 0, b: 0, c: 0, n: 0 };
    const faceNeck = { fb: 0, fa: 0, nb: 0, na: 0, fn: 0, nn: 0 };
    const weight = new Float64Array(n);
    let changed = 0;
    for (let i = 0; i < n; i++) {
        if (alpha[i] < 0.002 || od[i] <= 0)
            continue;
        const r = lin[0][i], g = lin[1][i], b = lin[2][i];
        const chroma = Math.hypot(r - g, b - g) / Math.max(1e-4, Y[i]);
        const specFrac = clamp((Y[i] / Math.max(1e-4, lowY[i]) - 1.12) / 0.35) * clamp(1 - chroma / 0.25) * 0.6;
        const k = [0, 1, 2].map((c) => Math.pow(10, -sign * od[i] * spec[c]));
        lin[0][i] = r * ((1 - specFrac) * k[0] + specFrac);
        lin[1][i] = g * ((1 - specFrac) * k[1] + specFrac);
        lin[2][i] = b * ((1 - specFrac) * k[2] + specFrac);
        weight[i] = alpha[i];
        changed++;
        if (alpha[i] > 0.9 && i % 7 === 0) {
            const b0 = linToLab(lowLin[0][i], lowLin[1][i], lowLin[2][i]), a0 = linToLab(lowLin[0][i] * k[0], lowLin[1][i] * k[1], lowLin[2][i] * k[2]);
            labBefore.a += b0[1];
            labBefore.b += b0[2];
            labBefore.c += Math.hypot(b0[1], b0[2]);
            labBefore.n++;
            labAfter.a += a0[1];
            labAfter.b += a0[2];
            labAfter.c += Math.hypot(a0[1], a0[2]);
            labAfter.n++;
            if (faceMid >= 0) {
                const y = Math.floor(i / w);
                if (y > faceMid && y < chinY) {
                    faceNeck.fb += b0[0];
                    faceNeck.fa += a0[0];
                    faceNeck.fn++;
                }
                else if (y > chinY + 0.15 * iod) {
                    faceNeck.nb += b0[0];
                    faceNeck.na += a0[0];
                    faceNeck.nn++;
                }
            }
        }
    }
    // Texture Law: the melanin change is applied as low-frequency colour only; the person's own high band is kept
    // at its original amplitude (a multiplicative darkening would otherwise shrink pores by the same factor).
    const out = lowBandOnly(image, writeLinear(image, lin, weight), Math.max(1.5, 0.02 * iod), undefined, gaussian);
    const hueShift = labBefore.n ? Math.abs(Math.atan2(labAfter.b, labAfter.a) - Math.atan2(labBefore.b, labBefore.a)) * 180 / Math.PI : 0;
    const chromaRise = labBefore.c > 0 ? labAfter.c / labBefore.c - 1 : 0;
    const continuity = faceNeck.fn > 50 && faceNeck.nn > 50
        ? Math.abs((faceNeck.fa / faceNeck.fn - faceNeck.na / faceNeck.nn) - (faceNeck.fb / faceNeck.fn - faceNeck.nb / faceNeck.nn)) : null;
    return { image: out, weight, label: direction === "add" ? ADD_LABEL : REMOVE_LABEL, metrics: {
            direction, undertone, lightens: direction === "remove", edited_pixels: changed, expanded_skin_pixels: extent.expandedPixels,
            skin_coverage_verified: extent.coverageComplete, skin_confidence: Math.round(extent.confidence * 1000) / 1000,
            hue_shift_deg: Math.round(hueShift * 100) / 100, chroma_rise: Math.round(chromaRise * 1000) / 1000,
            face_neck_step_l: continuity === null ? "unmeasured" : Math.round(continuity * 100) / 100,
            exposure_map: context.mesh ? "mesh_normals" : "uniform", texture_source: "own_photo", render_ms: now() - t0
        } };
}
