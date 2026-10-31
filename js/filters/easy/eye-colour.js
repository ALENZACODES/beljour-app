/** Local iris recolour preserving pupil and catchlight. Author: John Khan. */
import { maskSubtract, restore, validateImage, validateMask } from "./common.js";
export const LABEL = "Iris Tint — local colour shift with pupil, limbal ring and catchlight preserved.";
export const DEFAULT_EYE_COLOUR = { colour: [76, 117, 132], amount: 0.72 };
export function renderEyeColour(image, width, height, iris, pupil, highlight, options = DEFAULT_EYE_COLOUR, protectedMask) {
    validateImage(image, width, height);
    validateMask(iris, width, height, "iris");
    const editable = maskSubtract(maskSubtract(iris, pupil), highlight);
    const out = new Uint8ClampedArray(image);
    const targetMean = Math.max((options.colour[0] + options.colour[1] + options.colour[2]) / 3, 1);
    for (let i = 0; i < width * height; i += 1) {
        const alpha = editable[i] / 255 * options.amount;
        if (alpha <= 0)
            continue;
        const base = i * 4;
        const luminance = 0.299 * image[base] + 0.587 * image[base + 1] + 0.114 * image[base + 2];
        for (let c = 0; c < 3; c += 1) {
            const target = Math.max(0, Math.min(255, options.colour[c] * (0.55 + 0.45 * luminance / targetMean)));
            out[base + c] = Math.floor(image[base + c] * (1 - alpha) + target * alpha + 0.5);
        }
    }
    let safe = restore(out, image, pupil);
    safe = restore(safe, image, highlight);
    return protectedMask ? restore(safe, image, protectedMask) : safe;
}
