import { inspectNeutralCard, neutralPhotoOptions, publicNeutral } from "./neutral-calibration.js";
import { assessSkinPhoto, publicSkinAssessment } from "./skin-accuracy.js";
const NOTES = {
    none: "Shade read with a checked neutral card.",
    no_mesh: "No face landmarks were supplied; no shade is read.",
    invalid_mesh: "The face landmarks could not be used; no shade is read.",
    card_rejected: "The neutral card was not usable; no shade is read with it.",
    reading_refused: "The card-corrected reading did not pass the existing shade limits.",
};
function outcome(reason, neutral = null, assessment = null) {
    const usable = reason === null;
    return { usable, reason, referenceId: usable ? assessment?.referenceId ?? null : null, neutral, assessment,
        note: NOTES[reason ?? "none"] };
}
/** W6 on one photo using a visitor-confirmed, checked neutral card. */
export function assessCalibratedPhoto(image, points, cardMask, options) {
    if (points === null)
        return outcome("no_mesh");
    const neutral = inspectNeutralCard(image, cardMask, options);
    if (!neutral.usable)
        return outcome("card_rejected", neutral);
    let found;
    try {
        found = assessSkinPhoto(image, points, neutralPhotoOptions(neutral));
    }
    catch (error) {
        if (error instanceof RangeError || error instanceof TypeError)
            return outcome("invalid_mesh", neutral);
        throw error;
    }
    return outcome(found.accepted ? null : "reading_refused", neutral, found);
}
export function publicCalibrated(found) {
    return {
        format: "beljour-calibrated-photo/1", usable: found.usable, reason: found.reason,
        reference_id: found.referenceId, neutral: found.neutral === null ? null : publicNeutral(found.neutral),
        assessment: found.assessment === null ? null : publicSkinAssessment(found.assessment),
        note: found.note, provider_calls: 0, tested_against_real_products: false,
    };
}
//# sourceMappingURL=calibrated-photo.js.map