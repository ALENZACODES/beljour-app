/**
 * E06 warp fields: backward maps, coarse-grid evaluation, strength, weights and composition.
 *
 * Output pixel (x, y) reads the source at (mapX, mapY), pixel centres at integer
 * coordinates, as core `remap` samples them. Smooth warps are evaluated on grid nodes
 * (i * step, j * step), i = 0..ceil(W / step), j = 0..ceil(H / step), and every pixel reads
 * the grid bilinearly with node coordinates clamped; step 1 is exact per pixel.
 * Mirrors api/plumb_api/engines/warp/field.py (parity/warp-fill-r5.json).
 *
 * Author: John Khan.
 */
import { floatImage, remap } from "../core/buffer.js";
import { jacobianDeterminant } from "../core/filters.js";
export const MAX_GRID_STEP = 64;
function checkMaps(mapX, mapY) {
    if (mapX.channels !== 1 || mapY.channels !== 1)
        throw new RangeError("warp maps have one channel");
    if (mapX.width !== mapY.width || mapX.height !== mapY.height)
        throw new RangeError("warp maps must match in size");
    for (let i = 0; i < mapX.data.length; i++) {
        if (!Number.isFinite(mapX.data[i]) || !Number.isFinite(mapY.data[i]))
            throw new RangeError("warp maps must be finite");
    }
}
export function makeField(mapX, mapY) {
    checkMaps(mapX, mapY);
    return { width: mapX.width, height: mapX.height, mapX, mapY };
}
export function identity(width, height) {
    const mapX = floatImage(width, height, 1, true), mapY = floatImage(width, height, 1, true);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            mapX.data[y * width + x] = x;
            mapY.data[y * width + x] = y;
        }
    }
    return { width, height, mapX, mapY };
}
function checkStep(step) {
    if (!Number.isInteger(step) || step < 1 || step > MAX_GRID_STEP) {
        throw new RangeError(`grid step must be a whole number from 1 to ${MAX_GRID_STEP}`);
    }
}
/** Node coordinates along x and along y for a coarse evaluation grid. */
export function gridNodes(width, height, step) {
    checkStep(step);
    if (!(width >= 1 && height >= 1))
        throw new RangeError("field size must be positive");
    const nodes = (n) => {
        const out = [];
        const last = step === 1 ? n - 1 : Math.ceil(n / step) * step;
        for (let v = 0; v <= last; v += step)
            out.push(v);
        return out;
    };
    return { xs: nodes(width), ys: nodes(height) };
}
/** Bilinear read of a one-channel plane at (x, y), clamped to its edges. */
export function samplePlane(plane, x, y) {
    const w = plane.width, h = plane.height;
    const cx = Math.min(Math.max(x, 0), w - 1), cy = Math.min(Math.max(y, 0), h - 1);
    const x0 = Math.floor(cx), y0 = Math.floor(cy);
    const x1 = Math.min(x0 + 1, w - 1), y1 = Math.min(y0 + 1, h - 1);
    const fx = cx - x0, fy = cy - y0, d = plane.data;
    const top = d[y0 * w + x0] * (1 - fx) + d[y0 * w + x1] * fx;
    const bottom = d[y1 * w + x0] * (1 - fx) + d[y1 * w + x1] * fx;
    return top * (1 - fy) + bottom * fy;
}
/** Per-pixel maps from values on the coarse nodes (bilinear, clamped). */
export function upsampleGrid(gridX, gridY, width, height, step) {
    const { xs, ys } = gridNodes(width, height, step);
    if (gridX.width !== xs.length || gridX.height !== ys.length || gridY.width !== xs.length || gridY.height !== ys.length) {
        throw new RangeError("grid values do not match the node layout");
    }
    if (step === 1)
        return makeField(gridX, gridY);
    const mapX = floatImage(width, height, 1, true), mapY = floatImage(width, height, 1, true);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            mapX.data[y * width + x] = samplePlane(gridX, x / step, y / step);
            mapY.data[y * width + x] = samplePlane(gridY, x / step, y / step);
        }
    }
    return makeField(mapX, mapY);
}
/** Evaluate a backward point map on the grid nodes and upsample it. */
export function fromFunction(width, height, fn, step = 4) {
    const { xs, ys } = gridNodes(width, height, step);
    const gridX = floatImage(xs.length, ys.length, 1, true), gridY = floatImage(xs.length, ys.length, 1, true);
    for (let j = 0; j < ys.length; j++) {
        for (let i = 0; i < xs.length; i++) {
            const [sx, sy] = fn(xs[i], ys[j]);
            gridX.data[j * xs.length + i] = sx;
            gridY.data[j * xs.length + i] = sy;
        }
    }
    return upsampleGrid(gridX, gridY, width, height, step);
}
/** Same warp at a share of its displacement. */
export function scale(field, strength) {
    if (!Number.isFinite(strength))
        throw new RangeError("strength must be finite");
    const out = identity(field.width, field.height);
    for (let i = 0; i < out.mapX.data.length; i++) {
        out.mapX.data[i] += strength * (field.mapX.data[i] - out.mapX.data[i]);
        out.mapY.data[i] += strength * (field.mapY.data[i] - out.mapY.data[i]);
    }
    return out;
}
/** Displacement times a per-pixel weight in [0, 1]; weight 0 leaves the pixel exactly in place. */
export function weighted(field, weights) {
    if (weights.channels !== 1 || weights.width !== field.width || weights.height !== field.height) {
        throw new RangeError("weights must match the field size");
    }
    const out = identity(field.width, field.height);
    for (let i = 0; i < out.mapX.data.length; i++) {
        const w = weights.data[i];
        if (!(w >= 0 && w <= 1))
            throw new RangeError("weights must be finite and in [0, 1]");
        if (w > 0) {
            out.mapX.data[i] += w * (field.mapX.data[i] - out.mapX.data[i]);
            out.mapY.data[i] += w * (field.mapY.data[i] - out.mapY.data[i]);
        }
    }
    return out;
}
/** One field equal to warping by `inner` first and then by `outer`. */
export function compose(outer, inner) {
    if (outer.width !== inner.width || outer.height !== inner.height)
        throw new RangeError("fields must be the same size to compose");
    const mapX = floatImage(outer.width, outer.height, 1, true), mapY = floatImage(outer.width, outer.height, 1, true);
    for (let i = 0; i < mapX.data.length; i++) {
        const x = outer.mapX.data[i], y = outer.mapY.data[i];
        mapX.data[i] = samplePlane(inner.mapX, x, y);
        mapY.data[i] = samplePlane(inner.mapY, x, y);
    }
    return makeField(mapX, mapY);
}
/** Resample an RGB or RGBA byte image through the field (linear light by default). */
export function apply(img, field, linearLight = true) {
    if (img.width !== field.width || img.height !== field.height)
        throw new RangeError("image and field must be the same size");
    return remap(img, field.mapX, field.mapY, { border: "edge", linearLight });
}
/** Distance each output pixel reads from itself. */
export function moveMagnitude(field) {
    const out = floatImage(field.width, field.height, 1, true);
    for (let y = 0; y < field.height; y++) {
        for (let x = 0; x < field.width; x++) {
            const i = y * field.width + x;
            out.data[i] = Math.hypot(field.mapX.data[i] - x, field.mapY.data[i] - y);
        }
    }
    return out;
}
export function moveStats(field, threshold = 0.5) {
    const move = moveMagnitude(field).data;
    let max = 0, sum = 0, moved = 0;
    for (let i = 0; i < move.length; i++) {
        max = Math.max(max, move[i]);
        sum += move[i];
        if (move[i] > threshold)
            moved++;
    }
    return { maxMove: max, meanMove: sum / move.length, movedShare: moved / move.length };
}
export function jacobian(field) {
    return jacobianDeterminant(field.mapX, field.mapY);
}
//# sourceMappingURL=field.js.map