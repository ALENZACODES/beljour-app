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
    const lip = hexLab(options.lip ?? ""), blush = hexLab(options.blush ?? ""), shadow = hexLab(options.shadow ?? ""), liner = hexLab(options.liner ?? "");
    if (e === 0 || (!lip && !blush && !shadow && !liner))
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
            spots.push(ellipseSpot(rect, cx, cy, 0.38 * iod, 0.21 * iod, roll - side * 0.42));
        }
        // A tint relative to her own skin: the blush's colour difference from her measured skin is
        // added, at most 22 a*/b* units, so it reads as colour on her skin and not a painted patch,
        // and clearly at the default strength (owner bar, Oct 30: nothing faint).
        // Scaled to her skin's lightness (review, Oct 30): on deep skin a fixed redness read as red
        // patches, so the tint, its reach and its floor shrink with depth (tone 1 at L* 65+, 0.4 at L* 45-).
        const st = map.stats, tone = skinTone(st.L), amount = Math.min(1, 1.05 * e) * (0.3 + 0.7 * tone);
        const reach = 22 * tone * tone, floor = 10 * tone * tone;
        metrics.skin_l = Math.round(st.L * 10) / 10;
        const da = Math.max(-reach, Math.min(reach, Math.sign(blush[1] - st.a) * Math.max(floor, Math.abs(blush[1] - st.a)))), db = Math.max(-16 * tone, Math.min(16 * tone, blush[2] - st.b));
        const dl = Math.min(0, blush[0] - st.L) * 0.4;
        for (let i = 0; i < n; i++) {
            const w = Math.max(spots[0][i], spots[1][i]) * map.skin[i] * amount;
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
        if (shadow) {
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
            const thick = (t) => iod * (0.013 + 0.03 * t * t);
            const base = offsetLine(upper, () => -up * 0.006 * iod), top = offsetLine(upper, (t) => up * thick(t));
            const outer = upper[upper.length - 1], prev = upper[upper.length - 2];
            const dx = outer[0] - prev[0], dy = outer[1] - prev[1], len = Math.hypot(dx, dy) || 1;
            const ux = f.uy, uy = -f.ux; // up the face
            const tip = [outer[0] + dx / len * 0.1 * iod + ux * 0.06 * iod, outer[1] + dy / len * 0.1 * iod + uy * 0.06 * iod];
            const line = blur(polygonMask([...base, tip, ...top.reverse()], rect, 4), rect.w, rect.h, 0.005 * iod);
            const amount = 0.92 * Math.min(1, e * 1.6);
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
    if (lip) {
        const outer = grown(loop(mesh, CONTOURS.lips_outer), -0.004 * iod), inner = loop(mesh, CONTOURS.lips_inner);
        const lipsHard = polygonMask(outer, rect, 4), opening = polygonMask(inner, rect, 4);
        const mask = new Float32Array(n);
        for (let i = 0; i < n; i++)
            mask[i] = Math.max(0, lipsHard[i] - opening[i]);
        const soft = blur(mask, rect.w, rect.h, 0.008 * iod);
        for (let i = 0; i < n; i++)
            soft[i] = Math.min(soft[i], 1 - opening[i] * 0.95);
        const mL = weightedMedian(lab.L, mask, 0.6), mA = weightedMedian(lab.a, mask, 0.6), mB = weightedMedian(lab.b, mask, 0.6);
        // Local lip texture: each pixel's lightness against a softened lip, so lines and highlights stay.
        const smoothL = blur(lab.L, rect.w, rect.h, 0.03 * iod);
        // A pale shade on dark lips is held to a believable lift (ASSUMED 10 L*).
        // On deep skin a bright shade is held closer to her own lips (lift and chroma scale with skin
        // lightness), so it reads as lipstick on her lips and not as paint on top (review, Oct 30).
        const lipTone = skinTone(map.stats.L);
        const lipMix = 0.5 + 0.5 * lipTone;
        const shiftL = Math.min(lip[0] - mL, 10 * lipTone);
        const amount = 0.95 * Math.min(1, e * 1.3) * (0.5 + 0.5 * lipTone);
        for (let i = 0; i < n; i++) {
            const w = soft[i] * amount;
            if (!(w > 0.002))
                continue;
            const detail = lab.L[i] - smoothL[i];
            // Matte: highlights flattened; satin: her lips' own light; gloss: a wet shine where they catch light.
            let target = lab.L[i] + shiftL;
            if (finish === "matte" && detail > 0)
                target -= 0.65 * detail;
            if (finish === "gloss")
                target += 1.4 * Math.max(0, detail) + 6 * smoothstep(1, 5, detail);
            L[i] += w * (target - L[i]);
            // Chroma pushed a little past the shade so a colour near her own lips still reads as lipstick.
            // On deep skin the shade's colour is mixed with her own lip colour (k < 1), so it sits in her lips.
            const tA = mA + (lip[1] - mA) * lipMix, tB = mB + (lip[2] - mB) * lipMix;
            A[i] += w * (tA + (lip[1] - mA) * 0.35 * lipTone + (lab.a[i] - mA) * 0.35 - A[i]);
            B[i] += w * (tB + (lab.b[i] - mB) * 0.35 - B[i]);
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
];
/** Skin depth factor for makeup strength: 1 at L* 65 and lighter, down to 0.4 at L* 45 and deeper. ASSUMED. */
export function skinTone(L) {
    return Math.max(0.4, Math.min(1, 0.4 + 0.6 * (L - 45) / 20));
}
//# sourceMappingURL=makeup.js.map