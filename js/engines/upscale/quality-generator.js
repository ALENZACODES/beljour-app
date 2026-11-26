import { blendValue, checkedSelection } from "./safe.js";
import { legacyAmount, validateLevel } from "../../pro/strength.js";
export const QUALITY_LABEL = "BELJOUR Quality Generator: local resize with bounded luminance detail. " +
    "Marked face pixels are locked to the resized original; a pixel guard, not identity verification.";
/** ASSUMED bounds for the luminance detail: gain at 5.0 and the largest change in levels. */
export const DETAIL_GAIN = 0.8;
export const MAX_DETAIL_DELTA = 24;
function checkedRaster(source) {
    if (!source || !(source.data instanceof Uint8ClampedArray || source.data instanceof Uint8Array) ||
        !Number.isInteger(source.width) || !Number.isInteger(source.height) || source.width < 1 ||
        source.height < 1 || source.data.length !== source.width * source.height * 4) {
        throw new RangeError("Quality Generator needs an RGBA image");
    }
    return source;
}
function triangleTaps(sourceLength, targetLength) {
    const ratio = sourceLength / targetLength;
    const radius = Math.max(1, ratio);
    const taps = Math.ceil(radius) * 2 + 1;
    const index = new Int32Array(targetLength * taps);
    const weight = new Float64Array(targetLength * taps);
    for (let target = 0; target < targetLength; target++) {
        const centre = (target + 0.5) * ratio - 0.5;
        const first = Math.floor(centre - radius) + 1;
        let total = 0;
        for (let k = 0; k < taps; k++) {
            const position = first + k;
            const value = Math.max(0, 1 - Math.abs(position - centre) / radius);
            index[target * taps + k] = Math.min(sourceLength - 1, Math.max(0, position));
            weight[target * taps + k] = value;
            total += value;
        }
        for (let k = 0; k < taps; k++)
            weight[target * taps + k] /= total;
    }
    return { index, weight, taps };
}
/** Deterministic separable triangle-filter resampler (area-like when shrinking). */
export function cpuResize(source, width, height) {
    checkedRaster(source);
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
        throw new RangeError("Invalid resize target");
    }
    const columns = triangleTaps(source.width, width);
    const rows = triangleTaps(source.height, height);
    const middle = new Float64Array(width * source.height * 4);
    for (let y = 0; y < source.height; y++) {
        for (let x = 0; x < width; x++) {
            for (let k = 0; k < columns.taps; k++) {
                const w = columns.weight[x * columns.taps + k];
                if (w === 0)
                    continue;
                const from = (y * source.width + columns.index[x * columns.taps + k]) * 4;
                const to = (y * width + x) * 4;
                for (let c = 0; c < 4; c++)
                    middle[to + c] += source.data[from + c] * w;
            }
        }
    }
    const output = new Uint8ClampedArray(width * height * 4);
    const sums = new Float64Array(4);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            sums.fill(0);
            for (let k = 0; k < rows.taps; k++) {
                const w = rows.weight[y * rows.taps + k];
                if (w === 0)
                    continue;
                const from = (rows.index[y * rows.taps + k] * width + x) * 4;
                for (let c = 0; c < 4; c++)
                    sums[c] += middle[from + c] * w;
            }
            for (let c = 0; c < 4; c++)
                output[(y * width + x) * 4 + c] = Math.round(sums[c]);
        }
    }
    middle.fill(0);
    return output;
}
export const cpuResizer = async (source, width, height) => cpuResize(source, width, height);
/** Browser resize on an OffscreenCanvas with high-quality smoothing. */
export function canvasResizer() {
    return async (source, width, height) => {
        checkedRaster(source);
        const scope = globalThis;
        if (!scope.OffscreenCanvas || !scope.ImageData)
            throw new Error("This browser cannot resize photos locally.");
        const from = new scope.OffscreenCanvas(source.width, source.height);
        const to = new scope.OffscreenCanvas(width, height);
        const fromContext = from.getContext("2d");
        const toContext = to.getContext("2d");
        if (!fromContext || !toContext)
            throw new Error("No 2D canvas is available.");
        fromContext.putImageData(new scope.ImageData(new Uint8ClampedArray(source.data), source.width, source.height), 0, 0);
        toContext.imageSmoothingEnabled = true;
        toContext.imageSmoothingQuality = "high";
        toContext.drawImage(from, 0, 0, width, height);
        const pixels = toContext.getImageData(0, 0, width, height).data;
        fromContext.clearRect(0, 0, source.width, source.height);
        return new Uint8ClampedArray(pixels);
    };
}
export function defaultResizer() {
    return "OffscreenCanvas" in globalThis ? canvasResizer() : cpuResizer;
}
/** Resize the source and the face selection into the plan's content box. */
export async function prepareReference(source, selection, plan, resizer = defaultResizer()) {
    checkedRaster(source);
    if (source.width !== plan.sourceWidth || source.height !== plan.sourceHeight) {
        throw new RangeError("The plan was made for another photo size");
    }
    const mask = checkedSelection(selection, source.width, source.height);
    const content = await resizer(source, plan.contentWidth, plan.contentHeight);
    if (!(content instanceof Uint8ClampedArray) || content.length !== plan.contentWidth * plan.contentHeight * 4) {
        content?.fill?.(0);
        throw new RangeError("The resizer returned an image of the wrong size");
    }
    const coverage = resizeCoverage(mask, source.width, source.height, plan.contentWidth, plan.contentHeight);
    return { plan, content, coverage, noPerson: selection.noFace === true };
}
/** Nearest-neighbour resize of a face coverage mask (no new coverage is invented). */
export function resizeCoverage(mask, width, height, targetWidth, targetHeight) {
    const coverage = new Uint8Array(targetWidth * targetHeight);
    for (let y = 0; y < targetHeight; y++) {
        const sourceRow = Math.min(height - 1, Math.floor((y + 0.5) * height / targetHeight));
        for (let x = 0; x < targetWidth; x++) {
            const sourceColumn = Math.min(width - 1, Math.floor((x + 0.5) * width / targetWidth));
            coverage[y * targetWidth + x] = mask[sourceRow * width + sourceColumn];
        }
    }
    return coverage;
}
function luminance(content, pixels) {
    const luma = new Float32Array(pixels);
    for (let p = 0; p < pixels; p++) {
        luma[p] = 0.299 * content[p * 4] + 0.587 * content[p * 4 + 1] + 0.114 * content[p * 4 + 2];
    }
    return luma;
}
/** 3 x 3 box blur with clamped edges; shared with the HD/4K stages. */
export function boxBlur(luma, width, height) {
    const blurred = new Float32Array(luma.length);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let total = 0;
            for (let dy = -1; dy <= 1; dy++) {
                const row = Math.min(height - 1, Math.max(0, y + dy)) * width;
                for (let dx = -1; dx <= 1; dx++)
                    total += luma[row + Math.min(width - 1, Math.max(0, x + dx))];
            }
            blurred[y * width + x] = total / 9;
        }
    }
    return blurred;
}
/** Luminance-only detail of a resized reference, shared with the HD/4K stages. */
export function luminanceDetail(content, width, height, detailLevel) {
    const gain = DETAIL_GAIN * legacyAmount(validateLevel(detailLevel));
    const luma = luminance(content, width * height);
    const blurred = boxBlur(luma, width, height);
    const pixels = new Uint8ClampedArray(content);
    let maxDelta = 0;
    for (let p = 0; p < width * height; p++) {
        const delta = Math.round(Math.max(-MAX_DETAIL_DELTA, Math.min(MAX_DETAIL_DELTA, (luma[p] - blurred[p]) * gain)));
        if (delta === 0)
            continue;
        for (let c = 0; c < 3; c++) {
            const value = content[p * 4 + c] + delta;
            pixels[p * 4 + c] = value;
            maxDelta = Math.max(maxDelta, Math.abs(pixels[p * 4 + c] - content[p * 4 + c]));
        }
    }
    luma.fill(0);
    blurred.fill(0);
    return { pixels, maxDelta };
}
/** Apply detail and the face lock to a prepared reference; cheap enough per slider move. */
export function renderFromReference(reference, levels, release) {
    const { plan, content, coverage } = reference;
    const detailLevel = validateLevel(levels.detailLevel);
    const tenths = Math.round(validateLevel(levels.lockLevel) * 10);
    const detailed = luminanceDetail(content, plan.contentWidth, plan.contentHeight, detailLevel);
    const frame = new Uint8ClampedArray(plan.width * plan.height * 4).fill(255);
    let protectedPixels = 0, fullyLocked = 0;
    for (let y = 0; y < plan.contentHeight; y++) {
        for (let x = 0; x < plan.contentWidth; x++) {
            const p = y * plan.contentWidth + x;
            const out = ((y + plan.offsetY) * plan.width + x + plan.offsetX) * 4;
            const weight = coverage[p];
            if (weight > 0)
                protectedPixels += 1;
            if (weight === 255 && tenths === 50)
                fullyLocked += 1;
            for (let c = 0; c < 3; c++) {
                frame[out + c] = weight === 0 ? detailed.pixels[p * 4 + c]
                    : blendValue(detailed.pixels[p * 4 + c], content[p * 4 + c], weight, tenths);
            }
            frame[out + 3] = content[p * 4 + 3];
        }
    }
    detailed.pixels.fill(0);
    return {
        image: { width: plan.width, height: plan.height, data: frame },
        audit: Object.freeze({
            schema: "beljour-quality-audit/1", tier: plan.tier, width: plan.width, height: plan.height,
            contentWidth: plan.contentWidth, contentHeight: plan.contentHeight,
            offsetX: plan.offsetX, offsetY: plan.offsetY, detailLevel, lockLevel: tenths / 10,
            noPerson: reference.noPerson, protectedPixels, fullyLockedPixels: fullyLocked,
            maxDetailDelta: detailed.maxDelta, release, generator: "classical-local", label: QUALITY_LABEL,
        }),
    };
}
export async function renderQuality(source, selection, plan, levels, options = {}) {
    const reference = await prepareReference(source, selection, plan, options.resizer ?? defaultResizer());
    try {
        return renderFromReference(reference, levels, options.release ?? true);
    }
    finally {
        reference.content.fill(0);
    }
}
//# sourceMappingURL=quality-generator.js.map