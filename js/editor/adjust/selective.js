import { LUMA, clamp01, contrastGamma, mixLinear, sCurve, scaleChroma, shoulder, smoothstep, toEnc, toLin, whiteBalance } from "./colour.js";
export const SELECTIVE_SLIDERS = Object.freeze([
    { key: "exposure", label: "Exposure", hint: "Brighter or darker, here only." },
    { key: "contrast", label: "Contrast", hint: "More or less contrast, here only." },
    { key: "saturation", label: "Saturation", hint: "Richer or quieter colour, here only." },
    { key: "warmth", label: "Warmth", hint: "Warmer or cooler, here only." },
]);
export const SELECTIVE_DEFAULTS = Object.freeze({ mode: "point", x: 0.5, y: 0.5, radius: 0.15, feather: 60, similar: 0, brush: 0.05, soft: 60 });
export const DAB_KEYS = Array.from({ length: 12 }, (_, i) => `p${i}`);
export const DABS_PER_KEY = 25;
export const MAX_DABS = DAB_KEYS.length * DABS_PER_KEY;
const GRID = 1295;
function num(p, key, fallback, lo, hi) {
    const v = p[key];
    return typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : fallback;
}
export function encodeDabs(dabs) {
    if (dabs.length > MAX_DABS)
        throw new RangeError(`A painted area holds up to ${MAX_DABS} brush dabs`);
    const out = {};
    const code = (v) => Math.round(clamp01(v) * GRID).toString(36).padStart(2, "0");
    for (let k = 0; k * DABS_PER_KEY < dabs.length; k++) {
        out[DAB_KEYS[k]] = dabs.slice(k * DABS_PER_KEY, (k + 1) * DABS_PER_KEY).map(([x, y]) => code(x) + code(y)).join("");
    }
    return out;
}
export function decodeDabs(params) {
    const dabs = [];
    for (const key of DAB_KEYS) {
        const text = params[key];
        if (typeof text !== "string")
            continue;
        if (!/^[0-9a-z]*$/.test(text) || text.length % 4 !== 0)
            throw new RangeError("A painted area's brush dabs are not readable");
        for (let i = 0; i < text.length; i += 4) {
            const x = parseInt(text.slice(i, i + 2), 36), y = parseInt(text.slice(i + 2, i + 4), 36);
            if (x > GRID || y > GRID)
                throw new RangeError("A brush dab is outside the photo");
            dabs.push([x / GRID, y / GRID]);
        }
    }
    return dabs;
}
export function readArea(params) {
    const d = SELECTIVE_DEFAULTS;
    return {
        mode: params.mode === "paint" ? "paint" : "point",
        x: num(params, "x", d.x, 0, 1), y: num(params, "y", d.y, 0, 1),
        radius: num(params, "radius", d.radius, 0.02, 0.6), feather: num(params, "feather", d.feather, 0, 100),
        similar: num(params, "similar", d.similar, 0, 100), brush: num(params, "brush", d.brush, 0.01, 0.2),
        soft: num(params, "soft", d.soft, 0, 100), dabs: decodeDabs(params),
    };
}
export function readSelective(params) {
    const out = {};
    for (const s of SELECTIVE_SLIDERS)
        out[s.key] = num(params, s.key, 0, -100, 100);
    return out;
}
/** Append dabs along a stroke, spaced by a third of the brush so the stroke is even. */
export function addStroke(dabs, stroke, brush, aspect) {
    const out = dabs.map(([x, y]) => [x, y]);
    const step = brush / 3;
    // Distances are measured in short-side units: x is stretched by width/short, y by height/short.
    const sx = aspect >= 1 ? aspect : 1, sy = aspect >= 1 ? 1 : 1 / aspect;
    for (const [x, y] of stroke) {
        const last = out[out.length - 1];
        if (last && Math.hypot((x - last[0]) * sx, (y - last[1]) * sy) < step)
            continue;
        if (out.length >= MAX_DABS)
            break;
        out.push([clamp01(x), clamp01(y)]);
    }
    return out;
}
const ramp = (d, inner) => 1 - smoothstep(inner, 1, d);
/** The area's soft mask (0..1) at width x height. `image` (interleaved encoded RGB) is needed
 * only for "Similar colours". */
