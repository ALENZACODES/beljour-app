/** W28 balayage placement painter in the browser: she paints, the preview shows session 1.
 * Mirrors api/plumb_api/engines/haircolour/balayage.py (parity/haircolour-w39-w28.json): a soft
 * lift map from her strokes (two box-blur passes) inside the hair, an optional face frame, the
 * lift limited by base level and colour history, the warm pigment exposed at the level session 1
 * reaches, and the W39 renderer so the curl pattern is kept. Level data is ASSUMED.
 * Author: John Khan.
 */
import { LEVELS } from "./generated/levels.js";
import { boxBlur, recolourHair } from "./recolour.js";
import { srgbToLab } from "../shade/colourspace.js";
import { planRibbons, ratioLift } from "./ribbons.js";
import { renderClock } from "../skin/texture-law.js";
export const LABEL = "Balayage simulation of session 1. Lightening limits are estimates; a strand test and a colourist decide the real result.";
export const VERSION = "balayage-w28/1";
export function levelRow(level) {
    if (!Number.isInteger(level) || level < 1 || level > 10)
        throw new RangeError("hair level must be an integer 1..10");
    return LEVELS.levels[level - 1];
}
export function levelOfLightness(lightness) {
    if (!Number.isFinite(lightness))
        throw new RangeError("lightness must be finite");
    let best = LEVELS.levels[0];
    for (const row of LEVELS.levels) {
        const d = Math.abs(row.lightness - lightness), bd = Math.abs(best.lightness - lightness);
        if (d < bd || (d === bd && row.level < best.level))
            best = row;
    }
    return best.level;
}
export function levelLab(level, toner = "none") {
    const row = levelRow(level);
    const t = LEVELS.toners[toner];
    if (!t)
        throw new RangeError("unknown toner");
    const chroma = row.pigment_chroma * t.chroma_scale;
    const hue = (row.pigment_hue + t.hue_shift) * Math.PI / 180;
    return [row.lightness, chroma * Math.cos(hue), chroma * Math.sin(hue)];
}
export function sessionPlan(base, target, history = "virgin") {
    levelRow(base);
    levelRow(target);
    if (!(history in LEVELS.lift_per_session))
        throw new RangeError("unknown colour history");
    if (target <= base)
        throw new RangeError("balayage lightens: choose a target level above your base");
    const lift = LEVELS.lift_per_session[history];
    const steps = [];
    for (let level = base; level < target;) {
        level = Math.min(target, level + lift);
        steps.push(level);
    }
    let note = LEVELS.history_notes[history];
    if (steps.length > 1)
        note += ` Level ${target} from level ${base} needs ${steps.length} sessions; this preview shows session 1 (level ${steps[0]}).`;
    return { base_level: base, target_level: target, history, lift_per_session: lift, sessions: steps.length,
        levels_by_session: steps, session_1_level: steps[0], reachable_in_one_session: steps.length === 1, note, assumed: true };
}
export function measureBaseLevel(image, mask) {
    const values = [];
    for (let i = 0; i < image.width * image.height; i++) {
        if (mask[i] >= 0.5) {
            const o = i * image.channels;
            values.push(srgbToLab([image.data[o], image.data[o + 1], image.data[o + 2]])[0]);
        }
    }
    if (values.length < 16)
        throw new RangeError("not enough hair in the mask to measure its level");
    values.sort((a, b) => a - b);
    const mid = Math.floor(values.length / 2);
    return levelOfLightness(values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2);
}
export function liftMap(mask, strokes, width, height, softness = 4, faceFrame) {
    const n = width * height;
    if (strokes.length !== n || mask.length !== n)
        throw new RangeError("strokes must match the photo");
    if (!Number.isInteger(softness) || softness < 0 || softness > 64)
        throw new RangeError("softness must be an integer 0..64 pixels");
    let soft = boxBlur(boxBlur(strokes, width, height, softness), width, height, softness);
    if (faceFrame) {
        if (faceFrame.length !== n)
            throw new RangeError("face frame must match the photo");
        const frame = boxBlur(faceFrame, width, height, Math.max(1, Math.floor(softness / 2)));
        soft = soft.map((v, i) => Math.max(v, frame[i]));
    }
    return soft.map((v, i) => {
        const support = mask[i] >= 0.5 ? mask[i] : 0;
        return Math.min(1, Math.max(0, v)) * support;
    });
}
export function paint(image, mask, strokes, options) {
    const base = options.baseLevel ?? measureBaseLevel(image, mask);
    const plan = sessionPlan(base, options.targetLevel, options.history ?? "virgin");
    const toner = options.toner ?? "none";
    const colour = levelLab(plan.session_1_level, toner);
    const lift = liftMap(mask, strokes, image.width, image.height, options.softness ?? 4, options.faceFrame);
    let peak = 0;
    for (const v of lift)
        peak = Math.max(peak, v);
    if (peak <= 0)
        throw new RangeError("no painted hair: paint inside the hair to place the lightening");
    const alpha = lift.map((v) => Math.min(1, Math.max(0, v / Math.max(peak, 1e-9))));
    const rendered = recolourHair(image, mask, colour, { alpha });
    return { image: rendered.image, lift, plan, colour_lab: colour, checks: rendered.checks, toner, label: LABEL };
}
/**
 * Balayage as a colourist paints it, on her own strands. The root-to-end coordinate is geodesic through
 * the hair mask from the hairline (not each image column's top hair pixel, which beside the face is the
 * top of the shoulder-length hair, so lengths were treated as roots). Ribbons follow the hair's own flow
 * away from the root, widen toward the ends and grade along the length, with a money piece near the
 * face; the lift is a per-channel ratio with a highlight shoulder, so every strand keeps its own
 * light and dark (Texture Law). Her strokes are paint intent only. The flat `paint` above stays as the
 * Python parity reference.
 */
export function paintRibbons(image, mask, strokes, options) {
    const started = renderClock();
    const base = options.baseLevel ?? measureBaseLevel(image, mask);
    const plan = sessionPlan(base, options.targetLevel, options.history ?? "virgin");
    const toner = options.toner ?? "none";
    const colour = levelLab(plan.session_1_level, toner);
    const intent = liftMap(mask, strokes, image.width, image.height, options.softness ?? 4, options.faceFrame);
    const ribbons = planRibbons(image, mask, { scalpTopY: options.scalpTopY, intent, frame: options.faceFrame, seed: options.seed ?? 173 });
    if (ribbons.ribbons === 0)
        throw new RangeError("no coherent hair ribbons could be painted");
    const lifted = ratioLift(image, mask, ribbons, colour, Math.min(1, Math.max(0, (options.strength ?? 100) / 100)));
    const checks = options.skipGeometryChecks ? null : recolourHair(image, mask, colour, { alpha: ribbons.lift }).checks;
    return { image: lifted.data, lift: ribbons.lift, plan, colour_lab: colour, checks, toner, label: LABEL,
        metrics: { render_ms: Math.round(renderClock() - started), ribbons: ribbons.ribbons, painted_share: lifted.paintedShare, root_max: lifted.rootMax,
            width_growth: ribbons.widthGrowth, ribbon_lift_sd: ribbons.ribbonLiftSd, log_contrast_kept: lifted.logContrastKept, texture_source: "own_photo" } };
}
