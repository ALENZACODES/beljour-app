/** Public mask-only short-sides render with fail-closed input handling.
 * Assumed pixel guard will be replaced by Workstream H public identity API.
 * This is a tonal consultation simulation, not generated hair. Author: John Khan.
 */
import { validateLevel, toLegacy } from "../../commerce/strength.js";
import { DefaultCoverGuard } from "../local/fibre.js";
import { renderStyle, requireStyle } from "./render.js";
export const RENDER_LABEL = "Local short-sides tonal simulation. A haircut result is not predicted.";
export function renderStyleForFace(image, width, height, mask, landmarks, styleId, level, source, options = {}) {
    const amount = validateLevel(level), locked = validateLevel(options.lockLevel ?? 5);
    if (!landmarks)
        return { rendered: false, code: "no_mesh", reason: "No primary-face landmarks supplied." };
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 8 || height < 8 ||
        width * height > 4_500_000 || (image.length !== width * height * 3 && image.length !== width * height * 4)) {
        return { rendered: false, code: "invalid_image", reason: "Invalid RGB or RGBA photo." };
    }
    const box = options.primaryBox ?? [0, 0, width, height];
    if (box.length !== 4 || box.some((v) => !Number.isInteger(v)) || box[0] < 0 || box[1] < 0 ||
        box[2] > width || box[3] > height || box[0] >= box[2] || box[1] >= box[3]) {
        return { rendered: false, code: "invalid_primary_face", reason: "Invalid primary-face box." };
    }
    if (mask.length !== width * height) {
        return { rendered: false, code: "invalid_mask", reason: "Hair mask size mismatch." };
    }
    const clamped = new Float64Array(mask.length);
    let count = 0;
    const byte = mask instanceof Uint8Array || mask instanceof Uint8ClampedArray;
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
            const i = y * width + x, v = mask[i];
            if (!Number.isFinite(v) || v < 0 || v > (byte ? 255 : 1)) {
                return { rendered: false, code: "invalid_mask", reason: "Invalid hair-mask values." };
            }
            if (x >= box[0] && x < box[2] && y >= box[1] && y < box[3]) {
                clamped[i] = byte ? v / 255 : v;
                if (clamped[i])
                    count++;
            }
        }
    if (count === 0)
        return { rendered: false, code: "invalid_mask", reason: "No primary-face hair region." };
    const preset = requireStyle(source, styleId);
    const recipe = { ...preset, strength: toLegacy(amount) };
    const rendered = renderStyle(image, width, height, clamped, landmarks, recipe, null, options.scalpRgb);
    const decision = (options.guard ?? new DefaultCoverGuard()).guard(new Uint8Array(image), rendered.pixels, locked);
    if (decision.data.length !== image.length || !Number.isFinite(decision.similarity) ||
        decision.similarity < 0 || decision.similarity > 1)
        throw RangeError("Identity guard returned invalid output.");
    const result = new Uint8Array(image);
    const channels = image.length / (width * height);
    let changed = 0;
    for (let i = 0; i < clamped.length; i++) {
        if (!clamped[i])
            continue;
        for (let c = 0; c < 3; c++)
            result[i * channels + c] = decision.data[i * channels + c];
        if ([0, 1, 2].some((c) => image[i * channels + c] !== result[i * channels + c]))
            changed++;
    }
    return { rendered: true, pixels: result, styleId, level: amount,
        changedPixelShare: changed / (width * height), sideRevealShare: changed / count,
        affectedPixels: changed, maskPixels: count, identitySimilarity: decision.similarity,
        identityBlended: decision.blended, providerCalls: 0, simulated: true, label: RENDER_LABEL };
}
//# sourceMappingURL=public-render.js.map