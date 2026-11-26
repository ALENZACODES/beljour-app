const HEX64 = /^[0-9a-f]{64}$/i;
export function validateMakeupEvidence(value) {
    if (!/^W\d+$/.test(value.feature))
        throw new Error("feature must use a W row id");
    if (!HEX64.test(value.imageSha256))
        throw new Error("image digest must be sha256 hex");
    if (value.checkedReferenceSha256 !== undefined && !HEX64.test(value.checkedReferenceSha256)) {
        throw new Error("reference digest must be sha256 hex");
    }
    if (value.feature === "W13" && value.checkedReferenceSha256 === undefined) {
        throw new Error("W13 requires a checked reference fingerprint");
    }
    if (!value.engineRevision || value.engineRevision.length > 80)
        throw new Error("engine revision required");
    const regions = new Set();
    for (const observation of value.observations) {
        if (!observation.region || observation.region.length > 64)
            throw new Error("region is required");
        if (regions.has(observation.region))
            throw new Error("duplicate observed region");
        regions.add(observation.region);
        const [lightness, aAxis, bAxis] = observation.lab;
        if (lightness < 0 || lightness > 100 || Math.abs(aAxis) > 160 || Math.abs(bAxis) > 160) {
            throw new Error("Lab value is outside range");
        }
        if (observation.confidence !== undefined && (observation.confidence < 0 || observation.confidence > 1)) {
            throw new Error("confidence must be within 0..1");
        }
    }
}
export function makeupEvidenceSummary(value) {
    validateMakeupEvidence(value);
    const confidences = value.observations.flatMap((item) => item.confidence === undefined ? [] : [item.confidence]);
    return {
        schema: "beljour.r17b.makeup.provenance.v1",
        feature: value.feature,
        regions: value.observations.map((item) => item.region).sort(),
        sources: [...new Set(value.observations.map((item) => item.source))].sort(),
        minimumConfidence: confidences.length ? Math.min(...confidences) : null,
        checkedReference: value.checkedReferenceSha256 !== undefined,
        simulation: true,
        containsPhoto: false,
        networkRequired: false,
    };
}
export function makeupReplayCompatible(first, second) {
    validateMakeupEvidence(first);
    validateMakeupEvidence(second);
    return JSON.stringify(first) === JSON.stringify(second);
}
//# sourceMappingURL=provenance.js.map