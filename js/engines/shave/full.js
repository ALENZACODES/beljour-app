/** Full-beard estimate for Beard removal. When a beard hides the skin and the jaw line, remove.ts
 * refuses ("full_beard") because there is no visible skin under the hair to rebuild from. This path
 * paints an estimate instead and says so: the colour of her own cheek above the beard (the darkest
 * quarter of those pixels left out, so stray hairs do not darken it), a soft shadow that deepens toward
 * the jaw and more under it, fine texture at the cheek's own grain, mixed in up to FULL_CAP and never
 * lighter than the cheek. The area is the full beard plus the moustache, grown a little past the jaw line
 * and feathered wide so no dark rim or hard edge is left; the lips stay out.
 * Shares and radii are ASSUMED. A rough visual estimate, not a grooming or medical prediction.
 * Browser only; the stubble and short-beard path stays byte-matched to the Python twin.
 * Author: John Khan.
 */
import { dilate, feather, polygon, subtract, union } from "../core/mask.js";
import { CONTOURS } from "../../data/regions/index.js";
import { beardArea } from "../local/beard.js";
import { encode, frame, labPlanes, maskedLowpass, median, radius, skinMask, xy } from "../skin/common.js";
import { meshProblems, REASONS } from "../skin/studio.js";
import { BASE_RADIUS, KEEP_RADIUS, MESSAGES, MIN_REF_PIXELS, MODULE, REF_BELOW, REF_MARGIN } from "./remove.js";
export const FULL_SCOPE = "full_beard_estimate";
export const FULL_CAP = 0.95, BASE_SHADE_L = 3.0, JAW_SHADOW_L = 6.0, NECK_SHADOW_L = 7.0, TEXTURE_SHARE = 1.3, SIDE_SHADOW_L = 7.0, REF_KEEP_SHARE = 0.75;
export const EDGE_GROW = 0.03, EDGE_FEATHER = 0.1, LIP_GAP = 0.012;
export const FULL_LABEL = "Full-beard estimate: the skin under this beard cannot be seen, so it is estimated from your cheek above it. "
    + "A rough visual estimate, not a grooming or medical prediction.";
