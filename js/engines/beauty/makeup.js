/** Makeup on the photo: lipstick, blush, eyeshadow and eyeliner, from the 478 face points.
 *
 * Every product is laid on in CIELAB so her own texture stays: the lips keep their lines and
 * highlights (the lipstick moves the lips' average colour to the shade and keeps each pixel's
 * difference from that average), blush and shadow tint the skin under them and only ever
 * deepen it, liner is a soft dark line along the upper lash line with a small flick.
 * Finishes: matte flattens the lips' highlights, satin keeps them, gloss adds a wet highlight
 * where the lips already catch the light. Each edge is feathered over a few pixels per 100 px of
 * eye distance so nothing looks cut out.
 * Values marked ASSUMED were chosen by looking at the example faces, light to deep.
 * Author: John Khan.
 */
import { CONTOURS } from "../../data/regions/index.js";
import { amountOf, blur, ellipseSpot, polygonMask, rgbToLab, smoothstep, weightedMedian, writeLab } from "./photo-ops.js";
import { grown, loop, meshProblem, pt, skinMap, toPhoto } from "./face-regions.js";
export const FINISHES = ["matte", "satin", "gloss"];
export const LABEL = "Makeup simulation on this device.";
export function isMakeupRefusal(value) { return value.refused === true; }
/** Upper lid from inner to outer corner, and lower lid the same way (mesh indices). */
export const UPPER_LID = { right: [133, 173, 157, 158, 159, 160, 161, 246, 33], left: [362, 398, 384, 385, 386, 387, 388, 466, 263] };
export const LOWER_LID = { right: [133, 155, 154, 153, 145, 144, 163, 7, 33], left: [362, 382, 381, 380, 374, 373, 390, 249, 263] };
export function hexLab(hex) {
    if (!hex || hex === "none")
        return null;
    const m = /^#?([0-9a-f]{6})$/i.exec(hex);
    if (!m)
        throw new RangeError(`Colour must be #RRGGBB, not ${hex}`);
    const v = parseInt(m[1], 16);
    return rgbToLab((v >> 16) & 255, (v >> 8) & 255, v & 255);
}
/** A polyline moved along its own normal by a distance that varies along it (positive = to the
 * left of the walking direction). */
