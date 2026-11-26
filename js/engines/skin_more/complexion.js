/** W77-W82 complexion preview strategies. Author: John Khan. */
import { alphaComposite, feather, outsideChangeFraction } from "./masking.js";
import { castScore, compareRegions, preserveLightnessTarget, robustRegionColour } from "./colorimetry.js";
const tintOpacity = { sheer: .12, light: .20, medium: .30 };
const tan = { light: { rgb: [164, 112, 79], opacity: .08, dry: .78 }, medium: { rgb: [154, 101, 68], opacity: .14, dry: .72 }, dark: { rgb: [141, 89, 57], opacity: .20, dry: .66 }, olive: { rgb: [139, 111, 69], opacity: .13, dry: .72 } };
function amount(v) {
    if (!Number.isFinite(v) || v < 0 || v > 1)
        throw new Error("amount must be in [0,1]");
    return v;
}
export function tintPlan(base, target, style, value) { return { targetRgb: preserveLightnessTarget(base, target, Math.min(amount(value), .9)), opacity: tintOpacity[style] * value, coverageName: "face", preservesTexture: true, warning: "Sheer cosmetic simulation; it does not rate skin tone." }; }
export function applyTint(pixels, w, h, mask, plan) { return alphaComposite(pixels, w, h, plan.targetRgb, feather(mask, w, h, 3), plan.opacity); }
export function tanPlan(style, value) { const p = tan[style]; amount(value); return { targetRgb: p.rgb, opacity: p.opacity * value, style, dryZoneMultiplier: p.dry, warning: "Cosmetic colour only; no health or UV-safety implication." }; }
export function applyTan(pixels, w, h, mask, dry, plan) {
    if (mask.length !== dry.length)
        throw new Error("mask length mismatch");
    const weighted = new Float32Array(mask.length);
    for (let i = 0; i < mask.length; i++)
        weighted[i] = mask[i] * (1 - dry[i] * (1 - plan.dryZoneMultiplier));
    return alphaComposite(pixels, w, h, plan.targetRgb, feather(weighted, w, h, 2), plan.opacity);
}
export function faceBodyMatch(pixels, w, h, source, target, value) { amount(value); const s = robustRegionColour(pixels, w, h, source), before = compareRegions(pixels, w, h, source, target), rgb = s.rgb.map(Math.round), opacity = Math.min(.24, before.deltaE76 / 100) * value, out = alphaComposite(pixels, w, h, rgb, feather(target, w, h, 3), opacity), after = compareRegions(out, w, h, source, target); return { pixels: out, metrics: { beforeDeltaE: before.deltaE76, afterDeltaE: after.deltaE76, opacity } }; }
export function spfCastPreview(pixels, w, h, mask, style, value) { amount(value); const strength = { mineral_cast: .28, tinted_cast: .10, clear_finish: .025 }[style], target = { mineral_cast: [242, 244, 246], tinted_cast: [207, 173, 148], clear_finish: [238, 238, 236] }[style], before = castScore(pixels, w, h, mask), out = alphaComposite(pixels, w, h, target, feather(mask, w, h, 2), strength * value), after = castScore(out, w, h, mask); return { pixels: out, metrics: { style, visualCastBefore: before, visualCastAfter: after, efficacyClaim: "none" } }; }
export function deeperPigmentationPlan(style, value) { const choices = { orange_corrector: [221, 112, 63], peach_corrector: [232, 145, 111], neutral_concealer: [181, 142, 120] }; return { targetRgb: choices[style], opacity: Math.min(.58, .58 * amount(value)), reason: "user-marked deeper pigmentation", diagnostic: false }; }
export function rednessPlan(style, value) { const choices = { green_corrector: [157, 187, 144], neutral_tint: [180, 159, 141], low_coverage: [189, 171, 158] }; return { targetRgb: choices[style], opacity: Math.min(.46, .46 * amount(value)), reason: "user-marked persistent redness appearance", diagnostic: false }; }
export function applyCorrection(pixels, w, h, mask, plan) { return alphaComposite(pixels, w, h, plan.targetRgb, feather(mask, w, h, 2), plan.opacity); }
export function evaluateLocality(before, after, allowed) { const fraction = outsideChangeFraction(before, after, allowed); return { outsideChangeFraction: fraction, pass: fraction <= .001 }; }
export function passDefinition(feature) {
    const d = { W77: "checked face mask only; no lightening claim; amount zero exact identity; texture remains visible", W78: "bounded colour shift; dry zones receive less colour; no health or UV-safety claim", W79: "face/body checked-region delta decreases without changing unmarked pixels", W80: "visual cast preview changes only checked region and makes no SPF efficacy claim", W81: "user-marked pigmentation only; no diagnosis; corrector remains bounded", W82: "user-marked redness appearance only; no diagnosis; corrector remains bounded" };
    if (!d[feature])
        throw new Error("unknown feature");
    return d[feature];
}
//# sourceMappingURL=complexion.js.map