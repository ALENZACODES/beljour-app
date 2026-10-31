function finite(value, name) { if (!Number.isFinite(value))
    throw new RangeError(`${name} must be finite`); return value; }
export function assessShave(coverage, estimatedLengthMm, maskConfidence) { finite(coverage, "coverage"); finite(estimatedLengthMm, "estimatedLengthMm"); finite(maskConfidence, "maskConfidence"); if (coverage < 0 || coverage > 1 || maskConfidence < 0 || maskConfidence > 1)
    throw new RangeError("coverage/confidence outside 0..1"); if (estimatedLengthMm < 0 || estimatedLengthMm > 100)
    throw new RangeError("estimatedLengthMm outside range"); if (maskConfidence < .55)
    return { accepted: false, scope: "unknown", confidence: maskConfidence, reason: "beard mask confidence is too low", label: "not tested" }; if (estimatedLengthMm > 8)
    return { accepted: false, scope: "long_beard", confidence: maskConfidence, reason: "clean-shave preview is limited to stubble and short beards", label: "refused" }; if (coverage < .005)
    return { accepted: false, scope: "none", confidence: maskConfidence, reason: "no meaningful stubble/short-beard region supplied", label: "not applicable" }; const scope = estimatedLengthMm <= 2.5 ? "stubble" : "short_beard", confidence = Math.min(maskConfidence, scope === "stubble" ? .95 : .85); return { accepted: true, scope, confidence, reason: "within supported visual-estimate scope", label: "clean-shave visual estimate" }; }
export function shaveAmountCap(scope, skinDeltaBudget = 4) { finite(skinDeltaBudget, "skinDeltaBudget"); if (skinDeltaBudget <= 0)
    throw new RangeError("skinDeltaBudget must be positive"); if (scope !== "stubble" && scope !== "short_beard")
    return 0; const base = scope === "stubble" ? .9 : .72; return Math.min(base, Math.max(.15, skinDeltaBudget / 4 * base)); }
export function shaveDisclosure(value) { return { accepted: value.accepted, scope: value.scope, confidence: value.confidence, reason: value.reason, label: value.label, simulation: true, medical_advice: false, identity_geometry_changed: false }; }
