/** R12 protected visible-face turn support.
 * A warp fades inside the oval, keeping its rim and any caller-supplied occluder
 * pixels unchanged. Hair, glasses, a hijab and a hand use the same protection rule.
 * No RGB/skin-tone threshold, no model, no hidden-side reconstruction.
 * Face-mapping inspiration: 3DDFA_V2, DECA and face-parsing.PyTorch;
 * concept only, no code copied. MediaPipe contour indices are runtime data.
 * Mirrors api/plumb_api/engines/shape/turn_blend.py. Author: John Khan.
 */
import { floatImage, requireMask } from "../core/buffer.js";
import { distanceInside, distanceTo } from "../core/mask.js";
import { regionMask } from "../../data/regions/index.js";
import { moveMagnitude, samplePlane, weighted } from "../warp/field.js";
import { curve } from "../warp/falloff.js";
import { checkFace, faceFrame } from "../shape/geometry.js";
export const PRESERVED_RIM_PX = 3;
export const MIN_BLEND_PX = 4;
export const BLEND_IOD_SHARE = 0.18;
export const SOURCE_CLEARANCE_SHARE = 0.45;
/** Image padding is outside the visible surface, including for a cropped face. */
function depthWithBorder(oval) {
    const padded = floatImage(oval.width + 2, oval.height + 2);
    for (let y = 0; y < oval.height; y++) {
        for (let x = 0; x < oval.width; x++) {
            padded.data[(y + 1) * padded.width + x + 1] = oval.data[y * oval.width + x] >= 0.5 ? 1 : 0;
        }
    }
    const distance = distanceInside(padded);
    const out = floatImage(oval.width, oval.height, 1, true);
    for (let y = 0; y < oval.height; y++) {
        for (let x = 0; x < oval.width; x++)
            out.data[y * oval.width + x] = distance.data[(y + 1) * padded.width + x + 1];
    }
    return out;
}
export function turnSupport(width, height, points, options = {}) {
    checkFace(points);
    if (!Number.isInteger(width) || !Number.isInteger(height) || Math.min(width, height) < 2) {
        throw new RangeError("turn support needs image dimensions at least 2");
    }
    const rim = options.rimPx ?? PRESERVED_RIM_PX;
    if (!Number.isFinite(rim) || rim < PRESERVED_RIM_PX)
        throw new RangeError("turn rim must preserve at least 3 pixels");
    const frame = faceFrame(points);
    const ramp = options.blendPx ?? Math.max(MIN_BLEND_PX, BLEND_IOD_SHARE * frame.iod);
    if (!Number.isFinite(ramp) || ramp < MIN_BLEND_PX)
        throw new RangeError("turn blend must be finite and at least 4 pixels");
    const oval = regionMask("face_oval", points, width, height, { normalized: false, supersample: 2 });
    const depth = depthWithBorder(oval), protection = floatImage(width, height);
    if (options.protectedMask) {
        requireMask(options.protectedMask, width, height);
        if (options.protectedMask.data.length !== width * height)
            throw new RangeError("protection data must match the image size");
        protection.data.set(options.protectedMask.data);
    }
    const locked = floatImage(width, height);
    for (let i = 0; i < locked.data.length; i++)
        locked.data[i] = protection.data[i] > 0 ? 1 : 0;
    const objectDistance = distanceTo(locked), clearance = floatImage(width, height, 1, true);
    const weights = floatImage(width, height, 1, true);
    for (let i = 0; i < weights.data.length; i++) {
        clearance.data[i] = Math.min(depth.data[i], objectDistance.data[i]);
        weights.data[i] = oval.data[i] >= 0.5 && locked.data[i] === 0 ? curve((clearance.data[i] - rim) / ramp) : 0;
    }
    return { oval, weights, protected: protection, clearance, rimPx: rim, blendPx: ramp };
}
/** The same support with another inward ramp, reusing the distance maps. */
export function withBlend(masks, blendPx) {
    if (!Number.isFinite(blendPx) || blendPx < MIN_BLEND_PX)
        throw new RangeError("turn blend must be finite and at least 4 pixels");
    const weights = floatImage(masks.oval.width, masks.oval.height, 1, true);
    for (let i = 0; i < weights.data.length; i++) {
        weights.data[i] = masks.oval.data[i] >= 0.5 && !(masks.protected.data[i] > 0)
            ? curve((masks.clearance.data[i] - masks.rimPx) / blendPx) : 0;
    }
    return { ...masks, weights, blendPx };
}
/** Limit the entire bilinear sampling footprint, not just destination pixels. */
export function protectTurnField(field, masks) {
    requireMask(masks.weights, field.width, field.height);
    const desired = weighted(field, masks.weights), move = moveMagnitude(desired);
    const fraction = floatImage(field.width, field.height, 1, true);
    for (let i = 0; i < fraction.data.length; i++) {
        const limit = SOURCE_CLEARANCE_SHARE * Math.max(masks.clearance.data[i] - 2, 0);
        fraction.data[i] = Math.min(1, limit / Math.max(move.data[i], 1e-12));
        if (!Number.isFinite(fraction.data[i]))
            fraction.data[i] = 1;
    }
    return weighted(desired, fraction);
}
/** Control estimates after spatial attenuation; the final field is authoritative. */
export function appliedTurnTargets(before, proposed, masks, strength) {
    checkFace(before);
    checkFace(proposed);
    if (!Number.isFinite(strength) || strength < 0 || strength > 1)
        throw new RangeError("turn strength must be finite and in [0, 1]");
    return before.map(([x, y], i) => {
        const weight = samplePlane(masks.weights, x, y) * strength;
        return [x + (proposed[i][0] - x) * weight, y + (proposed[i][1] - y) * weight];
    });
}
//# sourceMappingURL=turn-blend.js.map