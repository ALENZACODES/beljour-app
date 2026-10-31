/** Meadow Crown: owned parametric art and observed hair occlusion. Author: John Khan. */
import { ellipseAlpha, faceFrame, over, pathDistance } from "./geometry.js";
import { blend, hashNoise, integer, landmarks, mask, number, parameters, photo, result, smooth01 } from "./types.js";
export const DEFAULTS = { amount: 0.8, size: 1.0, height: 0.05, flowers: 7, palette: "rose", seed: 23 };
export const PALETTES = {
    rose: [[224, 119, 148], [249, 217, 225], [244, 194, 86]],
    ivory: [[242, 232, 208], [255, 249, 232], [213, 174, 62]],
    violet: [[163, 140, 208], [220, 211, 245], [235, 203, 95]],
};
export const LABEL = "Meadow Crown simulation. Original floral art sits behind your hair mask.";
export function crownAnchors(points, count, size, height) {
    const frame = faceFrame(points);
    const forehead = [points[10][0] - frame.down[0] * frame.iod * height,
        points[10][1] - frame.down[1] * frame.iod * height];
    return Array.from({ length: count }, (_, i) => {
        const t = -1 + 2 * i / (count - 1), span = frame.iod * t * 0.78;
        const curve = frame.iod * (0.13 * t * t - 0.035) * size;
        return [forehead[0] + frame.across[0] * span + frame.down[0] * curve,
            forehead[1] + frame.across[1] * span + frame.down[1] * curve];
    });
}
export function crownArt(width, height, points, p) {
    const frame = faceFrame(points), n = width * height;
    const anchors = crownAnchors(points, p.count, p.size, p.height);
    const rgb = new Float64Array(n * 3), alpha = new Float64Array(n);
    const vineDistance = pathDistance(width, height, anchors, Math.max(0.65, frame.iod * 0.009) + 0.6).distance;
    const vine = vineDistance.map((d) => smooth01((Math.max(0.65, frame.iod * 0.009) + 0.6 - d) / 1.0));
    over(rgb, alpha, [61, 104, 61], vine);
    const [outer, inner, centre] = PALETTES[p.palette];
    for (const [i, anchor] of anchors.entries()) {
        const jitter = hashNoise(i + 1, 1, p.seed), radius = frame.iod * p.size * (0.078 + 0.025 * jitter);
        const angle = frame.roll + jitter * Math.PI;
        for (const side of [-1, 1]) {
            const cx = anchor[0] + frame.across[0] * radius * side * 0.9 + frame.down[0] * radius * 0.55;
            const cy = anchor[1] + frame.across[1] * radius * side * 0.9 + frame.down[1] * radius * 0.55;
            const leaf = ellipseAlpha(width, height, cx, cy, radius * 1.05, radius * 0.37, frame.roll + side * 0.45);
            over(rgb, alpha, [78, 126, 75], leaf);
        }
        for (let petal = 0; petal < 6; petal++) {
            const theta = angle + petal * Math.PI / 3;
            const cx = anchor[0] + Math.cos(theta) * radius * 0.64, cy = anchor[1] + Math.sin(theta) * radius * 0.64;
            const petalAlpha = ellipseAlpha(width, height, cx, cy, radius * 0.85, radius * 0.43, theta);
            over(rgb, alpha, outer.map((v) => v * (0.72 + 0.28 * petal / 5)), petalAlpha);
            const vein = ellipseAlpha(width, height, cx, cy, radius * 0.63, radius * 0.16, theta).map((v) => v * 0.35);
            over(rgb, alpha, inner, vein);
        }
        const disc = ellipseAlpha(width, height, anchor[0], anchor[1], radius * 0.38, radius * 0.38, 0, 0.32);
        over(rgb, alpha, centre, disc);
    }
    for (let i = 0; i < n; i++) {
        for (let c = 0; c < 3; c++)
            rgb[i * 3 + c] = Math.min(255, Math.max(0, rgb[i * 3 + c] / Math.max(alpha[i], 1e-12)));
    }
    return { rgb, alpha, anchors };
}
export function renderCrownFrame(image, points, hairMask, params) {
    const src = photo(image), p = parameters(params, DEFAULTS), n = src.width * src.height;
    if (points.length !== 478 || points.some((point) => point.length !== 2 || point.some((v) => !Number.isFinite(v)))) {
        throw new RangeError("crown frame needs 478 finite pixel points");
    }
    if (Math.hypot(points[468][0] - points[473][0], points[468][1] - points[473][1]) < 4) {
        throw new RangeError("crown frame has a degenerate eye distance");
    }
    const amount = number(p.amount, "amount", 0, 1), size = number(p.size, "size", 0.5, 1.6);
    const height = number(p.height, "height", -0.25, 0.3), count = integer(p.flowers, "flowers", 3, 11);
    const seed = integer(p.seed, "seed", 0, 2 ** 31 - 1);
    if (typeof p.palette !== "string" || !Object.hasOwn(PALETTES, p.palette))
        throw new RangeError("palette must be rose, ivory or violet");
    const palette = p.palette, hair = mask(hairMask, n, "hair_mask");
    const art = crownArt(src.width, src.height, points, { size, height, count, palette, seed });
    const support = new Float64Array(n);
    let visible = 0, total = 0;
    for (let i = 0; i < n; i++) {
        support[i] = art.alpha[i] * (1 - hair[i]) * amount;
        visible += support[i];
        total += art.alpha[i] * amount;
    }
    const out = blend(src, art.rgb, support);
    let hairError = 0;
    for (let i = 0; i < n; i++) {
        if (hair[i] !== 1)
            continue;
        for (let c = 0; c < 3; c++)
            hairError = Math.max(hairError, Math.abs(out[i * src.channels + c] - src.data[i * src.channels + c]));
    }
    const warnings = ["Original procedural artwork; placement depends on your confirmed mesh and hair matte."];
    if (visible < 1)
        warnings.push("The crown is hidden by the hair mask or outside the photo.");
    return result("meadow-crown", src, out, support, LABEL, { hair_foreground_max_error: hairError, visible_alpha_sum: visible, unoccluded_alpha_sum: total,
        occluded_fraction: total > 0 ? 1 - visible / total : 0, geometry_displacement: 0, flower_count: count }, warnings, { anchors: art.anchors, art_alpha: art.alpha });
}
export function meadowCrown(image, mesh, hairMask, params) {
    const src = photo(image);
    return renderCrownFrame(src, landmarks(mesh, src.width, src.height), hairMask, params);
}
