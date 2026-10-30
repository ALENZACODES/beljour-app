/** The seven painted retouch brushes (reshape is in reshape.ts). Each one calls an engine the
 * repo already has and then mixes its result in through the painted mask, in linear light, so a
 * pixel the mask doesn't reach keeps its exact bytes:
 *   heal     the fill engine's PatchMatch-lite (engines/fill) on the painted spot, from the skin around it
 *   smooth   the portrait looks' texture-preserving polish (filters/portrait/polish.ts), marks held
 *   whiten   the teeth engines' enamel test and natural cap (engines/teeth/whiten.ts, natural.ts)
 *   details  the portrait looks' feature definition, the filter engine's structure op
 *   relight  dodge and burn as the studio relight's gain, capped (engines/studio/relight.ts)
 *   blur     the studio's soft blur (engines/studio/common.ts), radius capped as background blur is
 *   colour   the colour's hue on each pixel's own L*, then the skin engines' no-lighten pass
 *            (engines/skin/common.ts) so no pixel ends up lighter
 * Author: John Khan.
 */
import { SRGB_TO_LINEAR, encodeChannel, floatImage, requireColour, roundHalfEven } from "../../engines/core/buffer.js";
import { hexToRgb } from "../../engines/core/colour.js";
import { fill } from "../../engines/fill/fill.js";
import { MAX_B_DROP, MAX_LIFT, NATURAL_L_CAP, ROUNDING_PASSES, ROUNDING_STEP, WARM_B } from "../../engines/teeth/natural.js";
import { labToSrgb, srgbToLab, toByte as toLabByte } from "../../engines/shade/colourspace.js";
import { MAX_GAIN } from "../../engines/studio/relight.js";
import { BLUR_MAX } from "../../engines/studio/blur.js";
import { radiusFor, softBlur } from "../../engines/studio/common.js";
import { noLighten } from "../../engines/skin/common.js";
import { DEFINITION, markMask, polish } from "../../filters/portrait/polish.js";
import { structure, structureRadius } from "../../filters/spatial/structure.js";
import { toBytes } from "../../filters/colour/lut.js";
import { wholeFrame } from "../../filters/runtime/engine.js";
import { findMarks } from "../../layout/still-you.js";
import { maskBox } from "./mask.js";
/** Strongest dodge or burn at full strength and full mask, as a share of linear light: twice the
 * studio relight's key-light cap, since it is painted only where she chooses; ASSUMED. */
export const RELIGHT_MAX = 2 * MAX_GAIN;
/** With no face points, the eye distance the smoothing and mark finder assume: a quarter of the
 * photo's shorter side, as in a head-and-shoulders portrait; ASSUMED. */
export const FALLBACK_IOD_SHARE = 0.25;
/** Fill reaches out this many brush-free pixels around the painted spot for its source patches; ASSUMED. */
export const HEAL_MARGIN = 3;
/** Mask level that counts as part of the hole to fill; softer edges blend toward the fill. */
export const HEAL_LEVEL = 0.2;
const clamp01 = (v) => Math.min(1, Math.max(0, v));
/** A mapped copy in a plain loop (a typed array's own mapped `from` is several times slower). */
function mapped(out, src, fn) {
    for (let i = 0; i < src.length; i++)
        out[i] = fn(src[i]);
    return out;
}
/** Linear light to an sRGB byte, rounded half to even. */
const linearByte = (v) => roundHalfEven(Math.min(255, Math.max(0, encodeChannel(v) * 255)));
function rgbOnly(img) {
    requireColour(img);
    if (img.channels === 3)
        return Uint8Array.from(img.data);
    const out = new Uint8Array(img.width * img.height * 3);
    for (let i = 0; i < img.width * img.height; i++)
        for (let c = 0; c < 3; c++)
            out[i * 3 + c] = img.data[i * 4 + c];
    return out;
}
/** An RGB copy of the photo. */
export function rgbImage(img) {
    return { width: img.width, height: img.height, channels: 3, data: rgbOnly(img) };
}
/** base + (effect - base) * weight, per pixel in linear light, rounded half to even; where the
 * weight is 0 the base bytes are copied unchanged. RGB out. */
