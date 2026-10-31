/** W69-W74 single entry point for local browser simulations. Author: John Khan. */
import { FEATURES, choice, photo, validateEvidence } from "./contracts.js";
import { observeBrows } from "./evidence.js";
import { shapeOptions } from "./assessment.js";
import { browFrames, union } from "./geometry.js";
import { renderLamination, renderTint } from "./observed.js";
import { renderPigment } from "./pigment.js";
import { renderProgress } from "./progress.js";
import { renderShape } from "./shape.js";
export { FEATURES, LABEL, VERSION, MAX_PIXELS } from "./contracts.js";
export { observeBrows } from "./evidence.js";
export { browFrames } from "./geometry.js";
export { progressSeries, validateDiary, diaryTrend, SAFETY_NOTE, SAFETY_SOURCE, SCENARIO_NOTE } from "./progress.js";
export { compareMethods } from "./pigment.js";
export { designShape } from "./shape.js";
export function renderBrows(image, landmarks, feature, settings, evidence) {
    choice(feature, "feature", FEATURES);
    photo(image);
    const frames = browFrames(landmarks, image.width, image.height);
    if (feature === "W71" || feature === "W72")
        return renderPigment(image, frames, feature, settings);
    if (feature === "W73") {
        const result = renderShape(image, frames, settings);
        result.details.alternatives = shapeOptions(landmarks, image.width, image.height);
        return result;
    }
    const measured = evidence === undefined ? observeBrows(image, landmarks) : validateEvidence(evidence, image, union(frames));
    if (feature === "W69")
        return renderTint(image, measured, frames, settings);
    if (feature === "W70")
        return renderLamination(image, measured, frames, settings);
    return renderProgress(image, measured, frames, settings);
}
export { shapeOptions, photoMeasurements, compareBrowPhotos } from "./assessment.js";
export { annotateBrows, validateMarks, observationDocument, parseObservations, exportObservations, simplifyMark } from "./annotations.js";
export { BrowObservationEditor } from "./editor.js";
export { diaryDocument, parseDiary, exportDiary, summarizeDiary } from "./diary.js";
// R28c observed, one-or-two-visible-brow trial and immutable comparison exports.
export { BrowTrialSession, PixelGuard, SIMULATION_LABEL, checkedLevel as checkedBrowLevel, safeReport as safeBrowTrialReport, } from "./brow-trial.js";
export { compareBrowStyles, parseBrowRecipe, safeBrowRecipe, } from "./brow-board.js";
export { aggregateBrowEvidence, auditBrowTrial, browSideEvidence, safeBrowEvidence, } from "./brow-evidence.js";
