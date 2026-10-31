const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function hash(x, y, salt) {
    let a = (Math.imul(x + 197, 0x7feb352d) ^ Math.imul(y + 719, 0x846ca68b) ^ salt) >>> 0;
    a = Math.imul(a ^ (a >>> 16), 0x7feb352d) >>> 0;
    return (a ^ (a >>> 15)) >>> 0;
}
/** O(width*height) normalized box mean: excluded pixels never contaminate a donor. */
function localMean(src, valid, w, h, radius) {
    const tmp = new Float64Array(w * h), counts = new Float64Array(w * h), result = new Float64Array(w * h);
    for (let y = 0; y < h; y++) {
        let sum = 0, count = 0;
        for (let x = 0; x < w + radius; x++) {
            if (x < w && valid[y * w + x] > 0.95) {
                sum += src[y * w + x];
                count++;
            }
            const expired = x - 2 * radius - 1;
            if (expired >= 0 && valid[y * w + expired] > 0.95) {
                sum -= src[y * w + expired];
                count--;
            }
            const centre = x - radius;
            if (centre >= 0 && centre < w) {
                tmp[y * w + centre] = sum;
                counts[y * w + centre] = count;
            }
        }
    }
    for (let x = 0; x < w; x++) {
        let sum = 0, count = 0;
        for (let y = 0; y < h + radius; y++) {
            if (y < h) {
                sum += tmp[y * w + x];
                count += counts[y * w + x];
            }
            const expired = y - 2 * radius - 1;
            if (expired >= 0) {
                sum -= tmp[expired * w + x];
                count -= counts[expired * w + x];
            }
            const centre = y - radius;
            if (centre >= 0 && centre < h)
                result[centre * w + x] = count > 0 ? sum / count : src[centre * w + x];
        }
    }
    return result;
}
const sd = (v, points) => {
    if (points.length === 0)
        return 0;
    let mean = 0, square = 0;
    for (const i of points) {
        mean += v[i];
        square += v[i] * v[i];
    }
    mean /= points.length;
    return Math.sqrt(Math.max(0, square / points.length - mean * mean));
};
/**
 * Deterministic overlap-add quilting of actual pore / fine-line / chroma residuals.
 * Source mask must exclude beard, eye, lips, hair and any occlusion.
 * Tone is a *reconstructed* low band, never the darkness of the original beard.
 * Returns null rather than synthesising counterfeit hash-noise pores when donors are insufficient.
 */
