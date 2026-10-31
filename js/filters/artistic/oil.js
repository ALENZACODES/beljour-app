/** Pigment Oil: integral-sum quadrant variance and original canvas grain. Author: John Khan. */
import { blend, hashNoise, integer, number, parameters, photo, result, rgbValues } from "./types.js";
export const DEFAULTS = { amount: 0.75, radius: 3, texture: 0.18, seed: 17,
    brush_angle: -0.4, canvas_scale: 1.0 };
export const LABEL = "Pigment Oil simulation. Face proportions are kept; paint texture is procedural.";
export function integral(values, width, height, squares = false) {
    const stride = (width + 1) * 3;
    const out = new Float64Array((width + 1) * (height + 1) * 3);
    // Match Python cumsum along y followed by x, including floating operation order.
    for (let x = 0; x < width; x++) {
        for (let c = 0; c < 3; c++) {
            let sum = 0;
            for (let y = 0; y < height; y++) {
                const v = values[(y * width + x) * 3 + c];
                sum += squares ? v * v : v;
                out[(y + 1) * stride + (x + 1) * 3 + c] = sum;
            }
        }
    }
    for (let y = 1; y <= height; y++) {
        for (let c = 0; c < 3; c++) {
            let sum = 0;
            for (let x = 1; x <= width; x++) {
                const i = y * stride + x * 3 + c;
                sum += out[i];
                out[i] = sum;
            }
        }
    }
    return out;
}
export function rectangleSum(table, width, x0, y0, x1, y1, channel) {
    const at = (x, y) => table[(y * (width + 1) + x) * 3 + channel];
    return at(x1, y1) - at(x1, y0) - at(x0, y1) + at(x0, y0);
}
export function kuwahara(rgb, width, height, radius) {
    const n = width * height;
    const table = integral(rgb, width, height), squares = integral(rgb, width, height, true);
    const best = new Float64Array(n).fill(Infinity), chosen = new Float64Array(n), painted = new Float64Array(n * 3);
    const means = new Float64Array(3);
    for (const [index, direction] of [[-1, -1], [-1, 1], [1, -1], [1, 1]].entries()) {
        const [dy, dx] = direction;
        for (let y = 0; y < height; y++) {
            const y0 = dy < 0 ? Math.max(0, y - radius) : y;
            const y1 = dy < 0 ? y + 1 : Math.min(height, y + radius + 1);
            for (let x = 0; x < width; x++) {
                const x0 = dx < 0 ? Math.max(0, x - radius) : x;
                const x1 = dx < 0 ? x + 1 : Math.min(width, x + radius + 1);
                const count = (x1 - x0) * (y1 - y0), i = y * width + x;
                let score = 0;
                for (let c = 0; c < 3; c++) {
                    const mean = rectangleSum(table, width, x0, y0, x1, y1, c) / count;
                    const variance = Math.max(0, rectangleSum(squares, width, x0, y0, x1, y1, c) / count - mean * mean);
                    means[c] = mean;
                    score += variance;
                }
                if (score < best[i] - 1e-8) {
                    best[i] = score;
                    chosen[i] = index;
                    painted.set(means, i * 3);
                }
            }
        }
    }
    return { rgb: painted, chosen };
}
export function paintTexture(width, height, seed, brushAngle, canvasScale, offsetX = 0, offsetY = 0) {
    const out = new Float64Array(width * height);
    const co = Math.cos(brushAngle), si = Math.sin(brushAngle);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const px = x + offsetX, py = y + offsetY;
            const direction = (px * co + py * si) / canvasScale;
            const cross = (-px * si + py * co) / canvasScale;
            const weave = 0.48 * Math.sin(direction * 2.4) + 0.28 * Math.sin(cross * 2);
            out[y * width + x] = (weave + (hashNoise(px, py, seed) - 0.5) * 0.48) * 7.5;
        }
    }
    return out;
}
export function pigmentOil(image, params, offsetX = 0, offsetY = 0) {
    const src = photo(image), p = parameters(params, DEFAULTS), n = src.width * src.height;
    const amount = number(p.amount, "amount", 0, 1);
    const radius = integer(p.radius, "radius", 1, 12);
    const texture = number(p.texture, "texture", 0, 1);
    const seed = integer(p.seed, "seed", 0, 2 ** 31 - 1);
    const angle = number(p.brush_angle, "brush_angle", -Math.PI, Math.PI);
    const scale = number(p.canvas_scale, "canvas_scale", 0.5, 8);
    const painted = kuwahara(rgbValues(src), src.width, src.height, radius);
    const canvas = paintTexture(src.width, src.height, seed, angle, scale, offsetX, offsetY);
    const pigment = new Float64Array(n * 3), counts = [0, 0, 0, 0];
    let squareDifference = 0;
    for (let i = 0; i < n; i++) {
        counts[painted.chosen[i]]++;
        for (let c = 0; c < 3; c++) {
            const v = painted.rgb[i * 3 + c], headroom = Math.min(v, 255 - v) / 127.5;
            const next = Math.min(255, Math.max(0, v + texture * canvas[i] * headroom));
            pigment[i * 3 + c] = next;
            squareDifference += (next - v) ** 2;
        }
    }
    const support = new Float64Array(n).fill(amount), out = blend(src, pigment, support);
    return result("pigment-oil", src, out, support, LABEL, { geometry_displacement: 0, texture_rms: Math.sqrt(squareDifference / (n * 3)), radius,
        quadrant_north_west_share: counts[0] / n, quadrant_north_east_share: counts[1] / n,
        quadrant_south_west_share: counts[2] / n, quadrant_south_east_share: counts[3] / n }, ["Paint treatment only; clothing, body shape and facial proportions are not generated."]);
}
