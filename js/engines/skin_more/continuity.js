/** W79/W91 checked-region continuity tools. Author: John Khan. */
import { alphaComposite, feather, outsideChangeFraction } from "./masking.js";
import { compareRegions, robustRegionColour } from "./colorimetry.js";
export function measure(pixels, w, h, source, target) { const s = robustRegionColour(pixels, w, h, source), t = robustRegionColour(pixels, w, h, target), d = compareRegions(pixels, w, h, source, target); return { deltaE: d.deltaE76, lightnessGap: d.lightness, chromaGap: d.chroma, sourcePixels: s.pixelCount, targetPixels: t.pixelCount, lightingWarning: Math.abs(s.luma - t.luma) > .20 }; }
export function continuityPlan(pixels, w, h, source, target, amount) {
    if (amount < 0 || amount > 1)
        throw new Error("amount must be in [0,1]");
    const m = measure(pixels, w, h, source, target), s = robustRegionColour(pixels, w, h, source), lighting = m.lightingWarning ? .45 : 1, opacity = Math.min(.18, m.deltaE / 120) * amount * lighting;
    return { sourceRgb: s.rgb.map(Math.round), opacity, maximumDeltaEReduction: .45, note: "Colour continuity only; body shape and worth are never scored." };
}
export function applyContinuity(pixels, w, h, target, plan) { return alphaComposite(pixels, w, h, plan.sourceRgb, feather(target, w, h, 4), plan.opacity); }
export function evaluateContinuity(before, after, w, h, source, target) { const b = measure(before, w, h, source, target), a = measure(after, w, h, source, target), outside = outsideChangeFraction(before, after, target), improved = a.deltaE <= b.deltaE + 1e-6, overcorrected = (b.deltaE - a.deltaE) > Math.max(2, b.deltaE * .60); return { beforeDeltaE: b.deltaE, afterDeltaE: a.deltaE, improved, overcorrected, outsideChangeFraction: outside, pass: improved && !overcorrected && outside <= .001 }; }
export function regionPairNames(names) {
    for (const p of [["face", "neck"], ["neck", "chest"], ["face", "chest"], ["face", "hand"]])
        if (names.includes(p[0]) && names.includes(p[1]))
            return p;
    if (names.length < 2)
        throw new Error("two checked regions required");
    return [names[0], names[1]];
}
export function lightingCaveat(m) { return m.lightingWarning ? "The checked regions have a large luminance gap, so lighting may dominate the apparent colour difference." : "The comparison is within one photo but still depends on local lighting and camera processing."; }