function offsetLine(line, dist) {
    return line.map((p, k) => {
        const a = line[Math.max(0, k - 1)], b = line[Math.min(line.length - 1, k + 1)];
        const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1, d = dist(k / (line.length - 1));
        return [p[0] + dy / len * d, p[1] - dx / len * d];
    });
}
/** +1 when offsetLine's positive side of this lid line points up the face, else -1. */
function upSign(line, up) {
    const a = line[0], b = line[line.length - 1];
    return (b[1] - a[1]) * up[0] - (b[0] - a[0]) * up[1] >= 0 ? 1 : -1;
}
export function applyMakeup(image, mesh, strength, options = {}) {
    const e = amountOf(strength);
    const finish = options.finish ?? "satin";
    if (!FINISHES.includes(finish))
        throw new RangeError("Finish must be matte, satin or gloss.");
    let lip = hexLab(options.lip ?? ""), blush = hexLab(options.blush ?? ""), liner = hexLab(options.liner ?? "");
    let shadow = hexLab(options.shadow ?? "");
    const brow = hexLab(options.brow ?? "");
    const op = (v) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1);
    const style = options.shadowStyle ?? "lid";
    if (e === 0 || (!lip && !blush && !shadow && !liner && !brow))
        return { image: Uint8Array.from(image.data), label: LABEL, metrics: { unchanged: true } };
    const problem = meshProblem(mesh, image.width, image.height);
    if (problem)
        return { refused: true, code: "mesh", message: problem };
    let map;
    try {
        map = skinMap(image, mesh, options);
    }
    catch (error) {
        if (error instanceof RangeError)
            return { refused: true, code: "no_skin", message: error.message };
        throw error;
    }
    const { rect, lab, frame: f } = map, n = rect.w * rect.h, iod = f.iod;
    // Deep skin (review, Oct 30): a light coral or peach reads as a patch or paint on deep skin, so the
    // look's blush and lip become its berry and plum counterparts and a soft liner adds definition.
    const deep = skinTone(map.stats.L) < DEEP_TONE;
    if (deep) {
        if (blush)
            blush = hexLab(options.deepBlush ?? DEEP_PALETTE.blush);
        if (lip)
            lip = hexLab(options.deepLip ?? DEEP_PALETTE.lip);
        if (!liner || options.deepLiner)
            liner = hexLab(options.deepLiner ?? DEEP_PALETTE.liner);
        if (shadow && options.deepShadow)
            shadow = hexLab(options.deepShadow);
    }
    const L = Float32Array.from(lab.L), A = Float32Array.from(lab.a), B = Float32Array.from(lab.b), weight = new Float32Array(n);
    const metrics = { amount: Math.round(e * 1000) / 1000 };
    const touch = (i, w) => { if (w > weight[i])
        weight[i] = Math.min(1, w); };
    if (blush) {
        // Soft ovals on the apples of the cheeks, swept up toward the temples (ASSUMED placement).
        const spots = [];
        for (const side of [-1, 1]) {
            const [cx, cy] = toPhoto(f, 0.66 * side, 0.62);
            const roll = Math.atan2(f.uy, f.ux);
            spots.push(ellipseSpot(rect, cx, cy, (deep ? 0.44 : 0.38) * iod, (deep ? 0.26 : 0.21) * iod, roll - side * 0.42));
        }
        // A tint relative to her own skin: the blush's colour difference from her measured skin is
        // added, at most 22 a*/b* units, so it reads as colour on her skin and not a painted patch,
        // and clearly at the default strength (owner bar, Oct 30: nothing faint).
        // Scaled to her skin's lightness (review, Oct 30): on deep skin a fixed redness read as red
        // patches, so the tint, its reach and its floor shrink with depth (tone 1 at L* 65+, 0.4 at L* 45-).
        const st = map.stats, tone = skinTone(st.L), amount = Math.min(1, 1.05 * e) * (deep ? 0.68 : 0.3 + 0.7 * tone) * op(options.blushOpacity); // deep: lifted from 0.6 after the Batch 2 review; 0.78 read as red patches
        // r3 review: at reach 11 the blush did not show on deep skin at the looks' opacities (0.25 to 0.4)
        const reach = deep ? 16 : 22 * tone * tone, floor = deep ? 0 : 10 * tone * tone;
        metrics.skin_l = Math.round(st.L * 10) / 10;
        const da = Math.max(-reach, Math.min(reach, Math.sign(blush[1] - st.a) * Math.max(floor, Math.abs(blush[1] - st.a)))), db = deep ? Math.max(-9, Math.min(9, blush[2] - st.b)) : Math.max(-16 * tone, Math.min(16 * tone, blush[2] - st.b));
        const dl = Math.min(0, blush[0] - st.L) * (deep ? 0.6 : 0.4);
        metrics.deep_palette = deep;
        // r4 (John's 9.2 bar): on deep skin the blush is a warmth rise of HER OWN low band (a* and b* scaled up from
        // her own colour, wider and softer spot), not an added berry, so it follows her redness and cannot form a
        // patch of foreign hue; less tied to the look's opacity so it shows at all.
        const lowA = deep ? blur(lab.a, rect.w, rect.h, 0.03 * iod) : undefined, lowB = deep ? blur(lab.b, rect.w, rect.h, 0.03 * iod) : undefined;
        const deepAmt = Math.min(1, 1.05 * e) * 0.68 * (0.5 + 0.5 * op(options.blushOpacity));
        for (let i = 0; i < n; i++) {
            const s = Math.max(spots[0][i], spots[1][i]) * map.skin[i];
            if (lowA && lowB) {
                const w = s * deepAmt;
                if (!(w > 0.002))
                    continue;
                A[i] += w * Math.min(reach, 0.45 * Math.max(4, lowA[i]) + 3);
                B[i] += w * Math.min(6, 0.2 * Math.max(0, lowB[i]));
                L[i] -= w * 1.2;
                touch(i, 1);
                continue;
            }
            const w = s * amount;
            if (!(w > 0.002))
                continue;
            A[i] += w * da;
            B[i] += w * db;
            L[i] += w * dl;
            touch(i, 1);
        }
        metrics.blush = true;
    }
    const eyes = [grown(loop(mesh, CONTOURS.right_eye), 0.004 * iod), grown(loop(mesh, CONTOURS.left_eye), 0.004 * iod)];
    const eyeball = new Float32Array(n);
    for (const eye of eyes) {
        const m = polygonMask(eye, rect, 3);
        for (let i = 0; i < n; i++)
            eyeball[i] = Math.max(eyeball[i], m[i]);
    }
    for (const side of ["right", "left"]) {
        const upper = UPPER_LID[side].map((i) => pt(mesh, i));
        const up = upSign(upper, [f.uy, -f.ux]);
        if (shadow && style !== "lid") {
            // Crease placement (makeup workstream, Oct 30): deepest along the lashes, graded up to the crease and
            // diffused above it; no hard upper edge. Laid on the low band (each pixel keeps its difference from
            // the softened lid), so lid texture and crepe show through; it only ever deepens.
            const smoky = style === "smoky";
            const crease = offsetLine(upper, (t) => up * iod * (0.15 + 0.07 * t));
            // r3 review: the smoky haze reached the brow bone and greyed it; it now stops lower and softer so
            // the brow bone stays clean skin
            const above = offsetLine(upper, (t) => up * iod * (smoky ? 0.19 + 0.07 * t : 0.24 + 0.1 * t));
            const base = offsetLine(upper, () => -up * 0.004 * iod);
            const core = blur(polygonMask([...base, ...[...crease].reverse()], rect, 3), rect.w, rect.h, 0.03 * iod);
            const haze = blur(polygonMask([...base, ...[...above].reverse()], rect, 3), rect.w, rect.h, (smoky ? 0.045 : 0.06) * iod);
            const lid = new Float32Array(n);
            // r3 review: the crease look read too faint; its core carries more
            for (let i = 0; i < n; i++)
                lid[i] = Math.min(1, (smoky ? 0.6 : 0.85) * core[i] + (smoky ? 0.35 : 0.45) * haze[i]);
            if (smoky) {
                // r4: depth built from the lash line up: a dense band along the lashes graded into the crease
                const lashTop = offsetLine(upper, (t) => up * iod * (0.06 + 0.03 * t));
                const lash = blur(polygonMask([...base, ...[...lashTop].reverse()], rect, 3), rect.w, rect.h, 0.02 * iod);
                for (let i = 0; i < n; i++)
                    lid[i] = Math.min(1, lid[i] + 0.4 * lash[i]);
            }
            if (smoky) {
                // smudge under the outer two thirds of the lower lashes, and a deeper outer V
                const lower = LOWER_LID[side].map((i) => pt(mesh, i)).slice(3);
                const below = offsetLine(lower, (t) => -upSign(lower, [f.uy, -f.ux]) * iod * (0.02 + 0.045 * t));
                const smudge = blur(polygonMask([...lower, ...[...below].reverse()], rect, 3), rect.w, rect.h, 0.026 * iod);
                const o = upper[upper.length - 1], ux = f.uy, uy = -f.ux;
                const vx = o[0] + ux * 0.1 * iod, vy = o[1] + uy * 0.1 * iod;
                const v = ellipseSpot(rect, vx, vy, 0.1 * iod, 0.065 * iod, Math.atan2(f.uy, f.ux) + (side === "right" ? 0.6 : -0.6));
                // r4: a slightly deeper outer V; the lower smudge stays soft and lighter than the upper lid
                for (let i = 0; i < n; i++)
                    lid[i] = Math.min(1, lid[i] + 0.5 * smudge[i] + 0.55 * v[i] * core[i] + 0.3 * v[i]);
            }
            const lowL = blur(lab.L, rect.w, rect.h, 0.02 * iod), lowA = blur(lab.a, rect.w, rect.h, 0.02 * iod), lowB = blur(lab.b, rect.w, rect.h, 0.02 * iod);
            const outer = upper[upper.length - 1], inner = upper[0];
            const amount = Math.min(1, 1.2 * e) * op(options.shadowOpacity);
            for (let i = 0; i < n; i++) {
                if (!(lid[i] > 0.003))
                    continue;
                const x = rect.x0 + (i % rect.w) + 0.5, y = rect.y0 + Math.floor(i / rect.w) + 0.5;
                const dIn = Math.hypot(x - inner[0], y - inner[1]), dOut = Math.hypot(x - outer[0], y - outer[1]);
                const toward = 0.55 + 0.45 * smoothstep(0, 1, dIn / (dIn + dOut + 1e-6));
                const w = lid[i] * toward * amount * (1 - eyeball[i]) * (1 - 0.7 * (map.features[i] > 0.5 && lowL[i] < map.stats.L - 25 ? 1 : 0));
                if (!(w > 0.002))
                    continue;
                L[i] += w * Math.min(0, shadow[0] - lowL[i]) * (smoky ? 0.85 : 0.75);
                // a dark shadow pulls chroma toward its own low chroma, which on warm skin reads grey; smoky keeps
                // more of her warmth and darkens instead
                const cm = smoky ? 0.5 : 0.8;
                A[i] += w * (shadow[1] - lowA[i]) * cm;
                B[i] += w * (shadow[2] - lowB[i]) * cm;
                touch(i, 1);
            }
            metrics.shadow = style;
        }
        if (shadow && style === "lid") {
            // The lid from the lash line up to just under the brow bone, deepest at the lashes and the
            // outer corner, fading upward.
            const crease = offsetLine(upper, (t) => up * iod * (0.18 + 0.09 * t));
            const lid = blur(polygonMask([...upper, ...crease.reverse()], rect, 3), rect.w, rect.h, 0.035 * iod);
            const outer = upper[upper.length - 1], inner = upper[0];
            const amount = Math.min(1, 1.2 * e);
            for (let i = 0; i < n; i++) {
                if (!(lid[i] > 0.003))
                    continue;
                const x = rect.x0 + (i % rect.w) + 0.5, y = rect.y0 + Math.floor(i / rect.w) + 0.5;
                const dIn = Math.hypot(x - inner[0], y - inner[1]), dOut = Math.hypot(x - outer[0], y - outer[1]);
                const toward = 0.65 + 0.35 * smoothstep(0, 1, dIn / (dIn + dOut + 1e-6));
                const w = lid[i] * toward * amount * (1 - eyeball[i]);
                if (!(w > 0.002))
                    continue;
                L[i] += w * Math.min(-6, shadow[0] - L[i]) * 0.8;
                A[i] += w * (shadow[1] - A[i]) * 0.9;
                B[i] += w * (shadow[2] - B[i]) * 0.9;
                touch(i, 1);
            }
            metrics.shadow = true;
        }
        if (liner) {
            // A line hugging the upper lashes: thin at the inner corner, fuller at the outer, with a
            // short flick out and up (ASSUMED proportions).
            const lw = options.linerWeight ?? 1, wing = options.wing ?? 1, lift = options.lift ?? 1;
            const thick = (t) => lw * iod * (0.013 + 0.03 * t * t);
            const base = offsetLine(upper, () => -up * 0.006 * iod), top = offsetLine(upper, (t) => up * thick(t));
            const outer = upper[upper.length - 1], prev = upper[upper.length - 2];
            const dx = outer[0] - prev[0], dy = outer[1] - prev[1], len = Math.hypot(dx, dy) || 1;
            const ux = f.uy, uy = -f.ux; // up the face
            const tip = [outer[0] + wing * (dx / len * 0.1 * iod + lift * ux * 0.06 * iod), outer[1] + wing * (dy / len * 0.1 * iod + lift * uy * 0.06 * iod)];
            const line = blur(polygonMask([...base, tip, ...top.reverse()], rect, 4), rect.w, rect.h, 0.005 * iod);
            const amount = 0.92 * Math.min(1, e * 1.6) * op(options.linerOpacity);
            for (let i = 0; i < n; i++) {
                const w = line[i] * amount * (1 - 0.85 * eyeball[i]);
                if (!(w > 0.003))
                    continue;
                L[i] += w * Math.min(0, liner[0] - L[i]);
                A[i] += w * (liner[1] - A[i]);
                B[i] += w * (liner[2] - B[i]);
                touch(i, 1);
            }
            metrics.liner = true;
        }
    }
    if (brow) {
        // Brow definition: inside her own brow outline (grown a little), the hairs (darker than their
        // softened surround) deepen most and the skin between them only a little, like a pencil and powder
        // that follow her hairs; the outline is feathered so there is no drawn edge.
        const amount = Math.min(1, 1.1 * e) * op(options.browOpacity);
        const lowL = blur(lab.L, rect.w, rect.h, 0.03 * iod);
        for (const side of ["right", "left"]) {
            const shape = grown(loop(mesh, CONTOURS[`${side}_brow`]), 0.012 * iod);
            const m = blur(polygonMask(shape, rect, 3), rect.w, rect.h, 0.02 * iod);
            for (let i = 0; i < n; i++) {
                if (!(m[i] > 0.003))
                    continue;
                const hair = smoothstep(1, 9, lowL[i] - lab.L[i]);
                const w = m[i] * amount * (0.3 + 0.6 * hair);
                L[i] += w * Math.min(0, brow[0] - lab.L[i]) * 0.6;
                A[i] += w * (brow[1] - lab.a[i]) * 0.6;
                B[i] += w * (brow[2] - lab.b[i]) * 0.6;
                touch(i, 1);
            }
        }
        metrics.brow = true;
    }
    if (lip) {
        const outer = grown(loop(mesh, CONTOURS.lips_outer), -0.004 * iod), inner = loop(mesh, CONTOURS.lips_inner);
        const lipsHard = polygonMask(outer, rect, 4), opening = polygonMask(inner, rect, 4);
        const mask = new Float32Array(n);
        for (let i = 0; i < n; i++)
            mask[i] = Math.max(0, lipsHard[i] - opening[i]);
        let soft = blur(mask, rect.w, rect.h, 0.008 * iod);
        const mL = weightedMedian(lab.L, mask, 0.6), mA = weightedMedian(lab.a, mask, 0.6), mB = weightedMedian(lab.b, mask, 0.6);
        if (options.trueLip === true && mA - map.stats.a > 4) {
            // True-colour lipstick follows HER lip line, not the mesh outline: a slightly wider outline, gated by
            // how lip-red each pixel is between her skin's and her lips' a*, so the colour stops at the vermilion
            // border (no soft halo on the skin) and fills the border where the mesh sits inside it.
            const wide = polygonMask(grown(loop(mesh, CONTOURS.lips_outer), 0.006 * iod), rect, 4);
            const redA = blur(lab.a, rect.w, rect.h, 0.003 * iod), span = mA - map.stats.a;
            soft = new Float32Array(n);
            for (let i = 0; i < n; i++) {
                const m = Math.max(0, wide[i] - opening[i]);
                if (!(m > 0))
                    continue;
                const lipness = smoothstep(0.3, 0.7, (redA[i] - map.stats.a) / span);
                soft[i] = m * (mask[i] >= 0.999 ? Math.max(lipness, 0.85) : lipness);
            }
            soft = blur(soft, rect.w, rect.h, 0.003 * iod);
        }
        for (let i = 0; i < n; i++)
            soft[i] = Math.min(soft[i], 1 - opening[i] * 0.95);
        // Local lip texture: each pixel's lightness against a softened lip, so lines and highlights stay.
        const smoothL = blur(lab.L, rect.w, rect.h, 0.03 * iod);
        // A pale shade on dark lips is held to a believable lift (ASSUMED 10 L*).
        // On deep skin a bright shade is held closer to her own lips (lift and chroma scale with skin
        // lightness), so it reads as lipstick on her lips and not as paint on top (review, Oct 30).
        const lipTone = skinTone(map.stats.L);
        const trueLip = options.trueLip === true;
        // true-colour looks on deep skin: the deep shade itself mostly (a classic red must read red), her lip colour 10%
        const lipMix = deep ? (trueLip ? 0.9 : 0.7) : trueLip ? 1 : 0.5 + 0.5 * lipTone;
        const shiftL = deep ? Math.max(trueLip ? -16 : -8, Math.min(0, lip[0] - mL)) : Math.min(lip[0] - mL, 10 * lipTone);
        const amount = 0.95 * Math.min(1, e * 1.3) * (deep ? (trueLip ? 0.95 : 0.85) : 0.5 + 0.5 * lipTone) * op(options.lipOpacity);
        for (let i = 0; i < n; i++) {
            const w = soft[i] * amount;
            if (!(w > 0.002))
                continue;
            const detail = lab.L[i] - smoothL[i];
            // Matte: highlights flattened; satin: her lips' own light; gloss: a wet shine where they catch light.
            // True colour: a lipstick covers, so a light lower lip and a darker upper lip move toward the same shade
            // (0.8 of the way since r3)
            // (each keeps its lines and light as the difference from its softened self).
            let target = lab.L[i] + (trueLip
                ? Math.max(deep ? -16 : -30, Math.min(10 * lipTone, 0.8 * (lip[0] - smoothL[i]) + 0.2 * shiftL))
                : shiftL);
            if (finish === "matte" && detail > 0)
                target -= 0.65 * detail;
            if (finish === "gloss")
                target += 1.4 * Math.max(0, detail) + 6 * smoothstep(1, 5, detail);
            L[i] += w * (target - L[i]);
            // Chroma pushed a little past the shade so a colour near her own lips still reads as lipstick.
            // On deep skin the shade's colour is mixed with her own lip colour (k < 1), so it sits in her lips.
            // r3 review: a true-colour lipstick on a lighter, warmer lower lip read coral; it covers more of her
            // own lightness and colour spread (0.8 / 0.2, was 0.65 / 0.35); her lines and light stay in the detail
            const tA = mA + (lip[1] - mA) * lipMix, tB = mB + (lip[2] - mB) * lipMix, own = trueLip ? 0.2 : 0.35;
            A[i] += w * (tA + (trueLip ? 0 : (lip[1] - mA) * 0.35 * lipTone) + (lab.a[i] - mA) * own - A[i]);
            B[i] += w * (tB + (lab.b[i] - mB) * own - B[i]);
            touch(i, 1);
        }
        Object.assign(metrics, { lip: true, finish, lip_l_before: Math.round(mL * 10) / 10, lip_l_shift: Math.round(shiftL * 10) / 10 });
    }
    return { image: writeLab(image, { rect, L, a: A, b: B }, weight), label: LABEL, metrics };
}
export const LOOKS = [
    { id: "provence", name: "Provence", lip: "#B5655E", finish: "satin", blush: "#D88A7D", shadow: "#9C7462", liner: "none" },
    { id: "bordeaux", name: "Bordeaux", lip: "#7A1F2E", finish: "matte", blush: "#B5626A", shadow: "#6E4B4A", liner: "#2A1E1E" },
    { id: "riviera", name: "Riviera", lip: "#D0574A", finish: "gloss", blush: "#E09276", shadow: "#A88068", liner: "none" },
    { id: "montmartre", name: "Montmartre", lip: "#A3283A", finish: "satin", blush: "#C46F72", shadow: "#5B4A48", liner: "#1C1717" },
    { id: "camargue", name: "Camargue", lip: "#8E5446", finish: "matte", blush: "#B97462", shadow: "#7A5A48", liner: "#33261F" },
    // Full looks (makeup workstream, Oct 30): own-shade foundation first, then colour. Scored at 200% on a light-medium
    // woman, a deep-skin man and a medium-deep man; each has its own deep-skin shades.
    { id: "bare", name: "Bare (no-makeup)", lip: "#93534F", finish: "satin", blush: "#D08A7C", shadow: "none", liner: "none",
        lipOpacity: 0.5, blushOpacity: 0.25, trueLip: true, base: "foundation", baseStrength: 35, concealer: 40,
        deepLip: "#6E3A38", deepBlush: "#94504A", deepLiner: "none" },
    { id: "soft-glam", name: "Soft glam", lip: "#A85A57", finish: "satin", blush: "#D38878", shadow: "#86604E", liner: "#2B1F1C",
        shadowStyle: "crease", shadowOpacity: 1, linerOpacity: 0.95, linerWeight: 1.15, wing: 1.35, lift: 1.2, lipOpacity: 0.75, blushOpacity: 0.4,
        trueLip: true, base: "foundation", baseStrength: 45, skinFinish: "glow-cassis", skinFinishStrength: 55,
        deepLip: "#76383C", deepBlush: "#A0504A", deepShadow: "#5E4034" }, // r5: #73352F read rust on a deep lower lip
    { id: "matte-evening", name: "Matte evening", lip: "#6A1A30", finish: "matte", blush: "#B66A6E", shadow: "#3E2C26", liner: "#1A1414",
        brow: "#3A2B25", shadowStyle: "smoky", shadowOpacity: 0.85, lipOpacity: 0.9, blushOpacity: 0.3, browOpacity: 0.7, linerWeight: 1.1,
        trueLip: true, base: "foundation", baseStrength: 60, skinFinish: "matte", skinFinishStrength: 45,
        deepLip: "#5A1A2C", deepBlush: "#7E3448", deepShadow: "#261A16" },
    { id: "red-carpet", name: "Red carpet", lip: "#8A1426", finish: "satin", blush: "#C97A78", shadow: "#8E6A5A", liner: "#141010",
        shadowStyle: "crease", shadowOpacity: 0.5, linerWeight: 1.25, wing: 1.5, lift: 1.6, lipOpacity: 0.95, blushOpacity: 0.3,
        trueLip: true, base: "foundation", baseStrength: 50, skinFinish: "glow-collioure", skinFinishStrength: 65,
        deepLip: "#7E0F22", deepBlush: "#8E3A45", deepShadow: "#5A3C30" },
];
/** Skin depth factor for makeup strength: 1 at L* 65 and lighter, down to 0.4 at L* 45 and deeper. ASSUMED. */
export function skinTone(L) {
    return Math.max(0.4, Math.min(1, 0.4 + 0.6 * (L - 45) / 20));
}
/** Below this skin depth factor the deep-skin palette is used. ASSUMED. */
export const DEEP_TONE = 0.75;
/** Berry blush, plum-berry lip and a soft brown-black liner for deep skin. ASSUMED shades. */
export const DEEP_PALETTE = { blush: "#8E3A55", lip: "#6E2440", liner: "#1F1515" };
