/** Local contrast observations with manual-mask substitution. Author: John Khan. */
import { photo, validateEvidence } from "./contracts.js";
import { browFrames, union } from "./geometry.js";
export function luminance(r, g, b) {
    return r * 0.2126 + g * 0.7152 + b * 0.0722;
}
export function observeBrows(image, landmarks) {
    photo(image);
    const frames = browFrames(landmarks, image.width, image.height);
    const region = union(frames), n = image.width * image.height;
    const lum = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        const o = i * image.channels;
        lum[i] = luminance(image.data[o], image.data[o + 1], image.data[o + 2]);
    }
    const coverage = new Float64Array(n), grey = new Float64Array(n), confidences = [];
    for (const frame of frames) {
        const values = [];
        for (let i = 0; i < n; i++)
            if (frame.mask[i] >= 0.5)
                values.push(lum[i]);
        values.sort((a, b) => a - b);
        if (values.length < 6) {
            confidences.push(0);
            continue;
        }
        const low = values[Math.floor((values.length - 1) * 0.15)];
        const high = values[Math.floor((values.length - 1) * 0.85)];
        const spread = high - low;
        if (spread < 8) {
            confidences.push(0);
            continue;
        }
        for (let i = 0; i < n; i++) {
            const o = i * image.channels;
            const r = image.data[o], g = image.data[o + 1], b = image.data[o + 2];
            const darkest = Math.min(1, Math.max(0, (high - lum[i] - spread * 0.25) / Math.max(12, spread * 0.5)));
            const chroma = Math.max(r, g, b) - Math.min(r, g, b);
            const localGrey = lum[i] > high - spread * 0.1 && chroma < 14 && lum[i] > 120 ? frame.mask[i] * 0.45 : 0;
            coverage[i] = Math.max(coverage[i], darkest * frame.mask[i], localGrey);
            grey[i] = Math.max(grey[i], localGrey);
        }
        confidences.push(Math.min(0.85, spread / 100));
    }
    return validateEvidence({ coverage, grey, origin: "contrast", confidence: Math.min(...confidences),
        notes: ["Hair coverage is a contrast estimate. Check sparse and grey areas manually."] }, image, region);
}
export function components(coverage, width, height, threshold = 0.5, limit = 1024) {
    const seen = new Uint8Array(coverage.length), groups = [];
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = y * width + x;
            if (coverage[i] < threshold || seen[i])
                continue;
            if (groups.length >= limit)
                throw new RangeError("too many disconnected brow observations");
            const stack = [[x, y]], points = [];
            seen[i] = 1;
            while (stack.length) {
                const [cx, cy] = stack.pop();
                points.push([cx, cy]);
                for (const [nx, ny] of [[cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]]) {
                    if (nx < 0 || nx >= width || ny < 0 || ny >= height)
                        continue;
                    const ni = ny * width + nx;
                    if (coverage[ni] >= threshold && !seen[ni]) {
                        seen[ni] = 1;
                        stack.push([nx, ny]);
                    }
                }
            }
            groups.push(points);
        }
    }
    return groups;
}
export function evidenceSummary(evidence, region) {
    const total = region.reduce((a, b) => a + b, 0);
    const covered = evidence.coverage.reduce((a, b) => a + b, 0);
    return { evidence_origin: evidence.origin, evidence_confidence: evidence.confidence,
        observed_coverage_px: covered, observed_coverage_fraction: total ? covered / total : 0,
        grey_coverage_px: evidence.grey.reduce((a, b) => a + b, 0), biological_hair_count: null, added_hairs: 0 };
}
//# sourceMappingURL=evidence.js.map