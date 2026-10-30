import { renderAge } from "../../engines/local/age.js";
import { genderTargets, LABEL as GENDER_LABEL } from "../../engines/local/gender.js";
import { meshWarp } from "../../engines/warp/mesh.js";
import { apply } from "../../engines/warp/field.js";
import { easeStrength, rootStrength } from "./strength-curve.js";
/** Level to engine amount: Normal (33) -> 72, Extra (66) -> 88, Hyper (100) -> 100, linear between and
 * 0 at Original, so each named level reads clearly and Normal < Extra < Hyper. ASSUMED values, tuned
 * with the Batch 2 probe on the synthetic samples. The eased strength mixes the level. */
export const GENDER_LEVEL_AMOUNT = [[0, 0], [33, 72], [66, 88], [100, 100]];
/** A steeper curve than the colour tools: the face-only warp moves few pixels, so 30 already gives 83%. */
export const GENDER_POWER = 0.15;
export function genderAmount(slider, strength) {
    if (!Number.isFinite(slider) || slider < -100 || slider > 100)
        throw new RangeError("Appearance direction must be -100 to 100.");
    const a = Math.abs(slider);
    let amount = 100;
    for (let k = 1; k < GENDER_LEVEL_AMOUNT.length; k++) {
        const [x0, y0] = GENDER_LEVEL_AMOUNT[k - 1], [x1, y1] = GENDER_LEVEL_AMOUNT[k];
        if (a <= x1) {
            amount = y0 + (y1 - y0) * (a - x0) / (x1 - x0);
            break;
        }
    }
    return Math.sign(slider) * amount * rootStrength(strength, GENDER_POWER);
}
export function applyHeroLayer(image, source, layer) {
    if (!["older", "younger", "gender"].includes(layer.kind))
        return null;
    const points = source.face;
    if (!points || points.length !== 478)
        throw new Error("This simulation needs recorded 478-point face geometry for this photo.");
    if (layer.kind === "gender") {
        const slider = Number(layer.parameters.slider ?? -33);
        const requested = genderAmount(slider, layer.strength);
        const target = genderTargets(points, requested, { scope: "face_only" });
        const warp = meshWarp(image.width, image.height, points, target.points, { guard: true });
        const s = warp.refused ? 0 : warp.strengthUsed;
        const face = points.map((p, i) => [p[0] + s * (target.points[i][0] - p[0]), p[1] + s * (target.points[i][1] - p[1])]);
        return { image: apply(image, warp.result.field), label: GENDER_LABEL, face,
            metrics: { slider: requested, direction: target.report.direction, scope: "face_only", styling_pending: false,
                strength_used: warp.strengthUsed, min_area_ratio: warp.flips.minAreaRatio,
                min_jacobian: warp.jacobian.minDet, refused: warp.refused,
                max_iod_percent: target.report.max_iod_percent, validated_on_released_photos: false } };
    }
    const stop = Number(layer.parameters.stop ?? (layer.kind === "older" ? 3 : 2)), max = layer.kind === "older" ? 5 : 3;
    if (!Number.isInteger(stop) || stop < 1 || stop > max)
        throw new RangeError(`Choose a ${layer.kind} stop from 1 to ${max}.`);
    // The stop carries the look; the eased strength mixes it, so 30 and 50 already read clearly.
    const result = renderAge(image, points, { stop: layer.kind === "older" ? stop : -stop, strength: easeStrength(layer.strength), seed: 1024,
        hairMask: source.hair, layers: { hair: source.hair ? 1 : 0 } });
    return { image: result.image, label: result.label, face: result.face, metrics: { ...result.metrics, stop: layer.kind === "older" ? stop : -stop,
            age_prediction: false, simulation: true, validated_on_released_photos: false } };
}
//# sourceMappingURL=hero-layer.js.map