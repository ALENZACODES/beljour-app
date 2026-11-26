/** W2 bounded deterministic palette extraction from a user-chosen image region.
 * Stratified sampling, weighted Lab clusters, stable farthest-point seeds and
 * reported CIEDE2000 error. No inference about faces or clothes. Author: John Khan.
 */
import { requireColour, checkSize } from "../core/buffer.js";
import { ciede2000 } from "../core/colour.js";
import { srgbToLab } from "../shade/colourspace.js";
import { gamutColour } from "./colour.js";
export const EXTRACT_LABEL = "Representative photo colours. Local extraction; not tested against real products.";
function distance(a, b) {
    return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
}
function nearest(lab, centres) {
    let index = 0, best = Infinity;
    for (let i = 0; i < centres.length; i++) {
        const d = distance(lab, centres[i]);
        if (d < best) {
            best = d;
            index = i;
        }
    }
    return index;
}
function hash(value) {
    let x = Math.imul(value ^ 0x9e3779b9, 0x85ebca6b);
    x ^= x >>> 13;
    return Math.imul(x, 0xc2b2ae35) >>> 0;
}
export function paletteRegion(image, input) {
    const region = input ?? { x: 0, y: 0, width: image.width, height: image.height };
    if (![region.x, region.y, region.width, region.height].every(Number.isSafeInteger) || region.x < 0 || region.y < 0 ||
        region.width < 1 || region.height < 1 || region.x + region.width > image.width || region.y + region.height > image.height) {
        throw new RangeError("Select a nonempty region inside the reference photo.");
    }
    return { ...region };
}
export function extractPalette(image, options = {}) {
    checkSize(image.width, image.height, image.channels);
    requireColour(image);
    if (image.data.length !== image.width * image.height * image.channels || image.width * image.height > 24_000_000)
        throw new RangeError("The reference has an invalid size.");
    const k = options.colours ?? 6, budget = options.maxSamples ?? 8192;
    if (!Number.isInteger(k) || k < 1 || k > 8)
        throw new RangeError("Choose 1 to 8 representative colours.");
    if (!Number.isInteger(budget) || budget < 64 || budget > 16384)
        throw new RangeError("Sampling budget must be 64 to 16384 pixels.");
    const region = paletteRegion(image, options.region), total = region.width * region.height, sampleCount = Math.min(total, budget);
    const bins = new Map();
    const samples = [];
    let sampled = 0, transparentSkipped = 0;
    for (let i = 0; i < sampleCount; i++) {
        const start = Math.floor(i * total / sampleCount), end = Math.floor((i + 1) * total / sampleCount);
        const index = start + hash(i + 1) % Math.max(1, end - start), x = region.x + index % region.width;
        const y = region.y + Math.floor(index / region.width), p = (y * image.width + x) * image.channels;
        const alpha = image.channels === 4 ? image.data[p + 3] / 255 : 1;
        if (alpha < .5) {
            transparentSkipped++;
            continue;
        }
        const r = image.data[p], g = image.data[p + 1], b = image.data[p + 2], lab = srgbToLab([r, g, b]);
        const key = (r >> 3) * 1024 + (g >> 3) * 32 + (b >> 3), weight = (end - start) * alpha;
        samples.push({ lab, weight });
        const bin = bins.get(key) ?? { lab: [0, 0, 0], weight: 0 };
        for (let c = 0; c < 3; c++)
            bin.lab[c] += lab[c] * weight;
        bin.weight += weight;
        bins.set(key, bin);
        sampled++;
    }
    if (!bins.size)
        throw new RangeError("No visible pixels in this region. Choose another part of the photo.");
    const points = [...bins.entries()].sort((a, b) => a[0] - b[0]).map(([, bin]) => ({
        lab: bin.lab.map(value => value / bin.weight), weight: bin.weight,
    }));
    const first = points.reduce((best, bin, index) => bin.weight > points[best].weight ? index : best, 0);
    const centres = [[...points[first].lab]];
    while (centres.length < Math.min(k, points.length)) {
        let best = -1, score = 0;
        for (let i = 0; i < points.length; i++) {
            const candidate = distance(points[i].lab, centres[nearest(points[i].lab, centres)]) * Math.sqrt(points[i].weight);
            if (candidate > score) {
                score = candidate;
                best = i;
            }
        }
        if (best < 0 || score < 1e-10)
            break;
        centres.push([...points[best].lab]);
    }
    let iterations = 0;
    for (; iterations < 16; iterations++) {
        const sums = centres.map(() => ({ lab: [0, 0, 0], weight: 0 }));
        for (const point of points) {
            const sum = sums[nearest(point.lab, centres)];
            sum.weight += point.weight;
            for (let c = 0; c < 3; c++)
                sum.lab[c] += point.lab[c] * point.weight;
        }
        let shift = 0;
        for (let i = 0; i < centres.length; i++) {
            if (!sums[i].weight)
                continue;
            const next = sums[i].lab.map(value => value / sums[i].weight);
            shift = Math.max(shift, distance(next, centres[i]));
            centres[i] = next;
        }
        if (shift < 1e-8) {
            iterations++;
            break;
        }
    }
    const displayed = centres.map(gamutColour), totals = displayed.map(() => ({ weight: 0, delta: 0 }));
    let sumWeight = 0, sumDelta = 0;
    // Report the error against every sampled pixel, not just the bin centres used
    // to speed up clustering. Otherwise within-bin colour variation would vanish.
    for (const point of samples) {
        const at = nearest(point.lab, centres), delta = ciede2000(point.lab, displayed[at].lab);
        totals[at].weight += point.weight;
        totals[at].delta += point.weight * delta;
        sumWeight += point.weight;
        sumDelta += point.weight * delta;
    }
    const merged = new Map();
    for (let i = 0; i < displayed.length; i++) {
        if (!totals[i].weight)
            continue;
        const colour = displayed[i], found = merged.get(colour.hex) ?? { colour, weight: 0, delta: 0 };
        found.weight += totals[i].weight;
        found.delta += totals[i].delta;
        merged.set(colour.hex, found);
    }
    const colours = [...merged.values()].sort((a, b) => b.weight - a.weight || a.colour.hex.localeCompare(b.colour.hex))
        .map(({ colour, weight, delta }) => ({ hex: colour.hex, lab: colour.lab, share: weight / sumWeight,
        meanDeltaE: delta / weight, gamutReduced: colour.gamutReduced }));
    return { format: "beljour-extracted-palette/1", colours, sampled, transparentSkipped, region, iterations,
        meanDeltaE: sumDelta / sumWeight, label: EXTRACT_LABEL, assumed: true };
}
//# sourceMappingURL=extract.js.map