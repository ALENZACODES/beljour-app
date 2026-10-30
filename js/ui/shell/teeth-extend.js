/** Studio finish for Teeth whitening. The engine (engines/teeth/natural.ts, byte-matched to its
 * Python twin) only whitens the upper 82% of the mouth opening, so on a broad smile the lower edge
 * of the front teeth kept their colour under a hard line. Here the same lift reaches the rest of the
 * opening's enamel (pixels as light and as neutral as the teeth it whitened, never red mouth tissue),
 * and the change is softened by one pixel so no edge is left. Inside the mouth opening only.
 * Author: John Khan.
 */
import { regionMask } from "../../data/regions/index.js";
import { labToSrgb, srgbToLab, toByte } from "../../engines/shade/colourspace.js";
import { MAX_B_DROP, MAX_LIFT, NATURAL_L_CAP, WARM_B } from "../../engines/teeth/natural.js";
import { percentile } from "../../engines/teeth/natural.js";
import { xy } from "../../engines/skin/common.js";
export function extendWhitening(before, after, width, height, channels, points, amount) {
    const n = width * height, ch = channels;
    const pts = points.map(xy);
    const opening = regionMask("mouth_opening", pts, width, height, { normalized: false }).data;
    const lab = (i, src) => srgbToLab([Number(src[i * ch]), Number(src[i * ch + 1]), Number(src[i * ch + 2])]);
    const changed = [];
    for (let i = 0; i < n; i++)
        if (after[i * ch] !== before[i * ch] || after[i * ch + 1] !== before[i * ch + 1] || after[i * ch + 2] !== before[i * ch + 2])
            changed.push(i);
    if (changed.length < 8 || !(amount > 0))
        return after;
    const seen = changed.map((i) => lab(i, before));
    const lMin = percentile(seen.map((v) => v[0]), 15) - 2;
    const cLimit = percentile(seen.map((v) => Math.hypot(v[1], v[2])), 90) + 4;
    const out = Uint8Array.from(after), isChanged = new Uint8Array(n);
    for (const i of changed)
        isChanged[i] = 1;
    for (let i = 0; i < n; i++) {
        if (isChanged[i] || !(opening[i] >= 0.5))
            continue;
        const [l, a, b] = lab(i, before);
        if (l < lMin || Math.hypot(a, b) > cLimit || a - b > 12)
            continue;
        const target = [Math.min(Math.max(l, NATURAL_L_CAP), l + amount * Math.min(MAX_LIFT, Math.max(0, NATURAL_L_CAP - l))), a,
            Math.max(Math.min(b, WARM_B), b - amount * Math.min(MAX_B_DROP, Math.max(0, b - WARM_B)))];
        const rgb = labToSrgb(target).map(toByte);
        for (let c = 0; c < 3; c++)
            out[i * ch + c] = rgb[c];
        isChanged[i] = 1;
    }
    // One-pixel softening of the change inside the opening, so the whitened area has no hard edge.
    const soft = Uint8Array.from(out);
    for (let y = 1; y < height - 1; y++)
        for (let x = 1; x < width - 1; x++) {
            const i = y * width + x;
            if (!(opening[i] >= 0.5))
                continue;
            let near = 0;
            for (let dy = -1; dy <= 1; dy++)
                for (let dx = -1; dx <= 1; dx++)
                    near += isChanged[i + dy * width + dx];
            if (near === 0 || near === 9)
                continue;
            for (let c = 0; c < 3; c++) {
                let sum = 0;
                for (let dy = -1; dy <= 1; dy++)
                    for (let dx = -1; dx <= 1; dx++) {
                        const j = i + dy * width + dx;
                        sum += out[j * ch + c] - Number(before[j * ch + c]);
                    }
                soft[i * ch + c] = Math.max(0, Math.min(255, Math.round(Number(before[i * ch + c]) + 0.5 * (out[i * ch + c] - Number(before[i * ch + c])) + 0.5 * sum / 9)));
            }
        }
    return soft;
}
//# sourceMappingURL=teeth-extend.js.map