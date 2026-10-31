/**
 * E06 falloff: weights that fade a warp to exactly zero at a band edge or a radius.
 *
 * Inside a band the weight rises with the distance to the nearest outside pixel over
 * `ramp` px through a curve (linear, smoothstep, smootherstep, cosine); outside it is 0,
 * so `weighted` leaves those pixels exactly in place (Q1, Q12). Mirrors
 * api/plumb_api/engines/warp/falloff.py.
 *
 * Author: John Khan.
 */
import { floatImage, requireMask } from "../core/buffer.js";
import { distanceInside } from "../core/mask.js";
import { weighted } from "./field.js";
export const CURVES = ["linear", "smoothstep", "smootherstep", "cosine"];
export function curve(t, kind = "smootherstep") {
    if (!CURVES.includes(kind))
        throw new RangeError(`curve must be one of ${CURVES.join(", ")}`);
    const x = Math.min(1, Math.max(0, t));
    switch (kind) {
        case "linear": return x;
        case "smoothstep": return x * x * (3 - 2 * x);
        case "smootherstep": return x * x * x * (x * (x * 6 - 15) + 10);
        default: return (1 - Math.cos(Math.PI * x)) / 2;
    }
}
export function bandWeights(band, ramp, kind = "smootherstep", level = 0.5) {
    requireMask(band);
    if (!(Number.isFinite(ramp) && ramp >= 0))
        throw new RangeError("ramp must be finite and non-negative");
    if (!CURVES.includes(kind))
        throw new RangeError(`curve must be one of ${CURVES.join(", ")}`);
    const out = floatImage(band.width, band.height, 1, true);
    if (ramp === 0) {
        for (let i = 0; i < out.data.length; i++)
            out.data[i] = band.data[i] >= level ? 1 : 0;
        return out;
    }
    const depth = distanceInside(band, level);
    for (let i = 0; i < out.data.length; i++)
        out.data[i] = band.data[i] >= level ? curve(depth.data[i] / ramp, kind) : 0;
    return out;
}
export function radialWeights(width, height, cx, cy, radius, kind = "smootherstep") {
    if (!(Number.isFinite(radius) && radius > 0))
        throw new RangeError("radius must be positive");
    const out = floatImage(width, height, 1, true);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const r = Math.hypot(x - cx, y - cy);
            out.data[y * width + x] = r < radius ? curve(1 - r / radius, kind) : 0;
        }
    }
    return out;
}
export function withinBand(field, band, ramp, kind = "smootherstep") {
    return weighted(field, bandWeights(band, ramp, kind));
}
/** All pixels within `radius` of any point: a simple band around control points. */
export function bandFromPoints(width, height, points, radius) {
    if (!(Number.isFinite(radius) && radius > 0))
        throw new RangeError("radius must be positive");
    const out = floatImage(width, height, 1);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            for (const [px, py] of points) {
                if ((x - px) ** 2 + (y - py) ** 2 <= radius * radius) {
                    out.data[y * width + x] = 1;
                    break;
                }
            }
        }
    }
    return out;
}
