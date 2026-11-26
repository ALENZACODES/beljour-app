import { describeLip } from "./anatomy.js";
import { lineEnergy, textureCorrelation } from "./finish.js";
function asPhoto(photo, data) { return { width: photo.width, height: photo.height, channels: photo.channels, data }; }
export function lipOutsideError(original, result, support) {
    let sum = 0;
    let count = 0;
    for (let i = 0; i < support.length; i++) {
        if (support[i] > 0.05)
            continue;
        const o = i * original.channels;
        sum += (Math.abs(original.data[o] - result[o]) + Math.abs(original.data[o + 1] - result[o + 1]) + Math.abs(original.data[o + 2] - result[o + 2])) / (3 * 255);
        count++;
    }
    return count ? sum / count : 0;
}
export function assessLip(feature, original, result, support, anatomy, pigmentationTwoTone, warnings = []) {
    if (result.length !== original.data.length)
        throw new RangeError("assessment image length mismatch");
    let changed = 0;
    let alphaExact = true;
    for (let i = 0; i < support.length; i++) {
        const o = i * original.channels;
        if (original.data[o] !== result[o] || original.data[o + 1] !== result[o + 1] || original.data[o + 2] !== result[o + 2])
            changed++;
        if (original.channels === 4 && original.data[o + 3] !== result[o + 3])
            alphaExact = false;
    }
    const resultPhoto = asPhoto(original, result);
    const beforeEnergy = lineEnergy(original, support);
    const afterEnergy = lineEnergy(resultPhoto, support);
    return { feature,
        changedFraction: changed / support.length,
        outsideError: lipOutsideError(original, result, support),
        alphaExact,
        textureCorrelation: textureCorrelation(original, resultPhoto, support),
        lineEnergyRatio: afterEnergy / Math.max(beforeEnergy, 1e-8),
        geometry: describeLip(anatomy),
        pigmentationTwoTone,
        warnings: [...warnings],
    };
}
export function gateLip(row) {
    const failures = [];
    if (row.outsideError > 0.025)
        failures.push("outside-support colour error exceeds 0.025");
    if (!row.alphaExact)
        failures.push("source alpha changed");
    if (row.textureCorrelation < 0.80)
        failures.push("texture correlation below 0.80");
    if (["W45", "W48", "W49"].includes(row.feature) && (row.lineEnergyRatio < 0.55 || row.lineEnergyRatio > 1.65)) {
        failures.push("geometry preview damaged local line energy");
    }
    if (row.feature === "W55" && row.lineEnergyRatio < 0.55)
        failures.push("finish preview flattened lip lines");
    return { passed: failures.length === 0, failures };
}
//# sourceMappingURL=assessment.js.map