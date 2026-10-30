import { hexToRgb } from "../../engines/core/colour.js";
import { srgbToLab } from "../../engines/shade/colourspace.js";
import { LABEL as LIGHT_LABEL, relightImage, simulateLook } from "../../engines/shade/lighting.js";
import { recolourHair } from "../../engines/haircolour/recolour.js";
import { paint, measureBaseLevel } from "../../engines/haircolour/balayage.js";
import { easeStrength } from "./strength-curve.js";
export function parameter(layer, key, fallback) {
    const value = layer.parameters[key];
    return typeof value === "string" ? value : fallback;
}
export function numeric(layer, key, fallback) {
    const value = layer.parameters[key];
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
export function photoMeanLab(image) {
    const sum = [0, 0, 0];
    const count = image.width * image.height;
    const step = Math.max(1, Math.floor(count / 512));
    let sampled = 0;
    for (let i = 0; i < count; i += step) {
        const p = i * image.channels;
        const lab = srgbToLab([image.data[p], image.data[p + 1], image.data[p + 2]]);
        for (let c = 0; c < 3; c++)
            sum[c] += lab[c];
        sampled++;
    }
    return sum.map(v => v / sampled);
}
/** Dye lifts dark hair only so far in one go: the target's lightness is held to at most
 * MAX_HAIR_LIFT L* above her hair's own average, and its chroma eased down with it, so a light
 * shade on black hair reads as a rich dark version of that shade instead of a painted wig.
 * Darker targets are untouched. ASSUMED limit from the example faces. */
export const MAX_HAIR_LIFT = 18;
export function believableTarget(image, hair, target) {
    let sum = 0, weight = 0;
    const step = Math.max(1, Math.floor(hair.length / 40000));
    for (let i = 0; i < hair.length; i += step) {
        const w = hair[i];
        if (!(w > 0.5))
            continue;
        const p = i * image.channels;
        sum += w * srgbToLab([image.data[p], image.data[p + 1], image.data[p + 2]])[0];
        weight += w;
    }
    if (!(weight > 0))
        return target;
    const mean = sum / weight, limit = mean + MAX_HAIR_LIFT;
    if (target[0] <= limit)
        return target;
    const scale = Math.sqrt(Math.max(0.2, limit / Math.max(1, target[0])));
    return [limit, target[1] * scale, target[2] * scale];
}
export function applyBeautyLayer(image, source, layer, lightingRenderer) {
    if (layer.kind === "lighting") {
        const id = parameter(layer, "preset", "daylight");
        const rendered = lightingRenderer?.render(image, id) ?? {
            image: { ...image, data: Uint8Array.from(relightImage(image, id)) }, label: LIGHT_LABEL,
            metrics: { backend: "cpu", lighting: id },
        };
        const report = simulateLook({ photo_sample: photoMeanLab(image) }, [], [id]);
        return { ...rendered, metrics: { ...rendered.metrics,
                shift_delta_e: report.items.photo_sample.by_preset[id].shift_delta_e,
                measurement: "Sampled whole-photo mean; not a product measurement", calibration: "Screen is not colour-calibrated" } };
    }
    if (layer.kind === "recolour") {
        if (!source.hair)
            throw new RangeError("Mark the hair area before recolouring.");
        const target = believableTarget(image, source.hair.data, srgbToLab(hexToRgb(parameter(layer, "colour", "#6B3F2A"))));
        const result = recolourHair(image, source.hair.data, target, { strength: layer.strength / 100 });
        return { image: { ...image, data: Uint8Array.from(result.image) }, label: `Local simulation. ${result.label}`,
            metrics: { geometry_lock: result.checks.geometry_lock, outside_unchanged: result.checks.outside_unchanged,
                edge_map_iou: result.checks.edge_map_iou, structure_correlation: result.checks.structure_correlation,
                curl_pattern: parameter(layer, "curl_pattern", "not specified"), mask_source: "manual or drawn example" } };
    }
    if (layer.kind === "balayage") {
        if (!source.hair || !source.hairPaint)
            throw new RangeError("Mark hair and paint the placement first.");
        const base = measureBaseLevel(image, source.hair.data);
        const result = paint(image, source.hair.data, source.hairPaint.data, {
            targetLevel: numeric(layer, "target_level", Math.min(10, base + 2)),
            history: parameter(layer, "history", "colour_treated"),
            toner: parameter(layer, "toner", "none"),
            softness: numeric(layer, "softness", 4),
        });
        // Strength blends the requested lift in Lab in the W39 engine, preserving structure.
        let peak = 0;
        for (const value of result.lift)
            peak = Math.max(peak, value);
        const recoloured = recolourHair(image, source.hair.data, result.colour_lab, 
        // Eased like the other colour tools, so 30 and 50 already show the placement; 100 is the full lift.
        { strength: easeStrength(layer.strength), alpha: result.lift.map(v => v / Math.max(peak, 1e-9)) });
        return { image: { ...image, data: Uint8Array.from(recoloured.image) }, label: `Local simulation. ${result.label}`,
            metrics: { base_level: base, target_level: result.plan.target_level, sessions: result.plan.sessions,
                session_1_level: result.plan.session_1_level, assumed: true, note: result.plan.note,
                geometry_lock: recoloured.checks.geometry_lock, outside_unchanged: recoloured.checks.outside_unchanged } };
    }
    return null;
}
//# sourceMappingURL=beauty-layer.js.map