/** W58 checked-frame smile-in-motion assessment. Author: John Khan. */
import { motionMetrics, motionAcceptance } from "../index.js";
export function assessW58(frames, adultConfirmed = false) {
    if (!adultConfirmed)
        throw new Error("18+ confirmation required for W58");
    const metrics = motionMetrics(frames);
    const gate = motionAcceptance(metrics);
    return { frames: metrics.frames, durationMs: metrics.durationMs, centreTravel: metrics.centreTravel, maximumStep: metrics.maximumStep, automaticTracking: false, passed: gate.pass, sequenceHash: metrics.sequenceHash };
}
export const passDefinitionW58 = "two+ time-ordered checked frames, bounded movement, no automatic tracking/model claim";
//# sourceMappingURL=w58_motion.js.map