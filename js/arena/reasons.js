/** The arena's fixed vocabularies, mirrored from api/plumb_api/arena/constants.py (a Python test
 * reads this file and fails if the two lists differ). Master command v1 loser reasons plus the
 * women-first "Not Her / Erased Marks"; six 1-10 score dimensions with Still Her sixth.
 * Author: John Khan.
 */
export const REASONS = [
    "Lost Identity",
    "Not Her / Erased Marks",
    "Plastic Skin",
    "Warped Glasses/Ears/Background",
    "Fake Hair",
    "Fake Teeth",
    "Too Strong",
    "Too Weak",
    "Uncanny/Scary",
];
export const DIMENSIONS = ["identity", "realism", "artifact_free", "flattering", "fairness", "still_her"];
/** Fairness is a spread across slices, never a per-image score, so judges don't score it. */
export const JUDGE_DIMENSIONS = ["identity", "realism", "artifact_free", "flattering", "still_her"];
export const DIMENSION_LABELS = {
    identity: "Identity", realism: "Realism", artifact_free: "Artifact-Free", flattering: "Flattering",
    fairness: "Fairness", still_her: "Still Her",
};
export const DIMENSION_HELP = {
    identity: "Same person as the reference?",
    realism: "Could this be a real photo?",
    artifact_free: "No warps, seams, smears or melted edges?",
    flattering: "Would she be happy to post it?",
    still_her: "Would she say this still looks like her? (women judges, women's photos)",
};
//# sourceMappingURL=reasons.js.map