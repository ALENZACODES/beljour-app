/** In-house hair swatch preview; limited to caller-authorized primary hair mask.
 * Pixel-only identity guard is temporary, not face verification.
 */
import { validateLevel } from "../../commerce/strength.js";
import { DefaultCoverGuard } from "../local/fibre.js";
import { pixelLab } from "../core/colour.js";
import { measuredLevel, requireShade } from "./palette.js";
export function applyShade(image, width, height, hairMask, landmarks, shadeId, level, options = {}) {
    const strength = validateLevel(level), lock = validateLevel(options.lockLevel ?? 5);
    if (!landmarks)
        return { rendered: false, code: "no_mesh", reason: "No primary-face landmarks supplied." };
    const n = width * height, channels = image.length / n;
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 8 || height < 8 ||
        n > 4_500_000 || ![3, 4].includes(channels) || hairMask.length !== n) {
        return { rendered: false, code: "invalid_image", reason: "Invalid photo or hair mask dimensions." };
    }
    const box = options.primaryBox ?? [0, 0, width, height];
    if (box.length !== 4 || box.some((v) => !Number.isInteger(v)) || box[0] < 0 || box[1] < 0 ||
        box[2] > width || box[3] > height || box[0] >= box[2] || box[1] >= box[3]) {
        return { rendered: false, code: "invalid_primary_face", reason: "Invalid primary-face box." };
    }
    const isByte = hairMask instanceof Uint8Array || hairMask instanceof Uint8ClampedArray;
    const allowed = new Uint8Array(n);
    const samples = [[], [], []];
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
            const i = y * width + x, value = hairMask[i];
            if (!Number.isFinite(value) || value < 0 || value > (isByte ? 255 : 1)) {
                return { rendered: false, code: "invalid_mask", reason: "Invalid hair coverage values." };
            }
            const inside = x >= box[0] && x < box[2] && y >= box[1] && y < box[3];
            if (inside && value >= (isByte ? 128 : .5)) {
                allowed[i] = 1;
                for (let c = 0; c < 3; c++)
                    samples[c].push(image[i * channels + c]);
            }
        }
    if (!samples[0].length)
        return { rendered: false, code: "invalid_mask", reason: "No visible primary-face hair." };
    const shade = requireShade(shadeId);
    const median = samples.map((array) => {
        array.sort((a, b) => a - b);
        return (array[(array.length - 1) >> 1] + array[array.length >> 1]) / 2;
    });
    const current = measuredLevel(pixelLab(median[0], median[1], median[2]));
    if (!options.allowLightening && shade.level > current) {
        return { rendered: false, code: "lightening_not_automatic", reason: "A lighter colour needs explicit selection." };
    }
    const opacity = (strength - 1) / 4 * .8;
    const changed = new Uint8Array(image);
    for (let i = 0; i < n; i++) {
        if (!allowed[i])
            continue;
        for (let c = 0; c < 3; c++) {
            const p = i * channels + c;
            changed[p] = Math.floor(image[p] * (1 - opacity) + shade.rgb[c] * opacity + .5);
        }
    }
    const decision = (options.guard ?? new DefaultCoverGuard()).guard(new Uint8Array(image), changed, lock);
    if (decision.data.length !== image.length || !Number.isFinite(decision.similarity)) {
        throw RangeError("Invalid identity guard output.");
    }
    const pixels = new Uint8Array(image);
    let count = 0;
    for (let i = 0; i < n; i++) {
        if (!allowed[i])
            continue;
        for (let c = 0; c < 3; c++)
            pixels[i * channels + c] = decision.data[i * channels + c];
        if ([0, 1, 2].some((c) => pixels[i * channels + c] !== image[i * channels + c]))
            count++;
    }
    return { rendered: true, pixels, shadeId, level: strength, changedPixels: count,
        identitySimilarity: decision.similarity, identityBlended: decision.blended,
        providerCalls: 0, simulated: true,
        label: "In-house hair-colour simulation; not tested against real products." };
}
