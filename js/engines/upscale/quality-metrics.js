import { checkedRaster, lumaPlane } from "./quality-raster.js";
const C1 = (0.01 * 255) ** 2;
const C2 = (0.03 * 255) ** 2;
export const SSIM_WINDOW = 8;
function sameShape(a, b) {
    checkedRaster(a);
    checkedRaster(b);
    if (a.width !== b.width || a.height !== b.height)
        throw new RangeError("Images differ in size");
}
/** Infinity for identical images. */
export function psnrRgb(reference, candidate) {
    sameShape(reference, candidate);
    let total = 0;
    const pixels = reference.width * reference.height;
    for (let p = 0; p < pixels; p++) {
        for (let c = 0; c < 3; c++) {
            const delta = reference.data[p * 4 + c] - candidate.data[p * 4 + c];
            total += delta * delta;
        }
    }
    const mse = total / (pixels * 3);
    return mse === 0 ? Infinity : 10 * Math.log10(255 * 255 / mse);
}
export function ssimLuma(reference, candidate) {
    sameShape(reference, candidate);
    if (reference.width < SSIM_WINDOW || reference.height < SSIM_WINDOW) {
        throw new RangeError("Images are smaller than one SSIM window");
    }
    const a = lumaPlane(reference), b = lumaPlane(candidate);
    const width = reference.width;
    let total = 0, windows = 0;
    for (let top = 0; top + SSIM_WINDOW <= reference.height; top += SSIM_WINDOW) {
        for (let left = 0; left + SSIM_WINDOW <= width; left += SSIM_WINDOW) {
            let sumA = 0, sumB = 0, sumAA = 0, sumBB = 0, sumAB = 0;
            for (let y = top; y < top + SSIM_WINDOW; y++) {
                for (let x = left; x < left + SSIM_WINDOW; x++) {
                    const va = a[y * width + x], vb = b[y * width + x];
                    sumA += va;
                    sumB += vb;
                    sumAA += va * va;
                    sumBB += vb * vb;
                    sumAB += va * vb;
                }
            }
            const n = SSIM_WINDOW * SSIM_WINDOW;
            const meanA = sumA / n, meanB = sumB / n;
            const varA = sumAA / n - meanA * meanA, varB = sumBB / n - meanB * meanB;
            const cov = sumAB / n - meanA * meanB;
            total += ((2 * meanA * meanB + C1) * (2 * cov + C2)) /
                ((meanA * meanA + meanB * meanB + C1) * (varA + varB + C2));
            windows += 1;
        }
    }
    return total / windows;
}
//# sourceMappingURL=quality-metrics.js.map