import { greyPreview, isGreyRefusal, STAGES } from "../../engines/haircolour/grey.js";
import { isShaveRefusal } from "../../engines/shave/remove.js";
import { cleanShave } from "../../engines/shave/clean.js";
import { isTeethRefusal, whitenTeeth } from "../../engines/teeth/natural.js";
import { rootStrength } from "./strength-curve.js";
import { extendWhitening } from "./teeth-extend.js";
function unchanged(image, message, label, metrics) {
    // The message rides in the metrics too, so the Studio can show why nothing changed (view.ts).
    return { image: { ...image, data: Uint8ClampedArray.from(image.data) }, label: `${message} ${label}`, metrics: { ...metrics, message } };
}
/** Shave change where a beard can be: the lower face (nose base to chin, jaw width) from the 478 points.
 * r1 averaged over the WHOLE photo (threshold 0.75), so a real short-beard shave on a 640 px headshot (a few % of the
 * frame) could read under the bar, while the live beardless deep-skin sample still changed 0.89 and passed.
 * Returns the share of lower-face pixels changed by >= CHANGE_LEVELS on any channel, and their mean change. */
export const CHANGE_LEVELS = 6, MIN_CHANGED_SHARE = 0.04; // ASSUMED: calibrate on a stubble sample (none exist yet)
export function lowerFaceChange(before, after, width, height, channels, face) {
    if (before.length !== after.length || before.length !== width * height * channels)
        throw new RangeError("Edited image has wrong dimensions");
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [x, y] of face) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
    }
    const nose = face[2]?.[1] ?? y0 + 0.55 * (y1 - y0); // mesh point 2: base of the nose (ASSUMED MediaPipe index)
    const X0 = Math.max(0, Math.floor(x0)), X1 = Math.min(width - 1, Math.ceil(x1));
    const Y0 = Math.max(0, Math.floor(nose)), Y1 = Math.min(height - 1, Math.ceil(y1 + 0.04 * (y1 - y0)));
    let n = 0, hit = 0, sum = 0;
    for (let y = Y0; y <= Y1; y++)
        for (let x = X0; x <= X1; x++) {
            const i = (y * width + x) * channels;
            let d = 0;
            for (let c = 0; c < 3; c++)
                d = Math.max(d, Math.abs(before[i + c] - after[i + c]));
            n++;
            if (d >= CHANGE_LEVELS) {
                hit++;
                sum += d;
            }
        }
    return { share: n ? hit / n : 0, mean: hit ? sum / hit : 0, pixels: n };
}
export function greyStage(layer) {
    const value = layer.parameters.stage ?? "cover";
    if (!STAGES.includes(value))
        throw new RangeError("Unknown Grey Transition stage");
    return value;
}
export const TEETH_POWER = 0.23, SHAVE_POWER = 0.35;
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
    // engines/shave/clean.ts: finds hair against her own skin and replaces it with her own skin,
    // stubble, moustache and full beards alike, and leaves a beardless face untouched. A part-mixed
    // fill lets the beard show through as a grey ghost, so the slider follows a steep curve.
    const strength = Math.min(100, 100 * rootStrength(layer.strength, SHAVE_POWER));
    const result = cleanShave(image, source.face, strength);
    if (isShaveRefusal(result))
        return unchanged(image, result.message, "Clean-shave visual estimate.", { status: "refused", reason_code: result.code });
    return { image: { ...image, data: result.image }, label: result.label,
        metrics: { ...result.metrics, status: "edited", mask_source: "face points" } };
}
//# sourceMappingURL=hair-beard-teeth-layer.js.map