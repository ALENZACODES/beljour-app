/** Scaled copies of a photo source for previews: thumbnails (FS7), the 2×2 grid and the stop grid.
 *
 * The photo, its masks (crown, person) and its geometry (synthetic face points, body control
 * points) are scaled together so every local engine sees a consistent, smaller document.
 * Masks use exact area averaging (the same weights as resizeArea), so a scaled mask keeps
 * its coverage. Nothing is inferred: a source without a face fixture stays without one.
 *
 * Author: John Khan.
 */
import { areaWeights, floatImage, resize } from "../../engines/core/buffer.js";
import { makeControls } from "../../engines/local/posture.js";
export function scaledSize(width, height, maxSide) {
    if (!(Number.isInteger(maxSide) && maxSide >= 16 && maxSide <= 4096))
        throw new RangeError("Preview size must be 16–4096 px");
    if (!(width >= 1 && height >= 1))
        throw new RangeError("Photo size must be positive");
    const factor = Math.min(1, maxSide / Math.max(width, height));
    return { width: Math.max(1, Math.round(width * factor)), height: Math.max(1, Math.round(height * factor)), factor };
}
/** Area-averaged mask resize (shrink only), keeping values in [0, 1]. */
export function resizeMask(mask, width, height) {
    if (mask.channels !== 1)
        throw new RangeError("A mask has one channel");
    if (width === mask.width && height === mask.height)
        return { ...mask, data: Float32Array.from(mask.data) };
    if (!(width >= 1 && width <= mask.width && height >= 1 && height <= mask.height))
        throw new RangeError("Masks only shrink here");
    const wy = areaWeights(mask.height, height), wx = areaWeights(mask.width, width);
    const rows = new Float64Array(height * mask.width);
    for (let i = 0; i < height; i++) {
        for (const [j, weight] of wy[i])
            for (let x = 0; x < mask.width; x++)
                rows[i * mask.width + x] += weight * mask.data[j * mask.width + x];
    }
    const out = floatImage(width, height, 1);
    for (let i = 0; i < height; i++) {
        for (let l = 0; l < width; l++) {
            let acc = 0;
            for (const [k, weight] of wx[l])
                acc += weight * rows[i * mask.width + k];
            out.data[i * width + l] = Math.min(1, Math.max(0, acc));
        }
    }
    return out;
}
export function scalePoint(p, sx, sy) {
    return [(p[0] + 0.5) * sx - 0.5, (p[1] + 0.5) * sy - 0.5];
}
export function scaleControls(c, width, height) {
    const sx = width / c.width, sy = height / c.height;
    const points = {};
    for (const [name, p] of Object.entries(c.points)) {
        const q = scalePoint(p, sx, sy);
        points[name] = [Math.min(width - 1, Math.max(0, q[0])), Math.min(height - 1, Math.max(0, q[1]))];
    }
    return makeControls(c.view, points, width, height, c.facing, c.estimated, c.manual);
}
/** A smaller copy of the whole source; the original is never changed. */
export function scaleSource(source, maxSide) {
    const { width, height, factor } = scaledSize(source.image.width, source.image.height, maxSide);
    if (factor >= 1)
        return source;
    const sx = width / source.image.width, sy = height / source.image.height;
    const image = resize(source.image, width, height);
    const scaled = { ...source, id: `${source.id}#${width}x${height}`, image };
    if (source.hair)
        scaled.hair = resizeMask(source.hair, width, height);
    if (source.hairPaint)
        scaled.hairPaint = resizeMask(source.hairPaint, width, height);
    if (source.crown)
        scaled.crown = resizeMask(source.crown, width, height);
    if (source.person)
        scaled.person = resizeMask(source.person, width, height);
    if (source.face)
        scaled.face = source.face.map((p) => scalePoint(p, sx, sy));
    if (source.body)
        scaled.body = scaleControls(source.body, width, height);
    return scaled;
}
//# sourceMappingURL=scale.js.map