const D65 = [.95047, 1, 1.08883];
const M = Object.freeze([[.4124564, .3575761, .1804375], [.2126729, .7151522, .072175], [.0193339, .119192, .9503041]]);
function finite(v, name) {
    if (!Number.isFinite(v))
        throw new Error(`${name}  must be finite`);
    return v;
}
export function linearChannel(v) { const x = Math.max(0, Math.min(1, finite(v, "channel") / 255)); return x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4; }
export function srgbChannel(v) { const x = Math.max(0, Math.min(1, finite(v, "linear channel"))); const y = x <= .0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - .055; return Math.round(Math.max(0, Math.min(255, y * 255))); }
export function rgbToXyz(rgb) { const r = linearChannel(rgb[0]), g = linearChannel(rgb[1]), b = linearChannel(rgb[2]); return M.map(row => row[0] * r + row[1] * g + row[2] * b); }
function labF(t) { const d = 6 / 29; return t > d ** 3 ? Math.cbrt(t) : t / (3 * d * d) + 4 / 29; }
export function rgbToLab(rgb) { const xyz = rgbToXyz(rgb), x = labF(xyz[0] / D65[0]), y = labF(xyz[1] / D65[1]), z = labF(xyz[2] / D65[2]); return [116 * y - 16, 500 * (x - y), 200 * (y - z)]; }
export function deltaE76(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }
export function labChroma(lab) { return Math.hypot(lab[1], lab[2]); }
export function hueAngle(lab) { return (Math.atan2(lab[2], lab[1]) * 180 / Math.PI + 360) % 360; }
export function relativeLuminance(rgb) { const r = linearChannel(rgb[0]), g = linearChannel(rgb[1]), b = linearChannel(rgb[2]); return .2126 * r + .7152 * g + .0722 * b; }
function quantile(values, q) {
    if (!values.length)
        throw new Error("empty region");
    const sorted = [...values].sort((a, b) => a - b), p = (sorted.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p), t = p - lo;
    return sorted[lo] * (1 - t) + sorted[hi] * t;
}
function trimmedMean(values, trim) {
    const sorted = [...values].sort((a, b) => a - b), lo = Math.floor(sorted.length * trim), hi = Math.max(lo + 1, Math.ceil(sorted.length * (1 - trim)));
    let sum = 0;
    for (let i = lo; i < hi; i++)
        sum += sorted[i];
    return sum / (hi - lo);
}
export function regionPixels(pixels, width, height, mask) {
    if (mask.length !== width * height)
        throw new Error("mask length mismatch");
    if (pixels.length !== width * height * 4)
        throw new Error("RGBA length mismatch");
    const out = [];
    for (let i = 0; i < mask.length; i++)
        if (mask[i] > .5)
            out.push([pixels[i * 4], pixels[i * 4 + 1], pixels[i * 4 + 2]]);
    return out;
}
export function robustRegionColour(pixels, width, height, mask, trim = .1) {
    if (trim < 0 || trim >= .45)
        throw new Error("trim must be in [0,.45)");
    const rows = regionPixels(pixels, width, height, mask);
    if (!rows.length)
        throw new Error("checked region contains no pixels");
    const labs = rows.map(rgbToLab);
    const rgb = [0, 1, 2].map(i => trimmedMean(rows.map(r => r[i]), trim));
    const lab = [0, 1, 2].map(i => trimmedMean(labs.map(r => r[i]), trim));
    const lumas = rows.map(relativeLuminance);
    const chroma = labChroma(lab);
    return { rgb, lab, luma: quantile(lumas, .5), chroma, warmAxis: lab[2] - .35 * lab[1], pixelCount: rows.length };
}
export function compareRegions(pixels, width, height, a, b) { const aa = robustRegionColour(pixels, width, height, a), bb = robustRegionColour(pixels, width, height, b), d = [aa.lab[0] - bb.lab[0], aa.lab[1] - bb.lab[1], aa.lab[2] - bb.lab[2]]; return { deltaE76: Math.hypot(...d), lightness: Math.abs(d[0]), redGreen: Math.abs(d[1]), yellowBlue: Math.abs(d[2]), chroma: Math.abs(aa.chroma - bb.chroma) }; }
export function cosmeticMix(base, target, opacity) {
    if (opacity < 0 || opacity > 1)
        throw new Error("opacity must be in [0,1]");
    const a = base.map(linearChannel), b = target.map(linearChannel);
    return [0, 1, 2].map(i => srgbChannel(a[i] * (1 - opacity) + b[i] * opacity));
}
export function neutralDirection(lab) { const n = Math.hypot(lab[1], lab[2]); return n < 1e-8 ? [0, 0] : [-lab[1] / n, -lab[2] / n]; }
export function preserveLightnessTarget(source, target, strength) {
    let mixed = cosmeticMix(source, target, strength), s = rgbToLab(source), m = rgbToLab(mixed), gap = Math.abs(m[0] - s[0]);
    if (gap <= 4)
        return mixed;
    return cosmeticMix(source, target, strength * Math.min(1, 4 / (gap + 1e-8)));
}
export function castScore(pixels, width, height, mask) { const r = robustRegionColour(pixels, width, height, mask), [L, , b] = r.lab, pale = Math.max(0, (L - 55) / 45), desat = Math.max(0, 1 - Math.min(r.chroma / 45, 1)), cool = Math.max(0, Math.min((-b + 4) / 30, 1)); return Math.max(0, Math.min(1, .5 * pale + .3 * desat + .2 * cool)); }
export function colourfulness(pixels, width, height, mask) {
    const rows = regionPixels(pixels, width, height, mask);
    if (!rows.length)
        return 0;
    const rg = rows.map(v => v[0] - v[1]), yb = rows.map(v => (v[0] + v[1]) * .5 - v[2]);
    const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length, variance = (a) => { const m = mean(a); return mean(a.map(v => (v - m) ** 2)); };
    return Math.sqrt(variance(rg) + variance(yb)) + .3 * Math.hypot(mean(rg), mean(yb));
}
//# sourceMappingURL=colorimetry.js.map