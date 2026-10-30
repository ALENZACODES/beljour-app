const allowedFeatures = [
    "W19", "W20", "W21", "W22", "W23", "W24", "W25", "W26", "W29", "W30", "W31", "W32", "W33",
    "W34", "W35", "W36", "W37", "W38", "W40", "W41", "W42", "W43", "W44",
];
const baseSteps = [
    { order: 1, title: "Confirm intent", purpose: "Keep the user goal explicit", requiredInput: "selected preview", output: "stated goal", limitation: "No beauty score or age-correction target." },
    { order: 2, title: "Check geometry", purpose: "Verify supplied hair/head regions", requiredInput: "hair mask + head landmarks", output: "checked placement", limitation: "Automatic geometry is not fabricated when evidence is missing." },
    { order: 3, title: "Compare locally", purpose: "Show original beside simulation", requiredInput: "local photo", output: "before/after preview", limitation: "Screen colour and movement differ from real hair." },
];
const featureStep = {
    W19: { title: "Discuss length", purpose: "Separate stretched from worn length", requiredInput: "curl strength", output: "two length estimates", limitation: "Weight and attachment comfort require in-person review." },
    W20: { title: "Discuss attachment", purpose: "Compare tape and sew-in integration zones", requiredInput: "method", output: "placement guide", limitation: "Not a scalp-tension assessment." },
    W21: { title: "Check topper footprint", purpose: "Review crown footprint and density", requiredInput: "crown point", output: "topper area", limitation: "Fit and clip comfort are not measured." },
    W22: { title: "Check wig fit", purpose: "Discuss cap width and hairline softness", requiredInput: "temple span", output: "fit guide", limitation: "Appearance does not establish cap size." },
    W23: { title: "Root band", purpose: "Keep touch-up inside root/scalp band", requiredInput: "root width", output: "root colour preview", limitation: "No formula or allergy claim." },
    W24: { title: "Hairline coverage", purpose: "Use conservative scalp-concealer opacity", requiredInput: "scalp region", output: "coverage map", limitation: "Cosmetic appearance only." },
    W25: { title: "Fibre density", purpose: "Bound visual fibre gain", requiredInput: "observed density", output: "density estimate", limitation: "Not hair growth." },
    W26: { title: "Tint strength", purpose: "Retain observed luminance/texture", requiredInput: "target colour", output: "tint preview", limitation: "No durability claim." },
    W29: { title: "Face frame", purpose: "Position procedural money-piece bands", requiredInput: "head geometry", output: "placement map", limitation: "Editable guide only." },
    W30: { title: "Foil map", purpose: "Compare procedural section density", requiredInput: "style + density", output: "foil map", limitation: "Not a salon sectioning guarantee." },
    W31: { title: "Broad colour", purpose: "Compare chunky and lived-in placement", requiredInput: "placement style", output: "colour zones", limitation: "Movement changes visibility." },
    W32: { title: "Grey choice", purpose: "Keep, blend, cover or grow out neutrally", requiredInput: "observed grey share", output: "choice preview", limitation: "No anti-age ranking." },
    W33: { title: "Transition estimate", purpose: "Show monotone natural-share timeline", requiredInput: "growth estimate", output: "timeline", limitation: "Actual growth varies." },
    W34: { title: "Melt position", purpose: "Choose transition start/softness", requiredInput: "vertical placement", output: "ombre curve", limitation: "Colour only." },
    W35: { title: "Part position", purpose: "Set explicit split partition", requiredInput: "part x-position", output: "left/right zones", limitation: "Part can move in real wear." },
    W36: { title: "Hidden colour", purpose: "Choose lower-side reveal", requiredInput: "side + reveal", output: "peekaboo zone", limitation: "Movement changes exposure." },
    W37: { title: "Fringe geometry", purpose: "Compare original fringe shapes", requiredInput: "temple/crown points", output: "fringe guide", limitation: "Density and movement vary." },
    W38: { title: "Cut comparison", purpose: "Show options without best-face claims", requiredInput: "head geometry", output: "cut previews", limitation: "Personal preference is primary." },
    W40: { title: "Texture retention", purpose: "Retain curl-frequency energy", requiredInput: "curl strength", output: "definition preview", limitation: "No permanent texture claim." },
    W41: { title: "Regrowth visual", purpose: "Show appearance-only timeline", requiredInput: "month", output: "density/length estimate", limitation: "Not medical advice or a growth prediction." },
    W42: { title: "Sensitive mode", purpose: "Cap intensity and prioritize comfort", requiredInput: "user opt-in", output: "gentle preview", limitation: "Keeping the current look is an equal option." },
    W43: { title: "Heat style", purpose: "Preserve texture floor", requiredInput: "style + heat shape", output: "appearance preview", limitation: "Not a temperature recommendation." },
    W44: { title: "Humidity estimate", purpose: "Use only entered humidity/curl values", requiredInput: "humidity", output: "retention estimate", limitation: "Weather and individual response vary." },
};
export function consultationSteps(feature) {
    if (!allowedFeatures.includes(feature))
        throw new RangeError("unsupported R17B hair feature");
    return [...baseSteps, { order: 4, ...featureStep[feature] }];
}
export function validateConsultationSequence(rows) {
    return rows.every((row, index) => row.order === index + 1) && new Set(rows.map(row => row.title)).size === rows.length;
}
export function maintenanceEstimate(service, growthCmMonth = 1.1, userIntervalWeeks) {
    if (!Number.isFinite(growthCmMonth) || growthCmMonth < .3 || growthCmMonth > 2.5)
        throw new RangeError("growthCmMonth outside range");
    const defaults = { root_colour: 6, extensions: 8, topper_check: 10, grey_blend: 8, fringe_trim: 5, cut: 10 };
    const standard = defaults[service];
    if (standard === undefined)
        throw new RangeError("unsupported service");
    const base = standard * (1.1 / growthCmMonth) ** .35;
    const interval = userIntervalWeeks === undefined ? base : userIntervalWeeks;
    if (!Number.isFinite(interval) || interval < 1 || interval > 52)
        throw new RangeError("interval outside range");
    const spread = Math.max(1, interval * .22);
    return { service, intervalWeeks: interval, lowWeeks: Math.max(1, interval - spread), highWeeks: Math.min(52, interval + spread), userAdjustable: userIntervalWeeks !== undefined, label: "ESTIMATE; adjust to the user's stylist and observed growth" };
}
export function annualVisits(value) { return 52 / Math.max(value.intervalWeeks, 1); }
//# sourceMappingURL=salon_plan.js.map