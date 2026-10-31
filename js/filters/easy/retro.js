/** Original retro portrait photo treatment; no generated clothes. Author: John Khan. */
import { deterministicNoise, restore, validateImage, validateMask } from "./common.js";
export const LABEL = "Archive Flash — grain, falloff and muted print colour; clothing is unchanged.";
export const DEFAULT_RETRO = { strength: 0.72, grain: 0.35, backdrop: 0.25, seed: 19 };
export function renderRetro(image, width, height, options = DEFAULT_RETRO, protectedMask, background, iris) {
    validateImage(image, width, height);
    if (background)
        validateMask(background, width, height, "background");
    const out = new Uint8ClampedArray(image);
    const grade = [1.035, 0.995, 0.92];
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const nx = (x + 0.5 - width * 0.5) / Math.max(width * 0.5, 1);
            const ny = (y + 0.5 - height * 0.46) / Math.max(height * 0.54, 1);
            const radius = Math.sqrt(nx * nx + ny * ny);
            const vignette = Math.max(0.72, Math.min(1, 1 - options.strength * 0.20 * Math.max(0, Math.min(1.2, radius - 0.22))));
            const flash = 1 + options.strength * 0.10 * Math.exp(-(nx * nx + ny * ny) / 0.16);
            const grain = deterministicNoise(x, y, options.seed) * (options.grain * 7 / 128);
            const i = (y * width + x) * 4;
            for (let c = 0; c < 3; c += 1) {
                let value = image[i + c] * vignette * flash * (1 + (grade[c] - 1) * options.strength);
                value = (value - 128) * (1 - 0.08 * options.strength) + 128 + grain;
                if (background && background[y * width + x] > 0 && options.backdrop > 0) {
                    const m = deterministicNoise(x, y, options.seed + 41) / 128;
                    const target = [142 + 8 * m, 146 + 6 * m, 151 + 5 * m][c];
                    const alpha = (background[y * width + x] / 255) * options.backdrop * 0.35;
                    value = value * (1 - alpha) + target * alpha;
                }
                out[i + c] = Math.max(0, Math.min(255, Math.floor(value + 0.5)));
            }
        }
    }
    const irisSafe = iris ? restore(out, image, iris) : out;
    return protectedMask ? restore(irisSafe, image, protectedMask) : irisSafe;
}
