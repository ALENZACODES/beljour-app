/** #24 Beard removal for stubble and short beards, local, from the face mesh. Mirrors
 * api/plumb_api/engines/shave/remove.py in the same order: beard area kept to visible face
 * skin, her cheek above it as the reference, scope measured against this photo's own
 * cheek-to-hair contrast (stubble, short beard, or refused as "full_beard"), keep taps that leave
 * the marks she taps exactly as they were, low-frequency fill from her nearby skin with the shaving shadow
 * reduced, capped per scope, never above her cheek's L*. Alpha copied; strength 0 a copy.
 * Shares and radii are ASSUMED. A visual estimate, not a grooming or medical prediction.
 * Author: John Khan.
 */
import { dilate } from "../core/mask.js";
import { beardArea } from "../local/beard.js";
import { srgbToLab } from "../shade/colourspace.js";
import { encode, frame, labPlanes, maskedLowpass, median, radius, skinMask, xy } from "../skin/common.js";
import { meshProblems, REASONS } from "../skin/studio.js";
import { percentile } from "../teeth/natural.js";
import { shaveAmountCap } from "./assessment.js";
export const MODULE = "shave.remove";
export const LABEL = "Clean-shave visual estimate for stubble and short beards. Skin under the hair is estimated "
    + "from your nearby skin; fine texture under dense hair is not invented.";
