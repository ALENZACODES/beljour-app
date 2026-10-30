import { renderAge } from "../../engines/local/age.js";
import { genderTargets, LABEL as GENDER_LABEL } from "../../engines/local/gender.js";
import { meshWarp } from "../../engines/warp/mesh.js";
import { apply } from "../../engines/warp/field.js";
export function applyHeroLayer(image, source, layer) {
    if (!["older", "younger", "gender"].includes(layer.kind))
        return null;
    const points = source.face;
    if (!points || points.length !== 478)
        throw new Error("This simulation needs recorded 478-point face geometry for this photo.");
    if (layer.kind === "gender") {
        const slider = Number(layer.parameters.slider ?? -33);
        if (!Number.isFinite(slider) || slider < -100 || slider > 100)
            throw new RangeError("Appearance direction must be -100 to 100.");
        const requested = slider * layer.strength / 100;
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
    const stop = Number(layer.parameters.stop ?? 1), max = layer.kind === "older" ? 5 : 3;
    if (!Number.isInteger(stop) || stop < 1 || stop > max)
        throw new RangeError(`Choose a ${layer.kind} stop from 1 to ${max}.`);
    const result = renderAge(image, points, { stop: layer.kind === "older" ? stop : -stop, strength: layer.strength / 100, seed: 1024,
        hairMask: source.hair, layers: { hair: source.hair ? 1 : 0 } });
    return { image: result.image, label: result.label, face: result.face, metrics: { ...result.metrics, stop: layer.kind === "older" ? stop : -stop,
            age_prediction: false, simulation: true, validated_on_released_photos: false } };
}
//# sourceMappingURL=hero-layer.js.map