/** A repeatable 0..1 value per pixel (no random state), so the same photo always gets the same grain. */
function grain(x, y) {
    let v = (Math.imul(x + 1, 73856093) ^ Math.imul(y + 1, 19349663)) >>> 0;
    v = Math.imul(v ^ (v >>> 13), 1274126177) >>> 0;
    return ((v ^ (v >>> 16)) >>> 0) / 4294967296;
}
export function estimateFullBeard(image, points, strength = 30, keep = []) {
    const { width: w, height: h, channels: ch } = image;
    if (!Number.isInteger(w) || !Number.isInteger(h) || Math.min(w, h) < 8 || (ch !== 3 && ch !== 4) || image.data.length !== w * h * ch) {
        throw new RangeError("beard removal needs an RGB or RGBA photo of at least 8 x 8");
    }
    if (!Number.isFinite(strength) || strength < 0 || strength > 100)
        throw new RangeError("strength must be 0..100");
    const refuse = (code) => ({ refused: true, module: MODULE, code, message: MESSAGES[code] ?? REASONS[code] });
    const problems = meshProblems(points, w, h);
    if (problems.length)
        return refuse(problems[0]);
    const pts = points.map(xy);
    let full, lip;
    try {
        full = beardArea(pts, w, h);
        lip = beardArea(pts, w, h, { region: "moustache" });
    }
    catch {
        return refuse("zone_not_visible");
    }
    const face = frame(pts), n = w * h, skin = skinMask(pts, w, h);
    const lipMask = dilate(polygon(w, h, CONTOURS.lips_outer.map((k) => pts[k]), 2), LIP_GAP * face.iod), lips = lipMask.data;
    const hard = union(full.hard, lip.hard);
    // Full weight on the beard itself; a soft ramp outward onto the cheek skin only (never the background).
    const core = subtract(dilate(hard, EDGE_GROW * face.iod), lipMask), halo = feather(core, Math.max(1, EDGE_FEATHER * face.iod), "outside");
    const area = { weight: { data: Float64Array.from(halo.data, (v, i) => (core.data[i] >= 0.5 ? 1 : skin[i] >= 0.5 ? v : 0)) } };
    const zoneIdx = [], refIdx = [];
    const grown = dilate(hard, REF_MARGIN * face.iod).data;
    let bMin = Infinity, bMax = -Infinity;
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            const i = y * w + x, b = face.local(x + 0.5, y + 0.5)[1];
            if (area.weight.data[i] > 0 && !(lips[i] >= 0.5)) {
                zoneIdx.push(i);
                bMin = Math.min(bMin, b);
                bMax = Math.max(bMax, b);
            }
            else if (skin[i] >= 0.5 && !(grown[i] >= 0.5) && b >= REF_BELOW)
                refIdx.push(i);
        }
    if (zoneIdx.length < MIN_REF_PIXELS || refIdx.length < MIN_REF_PIXELS)
        return refuse("zone_not_visible");
    const lab = labPlanes(image);
    const lighter = [...refIdx].sort((p, q) => lab.L[q] - lab.L[p]).slice(0, Math.max(MIN_REF_PIXELS, Math.floor(refIdx.length * REF_KEEP_SHARE)));
    const ref = [lab.L, lab.a, lab.b].map((plane) => median(lighter.map((i) => plane[i])));
    // The light across the face: her right and left cheeks each give their own level, blended across.
    const across = (i) => face.local((i % w) + 0.5, Math.floor(i / w) + 0.5)[0];
    const sideL = [lighter.filter((i) => across(i) < 0), lighter.filter((i) => across(i) >= 0)]
        .map((side) => side.length >= MIN_REF_PIXELS / 2 ? median(side.map((i) => lab.L[i])) : ref[0]);
    let aMax = 1e-6;
    for (const i of zoneIdx)
        aMax = Math.max(aMax, Math.abs(across(i)));
    // The cheek's own grain: spread of L* around its local mean, over the reference pixels.
    const refMask = new Float64Array(n);
    for (const i of refIdx)
        refMask[i] = 1;
    const smooth = maskedLowpass(lab.L, refMask, w, h, radius(face.iod, BASE_RADIUS, 2));
    let s2 = 0;
    for (const i of refIdx)
        s2 += (lab.L[i] - smooth[i]) ** 2;
    const grainL = TEXTURE_SHARE * Math.sqrt(s2 / refIdx.length);
    const r4 = (v) => Math.round(v * 1e4) / 1e4, r3 = (v) => Math.round(v * 1e3) / 1e3;
    const metrics = { scope: FULL_SCOPE, estimated: true, cheek_l: r3(ref[0]), cheek_l_right: r3(sideL[0]), cheek_l_left: r3(sideL[1]), grain_l: r3(grainL),
        zone_pixels: zoneIdx.length, kept_taps: keep.length, amount_cap: FULL_CAP };
    if (strength === 0)
        return { image: Uint8Array.from(image.data), weight: new Float64Array(n), label: FULL_LABEL, metrics: { ...metrics, unchanged: true } };
    const spared = new Uint8Array(n), keepR2 = (KEEP_RADIUS * face.iod) ** 2;
    for (const [kx, ky] of keep)
        for (const i of zoneIdx) {
            const x = i % w, y = (i - x) / w;
            if ((x + 0.5 - kx) ** 2 + (y + 0.5 - ky) ** 2 <= keepR2)
                spared[i] = 1;
        }
    const weight = new Float64Array(n), span = Math.max(bMax - bMin, 1e-6);
    for (const i of zoneIdx) {
        if (spared[i])
            continue;
        weight[i] = Math.min(1, area.weight.data[i]) * FULL_CAP * (strength / 100);
        if (!(weight[i] > 0))
            continue;
        const x = i % w, y = (i - x) / w, t = (face.local(x + 0.5, y + 0.5)[1] - bMin) / span;
        const g = 0.6 * (grain(x, y) - 0.5) + 0.4 * ((grain(x >> 1, y >> 1) + grain((x >> 1) + 1, y >> 1)) / 2 - 0.5);
        const under = skin[i] >= 0.5 ? 0 : NECK_SHADOW_L * t; // below the jaw line: the neck in the jaw's shadow
        const u = face.local(x + 0.5, y + 0.5)[0] / aMax, side = Math.min(1, Math.abs(u));
        const lit = sideL[0] + (sideL[1] - sideL[0]) * Math.min(1, Math.max(0, (u + 1) / 2));
        const level = lit - BASE_SHADE_L - JAW_SHADOW_L * t * t - SIDE_SHADOW_L * side ** 3 - under;
        const target = [Math.min(Math.max(...sideL), level + 2 * grainL * g), ref[1], ref[2]];
        lab.L[i] += weight[i] * (target[0] - lab.L[i]);
        lab.a[i] += weight[i] * (target[1] - lab.a[i]);
        lab.b[i] += weight[i] * (target[2] - lab.b[i]);
    }
    Object.assign(metrics, { weighted_share: r4(zoneIdx.filter((i) => weight[i] > 0).length / zoneIdx.length) });
    return { image: encode(image, lab, weight), weight, label: FULL_LABEL, metrics };
}
//# sourceMappingURL=full.js.map