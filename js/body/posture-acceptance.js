/** Export readiness for the body studio: every condition a labelled save depends on.
 * Ready means this edit of this photo stayed inside the simulation's limits; it is not a
 * quality, identity or body-set result. Body-set evidence stays NOT_RUN until a licensed,
 * released adult set is measured externally. Author: John Khan.
 */
import { SIMULATION_LABEL } from "../engines/local/posture.js";
export const BODY_SET_STATUS = "NOT_RUN";
export const BODY_SET_COPY = "Body-set evidence: NOT_RUN. No licensed body set has been measured; " +
    "results here are photo simulations, not medical advice.";
export function studioReadiness({ digest, revision, accepted, release, releaseRevision }) {
    const gaps = [];
    if (!digest)
        gaps.push("photo_required");
    else if (!accepted || accepted.digest !== digest || accepted.revision !== revision)
        gaps.push("annotation_not_accepted");
    if (!release || release.stage !== "release")
        gaps.push("release_required");
    else {
        if (release.digest !== digest)
            gaps.push("release_for_other_photo");
        if (releaseRevision !== revision)
            gaps.push("release_out_of_date");
        const inspection = release.inspection;
        if (!inspection.passed || inspection.headChanged !== 0 || inspection.outsideBandChanged !== 0) {
            gaps.push("output_checks_failed");
        }
        if (release.result.label !== SIMULATION_LABEL)
            gaps.push("simulation_label_missing");
    }
    return { ready: gaps.length === 0, gaps, bodySet: BODY_SET_STATUS };
}
export const READINESS_MESSAGES = {
    photo_required: "Open a photo.",
    annotation_not_accepted: "Accept the markings for this photo.",
    release_required: "Release the slider to render the full-size edit.",
    release_for_other_photo: "The rendered edit belongs to another photo.",
    release_out_of_date: "The markings changed; render the edit again.",
    output_checks_failed: "The edited image failed its safety checks.",
    simulation_label_missing: "The edit is missing its simulation label.",
};
