/** Validated R16B Skin & More contracts. Author: John Khan. */
export const FEATURES = Array.from({ length: 16 }, (_, i) => `W${77 + i}`);
export const LABEL = "Local cosmetic simulation. Appearance preview only; no medical diagnosis, treatment, SPF efficacy, or health prediction.";
export const VERSION = "skin-more-r16b/1";
export const MANUAL_MASK_FEATURES = new Set(["W79", "W80", "W81", "W82", "W85", "W86", "W87", "W88", "W90", "W91"]);
const bounded = (v, n, lo, hi) => {
    if (typeof v !== "number" || !Number.isFinite(v) || v < lo || v > hi)
        throw new RangeError(`${n}  must be ${lo} ..${hi} `);
    return v;
};
export function validateRegion(r) {
    if (!r.name || r.name.length > 48 || r.points.length < 3 || r.points.length > 256)
        throw new RangeError("invalid region");
    for (const [x, y] of r.points)
        if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1)
            throw new RangeError("region points must be normalized");
}
export function parseSkinMoreOptions(v) {
    if (!FEATURES.includes(v.feature))
        throw new RangeError("unsupported Skin & More feature");
    const masks = v.masks ?? [];
    masks.forEach(validateRegion);
    if (MANUAL_MASK_FEATURES.has(v.feature) && masks.length === 0)
        throw new RangeError("checked local region required");
    if (v.feature === "W83" && v.consent_local_health_data !== true)
        throw new Error("local health-data diary requires explicit consent");
    return { feature: v.feature, amount: bounded(v.amount ?? .5, "amount", 0, 1), style: v.style ?? "", colour: v.colour ?? [173, 112, 89], secondary_colour: v.secondary_colour ?? [99, 73, 63], undertone: v.undertone ?? "neutral", skin_depth: bounded(v.skin_depth ?? .5, "skin_depth", 0, 1), preserve_texture: bounded(v.preserve_texture ?? 1, "preserve_texture", .5, 1), masks, diary_values: (v.diary_values ?? []).map(x => bounded(x, "diary", 0, 1)), consent_local_health_data: v.consent_local_health_data ?? false, seed: bounded(v.seed ?? 17, "seed", 0, 2 ** 32 - 1), metadata: v.metadata ?? {} };
}
//# sourceMappingURL=contracts.js.map