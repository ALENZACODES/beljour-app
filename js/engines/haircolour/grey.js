/** #20 Grey removal and #102 Grey Transition decision previews, local, on her marked hair.
 * Mirrors api/plumb_api/engines/haircolour/grey.py: grey strands are low-chroma pixels well
 * lighter than her natural shade (read in two passes from her own non-grey hair, or given);
 * "cover" takes her greys to her natural shade, "blend" makes part of that move, "silver"
 * takes her pigmented strands to her own measured grey. Lightness stays an increasing
 * affine map of the old lightness (the curl-preserving recolour rule), nothing outside the
 * mask changes, alpha is copied, strength 0 is a copy, refusals are coded. No age is asked
 * or inferred. Shares and ramps are ASSUMED. Colour simulation, not a salon result.
 * Author: John Khan.
 */
import { labToSrgb, srgbToLab, toByte } from "../shade/colourspace.js";
import { median } from "../skin/common.js";
import { percentile } from "../teeth/natural.js";
import { textureGain } from "./recolour.js";
export const MODULE = "haircolour.grey";
export const MODE = "Grey Transition";
export const STAGES = ["cover", "blend", "silver"];
export const GREY_CHROMA = 8.0, CHROMA_RAMP = 8.0, LIGHT_GAP = 15.0, LIGHT_RAMP = 15.0, BLEND_SHARE = 0.55;
export const NO_GREY_SHARE = 0.01, NATURAL_SHARE = 0.25, STRICT_SHARE = 0.5, GREY_MIN_L = 45.0, MIN_HAIR_PIXELS = 64, MIN_COLOURED_PIXELS = 32;
export const LABELS = Object.freeze({
    cover: "Full colour: your greys in your natural shade. Regrowth shows at the roots, so this look needs regular touch-ups.",
    blend: "Grey blending: part of your silver kept as soft highlights, so regrowth shows less between visits.",
    silver: "Going silver: your hair shown in your own grey, as after a full grow-out. No colour upkeep; the grow-out itself takes months.",
});
export const NOTE = "Colour simulation and salon-decision aid, not a salon result.";
export const MESSAGES = Object.freeze({
    no_hair_marked: "Mark your hair first; it is never guessed from the photo.",
    no_grey_found: "No grey strands were found in the hair you marked, so nothing was changed.",
    natural_shade_unknown: "Too little of your natural colour is visible to read it. Choose your natural shade, for example from your roots.",
});
export function isGreyRefusal(value) {
    return value.refused === true;
}
const clamp01 = (v) => Math.min(1, Math.max(0, v));
/** 0..1 grey weight of one pixel inside the hair. */
export function greyWeight(lab, naturalL) {
    const low = clamp01((GREY_CHROMA + CHROMA_RAMP / 2 - Math.hypot(lab[1], lab[2])) / CHROMA_RAMP);
    return low * clamp01((lab[0] - naturalL - LIGHT_GAP) / LIGHT_RAMP);
}
export function greyPreview(image, mask, options = {}) {
    const { width: w, height: h, channels: ch } = image, n = w * h;
    if (!Number.isInteger(w) || !Number.isInteger(h) || Math.min(w, h) < 2 || (ch !== 3 && ch !== 4) || image.data.length !== n * ch) {
        throw new RangeError("grey preview needs an RGB or RGBA photo");
    }
    if (mask.length !== n)
        throw new RangeError("hair mask must match the photo and hold values in 0..1");
    for (let i = 0; i < n; i++)
        if (!(mask[i] >= 0 && mask[i] <= 1))
            throw new RangeError("hair mask must match the photo and hold values in 0..1");
    const stage = options.stage ?? "cover", strength = options.strength ?? 30;
    if (!Number.isFinite(strength) || strength < 0 || strength > 100)
        throw new RangeError("strength must be 0..100");
    if (!STAGES.includes(stage))
        throw new RangeError(`stage must be one of ${STAGES.join(", ")}`);
    const given = options.naturalLab;
    if (given && (given.length !== 3 || !given.every(Number.isFinite) || given[0] < 0 || given[0] > 100)) {
        throw new RangeError("natural shade must be one finite Lab triple with L* in 0..100");
    }
    const refuse = (code) => ({ refused: true, module: MODULE, code, message: MESSAGES[code] });
    const hairIdx = [];
    for (let i = 0; i < n; i++)
        if (mask[i] >= 0.5)
            hairIdx.push(i);
    if (hairIdx.length < MIN_HAIR_PIXELS)
        return refuse("no_hair_marked");
    const lab = new Array(n);
    for (let i = 0; i < n; i++)
        lab[i] = srgbToLab([Number(image.data[i * ch]), Number(image.data[i * ch + 1]), Number(image.data[i * ch + 2])]);
    const medianLab = (idx) => [0, 1, 2].map(c => median(idx.map(i => lab[i][c])));
    let natural;
    if (given)
        natural = [...given];
    else {
        const cut = percentile(hairIdx.map(i => lab[i][0]), 100 * NATURAL_SHARE);
        const first = medianLab(hairIdx.filter(i => lab[i][0] <= cut));
        const coloured = hairIdx.filter(i => Math.hypot(lab[i][1], lab[i][2]) > GREY_CHROMA + CHROMA_RAMP / 2).length;
        if (coloured < MIN_COLOURED_PIXELS && Math.hypot(first[1], first[2]) <= GREY_CHROMA + CHROMA_RAMP / 2 && first[0] > GREY_MIN_L) {
            return refuse("natural_shade_unknown");
        }
        natural = medianLab(hairIdx.filter(i => greyWeight(lab[i], first[0] - STRICT_SHARE * LIGHT_GAP) === 0));
    }
    const grey = new Float64Array(n);
    for (const i of hairIdx)
        grey[i] = greyWeight(lab[i], natural[0]);
    const greyish = hairIdx.filter(i => grey[i] >= 0.5);
    const share = greyish.length / hairIdx.length;
    const metrics = { mode: MODE, stage, grey_share: Math.round(share * 1e4) / 1e4,
        natural_l: Math.round(natural[0] * 1e3) / 1e3, natural_from: given ? "given" : "measured" };
    if (share < NO_GREY_SHARE)
        return refuse("no_grey_found");
    const label = `${MODE}. ${LABELS[stage]} ${NOTE}`;
    const copy = () => ({ image: Uint8Array.from(image.data), weight: new Float64Array(n), label, metrics: { ...metrics, unchanged: true } });
    if (strength === 0)
        return copy();
    const amount = strength / 100, weight = new Float64Array(n);
    let target, group;
    if (stage === "silver") {
        group = hairIdx.filter(i => !(grey[i] >= 0.5));
        if (!group.length)
            return copy();
        target = medianLab(greyish);
        for (const i of hairIdx)
            weight[i] = mask[i] * (1 - grey[i]) * amount;
    }
    else {
        group = greyish;
        target = natural;
        for (const i of hairIdx)
            weight[i] = mask[i] * grey[i] * amount * (stage === "blend" ? BLEND_SHARE : 1);
    }
    let meanL = 0;
    for (const i of group)
        meanL += lab[i][0];
    meanL /= group.length;
    const gain = textureGain(meanL, target[0]), out = Uint8Array.from(image.data);
    let moved = 0;
    for (let i = 0; i < n; i++) {
        const wgt = weight[i];
        if (!(wgt > 0))
            continue;
        const L = Math.min(100, Math.max(0, target[0] + gain * (lab[i][0] - meanL)));
        const shade = Math.min(1.25, Math.max(0.35, L / Math.max(target[0], 1)));
        const next = [L, target[1] * shade, target[2] * shade];
        const rgb = labToSrgb([0, 1, 2].map(c => lab[i][c] + (next[c] - lab[i][c]) * wgt));
        for (let c = 0; c < 3; c++)
            out[i * ch + c] = toByte(rgb[c]);
        moved++;
    }
    Object.assign(metrics, { target_l: Math.round(target[0] * 1e3) / 1e3, moved_pixels: moved });
    return { image: out, weight, label, metrics };
}