export function mixWeighted(base, effect, weight) {
    requireColour(base);
    const n = base.width * base.height, bc = base.channels;
    if (effect.length !== n * 3 || weight.length !== n)
        throw new RangeError("effect and weight must match the photo");
    const out = new Uint8Array(n * 3);
    for (let i = 0; i < n; i++) {
        const w = clamp01(weight[i]);
        for (let c = 0; c < 3; c++) {
            const b = base.data[i * bc + c];
            if (!(w > 0)) {
                out[i * 3 + c] = b;
                continue;
            }
            const e = effect[i * 3 + c];
            const lin = SRGB_TO_LINEAR[b] + w * (SRGB_TO_LINEAR[e] - SRGB_TO_LINEAR[b]);
            out[i * 3 + c] = linearByte(lin);
        }
    }
    return { width: base.width, height: base.height, channels: 3, data: out };
}
function scaled(mask, amount) {
    return mapped(new Float32Array(mask.data.length), mask.data, (v) => clamp01(v) * amount);
}
export function fallbackIod(width, height) {
    return Math.max(8, FALLBACK_IOD_SHARE * Math.min(width, height));
}
/** Filled crops kept between renders, keyed by the crop's own pixels and hole: when a stroke is
 * added, the strokes before it see the same pixels and are not filled again. */
const FILLS = new Map();
export const FILL_CACHE_SIZE = 48;
function fnv(bytes, seed = 2166136261) {
    let h = seed >>> 0;
    for (let i = 0; i < bytes.length; i++) {
        h ^= bytes[i];
        h = Math.imul(h, 16777619) >>> 0;
    }
    return h;
}
function cachedFill(crop, hole) {
    const key = `${crop.width}x${crop.height}:${fnv(crop.data).toString(36)}:${fnv(mapped(new Uint8Array(hole.data.length), hole.data, (v) => (v > 0 ? 1 : 0))).toString(36)}`;
    const hit = FILLS.get(key);
    if (hit) {
        FILLS.delete(key);
        FILLS.set(key, hit);
        return hit;
    }
    const out = Uint8Array.from(fill(crop, hole, "patchmatch", { grow: 1, patchRadius: 3, iterations: 5, seed: 1 }).image.data);
    FILLS.set(key, out);
    if (FILLS.size > FILL_CACHE_SIZE)
        FILLS.delete(FILLS.keys().next().value);
    return out;
}
/** Heal one painted spot: it is filled from its surroundings (PatchMatch-lite inside a crop
 * around the spot, so patches come from nearby skin), then blended in through the spot's own
 * coverage; its soft rim blends toward the fill. */
export function heal(img, cover, brushRadius) {
    const rgb = { width: img.width, height: img.height, channels: 3, data: rgbOnly(img) };
    const box = maskBox(cover, HEAL_LEVEL);
    if (!box)
        return rgb;
    const reach = Math.ceil(HEAL_MARGIN * Math.max(4, brushRadius));
    const x0 = Math.max(0, box[0] - reach), y0 = Math.max(0, box[1] - reach);
    const x1 = Math.min(img.width - 1, box[2] + reach), y1 = Math.min(img.height - 1, box[3] + reach);
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    const crop = new Uint8Array(w * h * 3), hole = floatImage(w, h, 1);
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            const src = (y + y0) * img.width + (x + x0), dst = y * w + x;
            for (let c = 0; c < 3; c++)
                crop[dst * 3 + c] = rgb.data[src * 3 + c];
            hole.data[dst] = cover.data[src] >= HEAL_LEVEL ? 1 : 0;
        }
    const filled = cachedFill({ width: w, height: h, channels: 3, data: crop }, hole);
    const weight = new Float32Array(w * h);
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            const m = clamp01(cover.data[(y + y0) * img.width + (x + x0)] / 0.5);
            weight[y * w + x] = m * m * (3 - 2 * m);
        }
    const mixed = mixWeighted({ width: w, height: h, channels: 3, data: crop }, filled, weight);
    for (let y = 0; y < h; y++)
        rgb.data.set(mixed.data.subarray(y * w * 3, (y + 1) * w * 3), ((y + y0) * img.width + x0) * 3);
    return rgb;
}
/** The painted area's bounding box grown by `margin` (clipped to the photo), cut out of the
 * photo and the mask; null when nothing is painted. */
