/** CIELAB-space W28/W39 post-render evidence, not physical dye validation.
 * Mirrors Python's hair_evidence.py and preserves source arrays.
 * Author: John Khan.
 */
import { srgbToLab } from '../shade/colourspace.js';
export function measureHairChange(before, after, mask, width, height, channels, feature) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
        width > 8192 || height > 8192 ||
        before.length !== width * height * channels || after.length !== before.length ||
        mask.length !== width * height || !['W28', 'W39'].includes(feature)) {
        throw new RangeError('Frames and authorized hair mask must match');
    }
    const diff = [0, 0, 0];
    let selected = 0;
    let changedHair = 0;
    let outside = 0;
    let alphaChanged = 0;
    let maxChange = 0;
    let lStar = 0;
    let chroma = 0;
    for (let p = 0; p < width * height; p++) {
        const core = mask[p] >= 128;
        let changed = false;
        const oldRgb = [before[p * channels], before[p * channels + 1], before[p * channels + 2]];
        const newRgb = [after[p * channels], after[p * channels + 1], after[p * channels + 2]];
        for (let c = 0; c < 3; c++) {
            const delta = newRgb[c] - oldRgb[c];
            changed ||= delta !== 0;
            maxChange = Math.max(maxChange, Math.abs(delta));
            if (core)
                diff[c] += delta;
        }
        if (mask[p] === 0 && changed)
            outside++;
        if (channels === 4 && before[p * channels + 3] !== after[p * channels + 3])
            alphaChanged++;
        if (!core)
            continue;
        selected++;
        if (changed)
            changedHair++;
        const first = srgbToLab(oldRgb);
        const final = srgbToLab(newRgb);
        lStar += final[0] - first[0];
        chroma += Math.hypot(final[1] - first[1], final[2] - first[2]);
    }
    if (selected < 16)
        throw new RangeError('Insufficient positive hair pixels');
    const r5 = (value) => Math.round(value * 1e5) / 1e5;
    return {
        feature, hair_pixels: selected, changed_hair_pixels: changedHair,
        outside_mask_changed: outside, alpha_changed: alphaChanged,
        lightness_delta_lstar: r5(lStar / selected),
        chroma_delta_de76: r5(chroma / selected),
        mean_rgb_delta: [r5(diff[0] / selected), r5(diff[1] / selected), r5(diff[2] / selected)],
        maximum_channel_delta: maxChange, status: 'UNPROVEN',
    };
}
//# sourceMappingURL=hairEvidence.js.map