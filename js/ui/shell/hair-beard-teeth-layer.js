import { greyPreview, isGreyRefusal, STAGES } from "../../engines/haircolour/grey.js";
import { isShaveRefusal, removeBeard } from "../../engines/shave/remove.js";
import { isTeethRefusal, whitenTeeth } from "../../engines/teeth/natural.js";
function unchanged(image, message, label, metrics) {
    return { image: { ...image, data: Uint8ClampedArray.from(image.data) }, label: `${message} ${label}`, metrics };
}
export function greyStage(layer) {
    const value = layer.parameters.stage ?? "cover";
    if (!STAGES.includes(value))
        throw new RangeError("Unknown Grey Transition stage");
    return value;
}
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
        const result = whitenTeeth(image, source.face, layer.strength);
        if (isTeethRefusal(result))
            return unchanged(image, result.message, "Teeth colour simulation, not dental treatment.", { status: "refused", reason_code: result.code });
        return { image: { ...image, data: result.image }, label: result.label,
            metrics: { ...result.metrics, status: "edited", mask_source: "face points" } };
    }
    const result = removeBeard(image, source.face, layer.strength);
    if (isShaveRefusal(result))
        return unchanged(image, result.message, "Clean-shave visual estimate.", { status: "refused", reason_code: result.code });
    return { image: { ...image, data: result.image }, label: result.label,
        metrics: { ...result.metrics, status: "edited", mask_source: "face points" } };
}
//# sourceMappingURL=hair-beard-teeth-layer.js.map