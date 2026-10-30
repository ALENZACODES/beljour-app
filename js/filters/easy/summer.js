/** Skin-only warm summer treatment with deterministic faux freckles. Author: John Khan. */
import { deterministicNoise, restore, validateImage, validateMask } from "./common.js";
export const LABEL = "Sunlit Skin — additive warm tone with optional faux freckles; never a tan-removal lightener.";
export const DEFAULT_SUMMER = { undertone: "neutral", amount: 0.30, freckles: 0, seed: 27 };
const targets = {
    cool: [126, 88, 73], neutral: [132, 91, 68], warm: [139, 94, 62], olive: [131, 100, 61],
};
export function renderSummer(image, width, height, skin, options = DEFAULT_SUMMER, cheekNose, iris, protectedMask) {
    validateImage(image, width, height);
    validateMask(skin, width, height, "skin");
    const out = new Uint8ClampedArray(image);
    const target = targets[options.undertone];
    for (let i = 0; i < width * height; i += 1) {
        const alpha = skin[i] / 255 * options.amount;
        if (alpha <= 0)
            continue;
        const base = i * 4;
        const originalMean = (image[base] + image[base + 1] + image[base + 2]) / 3;
        const candidate = [0, 1, 2].map(c => image[base + c] * (1 - alpha) + target[c] * alpha);
        const candidateMean = (candidate[0] + candidate[1] + candidate[2]) / 3;
        const scale = candidateMean > originalMean ? originalMean / Math.max(candidateMean, 1) : 1;
        for (let c = 0; c < 3; c += 1)
            out[base + c] = Math.floor(candidate[c] * scale + 0.5);
    }
    if (options.freckles > 0) {
        const threshold = Math.floor(127 - options.freckles * 14);
        const alpha = Math.min(0.55, 0.18 + options.freckles * 0.32);
        for (let y = 0; y < height; y += 1) {
            for (let x = 0; x < width; x += 1) {
                const i = y * width + x;
                if (skin[i] <= 115 || (cheekNose && cheekNose[i] <= 115))
                    continue;
                if (deterministicNoise(x, y, options.seed) <= threshold)
                    continue;
                const base = i * 4;
                for (let c = 0; c < 3; c += 1)
                    out[base + c] = Math.floor(out[base + c] * (1 - alpha) + 0.5);
            }
        }
    }
    let safe = iris ? restore(out, image, iris) : out;
    if (protectedMask)
        safe = restore(safe, image, protectedMask);
    return safe;
}
//# sourceMappingURL=summer.js.map