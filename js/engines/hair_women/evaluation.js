/** Hair mirror metrics. Author: John Khan. */
import { textureRatio } from "./colour.js";
export function hairMetrics(photo, after, coverage) { let outside = 0, outN = 0, changed = 0, inside = 0, inN = 0, alpha = 0; for (let i = 0; i < coverage.length; i++) {
    const o = i * photo.channels;
    let d = 0;
    for (let c = 0; c < 3; c++)
        d = Math.max(d, Math.abs(after[o + c] - photo.data[o + c]));
    if (coverage[i] <= .01) {
        outN++;
        if (d > 1)
            outside++;
    }
    else {
        inside += d;
        inN++;
    }
    if (d > 1)
        changed++;
    if (photo.channels === 4)
        alpha = Math.max(alpha, Math.abs(after[o + 3] - photo.data[o + 3]));
} return { outside_error: outN ? outside / outN : 0, changed_fraction: changed / coverage.length, alpha_error: alpha, texture_ratio: textureRatio(photo, after, coverage), mean_inside_change: inN ? inside / inN : 0 }; }
