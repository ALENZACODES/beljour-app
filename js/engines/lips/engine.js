/** Browser mirror of the R16B lips engine. Author: John Khan. */
import { LABEL, VERSION, parseOptions, validateLandmarks, validatePhoto } from "./contracts.js";
const OUTER = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95, 78];
function polygonMask(w, h, landmarks) {
    const poly = OUTER.map(i => landmarks[i]);
    const m = new Float32Array(w * h);
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            const px = (x + .5) / w, py = (y + .5) / h;
            let inside = false;
            for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
                const a = poly[i], b = poly[j];
                if ((a[1] > py) !== (b[1] > py) && px < (b[0] - a[0]) * (py - a[1]) / (b[1] - a[1] + 1e-12) + a[0])
                    inside = !inside;
            }
            m[y * w + x] = inside ? 1 : 0;
        }
    return m;
}
function blend(photo, data, mask, colour, opacity) {
    for (let i = 0; i < mask.length; i++) {
        const a = mask[i] * opacity;
        if (a <= 0)
            continue;
        const o = i * photo.channels;
        const lum = (data[o] + data[o + 1] + data[o + 2]) / 3 / 255;
        for (let c = 0; c < 3; c++) {
            const target = colour[c] * (.64 + .36 * lum);
            data[o + c] = Math.round(data[o + c] * (1 - a) + target * a);
        }
    }
}
function wear(mask, w, h, mode) {
    const out = new Float32Array(mask.length);
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            const i = y * w + x;
            const dx = (x - w * .5) / (w * .09 + 1), dy = (y - h * .59) / (h * .035 + 1);
            const centre = Math.exp(-(dx * dx + dy * dy) * 2);
            const loss = (mode === "meal" ? .68 : mode === "coffee" ? .46 : .25) * centre;
            out[i] = Math.max(0, mask[i] * (1 - loss));
        }
    return out;
}
export function renderLip(photo, landmarks, raw) {
    validatePhoto(photo);
    validateLandmarks(landmarks);
    const req = parseOptions(raw);
    const data = new Uint8ClampedArray(photo.data);
    let coverage = polygonMask(photo.width, photo.height, landmarks);
    const notes = [];
    if (req.feature === "W46") {
        const base = coverage;
        coverage = new Float32Array(base.length);
        for (let y = 1; y < photo.height - 1; y++)
            for (let x = 1; x < photo.width - 1; x++) {
                const i = y * photo.width + x;
                if (base[i] === 0 && (base[i - 1] + base[i + 1] + base[i - photo.width] + base[i + photo.width]) > 0)
                    coverage[i] = req.amount;
            }
        blend(photo, data, coverage, req.liner_colour, .88);
        notes.push("Corners are intentionally conservative in the overline guide.");
    }
    else if (req.feature === "W47") {
        const fade = { fresh: .78, healed: .48, month_6: .38, month_12: .28, month_18: .18 };
        blend(photo, data, coverage, req.colour, (fade[req.style] ?? .48) * req.amount);
        notes.push("Fade states are illustrative.");
    }
    else if (req.feature === "W54") {
        const c = req.style === "blue_based" ? [138, 35, 71] : req.style === "warm_based" ? [171, 69, 51] : req.colour;
        blend(photo, data, coverage, c, .72 * req.amount);
        notes.push("Teeth are untouched.");
    }
    else if (req.feature === "W55") {
        blend(photo, data, coverage, req.colour, .72 * req.amount);
        if (req.style === "gloss")
            for (let i = 0; i < coverage.length; i++)
                if (coverage[i] > .5) {
                    const o = i * photo.channels;
                    for (let c = 0; c < 3; c++)
                        data[o + c] = Math.min(255, Math.round(data[o + c] + 24 * req.amount));
                }
    }
    else if (req.feature === "W56") {
        coverage = wear(coverage, photo.width, photo.height, req.style);
        blend(photo, data, coverage, req.colour, .78 * req.amount);
        notes.push("Finish-class wear estimate.");
    }
    else if (req.feature === "W57") {
        blend(photo, data, coverage, req.colour, (req.style === "sheer" ? .3 : req.style === "opaque" ? .82 : .58) * req.amount);
    }
    else
        notes.push("Geometry preview is bounded; browser mirror exposes the same consultation label.");
    if (req.amount === 0) {
        for (let i = 0; i < data.length; i++)
            data[i] = photo.data[i];
        coverage.fill(0);
    }
    let changed = 0;
    for (let i = 0; i < coverage.length; i++) {
        const o = i * photo.channels;
        if (data[o] !== photo.data[o] || data[o + 1] !== photo.data[o + 1] || data[o + 2] !== photo.data[o + 2])
            changed++;
    }
    return { data, coverage, report: { feature: req.feature, style: req.style, label: LABEL, version: VERSION, notes, changed_fraction: changed / coverage.length, texture_preserved: true } };
}
//# sourceMappingURL=engine.js.map