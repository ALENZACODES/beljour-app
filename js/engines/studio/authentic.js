/** Authenticity mode for dating photos (women-first rule 11): light, contrast and crop only,
 * then the Still Her check (lightness, colour and texture against her own photo) before
 * anything is shown. Mirrors api/plumb_api/engines/studio/authentic.py. Author: John Khan.
 */
import { pixelLab } from "../core/colour.js";
import { toByte } from "../shade/colourspace.js";
import { box, faceBox, faceRange, finish, grey, personMask, photo, strength, StudioRefusal } from "./common.js";
import { crops } from "./headshot.js";
import { applyLight } from "./relight.js";
export const CONTRAST = 0.12;
export const LIGHT = 0.25;
export const MAX_LIGHTER = 1.0;
export const MAX_SHIFT = 3.0;
export const TEXTURE = [0.9, 1.25];
export const LABEL = "Authenticity mode: light, contrast and crop of your own photo. No reshaping, smoothing or generated pixels.";
function texture(rgb, region, width, height) {
    const g = grey(rgb), m = box(g, width, height, 2);
    let num = 0, den = 0;
    for (let i = 0; i < g.length; i++) {
        const f = g[i] - m[i];
        num += f * f * region[i];
        den += region[i];
    }
    return Math.sqrt(num / den);
}
export function stillHer(before, after, region, width, height) {
    const lab0 = [0, 0, 0], lab1 = [0, 0, 0], tmp = [0, 0, 0];
    const rounded = after.map(toByte);
    let n = 0;
    for (let i = 0; i < region.length; i++) {
        if (!(region[i] > 0))
            continue;
        pixelLab(before[i * 3], before[i * 3 + 1], before[i * 3 + 2], tmp);
        for (let k = 0; k < 3; k++)
            lab0[k] += tmp[k];
        pixelLab(rounded[i * 3], rounded[i * 3 + 1], rounded[i * 3 + 2], tmp);
        for (let k = 0; k < 3; k++)
            lab1[k] += tmp[k];
        n++;
    }
    const d = lab0.map((v, k) => (lab1[k] - v) / n);
    const ratio = texture(rounded, region, width, height) / Math.max(texture(before, region, width, height), 1e-9);
    const lighter = d[0], shift = Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]);
    const ok = lighter <= MAX_LIGHTER && shift <= MAX_SHIFT && ratio >= TEXTURE[0] && ratio <= TEXTURE[1];
    return { still_her: ok, lightness_change: lighter, colour_shift: shift, texture_ratio: ratio };
}
export function authenticity(image, coarse, points, amount = 60) {
    const p = photo(image), { width: w, height: h } = p;
    const share = strength(amount);
    const person = personMask(coarse, w, h);
    const faceRect = faceBox(points);
    const [r0, r1, c0, c1] = faceRange(faceRect, w, h);
    const region = new Float64Array(w * h);
    let count = 0;
    for (let y = r0; y < r1; y++)
        for (let x = c0; x < c1; x++) {
            const i = y * w + x;
            region[i] = person[i] >= 0.5 ? 1 : 0;
            count += region[i];
        }
    if (count < 16)
        throw new StudioRefusal("face_outside_person", "Her face points are outside the person area.");
    const pivot = [0, 0, 0];
    for (let i = 0; i < region.length; i++)
        for (let k = 0; k < 3; k++)
            pivot[k] += p.rgb[i * 3 + k] * region[i];
    for (let k = 0; k < 3; k++)
        pivot[k] /= count;
    const enhanced = new Float64Array(p.rgb.length);
    for (let i = 0; i < region.length; i++)
        for (let k = 0; k < 3; k++) {
            enhanced[i * 3 + k] = Math.min(255, Math.max(0, pivot[k] + (p.rgb[i * 3 + k] - pivot[k]) * (1 + CONTRAST * share)));
        }
    const lit = applyLight(enhanced, person, w, h, faceRect, "upper-left", LIGHT * share);
    const check = stillHer(p.rgb, lit.rgb, region, w, h);
    if (!check.still_her)
        throw new StudioRefusal("still_her_failed", "The result moved too far from her own colour, lightness or texture.");
    const out = finish(lit.rgb, p.alpha);
    return { image: out.data, channels: out.channels, label: LABEL, crops: crops(faceRect, w, h).filter((c) => c[0] === "portrait-4x5"),
        metrics: { tool: "authentic", ...check, gain_before_balance: lit.raw } };
}
