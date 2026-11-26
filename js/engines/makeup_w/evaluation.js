import { labToLch, rgbToLab } from "./colour.js";
export function makeupMetrics(photo, after, coverage) { let outside = 0, outN = 0, alpha = 0, lum = 0, inN = 0, changed = 0, bC = 0, aC = 0, darkN = 0; for (let i = 0; i < coverage.length; i++) {
    const o = i * photo.channels, d = Math.max(Math.abs(after[o] - photo.data[o]), Math.abs(after[o + 1] - photo.data[o + 1]), Math.abs(after[o + 2] - photo.data[o + 2]));
    if (coverage[i] <= .01) {
        outN++;
        if (d > 1)
            outside++;
    }
    else {
        const br = (photo.data[o] + photo.data[o + 1] + photo.data[o + 2]) / 3, ar = (after[o] + after[o + 1] + after[o + 2]) / 3;
        lum += ar - br;
        inN++;
        const bl = labToLch(rgbToLab([photo.data[o], photo.data[o + 1], photo.data[o + 2]])), al = labToLch(rgbToLab([after[o], after[o + 1], after[o + 2]]));
        if (bl[0] <= 50) {
            bC += bl[1];
            aC += al[1];
            darkN++;
        }
    }
    if (d > 1)
        changed++;
    if (photo.channels === 4)
        alpha = Math.max(alpha, Math.abs(after[o + 3] - photo.data[o + 3]));
} return { outside_error: outN ? outside / outN : 0, alpha_error: alpha, mean_luminance_shift: inN ? lum / inN : 0, deep_chroma_ratio: darkN ? aC / Math.max(bC, 1e-9) : 1, changed_fraction: changed / coverage.length }; }
//# sourceMappingURL=evaluation.js.map