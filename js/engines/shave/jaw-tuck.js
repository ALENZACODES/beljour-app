/**
 * Jaw under the beard. On a bearded face the mesh's face_oval tends to follow the beard's outline, so a
 * shave that keeps that outline leaves a jaw that is as wide and low as the beard was: a heavier
 * stranger's jaw (visible in the round-4 sheet). This pulls the lower contour INWARD by an estimated
 * beard thickness, never outward, with a smooth, fold-free field that dies out within ~3t of the line.
 * The thickness is a prior (ASSUMED: up to 0.05 IOD for a dense full beard), scaled by the beard
 * density measured at the silhouette, and checked afterwards by beardJawCheck (identity.ts).
 */
import { clamp, smoothstep } from "../core/bands.js";
export const LOWER_OVAL = [132, 58, 172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397, 288, 361];
export function jawTuck(img, pts, iod, density, amount, maxIod = 0.05) {
    const { width: w, height: h, channels: ch } = img;
    const out = Uint8Array.from(img.data);
    const nose = pts[1], contour = LOWER_OVAL.map((k) => pts[k]);
    // inward unit normal and shift per contour vertex
    const shift = contour.map(([x, y]) => clamp(amount) * maxIod * iod * clamp(density(x, y)));
    const normal = contour.map(([x, y], k) => {
        const p = contour[Math.max(0, k - 1)], q = contour[Math.min(contour.length - 1, k + 1)];
        let nx = -(q[1] - p[1]), ny = q[0] - p[0];
        const m = Math.hypot(nx, ny) || 1;
        nx /= m;
        ny /= m;
        if ((nose[0] - x) * nx + (nose[1] - y) * ny < 0) {
            nx = -nx;
            ny = -ny;
        }
        return [nx, ny]; // points INTO the face
    });
    const tMax = Math.max(...shift);
    if (!(tMax > 0.5))
        return { data: out, maxShiftPx: tMax, meanShiftPx: 0, minJacobian: 1 };
    const xs = contour.map((p) => p[0]), ys = contour.map((p) => p[1]), pad = 5 * tMax;
    const x0 = Math.max(0, Math.floor(Math.min(...xs) - pad)), x1 = Math.min(w - 1, Math.ceil(Math.max(...xs) + pad));
    const y0 = Math.max(0, Math.floor(Math.min(...ys) - pad)), y1 = Math.min(h - 1, Math.ceil(Math.max(...ys) + pad));
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1, dispX = new Float64Array(bw * bh), dispY = new Float64Array(bw * bh);
    let sum = 0, cnt = 0;
    for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
            // nearest point on the polyline
            let best = Infinity, bt = 0, bk = 0;
            for (let k = 0; k < contour.length - 1; k++) {
                const a = contour[k], b = contour[k + 1], dx = b[0] - a[0], dy = b[1] - a[1];
                const t = clamp(((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1));
                const d2 = (x - a[0] - t * dx) ** 2 + (y - a[1] - t * dy) ** 2;
                if (d2 < best) {
                    best = d2;
                    bk = k;
                    bt = t;
                }
            }
            const nx = normal[bk][0] * (1 - bt) + normal[bk + 1][0] * bt, ny = normal[bk][1] * (1 - bt) + normal[bk + 1][1] * bt;
            const t = shift[bk] * (1 - bt) + shift[bk + 1] * bt;
            if (t < 0.25)
                continue;
            const a = contour[bk], b = contour[bk + 1], px = a[0] + (b[0] - a[0]) * bt, py = a[1] + (b[1] - a[1]) * bt;
            const sgn = (x - px) * nx + (y - py) * ny; // > 0 inside the face
            const bs = -sgn; // > 0 outside
            // Backward map: the output samples further OUT, so the outline moves IN by ~t. Fold-free: slope < 1.
            const fall = bs >= 0 ? 1 - smoothstep(0, 4 * t, bs) : 1 - smoothstep(0, 2.5 * t, -bs);
            const k = (y - y0) * bw + (x - x0);
            dispX[k] = -nx * t * fall;
            dispY[k] = -ny * t * fall;
            if (fall > 0.9) {
                sum += t;
                cnt++;
            }
        }
    let minJ = Infinity;
    for (let y = 1; y < bh - 1; y++)
        for (let x = 1; x < bw - 1; x++) {
            const k = y * bw + x;
            const jx = 1 + 0.5 * (dispX[k + 1] - dispX[k - 1]), jy = 1 + 0.5 * (dispY[k + bw] - dispY[k - bw]);
            const cxy = 0.5 * (dispX[k + bw] - dispX[k - bw]), cyx = 0.5 * (dispY[k + 1] - dispY[k - 1]);
            minJ = Math.min(minJ, jx * jy - cxy * cyx);
        }
    for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
            const k = (y - y0) * bw + (x - x0);
            if (dispX[k] === 0 && dispY[k] === 0)
                continue;
            const sx = clamp(x + dispX[k], 0, w - 1), sy = clamp(y + dispY[k], 0, h - 1);
            const ix = Math.min(w - 2, Math.floor(sx)), iy = Math.min(h - 2, Math.floor(sy)), fx = sx - ix, fy = sy - iy;
            for (let c = 0; c < Math.min(ch, 3); c++) { // colour only: alpha stays where it was
                const v = (img.data[(iy * w + ix) * ch + c] * (1 - fx) + img.data[(iy * w + ix + 1) * ch + c] * fx) * (1 - fy)
                    + (img.data[((iy + 1) * w + ix) * ch + c] * (1 - fx) + img.data[((iy + 1) * w + ix + 1) * ch + c] * fx) * fy;
                out[(y * w + x) * ch + c] = Math.round(v);
            }
        }
    return { data: out, maxShiftPx: tMax, meanShiftPx: cnt ? sum / cnt : 0, minJacobian: Number.isFinite(minJ) ? minJ : 1 };
}
