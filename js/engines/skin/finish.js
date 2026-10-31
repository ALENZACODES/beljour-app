/** Skin finish: Matte (shine control) and Glow (named skin glows). Mirrors
 * api/plumb_api/engines/skin/finish.py. Matte only darkens the smooth shine bump and
 * gives back the colour shine washed out; Glow lifts the light the face already
 * catches and balances it so the average skin lightness does not rise.
 * Author: John Khan.
 */
import { blob, checkPhoto, checkStrength, encode, labPlanes, maskedLowpass, NOTE, noLighten, radius, unchanged } from "./common.js";
const MATTE_FINE = 1 / 16, MATTE_BROAD = 1 / 4, MATTE_FLOOR = 1.0, MATTE_TAKE = 0.8, MATTE_COLOUR = 0.6, MATTE_FULL_BUMP = 4.0;
const GLOW_FINE = 1 / 12, GLOW_BROAD = 1 / 3, GLOW_CAP = 6.0;
export const HIGH_POINTS = [
    [-0.62, 0.42, 0.38], [0.62, 0.42, 0.38], [0.0, 0.30, 0.16], [0.0, -0.75, 0.40], [0.0, 1.95, 0.22]
];
export const MATTE_LABEL = "Matte finish simulation: shine softened, texture kept. " + NOTE;
export const GLOWS = Object.freeze({
    cassis: { name: "Cassis", sheen: 4.0, contrast: 0.35, warm: 1.0, rose: 0.4 },
    collioure: { name: "Collioure", sheen: 6.0, contrast: 0.6, warm: 0.4, rose: 0.2 },
});
function fineAndBroad(plane, skin, w, h, iod, fine, broad) {
    return [maskedLowpass(plane, skin, w, h, radius(iod, fine)), maskedLowpass(plane, skin, w, h, radius(iod, broad, 2))];
}
export function matte(image, skin, face, strength = 30) {
    checkPhoto(image);
    const amount = checkStrength(strength);
    if (amount === 0)
        return unchanged(image, MATTE_LABEL);
    const { width: w, height: h } = image, lab = labPlanes(image), n = w * h;
    const [fineL, broadL] = fineAndBroad(lab.L, skin, w, h, face.iod, MATTE_FINE, MATTE_BROAD);
    const bump = new Float64Array(n), weight = new Float64Array(n), give = new Float64Array(n);
    let peak = 0, shiny = 0, inside = 0;
    for (let i = 0; i < n; i++) {
        bump[i] = Math.max(fineL[i] - broadL[i] - MATTE_FLOOR, 0);
        weight[i] = bump[i] > 0 ? skin[i] : 0;
        give[i] = amount * MATTE_COLOUR * Math.min(bump[i] / MATTE_FULL_BUMP, 1) * weight[i];
        peak = Math.max(peak, bump[i]);
        if (weight[i] > 0)
            shiny++;
        if (skin[i] >= 0.5)
            inside++;
    }
    for (const plane of [lab.a, lab.b]) {
        const [fine, broad] = fineAndBroad(plane, skin, w, h, face.iod, MATTE_FINE, MATTE_BROAD);
        for (let i = 0; i < n; i++)
            plane[i] += give[i] * (broad[i] - fine[i]);
    }
    for (let i = 0; i < n; i++)
        lab.L[i] -= amount * MATTE_TAKE * bump[i] * weight[i];
    const out = encode(image, lab, weight);
    const guarded = noLighten(image, out, weight);
    return { image: out, weight, label: MATTE_LABEL, metrics: { shine_share: shiny / Math.max(inside, 1), peak_bump: peak, guarded_pixels: guarded } };
}
export function highPoints(face, width, height) {
    const out = new Float64Array(width * height);
    for (const [a, b, r] of HIGH_POINTS) {
        const one = blob(face, width, height, a, b, r);
        for (let i = 0; i < out.length; i++)
            out[i] = Math.max(out[i], one[i]);
    }
    return out;
}
export function glowLabel(style) { return `Glow simulation (${GLOWS[style].name}): average skin lightness kept. ` + NOTE; }
export function glow(image, skin, face, strength = 30, style = "cassis") {
    checkPhoto(image);
    const amount = checkStrength(strength);
    if (!Object.hasOwn(GLOWS, style))
        throw new RangeError(`glow must be one of ${Object.keys(GLOWS).join(", ")}`);
    const look = GLOWS[style], label = glowLabel(style);
    if (amount === 0)
        return unchanged(image, label, { style });
    const { width: w, height: h } = image, lab = labPlanes(image), n = w * h;
    const [fineL, broadL] = fineAndBroad(lab.L, skin, w, h, face.iod, GLOW_FINE, GLOW_BROAD);
    const peaks = highPoints(face, w, h), lift = new Float64Array(n);
    let total = 0, sum = 0;
    for (let i = 0; i < n; i++) {
        lift[i] = Math.min(Math.max(amount * (look.sheen * peaks[i] + look.contrast * (fineL[i] - broadL[i])), -GLOW_CAP), GLOW_CAP) * skin[i];
        total += skin[i] * skin[i];
        sum += skin[i] * lift[i];
    }
    const balance = total > 0 ? sum / total : 0;
    const weight = new Float64Array(n);
    let peakLift = -Infinity;
    for (let i = 0; i < n; i++) {
        const change = lift[i] - balance * skin[i];
        peakLift = Math.max(peakLift, change);
        lab.L[i] += change;
        lab.a[i] += amount * look.rose * peaks[i] * skin[i];
        lab.b[i] += amount * look.warm * skin[i];
        weight[i] = skin[i] > 0 ? skin[i] : 0;
    }
    return { image: encode(image, lab, weight), weight, label, metrics: { style, balance_l: Math.round(balance * 1e4) / 1e4, peak_lift: peakLift } };
}