export function cropToMask(img, mask, margin) {
    const box = maskBox(mask);
    if (!box)
        return null;
    const m = Math.max(0, Math.ceil(margin));
    const x0 = Math.max(0, box[0] - m), y0 = Math.max(0, box[1] - m), x1 = Math.min(img.width - 1, box[2] + m), y1 = Math.min(img.height - 1, box[3] + m);
    const w = x1 - x0 + 1, hh = y1 - y0 + 1, ch = img.channels;
    const data = new Uint8Array(w * hh * 3), cm = floatImage(w, hh, 1);
    for (let y = 0; y < hh; y++)
        for (let x = 0; x < w; x++) {
            const g = (y + y0) * img.width + x + x0, l = y * w + x;
            for (let c = 0; c < 3; c++)
                data[l * 3 + c] = img.data[g * ch + c];
            cm.data[l] = clamp01(mask.data[g]);
        }
    return { x0, y0, image: { width: w, height: hh, channels: 3, data }, mask: cm };
}
/** Run a brush's effect on the painted area only and mix it in by `weight` (mask x amount). */
function local(img, mask, margin, amount, effect) {
    const base = { width: img.width, height: img.height, channels: 3, data: rgbOnly(img) };
    const crop = amount === 0 ? null : cropToMask(img, mask, margin);
    if (!crop)
        return base;
    const mixed = mixWeighted(crop.image, effect(crop.image, crop.mask), scaled(crop.mask, amount));
    const w = crop.image.width;
    for (let y = 0; y < crop.image.height; y++)
        base.data.set(mixed.data.subarray(y * w * 3, (y + 1) * w * 3), ((y + crop.y0) * img.width + crop.x0) * 3);
    return base;
}
/** Smooth: the texture-preserving polish limited to the painted mask; moles, freckles and other
 * dark marks it finds inside the mask are held, so smoothing never erases them. The polish
 * itself is at full; the layer strength sets how much of it is mixed in. */
export function smooth(img, mask, amount, ctx) {
    return local(img, mask, ctx.iod / 2, amount, (crop, m) => {
        const marks = findMarks(crop, m, ctx.iod);
        return polish(Uint8Array.from(crop.data), crop.width, crop.height, m, markMask(marks, crop.width, crop.height), ctx.iod, 1);
    });
}
/** Enamel-like: light enough and low in colour, the teeth whitening engine's own test
 * (engines/teeth/whiten.ts: L* at least 52, chroma under 25), and near neutral on a*, since a
 * brush may be painted over skin, lips or gums, which are all redder than enamel and eye whites.
 * The a* limit is ASSUMED (tooth enamel and sclera sit around a* 0 to 4). */
export const ENAMEL_MIN_L = 52, ENAMEL_MAX_CHROMA = 25, ENAMEL_MAX_A = 6;
/** Whiten: on painted enamel-like pixels (teeth or eye whites), the natural teeth engine's lift
 * (engines/teeth/natural.ts): up to MAX_LIFT L* and never past NATURAL_L_CAP, yellow eased
 * toward WARM_B but kept warm; then mixed in through the mask. */
