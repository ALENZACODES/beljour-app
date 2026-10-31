/**
 * E07 part 2 (plan-r3-final §10.4 R7): the learned fill wrapper and its registry gate.
 * MI-GAN is pending in the model registry, so every call falls back to the R5 fill today.
 * Author: John Khan.
 */
export { LearnedModelUnavailable, SessionLoader, plainTensor } from "./runtime.js";
export { LAYOUTS, MIGAN_ID, MiganFill, buildFeeds, compositeHole, cropBox, decodeOutput, defaultMigan, holeBox } from "./migan.js";
