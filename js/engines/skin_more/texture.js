function luma(p, i) { return .2126 * p[i * 4] + .7152 * p[i * 4 + 1] + .0722 * p[i * 4 + 2]; }
export function luminance(pixels, w, h) {
    if (pixels.length !== w * h * 4)
        throw new Error("RGBA length mismatch");
    const out = new Float32Array(w * h);
    for (let i = 0; i < out.length; i++)
        out[i] = luma(pixels, i);
    return out;
}
export function gradientMagnitude(pixels, w, h) {
    const g = luminance(pixels, w, h), out = new Float32Array(g.length);
    for (let y = 1; y < h - 1; y++)
        for (let x = 1; x < w - 1; x++) {
            const i = y * w + x, gx = (g[i + 1] - g[i - 1]) * .5, gy = (g[i + w] - g[i - w]) * .5;
            out[i] = Math.hypot(gx, gy);
        }
    return out;
}
export function localVariance(pixels, w, h, radius = 1) {
    if (radius < 1 || radius > 8)
        throw new Error("radius must be 1..8");
    const g = luminance(pixels, w, h), out = new Float32Array(g.length);
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            let sum = 0, sq = 0, n = 0;
            for (let dy = -radius; dy <= radius; dy++)
                for (let dx = -radius; dx <= radius; dx++) {
                    const yy = Math.max(0, Math.min(h - 1, y + dy)), xx = Math.max(0, Math.min(w - 1, x + dx)), v = g[yy * w + xx];
                    sum += v;
                    sq += v * v;
                    n++;
                }
            const mean = sum / n;
            out[y * w + x] = sq / n - mean * mean;
        }
    return out;
}
function percentile(values, p) {
    const a = [...values].sort((a, b) => a - b);
    if (!a.length)
        return 0;
    const pos = (a.length - 1) * p, lo = Math.floor(pos), hi = Math.ceil(pos), t = pos - lo;
    return a[lo] * (1 - t) + a[hi] * t;
}
export function percentileEdges(pixels, w, h, mask, p = .75) {
    const mag = gradientMagnitude(pixels, w, h), values = [];
    for (let i = 0; i < mask.length; i++)
        if (mask[i] > .5)
            values.push(mag[i]);
    const threshold = percentile(values, p), out = new Uint8Array(mask.length);
    for (let i = 0; i < out.length; i++)
        out[i] = mask[i] > .5 && mag[i] >= threshold ? 1 : 0;
    return out;
}
export function textureMetrics(before, after, w, h, mask) {
    const gb = gradientMagnitude(before, w, h), ga = gradientMagnitude(after, w, h), vb = localVariance(before, w, h), va = localVariance(after, w, h), indices = [];
    for (let i = 0; i < mask.length; i++)
        if (mask[i] > .5)
            indices.push(i);
    if (!indices.length)
        return { gradientBefore: 0, gradientAfter: 0, gradientRatio: 1, varianceBefore: 0, varianceAfter: 0, varianceRatio: 1, edgeRetention: 1 };
    const mean = (a) => indices.reduce((s, i) => s + a[i], 0) / indices.length, g0 = mean(gb), g1 = mean(ga), v0 = mean(vb), v1 = mean(va), eb = percentileEdges(before, w, h, mask), ea = percentileEdges(after, w, h, mask);
    let denom = 0, keep = 0;
    for (let i = 0; i < eb.length; i++)
        if (eb[i]) {
            denom++;
            if (ea[i])
                keep++;
        }
    return { gradientBefore: g0, gradientAfter: g1, gradientRatio: g1 / Math.max(g0, 1e-6), varianceBefore: v0, varianceAfter: v1, varianceRatio: v1 / Math.max(v0, 1e-6), edgeRetention: denom ? keep / denom : 1 };
}
export function preserveScore(m) { const g = m.gradientRatio > 0 ? Math.min(m.gradientRatio, 1 / m.gradientRatio) : 0, v = m.varianceRatio > 0 ? Math.min(m.varianceRatio, 1 / m.varianceRatio) : 0; return Math.max(0, Math.min(1, .4 * g + .3 * v + .3 * m.edgeRetention)); }
export function textureGate(before, after, w, h, mask, minimum = .72) { const m = textureMetrics(before, after, w, h, mask), score = preserveScore(m); return { score, gradientRatio: m.gradientRatio, varianceRatio: m.varianceRatio, edgeRetention: m.edgeRetention, minimum, pass: score >= minimum }; }
export function boundedMicrocontrast(pixels, w, h, mask, amount) {
    if (amount < 0 || amount > 1)
        throw new Error("amount must be in [0,1]");
    const out = new Uint8ClampedArray(pixels), blur = new Float32Array(w * h * 3);
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++)
            for (let c = 0; c < 3; c++) {
                let sum = 0, n = 0;
                for (let dy = -1; dy <= 1; dy++)
                    for (let dx = -1; dx <= 1; dx++) {
                        const yy = Math.max(0, Math.min(h - 1, y + dy)), xx = Math.max(0, Math.min(w - 1, x + dx));
                        sum += pixels[(yy * w + xx) * 4 + c];
                        n++;
                    }
                blur[(y * w + x) * 3 + c] = sum / n;
            }
    for (let i = 0; i < w * h; i++) {
        const a = Math.max(0, Math.min(1, mask[i]));
        for (let c = 0; c < 3; c++) {
            const base = pixels[i * 4 + c], b = blur[i * 3 + c], adjusted = b + (base - b) * (1 + .1 * amount);
            out[i * 4 + c] = Math.round(base * (1 - a) + adjusted * a);
        }
        out[i * 4 + 3] = pixels[i * 4 + 3];
    }
    return out;
}
export function proAgeProfile(style) {
    const profiles = { texture_first: { microcontrast: .06, colourOpacity: .04, lineBlur: 0, copy: "Texture stays visible." }, hydrated_finish: { microcontrast: .02, colourOpacity: .05, lineBlur: 0, copy: "Finish simulation only." }, soft_colour: { microcontrast: .04, colourOpacity: .06, lineBlur: 0, copy: "Colour shift without line removal." } };
    if (!profiles[style])
        throw new Error("unsupported pro-age profile");
    return profiles[style];
}
//# sourceMappingURL=texture.js.map