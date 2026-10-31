const artifactNames = ["seams", "halos", "flatPatches", "plasticSkin", "grainMismatch", "wrongLighting", "warpedGeometry"];
export function evaluateShipGate(tool, metrics, evidence) {
    const failures = [], unknown = [];
    const failBool = (value, label) => {
        if (value === false)
            failures.push(label);
        else if (value !== true)
            unknown.push(label);
    };
    const between = (value, min, max, label) => {
        if (value === undefined || !Number.isFinite(value))
            unknown.push(label);
        else if (value < min || value > max)
            failures.push(`${label} ${value.toFixed(4)} outside ${min}..${max}`);
    };
    const ms = typeof metrics.render_ms === "number" && Number.isFinite(metrics.render_ms) ? metrics.render_ms : null;
    if (ms === null)
        unknown.push("render_ms missing");
    else if (ms > 1000)
        failures.push(`render_ms ${ms.toFixed(1)} exceeds 1000ms`);
    between(evidence.changedTargetFraction, 0.08, 1, "default changed target fraction");
    // Interpret these seven properties as *detected defects*: true means an artifact exists.
    for (const k of artifactNames) {
        const label = `200% ${k}`;
        if (evidence[k] === undefined)
            unknown.push(label);
        else if (evidence[k])
            failures.push(label);
    }
    failBool(evidence.fullResolutionReview100, "100% visual review");
    failBool(evidence.fullResolutionReview200, "200% visual review");
    failBool(evidence.blindReview, "blind study");
    failBool(evidence.targetMatchesUserRequest, "requested effect perceptually achieved");
    if (tool !== "illustration") {
        between(evidence.poreBandRatio ?? (typeof metrics.pore_band_ratio === "number" ? metrics.pore_band_ratio : undefined), 0.90, 1.10, "pore high-band energy ratio");
        between(evidence.noiseBandRatio, 0.85, 1.15, "sensor/chroma residual ratio");
    }
    if (tool === "gender") {
        between(evidence.normalExtraDifferenceFraction, 0.02, 1, "Normal–Extra face-box fraction");
        failBool(evidence.identityLockPassed, "identity lock");
    }
    if (tool === "posture") {
        failBool(evidence.backgroundLinesStraight, "background-line straightness");
        failBool(metrics.seam_audit_pass === true, "automatic seam audit");
        between(evidence.outsideChangeFraction, 0, 0.002, "protected-background changed fraction");
    }
    if (tool === "tan" || tool === "older" || tool === "younger")
        failBool(evidence.fullSkinCoveragePassed, "hairline, ear, neck and visible chest skin coverage");
    if (tool === "freckles")
        failBool(evidence.freckleDistributionValidated, "freckle shape and clustering reference");
    if (tool === "older" || tool === "younger")
        failBool(evidence.identityLockPassed, "identity and marks retained");
    if (tool === "teeth") {
        failBool(evidence.specularPreserved, "enamel translucency/specular");
        failBool(evidence.edgeNatural, "gum/lip selection edge");
    }
    if (tool === "hair-fibres") {
        failBool(evidence.greyRootsProtected, "grey-root separation");
        between(typeof metrics.covered_scalp === "number" ? metrics.covered_scalp : undefined, 0.15, 0.30, "coverage at default 50");
        if (metrics.status === "refused")
            unknown.push("refused because no reliable donors: no export");
    }
    if (tool === "balayage") {
        failBool(evidence.rootsUntouched, "root melt");
        between(typeof metrics.root_max === "number" ? metrics.root_max : undefined, 0, 0.02, "root-zone lift");
        between(typeof metrics.painted_share === "number" ? metrics.painted_share : undefined, 0.08, 0.45, "ribbon painted hair fraction");
        between(evidence.luminanceCorrelation ?? (typeof metrics.luminance_correlation === "number" ? metrics.luminance_correlation : undefined), 0.90, 1, "strand shading correlation");
    }
    if (tool === "illustration")
        failBool(evidence.edgeNatural, "ink edge cleanliness and small faces");
    const status = failures.length ? "FAIL" : unknown.length ? "UNKNOWN" : "PASS";
    return { tool, status, timeMs: ms, failures, unknown, pass: status === "PASS" };
}