export const HAIR_PERCENTILE = 5.0, SKIN_SHARE = 0.3, HAIR_SHARE = 0.4, MIN_RELATIVE_CONTRAST = 0.16, KEEP_RADIUS = 0.05;
export const ROUNDING_MARGIN = 0.5, STUBBLE_VISIBLE = 0.5, SKIN_VISIBLE_MIN = 0.2, NO_BEARD_SHARE = 0.03;
export const REF_BELOW = 0.35, REF_MARGIN = 0.08, BASE_RADIUS = 0.06, CAST_RADIUS = 0.3, SHADOW_SHARE = 0.6, MIN_REF_PIXELS = 40;
export const MESSAGES = Object.freeze({
    zone_not_visible: "The beard area or the cheek beside it is not visible enough in this photo.",
    no_beard_found: "No stubble or short beard was found, so nothing was changed.",
    full_beard: "This beard hides the skin and the jaw line. The clean-shave estimate covers stubble and short beards only.",
});
export function isShaveRefusal(value) {
    return value.refused === true;
}
export function removeBeard(image, points, strength = 30, keep = []) {
    const { width: w, height: h, channels: ch } = image;
    if (!Number.isInteger(w) || !Number.isInteger(h) || Math.min(w, h) < 8 || (ch !== 3 && ch !== 4) || image.data.length !== w * h * ch) {
        throw new RangeError("beard removal needs an RGB or RGBA photo of at least 8 x 8");
    }
    if (!Number.isFinite(strength) || strength < 0 || strength > 100)
        throw new RangeError("strength must be 0..100");
    if (!Array.isArray(keep) || keep.some(p => !Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite))) {
        throw new RangeError("keep must be a list of [x, y] points");
    }
    if (keep.some(([x, y]) => !(x >= 0 && x < w && y >= 0 && y < h)))
        throw new RangeError("keep points must lie inside the photo");
    const refuse = (code) => ({ refused: true, module: MODULE, code, message: MESSAGES[code] ?? REASONS[code] });
    const problems = meshProblems(points, w, h);
    if (problems.length)
        return refuse(problems[0]);
    const pts = points.map(xy);
    let area;
    try {
        area = beardArea(pts, w, h);
    }
    catch {
        return refuse("zone_not_visible");
    }
    const face = frame(pts), n = w * h, skin = skinMask(pts, w, h);
    const inside = new Uint8Array(n), zone = new Float64Array(n);
    for (let i = 0; i < n; i++)
        if (area.hard.data[i] >= 0.5 && skin[i] >= 0.5) {
            inside[i] = 1;
            zone[i] = 1;
        }
    const grown = dilate(area.hard, REF_MARGIN * face.iod).data;
    const lab = labPlanes(image), ref = [0, 0, 0], refIdx = [], zoneIdx = [];
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            const i = y * w + x;
            if (inside[i])
                zoneIdx.push(i);
            if (skin[i] >= 0.5 && !(grown[i] >= 0.5) && face.local(x + 0.5, y + 0.5)[1] >= REF_BELOW)
                refIdx.push(i);
        }
    if (zoneIdx.length < MIN_REF_PIXELS || refIdx.length < MIN_REF_PIXELS)
        return refuse("zone_not_visible");
    [lab.L, lab.a, lab.b].forEach((plane, c) => { ref[c] = median(refIdx.map(i => plane[i])); });
    const contrast = ref[0] - percentile(zoneIdx.map(i => lab.L[i]), HAIR_PERCENTILE);
    const skinLevel = ref[0] - SKIN_SHARE * contrast, ramp = Math.max(HAIR_SHARE * contrast, 1e-6);
    const hair = new Float64Array(n), spared = new Uint8Array(n);
    for (const i of zoneIdx)
        hair[i] = Math.min(1, Math.max(0, (skinLevel - lab.L[i]) / ramp));
    const keepR2 = (KEEP_RADIUS * face.iod) ** 2;
    for (const [kx, ky] of keep)
        for (let y = 0; y < h; y++)
            for (let x = 0; x < w; x++) {
                if ((x + 0.5 - kx) ** 2 + (y + 0.5 - ky) ** 2 <= keepR2) {
                    hair[y * w + x] = 0;
                    spared[y * w + x] = 1;
                }
            }
    let skinLike = 0, hairy = 0;
    for (const i of zoneIdx) {
        if (lab.L[i] >= skinLevel)
            skinLike++;
        if (hair[i] > 0)
            hairy++;
    }
    const visible = skinLike / zoneIdx.length, hairShare = hairy / zoneIdx.length;
    const r4 = (v) => Math.round(v * 1e4) / 1e4, r3 = (v) => Math.round(v * 1e3) / 1e3;
    const metrics = { skin_visible_share: r4(visible), hair_share: r4(hairShare), contrast_l: r3(contrast),
        cheek_l: r3(ref[0]), kept_taps: keep.length };
    if (contrast < MIN_RELATIVE_CONTRAST * ref[0])
        return refuse("no_beard_found");
    if (visible < SKIN_VISIBLE_MIN)
        return refuse("full_beard");
    if (hairShare < NO_BEARD_SHARE)
        return refuse("no_beard_found");
    const scope = visible >= STUBBLE_VISIBLE ? "stubble" : "short_beard";
    metrics.scope = scope;
    if (strength === 0)
        return { image: Uint8Array.from(image.data), weight: new Float64Array(n), label: LABEL, metrics: { ...metrics, unchanged: true } };
    const cap = shaveAmountCap(scope), weight = new Float64Array(n), clean = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        weight[i] = spared[i] ? 0 : area.weight.data[i] * zone[i] * cap * (strength / 100);
        clean[i] = zone[i] * (1 - hair[i]) ** 2;
    }
    const rBase = radius(face.iod, BASE_RADIUS, 2), rCast = radius(face.iod, CAST_RADIUS, 3);
    const original = { L: Float64Array.from(lab.L), a: Float64Array.from(lab.a), b: Float64Array.from(lab.b) };
    [lab.L, lab.a, lab.b].forEach((plane, c) => {
        const base = maskedLowpass(plane, clean, w, h, rBase), cast = maskedLowpass(base, zone, w, h, rCast);
        for (let i = 0; i < n; i++) {
            const target = base[i] - SHADOW_SHARE * (cast[i] - ref[c]) + (plane[i] - base[i]) * (1 - hair[i]);
            plane[i] = plane[i] + weight[i] * (target - plane[i]);
        }
    });
    for (let i = 0; i < n; i++)
        lab.L[i] = Math.min(lab.L[i], Math.max(original.L[i], ref[0] - ROUNDING_MARGIN));
    const out = encode(image, lab, weight);
    let restored = 0;
    for (let i = 0; i < n; i++) {
        if (!(weight[i] > 0))
            continue;
        const after = srgbToLab([out[i * ch], out[i * ch + 1], out[i * ch + 2]])[0];
        if (after > Math.max(original.L[i], ref[0]) + 1e-9) {
            restored++;
            for (let c = 0; c < 3; c++)
                out[i * ch + c] = image.data[i * ch + c];
        }
    }
    Object.assign(metrics, { restored_pixels: restored, amount_cap: cap });
    return { image: out, weight, label: LABEL, metrics };
}
//# sourceMappingURL=remove.js.map