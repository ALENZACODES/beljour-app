export function diagnostic(reference, candidate) {
    if (reference.length !== candidate.length || reference.length === 0 || reference.length % 4 !== 0) {
        throw new Error("RGBA arrays must be non-empty and have the same length");
    }
    let total = 0;
    let peak = 0;
    let alphaExact = true;
    let samples = 0;
    for (let offset = 0; offset < reference.length; offset += 4) {
        for (let channel = 0; channel < 3; channel += 1) {
            const error = Math.abs(reference[offset + channel] - candidate[offset + channel]);
            total += error;
            peak = Math.max(peak, error);
            samples += 1;
        }
        alphaExact &&= reference[offset + 3] === candidate[offset + 3];
    }
    const meanAbsoluteError = total / samples;
    return {
        meanAbsoluteError,
        peakError: peak,
        alphaExact,
        finite: Number.isFinite(meanAbsoluteError),
        label: "synthetic diagnostic; not real-face evidence",
    };
}
export function baselineDelta(ours, baseline) {
    return {
        meanErrorGain: baseline.meanAbsoluteError - ours.meanAbsoluteError,
        peakErrorGain: baseline.peakError - ours.peakError,
        alphaExact: ours.alphaExact,
        improvesMeanError: ours.meanAbsoluteError < baseline.meanAbsoluteError,
    };
}
//# sourceMappingURL=diagnostics.js.map