export function areaMask(area, width, height, image) {
    const mask = new Float32Array(width * height), short = Math.min(width, height);
    if (area.mode === "point") {
        const cx = area.x * width, cy = area.y * height, rad = area.radius * short, inner = 1 - 0.9 * area.feather / 100;
        for (let y = Math.max(0, Math.floor(cy - rad)); y < Math.min(height, Math.ceil(cy + rad)); y++) {
            for (let x = Math.max(0, Math.floor(cx - rad)); x < Math.min(width, Math.ceil(cx + rad)); x++) {
                mask[y * width + x] = ramp(Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / rad, inner);
            }
        }
        if (area.similar > 0 && image)
            narrowToColour(mask, image, width, height, cx, cy, area.similar);
        return mask;
    }
    const rad = area.brush * short, inner = 1 - 0.9 * area.soft / 100;
    for (const [nx, ny] of area.dabs) {
        const cx = nx * width, cy = ny * height;
        for (let y = Math.max(0, Math.floor(cy - rad)); y < Math.min(height, Math.ceil(cy + rad)); y++) {
            for (let x = Math.max(0, Math.floor(cx - rad)); x < Math.min(width, Math.ceil(cx + rad)); x++) {
                const v = ramp(Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / rad, inner), i = y * width + x;
                if (v > mask[i])
                    mask[i] = v;
            }
        }
    }
    return mask;
}
function opponent(image, i) {
    const r = image[i * 3], g = image[i * 3 + 1], b = image[i * 3 + 2], y = LUMA[0] * r + LUMA[1] * g + LUMA[2] * b;
    return [y, b - y, r - y];
}
/** Keep the mask only where the colour is near the colour under the point (a small disc mean). */
function narrowToColour(mask, image, width, height, cx, cy, similar) {
    const r = Math.max(1, Math.round(0.01 * Math.min(width, height)));
    const ref = [0, 0, 0];
    let n = 0;
    for (let y = Math.max(0, Math.round(cy) - r); y <= Math.min(height - 1, Math.round(cy) + r); y++) {
        for (let x = Math.max(0, Math.round(cx) - r); x <= Math.min(width - 1, Math.round(cx) + r); x++) {
            const o = opponent(image, y * width + x);
            ref[0] += o[0];
            ref[1] += o[1];
            ref[2] += o[2];
            n++;
        }
    }
    if (!n)
        return;
    ref[0] /= n;
    ref[1] /= n;
    ref[2] /= n;
    const tol = 0.5 - 0.44 * similar / 100;
    for (let i = 0; i < mask.length; i++) {
        if (mask[i] <= 0)
            continue;
        const o = opponent(image, i);
        const dist = Math.sqrt((o[0] - ref[0]) ** 2 + 2 * ((o[1] - ref[1]) ** 2 + (o[2] - ref[2]) ** 2));
        mask[i] *= 1 - smoothstep(tol * 0.5, tol, dist);
    }
}
export function selectiveIsNeutral(values) {
    return SELECTIVE_SLIDERS.every((s) => values[s.key] === 0);
}
/** Apply the adjustments through the mask (values -100..100, strength already applied). */
export function applySelective(rgb, width, height, area, values, opacity) {
    const mask = areaMask(area, width, height, rgb);
    if (selectiveIsNeutral(values) || opacity <= 0)
        return mask;
    const gain = Math.pow(2, 1.5 * values.exposure / 100), roll = clamp01(1.5 * values.exposure / 100);
    const gamma = contrastGamma(values.contrast / 100), k = 1 + values.saturation / 100;
    const wb = whiteBalance(0.8 * values.warmth / 100, 0);
    const px = [0, 0, 0];
    for (let i = 0; i < mask.length; i++) {
        const m = mask[i] * opacity;
        if (m <= 0)
            continue;
        const before = [rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]];
        for (let c = 0; c < 3; c++) {
            px[c] = sCurve(toEnc(clamp01(shoulder(toLin(before[c]) * gain, roll) * wb[c])), gamma);
        }
        if (k !== 1)
            scaleChroma(px, k);
        mixLinear(before, px, m);
        rgb[i * 3] = px[0];
        rgb[i * 3 + 1] = px[1];
        rgb[i * 3 + 2] = px[2];
    }
    return mask;
}
