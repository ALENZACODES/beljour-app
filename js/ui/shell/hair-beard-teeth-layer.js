import { greyPreview, isGreyRefusal, STAGES } from "../../engines/haircolour/grey.js";
import { isShaveRefusal, removeBeard } from "../../engines/shave/remove.js";
import { isTeethRefusal, whitenTeeth } from "../../engines/teeth/natural.js";
import { easeStrength, rootStrength } from "./strength-curve.js";
import { estimateFullBeard, FULL_LABEL } from "../../engines/shave/full.js";
import { extendWhitening } from "./teeth-extend.js";
function unchanged(image, message, label, metrics) {
    // The message rides in the metrics too, so the Studio can show why nothing changed (view.ts).
    return { image: { ...image, data: Uint8ClampedArray.from(image.data) }, label: `${message} ${label}`, metrics: { ...metrics, message } };
}
export function greyStage(layer) {
    const value = layer.parameters.stage ?? "cover";
    if (!STAGES.includes(value))
        throw new RangeError("Unknown Grey Transition stage");
    return value;
}
export const TEETH_POWER = 0.23, FULL_POWER = 0.15;
export function applyHairBeardTeethLayer(image, source, layer) {
    if (layer.kind === "grey") {
        if (!source.hair)
            throw new RangeError("Mark the hair area before a Grey Transition preview.");
        const stage = greyStage(layer);
        const result = greyPreview(image, source.hair.data, { stage, strength: layer.strength });
        if (isGreyRefusal(result))
            return unchanged(image, result.message, "Grey Transition preview.", { status: "refused", reason_code: result.code, stage });
        return { image: { ...image, data: result.image }, label: result.label,
            metrics: { ...result.metrics, status: "edited", mask_source: "marked hair" } };
    }
    if (layer.kind !== "teeth" && layer.kind !== "shave")
        return null;
    if (!source.face || source.face.length !== 478)
        throw new RangeError("This tool needs 478 recorded face points.");
    if (layer.kind === "teeth") {
        // A straight line left 30 and 50 too faint to see on the teeth. The mouth opening is a small
        // area, so a steeper curve (TEETH_POWER) brings 30 close to the natural cap.
        const result = whitenTeeth(image, source.face, Math.min(100, 100 * rootStrength(layer.strength, TEETH_POWER)));
        if (isTeethRefusal(result))
            return unchanged(image, result.message, "Teeth colour simulation, not dental treatment.", { status: "refused", reason_code: result.code });
        const amount = Math.min(100, 100 * rootStrength(layer.strength, TEETH_POWER)) / 100;
        const finished = extendWhitening(image.data, result.image, image.width, image.height, image.channels, source.face, amount);
        return { image: { ...image, data: finished }, label: result.label,
            metrics: { ...result.metrics, status: "edited", mask_source: "face points" } };
    }
    const strength = Math.min(100, 100 * easeStrength(layer.strength));
    const result = removeBeard(image, source.face, strength);
    if (isShaveRefusal(result) && result.code === "full_beard") {
        // A full beard hides the skin: paint the labelled estimate from her cheek instead of refusing.
        // A part-mixed estimate lets the hidden beard show through as a grey ghost, so this path uses a
        // steeper curve (FULL_POWER): 30 already covers most of the beard.
        const estimate = estimateFullBeard(image, source.face, Math.min(100, 100 * rootStrength(layer.strength, FULL_POWER)));
        if (isShaveRefusal(estimate))
            return unchanged(image, estimate.message, "Clean-shave visual estimate.", { status: "refused", reason_code: estimate.code });
        return { image: { ...image, data: estimate.image }, label: estimate.label,
            metrics: { ...estimate.metrics, status: "estimated", message: FULL_LABEL, mask_source: "face points" } };
    }
    if (isShaveRefusal(result))
        return unchanged(image, result.message, "Clean-shave visual estimate.", { status: "refused", reason_code: result.code });
    return { image: { ...image, data: result.image }, label: result.label,
        metrics: { ...result.metrics, status: "edited", mask_source: "face points" } };
}
//# sourceMappingURL=hair-beard-teeth-layer.js.map