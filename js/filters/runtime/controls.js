import { catalogue } from "../recipe/registry.js";
import { BUILT_ADDON_IDS, addonParamKey, defaultFilterParams, recipeFor } from "./layer.js";
import { checkedLevel, fromPercent, levelValues } from "./strength.js";
export const TOGGLE_LABELS = {
    guard: "Skin guard (keeps your skin tone)",
    protect: "Protect skin",
    background: "Background only",
};
export function filterControls(layer, options = {}) {
    const recipe = recipeFor(layer);
    const p = layer.parameters;
    const flag = (key, fallback) => (typeof p[key] === "boolean" ? p[key] : fallback);
    const pending = recipe.presets.flatMap((x) => x.pending ?? []).concat(recipe.defaults.addons.filter((a) => a.amount > 0 && !catalogue().addons.get(a.id)?.built)
        .map((a) => `${catalogue().addons.get(a.id)?.label.toLowerCase() ?? a.id} ${catalogue().addons.get(a.id)?.round ?? ""}`.trim()));
    const review = recipe.defaults.addons.filter((a) => {
        const key = `addon_${a.id.replace(/-/g, "_")}`;
        const value = p[key];
        return a.amount > 0 && catalogue().addons.get(a.id)?.manualOnly &&
            !(typeof value === "number" && value > 0);
    }).map((a) => catalogue().addons.get(a.id)?.label ?? a.id);
    const guardOn = flag("guard", recipe.defaults.guard);
    // An explicit editor preference wins. Otherwise respect the operating system
    // without relying on matchMedia in Node, workers, or server-side rendering.
    const reducedMotion = options.reducedMotion ?? (typeof matchMedia === "function"
        && matchMedia("(prefers-reduced-motion: reduce)").matches);
    const level = typeof p.level === "number" ? checkedLevel(p.level) : fromPercent(layer.strength ?? recipe.defaults.strength);
    const hint = [
        recipe.description + ".",
        `${recipe.editorial.family} · ${recipe.editorial.light} light.`,
        "Identity Lock starts on. Skin hue is protected whenever a face mask is available.",
        guardOn ? "The skin guard holds your skin's lightness, tone and detail." : "Skin guard off: the look also changes your skin's lightness and chroma.",
        pending.length ? `Coming later: ${[...new Set(pending)].join(", ")}.` : "",
        review.length
            ? `Pending visual review: ${[...new Set(review)].join(", ")}. Try the opt-in control to preview.`
            : "",
    ].filter(Boolean).join(" ");
    return {
        recipe: recipe.id, family: recipe.editorial.family, light: recipe.editorial.light,
        level, levels: levelValues(), identityLock: flag("identity_lock", true),
        looks: catalogue().recipes.map((r) => ({ value: r.id,
            label: `${r.name} · ${r.tab} · ${r.editorial.family} · ${r.editorial.light}` })),
        preset: typeof p.preset === "string" ? p.preset : "",
        presets: [{ value: "", label: "Standard" }, ...recipe.presets.filter((x) => (x.append?.length ?? 0) + Object.keys(x.patch ?? {}).length > 0)
                .map((x) => ({ value: x.name, label: x.name }))],
        toggles: [
            { key: "guard", label: TOGGLE_LABELS.guard, value: guardOn },
            { key: "protect", label: TOGGLE_LABELS.protect, value: flag("protect", recipe.defaults.protectSkin) },
            { key: "background", label: TOGGLE_LABELS.background, value: flag("background", recipe.defaults.backgroundOnly) },
        ],
        fade: typeof p.addon_fade === "number" ? p.addon_fade : 0,
        addons: BUILT_ADDON_IDS.map((id) => {
            const key = addonParamKey(id);
            const current = p[key];
            const value = catalogue().addons.get(id)?.manualOnly ? 0
                : recipe.defaults.addons.find((item) => item.id === id)?.amount ?? 0;
            return { id, key, label: catalogue().addons.get(id)?.label ?? id,
                amount: typeof current === "number" && Number.isFinite(current) ? current : value,
                maximum: 100 };
        }),
        hint,
        accessibility: {
            recipeLabel: `BELJOUR filter: ${recipe.name}, ${recipe.editorial.family}, ${recipe.editorial.light} light`,
            strengthLabel: `${recipe.name} filter strength`,
            strengthValueText: `${level.toFixed(1)} of 5.0`,
            toggles: {
                guard: TOGGLE_LABELS.guard,
                protect: TOGGLE_LABELS.protect,
                background: TOGGLE_LABELS.background,
            },
            identityLockLabel: "Keep your identity unchanged",
            previewAnnouncement: `${recipe.name} preview, ${level.toFixed(1)} of 5.0. Identity lock ${flag("identity_lock", true) ? "on" : "off"}.`,
            liveRegion: "polite",
            transitionMs: reducedMotion ? 0 : 120,
            animatePreview: !reducedMotion,
            animateBeforeAfter: !reducedMotion,
            reducedMotion,
        },
        paramsFor: (id) => defaultFilterParams(id),
        labelFor: (id) => catalogue().get(id).name,
    };
}
//# sourceMappingURL=controls.js.map