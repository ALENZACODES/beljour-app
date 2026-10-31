/** Ink Study: cel bands, original ink contours, exact protected pixels. Author: John Khan. */
import { blend, integer, luma, mask, number, parameters, photo, result, rgbValues, smooth01 } from "./types.js";
export const DEFAULTS = { amount: 0.75, levels: 5, ink: 0.65,
    edge_threshold: 0.09, edge_softness: 0.14, shadow: 0.18 };
export const LABEL = "Ink Study simulation. Hair and eye colours are copied from your photo.";
export function sobel(values, width, height) {
    const out = new Float64Array(width * height);
    const at = (x, y) => values[Math.min(height - 1, Math.max(0, y)) * width + Math.min(width - 1, Math.max(0, x))];
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const tl = at(x - 1, y - 1), tc = at(x, y - 1), tr = at(x + 1, y - 1);
            const ml = at(x - 1, y), mr = at(x + 1, y);
            const bl = at(x - 1, y + 1), bc = at(x, y + 1), br = at(x + 1, y + 1);
            const dx = (tr + 2 * mr + br - tl - 2 * ml - bl) / 8;
            const dy = (bl + 2 * bc + br - tl - 2 * tc - tr) / 8;
            out[y * width + x] = Math.hypot(dx, dy);
        }
    }
    return out;
}
export function celRGB(rgb, width, height, p) {
    const n = width * height, lum = new Float64Array(n), flat = new Float64Array(n * 3);
    for (let i = 0; i < n; i++)
        lum[i] = luma(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]) / 255;
    const edge = sobel(lum, width, height);
    for (let i = 0; i < n; i++) {
        let band = Math.floor(lum[i] * (p.levels - 1) + 0.5) / (p.levels - 1);
        band = Math.min(1, Math.max(0, band - p.shadow * (1 - smooth01((lum[i] - 0.25) / 0.5)) * 0.12));
        const scale = band / Math.max(lum[i], 1 / 255);
        edge[i] = smooth01((edge[i] - p.edgeThreshold) / p.edgeSoftness);
        for (let c = 0; c < 3; c++)
            flat[i * 3 + c] = Math.min(255, Math.max(0, rgb[i * 3 + c] * scale)) * (1 - p.ink * edge[i]);
    }
    return { rgb: flat, edge };
}
export function inkStudy(image, hairMask, eyeMask, params) {
    const src = photo(image), p = parameters(params, DEFAULTS), n = src.width * src.height;
    const amount = number(p.amount, "amount", 0, 1);
    const levels = integer(p.levels, "levels", 2, 12);
    const ink = number(p.ink, "ink", 0, 1);
    const edgeThreshold = number(p.edge_threshold, "edge_threshold", 0, 0.5);
    const edgeSoftness = number(p.edge_softness, "edge_softness", 0.005, 0.5);
    const shadow = number(p.shadow, "shadow", 0, 1);
    const hair = mask(hairMask, n, "hair_mask"), eyes = mask(eyeMask, n, "eye_mask");
    const support = new Float64Array(n);
    let protectionPixels = 0;
    for (let i = 0; i < n; i++) {
        if (hair[i] > 0 || eyes[i] > 0)
            protectionPixels++;
        else
            support[i] = amount;
    }
    const flat = celRGB(rgbValues(src), src.width, src.height, { levels, ink, edgeThreshold, edgeSoftness, shadow });
    const out = blend(src, flat.rgb, support);
    let hairError = 0, eyeError = 0, edgeSum = 0;
    for (let i = 0; i < n; i++) {
        edgeSum += flat.edge[i];
        for (let c = 0; c < 3; c++) {
            const diff = Math.abs(out[i * src.channels + c] - src.data[i * src.channels + c]);
            if (hair[i] > 0)
                hairError = Math.max(hairError, diff);
            if (eyes[i] > 0)
                eyeError = Math.max(eyeError, diff);
        }
    }
    return result("ink-study", src, out, support, LABEL, { hair_max_error: hairError, eye_max_error: eyeError, geometry_displacement: 0,
        ink_coverage: edgeSum / n, protection_pixels: protectionPixels, quantization_levels: levels }, ["Procedural illustration; this does not generate a new face or hairstyle."]);
}
