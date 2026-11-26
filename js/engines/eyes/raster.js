/** Deterministic local brush kernels. No raster assets. Author: John Khan. */
import { polygon } from "../core/mask.js";
export function smoothstep(low, high, value) {
    const v = Math.min(1, Math.max(0, (value - low) / Math.max(high - low, 1e-12)));
    return v * v * (3 - 2 * v);
}
export function segmentDistance(x, y, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const t = Math.min(1, Math.max(0, ((x - a[0]) * dx + (y - a[1]) * dy) / Math.max(dx * dx + dy * dy, 1e-20)));
    return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy);
}
export function stroke(height, width, points, radius, taper = false, softness = .75) {
    if (points.length < 2 || !Number.isFinite(radius) || radius <= 0)
        throw new RangeError("stroke needs two points and a positive radius");
    if (!Number.isFinite(softness) || softness < 0 || softness > 16)
        throw new RangeError("stroke softness must be in 0..16");
    if (!points.every(p => p.length === 2 && p.every(Number.isFinite)))
        throw new RangeError("stroke points must be finite pairs");
    const margin = radius + softness + 1;
    const x0 = Math.max(0, Math.floor(Math.min(...points.map(p => p[0])) - margin));
    const x1 = Math.min(width, Math.ceil(Math.max(...points.map(p => p[0])) + margin));
    const y0 = Math.max(0, Math.floor(Math.min(...points.map(p => p[1])) - margin));
    const y1 = Math.min(height, Math.ceil(Math.max(...points.map(p => p[1])) + margin));
    const result = new Float64Array(height * width);
    for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
            let opacity = 0;
            for (let i = 0; i + 1 < points.length; i++) {
                const rad = taper ? radius * (1 - .85 * (i + .5) / (points.length - 1)) : radius;
                const distance = segmentDistance(x + .5, y + .5, points[i], points[i + 1]);
                opacity = Math.max(opacity, 1 - smoothstep(Math.max(0, rad - softness / 2), rad + softness / 2 + 1e-8, distance));
            }
            result[y * width + x] = opacity;
        }
    }
    return result;
}
export function filled(height, width, points) {
    return Float64Array.from(polygon(width, height, points, 2).data);
}
export function bezier(a, control, b, steps = 16) {
    if (!Number.isInteger(steps) || steps < 2 || steps > 64)
        throw new RangeError("curve steps must be 2..64");
    const output = [];
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        output.push([(1 - t) ** 2 * a[0] + 2 * t * (1 - t) * control[0] + t * t * b[0], (1 - t) ** 2 * a[1] + 2 * t * (1 - t) * control[1] + t * t * b[1]]);
    }
    return output;
}
export function paint(image, mask, colour, strength = 1) {
    if (mask.length !== image.width * image.height)
        throw new RangeError("paint mask must match image");
    const field = colour.length !== 3;
    if (field && colour.length !== image.width * image.height * 3)
        throw new RangeError("paint colour size is wrong");
    if (!Array.from(colour).every(Number.isFinite))
        throw new RangeError("paint colour must be finite");
    const result = Uint8ClampedArray.from(image.data);
    for (let i = 0; i < mask.length; i++) {
        if (!Number.isFinite(mask[i]) || mask[i] < 0 || mask[i] > 1)
            throw new RangeError("paint mask is outside 0..1");
        const offset = i * image.channels;
        let alpha = mask[i] * strength;
        if (image.channels === 4 && image.data[offset + 3] === 0)
            alpha = 0;
        for (let c = 0; c < 3; c++) {
            const target = colour[field ? i * 3 + c : c];
            result[offset + c] = Math.min(255, Math.max(0, Math.floor(image.data[offset + c] * (1 - alpha) + target * alpha + .5)));
        }
    }
    return result;
}
export function combine(a, b) {
    if (a.length !== b.length)
        throw new RangeError("coverage size mismatch");
    return a.map((v, i) => 1 - (1 - v) * (1 - b[i]));
}
export function randomValues(seed, count) {
    let state = seed >>> 0;
    const result = [];
    for (let i = 0; i < count; i++) {
        state = (Math.imul(1664525, state) + 1013904223) >>> 0;
        result.push(state / 4294967296);
    }
    return result;
}
function median(values) {
    values.sort((a, b) => a - b);
    const m = Math.floor(values.length / 2);
    return values.length % 2 ? values[m] : (values[m - 1] + values[m]) / 2;
}
export function restoreTraceBackground(image, mask, protectedMask) {
    const output = Uint8ClampedArray.from(image.data);
    const { height, width, channels } = image;
    const neighbours = [[-3, 0], [3, 0], [0, -3], [0, 3], [-2, -2], [-2, 2], [2, -2], [2, 2]];
    let unreliable = 0;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const index = y * width + x;
            if (mask[index] <= .02 || protectedMask[index] >= .01)
                continue;
            const values = [[], [], []];
            for (const [dy, dx] of neighbours) {
                const xx = x + dx, yy = y + dy, other = yy * width + xx;
                if (xx < 0 || xx >= width || yy < 0 || yy >= height || mask[other] >= .01 || protectedMask[other] >= .01)
                    continue;
                for (let c = 0; c < 3; c++)
                    values[c].push(image.data[other * channels + c]);
            }
            if (!values[0].length) {
                unreliable++;
                continue;
            }
            const alpha = mask[index];
            for (let c = 0; c < 3; c++)
                output[index * channels + c] = Math.floor(image.data[index * channels + c] * (1 - alpha) + median(values[c]) * alpha + .5);
        }
    }
    return { image: output, unreliable };
}
//# sourceMappingURL=raster.js.map