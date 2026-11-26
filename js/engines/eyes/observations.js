/** Observed trace evidence diagnostics; never a learned lash counter. Author: John Khan. */
import { polylineLength } from "./contracts.js";
export function traceSummary(traces, width, height) {
    if (width < 8 || height < 8)
        throw new RangeError("trace summary needs positive image dimensions");
    const counts = { right_upper: 0, right_lower: 0, left_upper: 0, left_lower: 0 };
    let lowConfidence = 0, duplicates = 0, sharpTurns = 0;
    const seen = new Set(), lengths = [];
    for (const item of traces) {
        const key = JSON.stringify([item.side, item.lower, item.points]);
        if (seen.has(key))
            duplicates++;
        seen.add(key);
        if (item.confidence < .5) {
            lowConfidence++;
            continue;
        }
        counts[`${item.side}_${item.lower ? "lower" : "upper"}`]++;
        const points = item.points.map(([x, y]) => [x * width, y * height]);
        lengths.push(polylineLength(points));
        for (let i = 0; i + 2 < points.length; i++) {
            const [a, b, c] = points.slice(i, i + 3);
            const first = [b[0] - a[0], b[1] - a[1]], second = [c[0] - b[0], c[1] - b[1]];
            const den = Math.hypot(...first) * Math.hypot(...second);
            if (den > 1e-9 && (first[0] * second[0] + first[1] * second[1]) / den < -.5)
                sharpTurns++;
        }
    }
    return { observed: counts, low_confidence: lowConfidence, duplicate_traces: duplicates, sharp_turns: sharpTurns,
        length_min_px: lengths.length ? Math.min(...lengths) : null, length_max_px: lengths.length ? Math.max(...lengths) : null,
        source: "explicit_observed_traces", automatic_lash_count: null,
        quality_note: "Manual traces require visual checking; no automatic lash model is used." };
}
export function resampleTrace(points, count = 17) {
    if (!Number.isInteger(count) || count < 2 || count > 64)
        throw new RangeError("resample count must be 2..64");
    if (points.length < 2 || points.some(p => p.length !== 2 || p.some(v => !Number.isFinite(v))))
        throw new RangeError("resampling needs finite trace points");
    const segments = points.slice(1).map((p, i) => Math.hypot(p[0] - points[i][0], p[1] - points[i][1]));
    const total = segments.reduce((sum, d) => sum + d, 0);
    if (total <= 1e-9)
        throw new RangeError("cannot resample a zero-length trace");
    const cumulative = [0];
    for (const distance of segments)
        cumulative.push(cumulative.at(-1) + distance);
    let cursor = 0;
    const output = [];
    for (let i = 0; i < count; i++) {
        const target = i * total / (count - 1);
        while (cursor < segments.length - 1 && cumulative[cursor + 1] < target)
            cursor++;
        const share = (target - cumulative[cursor]) / Math.max(segments[cursor], 1e-12);
        output.push([points[cursor][0] * (1 - share) + points[cursor + 1][0] * share, points[cursor][1] * (1 - share) + points[cursor + 1][1] * share]);
    }
    return output;
}
export function photometricTraceEvidence(photo, trace) {
    const { width, height, channels } = photo;
    const points = resampleTrace(trace.points.map(([x, y]) => [x * width, y * height]));
    const values = [];
    let missing = 0;
    const luminance = (x, y) => {
        const index = (y * width + x) * channels;
        return photo.data[index] * .2126 + photo.data[index + 1] * .7152 + photo.data[index + 2] * .0722;
    };
    points.forEach(([x, y], index) => {
        const previous = points[Math.max(0, index - 1)], following = points[Math.min(points.length - 1, index + 1)];
        const dx = following[0] - previous[0], dy = following[1] - previous[1], norm = Math.max(Math.hypot(dx, dy), 1e-12);
        const normal = [-dy / norm * 2, dx / norm * 2];
        const coords = [[x, y], [x + normal[0], y + normal[1]], [x - normal[0], y - normal[1]]].map(([a, b]) => [Math.floor(a), Math.floor(b)]);
        if (coords.some(([a, b]) => a < 0 || a >= width || b < 0 || b >= height)) {
            missing++;
            return;
        }
        const [centre, first, second] = coords.map(([a, b]) => luminance(a, b));
        values.push((first + second) / 2 - centre);
    });
    values.sort((a, b) => a - b);
    const m = Math.floor(values.length / 2);
    const median = values.length ? values.length % 2 ? values[m] : (values[m - 1] + values[m]) / 2 : null;
    return { samples: values.length, missing, median_dark_line_contrast: median, classification: "diagnostic_only", trace_removed: false,
        warning: "Grey or low-contrast lashes can score weakly; confirm the trace visually." };
}
//# sourceMappingURL=observations.js.map