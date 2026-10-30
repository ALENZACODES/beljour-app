/** Safety/claim gates for Skin & More. Author: John Khan. */
export const skinMoreFeatures = Array.from({ length: 16 }, (_, i) => `W${77 + i} `);
const regionRequired = new Set(["W79", "W80", "W81", "W82", "W85", "W86", "W87", "W88", "W90", "W91"]), healthConsent = new Set(["W83"]), culturalReview = new Set(["W88"]);
const forbidden = { W78: ["safe tan", "healthy tan", "uv protection", "sun protection"], W80: ["spf efficacy", "blocks uv", "protects from sun", "clinically proven"], W81: ["melasma diagnosis", "disease", "treatment"], W82: ["rosacea diagnosis", "cure", "treats redness"], W83: ["fertility", "ovulation prediction", "pregnancy prediction", "diagnosis"], W84: ["reverse ageing", "anti-aging", "anti ageing", "look younger"], W92: ["reverse ageing", "erase wrinkles", "look younger", "anti-aging"] };
export function requiredLabels(feature) {
    if (!skinMoreFeatures.includes(feature))
        throw new Error("unknown feature");
    const labels = ["SIMULATION"];
    if (feature === "W78" || feature === "W80")
        labels.push("NO SPF/UV EFFICACY CLAIM");
    if (feature === "W81" || feature === "W82")
        labels.push("NOT A DIAGNOSIS");
    if (feature === "W83")
        labels.push("LOCAL SELF-OBSERVATION", "NOT MEDICAL ADVICE");
    if (feature === "W84" || feature === "W92")
        labels.push("PRO-AGE · TEXTURE RETAINED");
    if (feature === "W88")
        labels.push("CULTURAL REVIEW REQUIRED BEFORE RELEASE");
    return labels;
}
export function lintSkinCopy(feature, text) {
    if (!skinMoreFeatures.includes(feature))
        throw new Error("unknown feature");
    const lower = text.toLowerCase().replace(/\s+/g, " "), findings = [];
    for (const phrase of forbidden[feature] ?? [])
        if (lower.includes(phrase))
            findings.push(`forbidden claim: ${phrase} `);
    for (const phrase of ["guaranteed", "perfect match", "works for everyone", "zero risk"])
        if (lower.includes(phrase))
            findings.push(`absolute claim: ${phrase} `);
    return findings;
}
export function safetyDecision(feature, options = {}) {
    if (!skinMoreFeatures.includes(feature))
        throw new Error("unknown feature");
    const reasons = [...lintSkinCopy(feature, options.copy ?? "")];
    if (regionRequired.has(feature) && !Object.keys(options.regions ?? {}).length)
        reasons.push("checked region required");
    if (healthConsent.has(feature) && !options.healthConsent)
        reasons.push("explicit local health-data consent required");
    if (culturalReview.has(feature) && !options.culturalReviewComplete)
        reasons.push("cultural co-design review remains a release dependency");
    return { feature, allowed: reasons.length === 0, reasons, requiredLabels: requiredLabels(feature), regionRequired: regionRequired.has(feature), healthConsentRequired: healthConsent.has(feature), culturalReviewRequired: culturalReview.has(feature) };
}
export function releaseBlockers(feature, decision, realFaceTested, realFacePassed) {
    const blockers = [...decision.reasons];
    if (!realFaceTested)
        blockers.push("real-face gate not tested");
    else if (!realFacePassed)
        blockers.push("real-face gate failed");
    if (feature === "W88" && decision.culturalReviewRequired)
        blockers.push("cultural review must be recorded separately");
    return [...new Set(blockers)];
}
//# sourceMappingURL=safety.js.map