export function donorPoreField(planes, source, target, tone, w, h, iod, seed = 37) {
    const n = w * h;
    if (planes.some((p) => p.length !== n) || source.length !== n || target.length !== n || tone.length !== n) {
        throw new RangeError("donor texture planes and masks must match the photo");
    }
    if (!(w >= 8 && h >= 8 && iod > 0 && Number.isFinite(iod)))
        throw new RangeError("invalid donor texture dimensions");
    const side = Math.max(6, Math.min(12, Math.round(iod * 0.075)));
    const half = Math.ceil(side / 2), step = Math.max(2, Math.floor(side / 2));
    const smoothRadius = Math.max(2, Math.round(iod * 0.043));
    const lows = planes.map((p) => localMean(p, source, w, h, smoothRadius));
    const highs = planes.map((p, k) => Float64Array.from(p, (v, i) => v - lows[k][i]));
    const donors = [];
    for (let y = half + 1; y < h - half - 1; y += 2)
        for (let x = half + 1; x < w - half - 1; x += 2) {
            const i = y * w + x;
            if (source[i] < 0.99)
                continue;
            let clean = true;
            for (let dy = -half; dy <= half && clean; dy += Math.max(1, half - 1)) {
                for (let dx = -half; dx <= half; dx += Math.max(1, half - 1)) {
                    if (source[(y + dy) * w + x + dx] < 0.99) {
                        clean = false;
                        break;
                    }
                }
            }
            if (clean)
                donors.push(i);
        }
    if (donors.length < 32)
        return null;
    const bands = [new Float64Array(n), new Float64Array(n), new Float64Array(n)];
    const sumW = new Float64Array(n), sumW2 = new Float64Array(n);
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let i = 0; i < n; i++)
        if (target[i] > 0.01) {
            const x = i % w, y = Math.floor(i / w);
            x0 = Math.min(x0, x);
            y0 = Math.min(y0, y);
            x1 = Math.max(x1, x);
            y1 = Math.max(y1, y);
        }
    if (x1 < x0)
        return { bands, sourceSd: 0, outputSd: 0, donors: donors.length };
    for (let ty = y0 - half; ty <= y1 + half; ty += step)
        for (let tx = x0 - half; tx <= x1 + half; tx += step) {
            const px = clamp(tx, 0, w - 1), py = clamp(ty, 0, h - 1), dest = py * w + px;
            let best = donors[hash(tx, ty, seed) % donors.length], bestScore = Infinity;
            for (let k = 0; k < Math.min(32, donors.length); k++) {
                const candidate = donors[hash(tx, ty, seed + 257 * k) % donors.length];
                const ccx = candidate % w, ccy = Math.floor(candidate / w);
                const toneCost = Math.abs(lows[0][candidate] - tone[dest]) * 0.27;
                const spatialCost = Math.abs(ccx - px) / Math.max(1, iod) + Math.abs(ccy - py) / Math.max(1, iod);
                const score = toneCost + spatialCost + 0.04 * k;
                if (score < bestScore) {
                    bestScore = score;
                    best = candidate;
                }
            }
            const bx = best % w, by = Math.floor(best / w);
            for (let y = Math.max(y0, ty - half); y <= Math.min(y1, ty + half); y++) {
                const vy = (y - ty) / (half + 0.5), wy = 0.5 + 0.5 * Math.cos(Math.PI * vy);
                const sy = by + y - ty;
                if (sy < 0 || sy >= h)
                    continue;
                for (let x = Math.max(x0, tx - half); x <= Math.min(x1, tx + half); x++) {
                    const i = y * w + x;
                    if (target[i] <= 0.01)
                        continue;
                    const sx = bx + x - tx;
                    if (sx < 0 || sx >= w || source[sy * w + sx] < 0.95)
                        continue;
                    const vx = (x - tx) / (half + 0.5), wx = 0.5 + 0.5 * Math.cos(Math.PI * vx);
                    const weight = wx * wy, j = sy * w + sx;
                    sumW[i] += weight;
                    sumW2[i] += weight * weight;
                    for (let c = 0; c < 3; c++)
                        bands[c][i] += weight * highs[c][j];
                }
            }
        }
    const targetPoints = [], sourcePoints = [];
    for (let k = 0; k < donors.length; k += Math.max(1, Math.floor(donors.length / 4000)))
        sourcePoints.push(donors[k]);
    for (let i = 0; i < n; i++)
        if (target[i] > 0.5 && sumW[i] > 0) {
            const compensation = clamp(sumW[i] / Math.sqrt(Math.max(1e-12, sumW2[i])), 1, 1.65);
            for (let c = 0; c < 3; c++)
                bands[c][i] *= compensation / sumW[i];
            if (targetPoints.length < 12000 || i % 3 === 0)
                targetPoints.push(i);
        }
    // If a target pixel has no donor, it receives zero high band and triggers the coverage guard below.
    let holes = 0, filled = 0;
    for (let i = 0; i < n; i++)
        if (target[i] > 0.5) {
            filled++;
            if (sumW[i] <= 0)
                holes++;
        }
    if (filled === 0 || holes > filled * 0.005)
        return null;
    const sourceSd = sd(highs[0], sourcePoints), outputSd = sd(bands[0], targetPoints);
    const gain = sourceSd > 0.01 && outputSd > 0.01 ? clamp(sourceSd / outputSd, 0.75, 1.4) : 1;
    for (let i = 0; i < n; i++)
        if (sumW[i] > 0)
            for (let c = 0; c < 3; c++)
                bands[c][i] *= gain;
    return { bands, sourceSd, outputSd: outputSd * gain, donors: donors.length };
}
