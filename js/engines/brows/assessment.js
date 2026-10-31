/** Observable geometry alternatives and photo comparability. Author: John Khan. */
import { pixelPoints } from "../../data/regions/index.js";
import { number, photo, validateEvidence } from "./contracts.js";
import { luminance, observeBrows } from "./evidence.js";
import { browFrames, union } from "./geometry.js";
export function shapeOptions(landmarks, width, height) {
    const pts = pixelPoints(landmarks, width, height), frames = browFrames(landmarks, width, height);
    const distance = (a, b) => Math.hypot(pts[a][0] - pts[b][0], pts[a][1] - pts[b][1]);
    const faceHeight = distance(10, 152), cheekWidth = distance(234, 454), jawWidth = distance(172, 397);
    if (faceHeight < 8 || cheekWidth < 6 || jawWidth < 3)
        throw new RangeError("face geometry is too small for shape comparisons");
    const elongation = faceHeight / cheekWidth, jawShare = jawWidth / cheekWidth;
    const alternatives = [
        { id: "current_outline", name: "Keep my outline", arch: 0, peak: 0.62, tail: 0, thickness: 1,
            reason: "Starts from each brow independently; keeps its width and thickness." },
        { id: "gentle_arch", name: "Gentle arch", arch: elongation < 1.5 ? 0.07 : 0.045, peak: 0.64, tail: 0, thickness: 1,
            reason: "A modest arch guide follows the measured face proportions without thinning the brow." },
        { id: "soft_tail", name: "Soft tail", arch: 0.04, peak: 0.58, tail: jawShare > 0.75 ? 0.08 : 0.04, thickness: 1,
            reason: "A small outward tail guide can be compared with the existing outline; it makes no lifting claim." },
        { id: "full_outline", name: "Full outline", arch: 0.035, peak: 0.60, tail: 0, thickness: 1.12,
            reason: "Shows a slightly fuller outline as an explicit choice, with both brows retaining their own proportions." },
    ];
    return { face_height_width_ratio: elongation, jaw_cheek_ratio: jawShare,
        brow_width_difference_px: Math.abs(frames[0].width - frames[1].width),
        brow_height_difference_px: Math.abs(frames[0].height - frames[1].height), alternatives,
        automatic_selection: false,
        note: "Styling guides from measured geometry. There is no ideal face shape or required symmetry." };
}
export function photoMeasurements(image, landmarks, evidence) {
    photo(image);
    const frames = browFrames(landmarks, image.width, image.height), region = union(frames);
    const measured = evidence === undefined ? observeBrows(image, landmarks) : validateEvidence(evidence, image, region);
    const pts = pixelPoints(landmarks, image.width, image.height);
    const roll = Math.atan2(pts[263][1] - pts[33][1], pts[263][0] - pts[33][0]) * 180 / Math.PI;
    const light = new Float64Array(region.length);
    for (let i = 0; i < light.length; i++) {
        const o = i * image.channels;
        light[i] = luminance(image.data[o], image.data[o + 1], image.data[o + 2]);
    }
    const sides = frames.map(frame => {
        let area = 0, covered = 0, observedPixels = 0, skinSum = 0, skinCount = 0;
        const values = [];
        for (let i = 0; i < region.length; i++) {
            area += frame.mask[i];
            covered += measured.coverage[i] * frame.mask[i];
            if (measured.coverage[i] * frame.mask[i] >= 0.5)
                observedPixels++;
            if (frame.mask[i] >= 0.5) {
                values.push(light[i]);
                if (measured.coverage[i] < 0.2) {
                    skinSum += light[i];
                    skinCount++;
                }
            }
        }
        const mean = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
        const variance = values.length ? values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length : 0;
        return { side: frame.side, width_fraction: frame.width / image.width, height_width_ratio: frame.height / frame.width,
            coverage_fraction: area ? covered / area : 0, coverage_per_width_squared: covered / frame.width ** 2,
            luminance_mean: mean, skin_luminance_mean: skinCount ? skinSum / skinCount : 0,
            texture_std: Math.sqrt(variance), observed_pixels: observedPixels };
    });
    return { roll_degrees: roll, sides, evidence_origin: measured.origin, evidence_confidence: measured.confidence,
        photo_stored: false, biological_count: null, units: "normalized image measurements" };
}
export function compareBrowPhotos(before, beforeFace, after, afterFace, beforeEvidence, afterEvidence, maxRollDifference = 5, maxExposureDifference = 15) {
    const maxRoll = number(maxRollDifference, "maxRollDifference", 0, 20);
    const maxExposure = number(maxExposureDifference, "maxExposureDifference", 0, 50);
    const first = photoMeasurements(before, beforeFace, beforeEvidence), second = photoMeasurements(after, afterFace, afterEvidence);
    const radians = (second.roll_degrees - first.roll_degrees) * Math.PI / 180;
    const rollDiff = Math.abs(Math.atan2(Math.sin(radians), Math.cos(radians)) * 180 / Math.PI);
    const reasons = [];
    if (rollDiff > maxRoll)
        reasons.push("Head roll differs beyond the selected comparability limit.");
    if (first.evidence_origin !== second.evidence_origin)
        reasons.push("Observation methods differ; use the same manually checked mask method.");
    if (Math.min(first.evidence_confidence, second.evidence_confidence) < 0.5)
        reasons.push("At least one photo has low-confidence hair observations.");
    const widthScales = [];
    const pairs = first.sides.map((a, i) => {
        const b = second.sides[i], exposure = b.skin_luminance_mean - a.skin_luminance_mean;
        if (Math.abs(exposure) > maxExposure)
            reasons.push(`${a.side[0].toUpperCase()}${a.side.slice(1)} brow lighting differs beyond the selected limit.`);
        widthScales.push(b.width_fraction / a.width_fraction);
        return { side: a.side, coverage_fraction_change: b.coverage_fraction - a.coverage_fraction,
            normalized_coverage_change: b.coverage_per_width_squared - a.coverage_per_width_squared,
            skin_luminance_change: exposure, texture_std_change: b.texture_std - a.texture_std, biological_growth_claim: false };
    });
    if (Math.abs(widthScales[0] - widthScales[1]) > 0.08)
        reasons.push("The two brow scales changed differently; viewpoint or mesh placement may differ.");
    return { comparable: reasons.length === 0, reasons, roll_difference_degrees: rollDiff, sides: pairs,
        attribution: false, photos_stored: false,
        limits_assumed: { max_roll_degrees: maxRoll, max_skin_luminance_change: maxExposure,
            maximum_side_scale_disagreement: 0.08, minimum_evidence_confidence: 0.5 },
        note: "Observable photo changes only. A matching pair does not prove serum efficacy or biological growth." };
}
