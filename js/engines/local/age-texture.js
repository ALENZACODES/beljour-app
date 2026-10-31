import { extendVisibleSkin } from "../skin/full-skin.js";
import { boxPlane, byte, clamp01, highBandEnergy, lumaAt, renderClock, seeded, smooth01 } from "../skin/texture-law.js";
const ell = (x, y, cx, cy, rx, ry) => Math.exp(-0.5 * (((x - cx) / Math.max(1, rx)) ** 2 + ((y - cy) / Math.max(1, ry)) ** 2));
/** Detects photographic wrinkle valleys ONLY in landmark-plausible regions.
 * Does not draw parallel forehead strokes where the source shows none.
 */
export function renderAgeSurface(image, skin, points, options) {
    const start = renderClock(), { width: w, height: h, channels: ch } = image, n = w * h;
    if (skin.data.length !== n || points.length < 468)
        throw new RangeError("age needs a matching skin mask and face mesh");
    const extent = extendVisibleSkin(image, skin.data, options.excluded), support = extent.alpha;
    const photoY = new Float64Array(n), R = new Float64Array(n), G = new Float64Array(n), B = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        const j = i * ch;
        R[i] = image.data[j];
        G[i] = image.data[j + 1];
        B[i] = image.data[j + 2];
        photoY[i] = lumaAt(image, i);
    }
    const poreR = 2, lowY = boxPlane(photoY, w, h, poreR), midY = boxPlane(photoY, w, h, 8), wideY = boxPlane(photoY, w, h, 22);
    let minX = w, maxX = 0, minY = h, maxY = 0;
    for (const [x, y] of points.slice(0, 468)) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
    }
    const fw = maxX - minX, fh = maxY - minY, frac = clamp01(options.fraction);
    const random = seeded(options.seed), out = new Uint8Array(image.data), edit = new Float64Array(n);
    const outerEyeLeft = points[33], outerEyeRight = points[263];
    const mouthLeft = points[61], mouthRight = points[291];
    const noseLeft = points[129], noseRight = points[358];
    const marks = [];
    if (options.older && options.spots > 0) {
        const count = Math.min(28, Math.round(14 * frac * clamp01(options.spots)));
        for (let k = 0; k < count * 8 && marks.length < count; k++) {
            const x = minX + fw * (0.12 + random() * 0.76), y = minY + fh * (0.08 + random() * 0.72);
            const i = Math.floor(y) * w + Math.floor(x);
            if (i < 0 || i >= n || support[i] < 0.95)
                continue;
            const distanceFromMouth = Math.min(Math.hypot(x - mouthLeft[0], y - mouthLeft[1]), Math.hypot(x - mouthRight[0], y - mouthRight[1]));
            if (distanceFromMouth < options.iod * 0.15)
                continue;
            marks.push({ x, y, radius: Math.max(1.2, options.iod * (0.013 + random() * 0.018)),
                depth: 1.8 + random() * 3.7, phase: random() * Math.PI * 2 });
        }
    }
    let wrinklePixels = 0, wrinkleContrast = 0;
    for (let y = Math.max(0, Math.floor(minY - 0.2 * fh)); y < Math.min(h, Math.ceil(maxY + 0.90 * fh)); y++) {
        for (let x = Math.max(0, Math.floor(minX - fw * 0.2)); x < Math.min(w, Math.ceil(maxX + fw * 0.2)); x++) {
            const i = y * w + x, alpha = support[i] * frac;
            if (alpha < 0.002)
                continue;
            const fore = ell(x, y, minX + fw * 0.5, minY + fh * 0.19, fw * 0.40, fh * 0.12);
            const eye = Math.max(ell(x, y, outerEyeLeft[0], outerEyeLeft[1], options.iod * 0.24, options.iod * 0.22), ell(x, y, outerEyeRight[0], outerEyeRight[1], options.iod * 0.24, options.iod * 0.22));
            const fold = Math.max(ell(x, y, (noseLeft[0] + mouthLeft[0]) / 2, (noseLeft[1] + mouthLeft[1]) / 2, options.iod * 0.19, options.iod * 0.27), ell(x, y, (noseRight[0] + mouthRight[0]) / 2, (noseRight[1] + mouthRight[1]) / 2, options.iod * 0.19, options.iod * 0.27));
            const neck = smooth01((y - maxY + 0.05 * fh) / Math.max(1, 0.25 * fh));
            const wrinkleZone = clamp01(Math.max(fore, eye, fold, neck * 0.45));
            // Source-local 2–8px negative ridges: shaded real creases, not generated ruled lines.
            const valley = clamp01((midY[i] - lowY[i] - 0.9) / 5.0) * wrinkleZone;
            const wrinkle = alpha * clamp01(options.lines) * (options.older ? -3.5 : 5.0) * valley;
            if (Math.abs(wrinkle) > 0.12) {
                wrinklePixels++;
                wrinkleContrast += Math.abs(wrinkle);
            }
            // Aged low/mid albedo is photo-derived: no global yellow/blue additive wash.
            const ownMottle = midY[i] - wideY[i];
            const mottle = (options.older ? 0.16 : -0.23) * clamp01(options.colour) * alpha * ownMottle;
            const redness = (options.older ? -0.012 : 0.009) * clamp01(options.colour) * alpha;
            const grainGuard = clamp01(Math.abs(photoY[i] - lowY[i]) / 12);
            const textureMid = (options.older ? 0.16 : -0.17) * clamp01(options.texture) * alpha
                * (1 - 0.4 * grainGuard) * (lowY[i] - midY[i]);
            let pigment = 0;
            if (marks.length)
                for (const mark of marks) {
                    if (Math.abs(x - mark.x) > 3 * mark.radius || Math.abs(y - mark.y) > 3 * mark.radius)
                        continue;
                    const dx = x - mark.x, dy = y - mark.y, theta = Math.atan2(dy, dx);
                    const rr = mark.radius * (1 + 0.13 * Math.sin(3 * theta + mark.phase) + 0.06 * Math.sin(5 * theta - mark.phase));
                    pigment += mark.depth * (1 - smooth01((Math.hypot(dx, dy) - rr + 0.5) / 1.1));
                }
            pigment *= alpha * clamp01(options.spots);
            const delta = wrinkle + mottle + textureMid - pigment;
            const j = i * ch, old = photoY[i];
            // Add only a computed low/mid difference; original 1–2px residual is unchanged.
            const lowGuard = Math.max(0.25, 1 - 0.55 * clamp01((old - 190) / 65));
            const d = delta * lowGuard;
            const shiftRed = 255 * redness * (G[i] / 255) * (1 - G[i] / 255);
            out[j] = byte(R[i] + d + shiftRed);
            out[j + 1] = byte(G[i] + d);
            out[j + 2] = byte(B[i] + d - shiftRed * 0.25);
            if (out[j] !== image.data[j] || out[j + 1] !== image.data[j + 1] || out[j + 2] !== image.data[j + 2])
                edit[i] = alpha;
        }
    }
    const beforeEnergy = highBandEnergy(photoY, w, h, support);
    const afterY = new Float64Array(n), finished = { ...image, data: out };
    for (let i = 0; i < n; i++)
        afterY[i] = lumaAt(finished, i);
    const afterEnergy = highBandEnergy(afterY, w, h, support);
    // The 1–2px band is guarded by the additive design; no blind noise amplification.
    return { image: { ...image, data: out }, edit, wrinklePixels,
        wrinkleContrast: wrinklePixels ? wrinkleContrast / wrinklePixels : 0, spots: marks.length,
        poreRatio: beforeEnergy > 0 ? afterEnergy / beforeEnergy : 1,
        expandedSkin: extent.expandedPixels, coverageVerified: extent.coverageComplete, renderMs: renderClock() - start };
}
