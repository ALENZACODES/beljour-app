import { boxPlane, byte, renderClock, smooth01 } from "../skin/texture-law.js";
const percentile = (numbers, q) => {
    const v = numbers.slice().sort((a, b) => a - b), index = Math.max(0, Math.min(v.length - 1, (v.length - 1) * q / 100));
    const lo = Math.floor(index), hi = Math.ceil(index);
    return lo === hi ? v[lo] : v[lo] * (hi - index) + v[hi] * (index - lo);
};
/**
 * Keep enamel shading and incisal translucency by applying a shared relative brightness lift.
 * The anatomical tooth selector remains in natural.ts. No white paint, donor pixels, or generated grain.
 */
export function relightEnamel(image, lab, selected, opening, strength, labToRgb, rgbToLab) {
    const start = renderClock(), { width: w, height: h, channels: ch } = image, n = w * h;
    if (selected.length !== n || opening.length !== n || lab.length !== n)
        throw new RangeError("enamel dimensions mismatch");
    if (!Number.isFinite(strength) || strength < 0 || strength > 100)
        throw new RangeError("strength must be 0..100");
    const out = Uint8Array.from(image.data), weight = new Float64Array(n), amount = strength / 100;
    const teeth = [];
    let firstY = h, lastY = -1;
    for (let i = 0; i < n; i++)
        if (selected[i]) {
            teeth.push(i);
            const y = Math.floor(i / w);
            firstY = Math.min(firstY, y);
            lastY = Math.max(lastY, y);
        }
    if (!teeth.length || amount === 0)
        return { image: out, weight, meanLift: 0, maxL: 0, translucentProtected: 0, edgeFeatherPixels: 0,
            renderMs: renderClock() - start };
    const medianL = percentile(teeth.map(i => lab[i][0]), 75);
    const lift = Math.min(8.5, Math.max(0, 89 - medianL) * 0.53) * amount;
    const chosen = new Float64Array(n);
    for (const i of teeth)
        chosen[i] = 1;
    const selectionSoft = boxPlane(chosen, w, h, 2);
    let added = 0, sumLift = 0, maxL = -Infinity, transProtected = 0, feathers = 0;
    for (const i of teeth) {
        const [l, a, b] = lab[i], y = Math.floor(i / w);
        const down = (y - firstY) / Math.max(1, lastY - firstY), tip = smooth01((down - 0.69) / 0.27);
        const translucent = tip * smooth01((11 - b) / 11); // grey/blue incisal edges remain less altered
        const specular = smooth01((l - 82) / 11);
        const edge = smooth01((selectionSoft[i] - 0.13) / 0.72);
        const wgt = amount * edge * (1 - 0.74 * translucent) * (1 - 0.63 * specular);
        if (translucent > 0.25)
            transProtected++;
        if (edge < 0.95)
            feathers++;
        if (wgt < 1e-5)
            continue;
        const targetL = Math.min(91, l + lift * wgt / Math.max(1e-7, amount));
        const targetB = b > 0 ? b * (1 - 0.23 * wgt) : b;
        const chromaA = a * (1 - 0.045 * wgt);
        const rgb = labToRgb([targetL, chromaA, targetB]);
        const candidate = [byte(rgb[0]), byte(rgb[1]), byte(rgb[2])];
        const recoded = rgbToLab(candidate);
        if (!(recoded[0] <= Math.max(91.2, l + 0.7) && recoded[2] >= Math.min(b, -2) - 1))
            continue;
        const j = i * ch;
        for (let c = 0; c < 3; c++)
            out[j + c] = candidate[c];
        weight[i] = wgt;
        sumLift += recoded[0] - l;
        maxL = Math.max(maxL, recoded[0]);
        added++;
    }
    return { image: out, weight, meanLift: sumLift / Math.max(1, added), maxL: Number.isFinite(maxL) ? maxL : 0,
        translucentProtected: transProtected, edgeFeatherPixels: feathers, renderMs: renderClock() - start };
}
