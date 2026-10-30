import { brightenUnderEyes } from "../../engines/skin/under-eye.js";
/** Settings a new under-eye layer starts with: dark circles and eye-bag shadow together. */
export const UNDER_EYE_DEFAULTS = Object.freeze({ include_bags: true });
export function applyUnderEyeLayer(image, source, layer) {
    if (layer.kind !== "under-eye")
        return null;
    if (!source.face || source.face.length !== 478)
        throw new RangeError("Under-eye brightening needs 478 recorded face points.");
    const includeBags = layer.parameters.include_bags !== false;
    const result = brightenUnderEyes(image, source.face, { strength: layer.strength, includeBags });
    const metrics = { status: result.status, reason_code: result.reasonCode, include_bags: includeBags, mask_source: "face points" };
    if (result.status === "edited")
        return { image: result.image, label: result.label, metrics };
    return { image: { ...image, data: Uint8ClampedArray.from(image.data) }, label: `${result.message} ${result.label}`, metrics };
}
//# sourceMappingURL=under-eye-layer.js.map