export function whitenPainted(img, mask, amount) {
    return local(img, mask, 0, amount, (crop, m) => {
        const out = Uint8Array.from(crop.data);
        for (let i = 0; i < crop.width * crop.height; i++) {
            if (!(m.data[i] > 0))
                continue;
            const [l, a, b] = srgbToLab([crop.data[i * 3], crop.data[i * 3 + 1], crop.data[i * 3 + 2]]);
            if (l < ENAMEL_MIN_L || Math.hypot(a, b) >= ENAMEL_MAX_CHROMA || a >= ENAMEL_MAX_A || l >= NATURAL_L_CAP)
                continue;
            const target = [l + Math.min(MAX_LIFT, NATURAL_L_CAP - l), a, b - Math.min(MAX_B_DROP, Math.max(0, b - WARM_B))];
            // As the natural engine does: if rounding to bytes carries it past the cap, aim a little lower.
            let rgb = labToSrgb(target).map(toLabByte);
            for (let pass = 0; pass < ROUNDING_PASSES && srgbToLab(rgb)[0] > NATURAL_L_CAP; pass++) {
                target[0] -= ROUNDING_STEP;
                rgb = labToSrgb(target).map(toLabByte);
            }
            if (srgbToLab(rgb)[0] > NATURAL_L_CAP)
                continue;
            out.set(rgb, i * 3);
        }
        return out;
    });
}
/** Details: the structure op the portrait looks define features with, at the whole photo's
 * radius (its frame is the photo, the crop is a tile of it), mixed in through the mask. */
export function details(img, mask, amount) {
    const frame = wholeFrame(img.width, img.height);
    const reach = structureRadius(DEFINITION.radius, frame) + 2;
    return local(img, mask, reach, amount, (crop) => {
        const unit = mapped(new Float64Array(crop.data.length), crop.data, (v) => v / 255);
        const tile = { ...frame, x0: 0, y0: 0 };
        return toBytes(structure({ width: crop.width, height: crop.height, data: unit }, { ...DEFINITION }, tile).data);
    });
}
/** Relight: burn darkens and dodge brightens, by at most RELIGHT_MAX of linear light. */
export function relightPainted(img, dodge, burn, amount) {
    const rgb = rgbOnly(img);
    const n = img.width * img.height, out = new Uint8Array(n * 3);
    for (let i = 0; i < n; i++) {
        const gain = 1 + RELIGHT_MAX * amount * (clamp01(dodge.data[i]) - clamp01(burn.data[i]));
        for (let c = 0; c < 3; c++) {
            const b = rgb[i * 3 + c];
            out[i * 3 + c] = gain === 1 ? b : linearByte(SRGB_TO_LINEAR[b] * gain);
        }
    }
    return { width: img.width, height: img.height, channels: 3, data: out };
}
/** Blur: the studio soft blur at up to the background blur's radius, mixed in by the mask. */
export function blurPainted(img, mask, amount) {
    const radius = radiusFor(img.width, img.height, BLUR_MAX * amount);
    return local(img, mask, 3 * radius, amount === 0 ? 0 : 1, (crop) => {
        const lin = mapped(new Float64Array(crop.data.length), crop.data, (v) => SRGB_TO_LINEAR[v]);
        return mapped(new Uint8Array(lin.length), softBlur(lin, crop.width, crop.height, radius, 3), linearByte);
    });
}
/** Colour: each painted pixel takes the colour's a* and b* (its hue and colourfulness) and keeps
 * its own L*, so hair or lips keep their own light and shade; the skin engines' no-lighten pass
 * then makes sure rounding and the colour gamut never leave a pixel lighter than it was. */
export function colourPainted(img, mask, amount, hex) {
    const [, ta, tb] = srgbToLab(hexToRgb(hex));
    const base = { width: img.width, height: img.height, channels: 3, data: rgbOnly(img) };
    const out = local(base, mask, 0, amount, (crop) => {
        const tinted = new Uint8Array(crop.data.length);
        for (let i = 0; i < crop.width * crop.height; i++) {
            const [l] = srgbToLab([crop.data[i * 3], crop.data[i * 3 + 1], crop.data[i * 3 + 2]]);
            tinted.set(labToSrgb([l, ta, tb]).map(toLabByte), i * 3);
        }
        return tinted;
    });
    noLighten(base, out.data, mapped(new Float64Array(mask.data.length), mask.data, (v) => (v > 0 && amount > 0 ? 1 : 0)));
    return out;
}
//# sourceMappingURL=effects.js.map