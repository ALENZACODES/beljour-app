import { MESSAGES, NOT_MEDICAL, unchanged } from "../skin/local-zones.js";
import { amountOf, blur, maskedBlur, polygonMask, weightedMedian, writeLab } from "./photo-ops.js";
import { meshProblem, pt, skinMap, toFace, toPhoto } from "./face-regions.js";
import { LOWER_LID } from "./makeup.js";
export const LABEL = "Under-eye brightening simulation, matched to your own cheek. " + NOT_MEDICAL;
export const MAX_LIFT = 15, DARK_MIN = 1.5; // ASSUMED, in L*
function offsetDown(line, down, dist) {
    return line.map((p, k) => { const d = dist(k / (line.length - 1)); return [p[0] + down[0] * d, p[1] + down[1] * d]; });
}
export function correctUnderEyes(image, mesh, { strength = 60, includeBags = true } = {}) {
    if (typeof includeBags !== "boolean")
        throw new RangeError("includeBags must be true or false");
    const e = amountOf(strength);
    if (!mesh || mesh.length !== 478)
        return unchanged(image, "refused", "wrong_shape", LABEL);
    if (meshProblem(mesh, image.width, image.height))
        return unchanged(image, "refused", "face_too_small", LABEL);
    if (e === 0)
        return unchanged(image, "not_applicable", "zero_strength", LABEL);
    let map;
    try {
        map = skinMap(image, mesh);
    }
    catch (error) {
        if (error instanceof RangeError)
            return unchanged(image, "refused", "no_skin_visible", LABEL);
        throw error;
    }
    const { rect, lab, frame: f } = map, n = rect.w * rect.h, iod = f.iod;
    const down = [-f.uy, f.ux];
    const L = Float32Array.from(lab.L), A = Float32Array.from(lab.a), B = Float32Array.from(lab.b), weight = new Float32Array(n);
    const peak = includeBags ? 0.34 : 0.24; // ASSUMED depth of the crescent in eye distances
    const sides = {};
    let edited = 0;
    for (const side of ["right", "left"]) {
        const lid = LOWER_LID[side].map((i) => pt(mesh, i));
        const top = offsetDown(lid, down, (t) => iod * (0.014 + 0.02 * Math.sin(Math.PI * t)));
        const bottom = offsetDown(lid, down, (t) => iod * (0.05 + peak * Math.sin(Math.PI * t) ** 0.8));
        const hard = polygonMask([...top, ...bottom.reverse()], rect, 3);
        const zone = blur(hard, rect.w, rect.h, 0.045 * iod);
        for (let i = 0; i < n; i++)
            zone[i] *= Math.min(1, map.skin[i] * 1.5);
        // Her cheek just below: a disc 0.55 eye distances under the middle of the lid.
        const mid = lid[lid.length >> 1], [mu, mv] = toFace(f, mid[0], mid[1]), [cx, cy] = toPhoto(f, mu, mv + 0.55);
        const cheek = new Float32Array(n), r = 0.14 * iod;
        for (let y = 0; y < rect.h; y++)
            for (let x = 0; x < rect.w; x++) {
                const dx = rect.x0 + x + 0.5 - cx, dy = rect.y0 + y + 0.5 - cy;
                if (dx * dx + dy * dy <= r * r && map.skin[y * rect.w + x] > 0.6)
                    cheek[y * rect.w + x] = 1;
            }
        const core = new Float32Array(n);
        for (let i = 0; i < n; i++)
            core[i] = hard[i] > 0.6 && map.skin[i] > 0.5 ? 1 : 0;
        // The cheek's lightness and warmth, without a flush: a* no redder than her skin's median.
        const ref = [weightedMedian(lab.L, cheek), Math.min(weightedMedian(lab.a, cheek), map.stats.a), weightedMedian(lab.b, cheek)];
        const under = [weightedMedian(lab.L, core), weightedMedian(lab.a, core), weightedMedian(lab.b, core)];
        const row = { cheek_lab: ref.map((v) => Math.round(v * 10) / 10), under_eye_lab: under.map((v) => Math.round(v * 10) / 10) };
        sides[side] = row;
        if (ref.some((v) => !Number.isFinite(v)) || under.some((v) => !Number.isFinite(v))) {
            row.action = "not_visible";
            continue;
        }
        row.difference_l = Math.round((ref[0] - under[0]) * 10) / 10;
        // A dark circle is darker than the cheek, or cooler (blue-violet: lower b*), or both.
        const cooler = ref[2] - under[2];
        row.difference_b = Math.round(cooler * 10) / 10;
        if (ref[0] - under[0] < DARK_MIN && cooler < 2.5) {
            row.action = "already_even";
            continue;
        }
        // The zone's broad colour (its blur over the zone only), so texture is not touched.
        const sigma = 0.07 * iod;
        const lowL = maskedBlur(lab.L, core, rect.w, rect.h, sigma), lowA = maskedBlur(lab.a, core, rect.w, rect.h, sigma), lowB = maskedBlur(lab.b, core, rect.w, rect.h, sigma);
        const amount = 0.95 * e;
        for (let i = 0; i < n; i++) {
            const w = zone[i] * amount;
            if (!(w > 0.003))
                continue;
            const lift = Math.min(MAX_LIFT, Math.max(0, ref[0] - lowL[i]));
            L[i] += w * lift;
            A[i] += w * 0.85 * (ref[1] - lowA[i]);
            B[i] += w * 0.85 * (ref[2] - lowB[i]);
            weight[i] = 1;
        }
        row.action = "brightened";
        edited++;
    }
    const report = { include_bags: includeBags, sides };
    if (Object.values(sides).every((row) => row.action === "not_visible"))
        return unchanged(image, "refused", "zone_not_visible", LABEL, report);
    if (!edited)
        return unchanged(image, "not_applicable", "no_dark_circle", LABEL, report);
    const out = writeLab(image, { rect, L, a: A, b: B }, weight);
    const alpha = new Float64Array(image.width * image.height);
    for (let y = 0; y < rect.h; y++)
        for (let x = 0; x < rect.w; x++)
            alpha[(rect.y0 + y) * image.width + rect.x0 + x] = weight[y * rect.w + x];
    return { image: { ...image, data: out }, alpha, status: "edited", reasonCode: "edited", message: MESSAGES.edited, label: LABEL, report };
}
//# sourceMappingURL=under-eye.js.map