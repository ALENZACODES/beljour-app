import { CURVE_PRESETS, presetParams } from "./curves.js";
import { ASPECT_BUTTONS, IDENTITY, geometryParams, refit } from "../crop/geometry.js";
import { SELECTIVE_DEFAULTS } from "./selective.js";
/** A new selective layer: a point in the middle, nothing changed yet. */
export const SELECTIVE_START = Object.freeze({ mode: "point", x: SELECTIVE_DEFAULTS.x, y: SELECTIVE_DEFAULTS.y });
const ADJUST_STARTS = [
    ["brighter", "Brighter", { exposure: 0.35, shadows: 15 }],
    ["open-shadows", "Open shadows", { shadows: 45, highlights: -20, brilliance: 15 }],
    ["punchy", "More depth", { contrast: 25, clarity: 20, vibrance: 15 }],
    ["soft-matte", "Soft matte", { contrast: -15, black_point: -40, fade: 25 }],
    ["warmer", "Warmer", { temperature: 25 }],
    ["cooler", "Cooler", { temperature: -25 }],
    ["clear-detail", "Crisp detail", { sharpen: 40, clarity: 15, noise: 15 }],
    ["film-grain", "Film grain", { grain: 35, vignette: -25, fade: 10 }],
];
const MIXER_STARTS = [
    ["richer", "Richer colour", { red_s: 20, orange_s: 15, yellow_s: 20, green_s: 25, aqua_s: 25, blue_s: 25, purple_s: 20, magenta_s: 20 }],
    ["skies", "Deeper skies", { blue_s: 30, blue_l: -20, aqua_s: 20, aqua_l: -10 }],
    ["leaves", "Fresher greens", { green_s: 25, green_h: -15, yellow_h: 10, green_l: 10 }],
    ["quiet-greens", "Quiet greens", { green_s: -45, aqua_s: -25, yellow_s: -15 }],
    ["soft-reds", "Softer reds", { red_s: -25, magenta_s: -20 }],
    ["golden", "Golden hour", { yellow_h: -15, yellow_s: 15, orange_l: 10, blue_s: -15 }],
];
export function editorOptions(kind, source) {
    if (kind === "adjust" || kind === "mixer") {
        const rows = kind === "adjust" ? ADJUST_STARTS : MIXER_STARTS;
        return rows.map(([id, label, values], i) => ({ id: `${kind}:start:${id}`, kind, key: "start", label,
            params: { ...values, start: id }, strength: 100, rank: i + 1 }));
    }
    if (kind === "curves") {
        return CURVE_PRESETS.filter((p) => p.id !== "original").map((p, i) => ({ id: `curves:preset:${p.id}`, kind, key: "preset", label: p.name,
            params: presetParams(p.id), strength: 100, rank: i + 1 }));
    }
    if (kind === "crop" && source) {
        const { width, height } = source.image;
        return ASPECT_BUTTONS.filter((a) => a.id !== "free" && a.id !== "original").map((a, i) => ({ id: `crop:aspect:${a.id}`, kind, key: "aspect",
            label: a.label, params: { ...geometryParams(refit(width, height, { ...IDENTITY, aspect: a.id })), aspect: a.id }, strength: 100, rank: i + 1 }));
    }
    return [];
}
//# sourceMappingURL=options.js.map