import { boxMean } from "../../engines/core/filters.js";
import { faceOval } from "../../lenses/effects.js";
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
export const TEETH_POWER = 0.23, FULL_POWER = 0.15;
const round3 = (v) => Math.round(v * 1000) / 1000;
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
    // A full beard hides the skin and the jaw line: the Studio shows the designed refusal and leaves the
    // photo byte-identical (clearance audit S6). The labelled estimate stays behind an explicit opt-in
    // parameter that no Studio control sets, pending a ruling on its scope.
    if (isShaveRefusal(result) && result.code === "full_beard" && layer.parameters.estimate_full_beard !== true)
        return unchanged(image, result.message, "Clean-shave visual estimate.", { status: "refused", reason_code: result.code });
    if (isShaveRefusal(result) && result.code === "full_beard") {
        // A full beard hides the skin: paint the labelled estimate from her cheek instead of refusing.
        // A part-mixed estimate lets the hidden beard show through as a grey ghost, so this path uses a
        // steeper curve (FULL_POWER): 30 already covers most of the beard.
        // Coverage follows the steep curve; how clean the shave is (stubble left) follows the slider itself.
        const estimate = estimateFullBeard(image, source.face, Math.min(100, 100 * rootStrength(layer.strength, FULL_POWER)), [], layer.strength / 100);
        if (isShaveRefusal(estimate))
            return unchanged(image, estimate.message, "Clean-shave visual estimate.", { status: "refused", reason_code: estimate.code });
        const seen = lowerFaceChange(image.data, estimate.image, image.width, image.height, image.channels, source.face);
        if (seen.share < MIN_CHANGED_SHARE)
            return unchanged(image, "No convincing shave change can be made from this image.", "Clean shave not applied.", { status: "refused", reason_code: "insufficient_visible_change", change_share: round3(seen.share) });
        return { image: { ...image, data: estimate.image }, label: estimate.label,
            metrics: { ...estimate.metrics, status: "estimated", message: FULL_LABEL, mask_source: "face points", change_share: round3(seen.share) } };
    }
    if (isShaveRefusal(result))
        return unchanged(image, result.message, "Clean-shave visual estimate.", { status: "refused", reason_code: result.code });
    // The engine's own no_beard_found test did not fire on beardless samples (live: woman 0.34, men 0.60 and 0.89):
    // refuse here when the lower face barely changed, and keep the photo byte-identical.
    const seen = lowerFaceChange(image.data, result.image, image.width, image.height, image.channels, source.face);
    if (seen.share < MIN_CHANGED_SHARE)
        return unchanged(image, "No stubble or short beard was found to remove.", "Clean shave not applied.", { status: "refused", reason_code: "no_beard_found", change_share: round3(seen.share) });
    // Stubble is fine dark texture: the beard area carries more fine detail than her cheeks. A jaw that
    // is only darker (shading, a deeper skin tone low on the face) has less, and filling it painted a
    // lighter patch on beardless faces. Measured Nov 1, 2026: beardless 0.57-0.67, stubble and short
    // beards 1.03-1.71 (synthetic samples); the cut is set between them.
    const texture = beardTexture(image, result.weight, source.face);
    if (texture < MIN_BEARD_TEXTURE)
        return unchanged(image, "No stubble or short beard was found to remove.", "Clean shave not applied.", { status: "refused", reason_code: "no_beard_found", beard_texture: round3(texture) });
    return { image: { ...image, data: softEdges(image, result.image, result.weight, source.face, Number(result.metrics.cheek_l) || 0) }, label: result.label,
        metrics: { ...result.metrics, status: "edited", mask_source: "face points", change_share: round3(seen.share) } };
}
/** The engine's weight stops in a hard step where its skin mask ends, which showed as a staircase
 * along the jaw. Here the change fades over a few pixels instead: each pixel keeps its change in
 * proportion to the blurred weight around it (never more than the engine gave it). */
export const SHAVE_EDGE_IOD = 0.14;
export const MIN_BEARD_TEXTURE = 0.85;
/** Fine-detail strength (luminance minus a 5 px box blur, RMS) in the beard area over the same on
 * the cheeks between the eye line and the nose tip, away from the nose. */
export function beardTexture(image, weight, face) {
    const { width: w, height: h, channels: ch } = image, n = w * h;
    const L = new Float64Array(n);
    for (let i = 0; i < n; i++)
        L[i] = 0.2126 * image.data[i * ch] + 0.7152 * image.data[i * ch + 1] + 0.0722 * image.data[i * ch + 2];
    const blur = boxMean({ width: w, height: h, channels: 1, data: L }, 2).data;
    const eyeY = (face[468][1] + face[473][1]) / 2, noseY = face[1][1], noseX = face[1][0], x0 = face[234][0], x1 = face[454][0], fw = x1 - x0;
    let zs = 0, zn = 0, rs = 0, rn = 0;
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            const i = y * w + x, hf = L[i] - blur[i];
            if (weight[i] > 0.3) {
                zs += hf * hf;
                zn++;
            }
            else if (y > eyeY + 0.25 * (noseY - eyeY) && y < noseY && x > x0 + 0.1 * fw && x < x1 - 0.1 * fw && Math.abs(x - noseX) > 0.12 * fw) {
                rs += hf * hf;
                rn++;
            }
        }
    if (!zn || !rn || !(rs > 0))
        return Infinity;
    return Math.sqrt(zs / zn) / Math.sqrt(rs / rn);
}
function softEdges(image, edited, weight, face, cheekL = 0) {
    const { width: w, height: h, channels: ch } = image, n = w * h;
    const iod = Math.hypot(face[468][0] - face[473][0], face[468][1] - face[473][1]);
    const r = Math.max(1, Math.min(32, Math.round(SHAVE_EDGE_IOD * iod)));
    // The change stays inside the face outline and fades out over r pixels.
    const oval = faceOval({ points: face }, w, h);
    const kept = new Float64Array(n);
    for (let i = 0; i < n; i++)
        kept[i] = Math.min(1, weight[i] * 1.6) * oval[i];
    const soft = boxMean({ width: w, height: h, channels: 1, data: kept }, r).data;
    // Stubble is fine dark texture on top of her skin's own shading. Each channel is lifted to its
    // local mean where it is darker (the hair dots), so the shading of the jaw stays as it is; the
    // engine's estimate only adds its colour change (the blue-grey shaving shadow taken out), at half.
    const rr = Math.max(2, Math.round(0.035 * iod));
    const out = new Uint8ClampedArray(image.data.length);
    for (let c = 0; c < ch; c++) {
        const plane = new Float64Array(n);
        for (let i = 0; i < n; i++)
            plane[i] = image.data[i * ch + c];
        const mean = boxMean({ width: w, height: h, channels: 1, data: plane }, rr).data;
        for (let i = 0; i < n; i++) {
            const o = i * ch + c, k = c < 3 ? soft[i] : 0;
            if (!(k > 0)) {
                out[o] = image.data[o];
                continue;
            }
            const lift = Math.max(0, mean[i] - plane[i]);
            const cast = 0.5 * (edited[o] - image.data[o]) - 0.5 * (edited[i * ch] + edited[i * ch + 1] + edited[i * ch + 2] - image.data[i * ch] - image.data[i * ch + 1] - image.data[i * ch + 2]) / 3;
            out[o] = Math.round(image.data[o] + k * (lift + cast));
        }
    }
    void cheekL;
    return out;
}
//# sourceMappingURL=hair-beard-teeth-layer.js.map