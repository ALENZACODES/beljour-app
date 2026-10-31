/** Local ceremony makeup bundle plus daylight/venue/flash drift checks. Author: John Khan. */
import { alphaBlend, restore } from "./common.js";
export const LABEL = "Ceremony Light Check — restrained local look previewed under daylight, venue and camera flash.";
export const DEFAULT_BRIDAL = { complexion: 0.14, lip: 0.34, eye: 0.24, cheek: 0.16 };
export function renderBridal(image, width, height, skin, lips, eyes, cheeks, options = DEFAULT_BRIDAL, iris, protectedMask) {
    let out = alphaBlend(image, width, height, [164, 128, 111], skin, Math.floor(options.complexion * 180));
    out = alphaBlend(out, width, height, [132, 66, 78], lips, Math.floor(options.lip * 255));
    out = alphaBlend(out, width, height, [72, 60, 64], eyes, Math.floor(options.eye * 210));
    out = alphaBlend(out, width, height, [177, 100, 102], cheeks, Math.floor(options.cheek * 190));
    if (iris)
        out = restore(out, image, iris);
    return protectedMask ? restore(out, image, protectedMask) : out;
}
function meanRgb(image, mask) {
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (let i = 0; i < mask.length; i += 1) {
        if (mask[i] === 0)
            continue;
        const base = i * 4;
        r += image[base];
        g += image[base + 1];
        b += image[base + 2];
        n += 1;
    }
    return n === 0 ? [0, 0, 0] : [r / n, g / n, b / n];
}
function drift(reference, observed) {
    const dr = reference[0] - observed[0];
    const dg = reference[1] - observed[1];
    const db = reference[2] - observed[2];
    return Math.sqrt(dr * dr + dg * dg + db * db) / 255 * 100;
}
function adjusted(rgb, gains) {
    return [
        Math.max(0, Math.min(255, rgb[0] * gains[0])),
        Math.max(0, Math.min(255, rgb[1] * gains[1])),
        Math.max(0, Math.min(255, rgb[2] * gains[2])),
    ];
}
export function flashCheck(image, skin, lips) {
    const skinRgb = meanRgb(image, skin);
    const lipRgb = meanRgb(image, lips);
    const daylight = Math.max(drift(skinRgb, adjusted(skinRgb, [1.02, 1.01, 0.99])), drift(lipRgb, adjusted(lipRgb, [1.01, 1, 0.99])));
    const venue = Math.max(drift(skinRgb, adjusted(skinRgb, [1, 0.94, 0.88])), drift(lipRgb, adjusted(lipRgb, [1, 0.96, 0.91])));
    const flash = Math.max(drift(skinRgb, adjusted(skinRgb, [1.06, 1.06, 1.08])), drift(lipRgb, adjusted(lipRgb, [1.04, 1.03, 1.04])));
    return { daylightDrift: daylight, venueDrift: venue, flashDrift: flash, passed: Math.max(daylight, venue, flash) <= 8 };
}
