/**
 * The FX1 pointwise colour ops and the one op registry recipes name (filters-plan.md §3.3).
 *
 * Same names, parameters, neutral values and formulas as api/plumb_api/filters/colour/ops.py
 * (see its docstring for each op). A colour op maps one encoded sRGB colour to another and
 * clips to [0, 1]; ops run in place over a Float64Array of r, g, b triples. Spatial and light
 * ops (spatial/glow.ts, light/position.ts) register here too, with an image body instead.
 *
 * Parameters in a recipe are the op's values at strength 100. `scaleParams` moves each
 * scalable value from neutral to target; hues, fixed settings and photo statistics don't
 * scale. OKLab is Ottosson (2020); grey-world balance is Buchsbaum grey world (1980), "lite";
 * concept only, no code copied.
 * Author: John Khan.
 */
import { Curve, IDENTITY, atStrength, checkPoints } from "./curves.js";
import { DEG, RAD, clamp01, decode1, encode1, linearToOklab, luminance, mod360, oklabToSrgb, smoothstep, srgbToOklab, wrapDegrees } from "./space.js";
export const BANDS = ["red", "orange", "yellow", "green", "aqua", "blue", "purple", "magenta"];
export const BAND_CENTRES = [25, 60, 100, 140, 195, 255, 295, 335];
export const BAND_KEYS = ["hue", "chroma", "light"];
export const SKIN_BANDS = ["red", "orange", "yellow"];
export const BAND_LIMITS = { hue: 45, chroma: 1, light: 1 };
export const CHROMA_GATE = 0.05, LIGHT_UNIT = 0.1, VIBRANCE_KNEE = 0.2;
export const FADE_BLACK = 0.12, FADE_WHITE = 0.04, FADE_CHROMA = 0.25, TONE_UNIT = 0.12;
export const CAST_CHROMA_MAX = 0.08, CAST_LIMIT = 0.03, GREY_WORLD_SHARE = 0.5;
export const IDENTITY3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
export const SCALES = ["linear", "easeIn", "easeOut", "step"];
export const num = (neutral, lo, hi, help = "") => ({ kind: "number", neutral, lo, hi, help });
export const fixed = (value, lo, hi, help = "") => ({ kind: "fixed", neutral: value, lo, hi, help });
export const angle = (neutral = 0) => ({ kind: "angle", neutral, lo: -Infinity, hi: Infinity });
const stat = () => ({ kind: "stat", neutral: 0, lo: -Infinity, hi: Infinity });
export const OPS = new Map();
export function register(op) {
    if (OPS.has(op.name))
        throw new Error(`op ${op.name} is registered twice`);
    OPS.set(op.name, op);
    return op;
}
export function op(name) {
    const found = OPS.get(name);
    if (!found)
        throw new RangeError(`unknown filter op ${JSON.stringify(name)}`);
    return found;
}
// --- shared pieces -------------------------------------------------------------------
const n = (p, k) => p[k];
/** Write an OKLab triple back to rgb[i..i+2] as encoded sRGB. */
function putLab(rgb, i, s) {
    oklabToSrgb(s[0], s[1], s[2], s);
    rgb[i] = s[0];
    rgb[i + 1] = s[1];
    rgb[i + 2] = s[2];
}
const getLab = (rgb, i, s) => srgbToOklab(rgb[i], rgb[i + 1], rgb[i + 2], s);
function push(s, hue, amount) {
    const rad = hue * RAD;
    s[1] += amount * Math.cos(rad);
    s[2] += amount * Math.sin(rad);
}
export function contrastCurve(light, amount, pivot) {
    const a = Math.min(0.95, Math.max(-0.95, amount));
    const L = clamp01(light);
    let u = L <= pivot ? (0.5 * L) / pivot : 0.5 + (0.5 * (L - pivot)) / (1 - pivot);
    u = u - (a * Math.sin(2 * Math.PI * u)) / (2 * Math.PI);
    return u <= 0.5 ? 2 * u * pivot : pivot + (u - 0.5) * 2 * (1 - pivot);
}
export function rolloffCurve(light, amount, knee) {
    const L = clamp01(light);
    let x = (L - knee) / (1 - knee);
    x = x < 0 ? 0 : x > 1 ? 1 : x;
    const y = x * (1 - amount * 0.5 * x);
    return L > knee ? knee + y * (1 - knee) : L;
}
export function toneCurve(light, shadows, highlights) {
    const L = clamp01(light);
    return L + TONE_UNIT * 6.75 * (shadows * L * (1 - L) ** 2 + highlights * L * L * (1 - L));
}
const SPAN_NEXT = BAND_CENTRES.map((c, k) => mod360(BAND_CENTRES[(k + 1) % BAND_CENTRES.length] - c));
const SPAN_PREV = BAND_CENTRES.map((c, k) => mod360(c - BAND_CENTRES[(k - 1 + BAND_CENTRES.length) % BAND_CENTRES.length]));
/** Raised-cosine weights over the eight band centres; they sum to 1 at every hue. Only the two
 * bands either side of the hue can be non-zero, so only their weights are computed (each with
 * the same formula as the Python loop over all eight). */
export function bandWeights(hue, out = new Float64Array(8)) {
    out.fill(0);
    const count = BAND_CENTRES.length;
    for (let k = 0; k < count; k++) {
        const d = wrapDegrees(hue - BAND_CENTRES[k]);
        const t = d >= 0 ? d / SPAN_NEXT[k] : -d / SPAN_PREV[k];
        if (t < 1)
            out[k] = 0.5 * (1 + Math.cos(Math.PI * Math.min(t, 1)));
    }
    return out;
}
// --- colour op bodies -------------------------------------------------------------------
function whiteBalance(rgb, i, p) {
    const r = decode1(rgb[i]), g = decode1(rgb[i + 1]), b = decode1(rgb[i + 2]);
    const y0 = luminance(r, g, b);
    const t = n(p, "temperature"), tint = n(p, "tint");
    const or = r * 2 ** (0.3 * t), og = g * 2 ** (-0.2 * tint), ob = b * 2 ** (-0.3 * t);
    const y1 = luminance(or, og, ob);
    const scale = y1 > 1e-12 ? y0 / y1 : 1;
    rgb[i] = encode1(or * scale);
    rgb[i + 1] = encode1(og * scale);
    rgb[i + 2] = encode1(ob * scale);
}
function exposure(rgb, i, p) {
    const k = 2 ** n(p, "ev");
    for (let c = 0; c < 3; c++)
        rgb[i + c] = encode1(decode1(rgb[i + c]) * k);
}
function contrast(rgb, i, p, s) {
    getLab(rgb, i, s);
    s[0] = contrastCurve(s[0], n(p, "amount"), n(p, "pivot"));
    putLab(rgb, i, s);
}
const curveCache = new WeakMap();
function prepared(p) {
    let c = curveCache.get(p);
    if (!c) {
        const mk = (k) => new Curve(p[k]);
        c = { master: mk("master"), r: mk("r"), g: mk("g"), b: mk("b") };
        curveCache.set(p, c);
    }
    return c;
}
function curve(rgb, i, p) {
    const c = prepared(p);
    if (!c.master.identity)
        for (let k = 0; k < 3; k++)
            rgb[i + k] = c.master.at(rgb[i + k]);
    if (!c.r.identity)
        rgb[i] = c.r.at(rgb[i]);
    if (!c.g.identity)
        rgb[i + 1] = c.g.at(rgb[i + 1]);
    if (!c.b.identity)
        rgb[i + 2] = c.b.at(rgb[i + 2]);
    for (let k = 0; k < 3; k++)
        rgb[i + k] = clamp01(rgb[i + k]);
}
const weightsScratch = new Float64Array(8);
function hsl(rgb, i, p, s) {
    const bands = p.bands;
    getLab(rgb, i, s);
    const C = Math.hypot(s[1], s[2]);
    const h = mod360(Math.atan2(s[2], s[1]) * DEG);
    const w = bandWeights(h, weightsScratch);
    const gate = smoothstep(0, CHROMA_GATE, C);
    let turn = 0, grow = 0, lift = 0;
    for (let k = 0; k < BANDS.length; k++) {
        const e = bands[BANDS[k]];
        if (!e)
            continue;
        const wk = w[k] * gate;
        turn += wk * e.hue;
        grow += wk * e.chroma;
        lift += wk * e.light;
    }
    const L = s[0] + LIGHT_UNIT * lift;
    const C2 = Math.max(0, C * Math.max(0, 1 + grow));
    const rad = (h + turn) * RAD;
    s[0] = L;
    s[1] = C2 * Math.cos(rad);
    s[2] = C2 * Math.sin(rad);
    putLab(rgb, i, s);
}
function saturation(rgb, i, p, s) {
    getLab(rgb, i, s);
    const k = Math.max(0, 1 + n(p, "amount"));
    s[1] *= k;
    s[2] *= k;
    putLab(rgb, i, s);
}
function vibrance(rgb, i, p, s) {
    getLab(rgb, i, s);
    const amount = n(p, "amount");
    const share = Math.min(Math.hypot(s[1], s[2]) / VIBRANCE_KNEE, 1);
    const weight = amount >= 0 ? 1 - share : share;
    const k = Math.max(0, 1 + amount * weight);
    s[1] *= k;
    s[2] *= k;
    putLab(rgb, i, s);
}
function splitTone(rgb, i, p, s) {
    getLab(rgb, i, s);
    const u = clamp01(s[0]) ** (2 ** -n(p, "balance"));
    push(s, n(p, "shadowHue"), n(p, "shadowAmount") * (1 - u) ** 2);
    push(s, n(p, "highlightHue"), n(p, "highlightAmount") * u ** 2);
    putLab(rgb, i, s);
}
function tint(rgb, i, p, s) {
    getLab(rgb, i, s);
    const u = clamp01(s[0]);
    push(s, n(p, "hue"), n(p, "amount") * (1 - (2 * u - 1) ** 4));
    putLab(rgb, i, s);
}
function fade(rgb, i, p, s) {
    const f = n(p, "amount");
    getLab(rgb, i, s);
    const u = clamp01(s[0]);
    s[0] = FADE_BLACK * f + u * (1 - (FADE_BLACK + FADE_WHITE) * f);
    const k = 1 - FADE_CHROMA * f;
    s[1] *= k;
    s[2] *= k;
    push(s, n(p, "toneHue"), n(p, "toneAmount") * (1 - u) ** 2);
    putLab(rgb, i, s);
}
function highlightRolloff(rgb, i, p, s) {
    getLab(rgb, i, s);
    const knee = n(p, "knee");
    let above = (clamp01(s[0]) - knee) / (1 - knee);
    above = above < 0 ? 0 : above > 1 ? 1 : above;
    s[0] = rolloffCurve(s[0], n(p, "amount"), knee);
    const k = Math.max(0, 1 + n(p, "chroma") * above);
    s[1] *= k;
    s[2] *= k;
    putLab(rgb, i, s);
}
function greyWorld(rgb, i, p, s) {
    getLab(rgb, i, s);
    const u = clamp01(s[0]);
    const weight = GREY_WORLD_SHARE * n(p, "amount") * (1 - (1 - u) ** 4);
    s[1] -= weight * n(p, "castA");
    s[2] -= weight * n(p, "castB");
    putLab(rgb, i, s);
}
function tone(rgb, i, p, s) {
    getLab(rgb, i, s);
    s[0] = toneCurve(s[0], n(p, "shadows"), n(p, "highlights"));
    putLab(rgb, i, s);
}
function channelMixer(rgb, i, p) {
    const m = p.matrix;
    const r = decode1(rgb[i]), g = decode1(rgb[i + 1]), b = decode1(rgb[i + 2]);
    for (let c = 0; c < 3; c++)
        rgb[i + c] = encode1(r * m[c][0] + g * m[c][1] + b * m[c][2]);
}
/** Mean OKLab (a, b) of the near-neutral pixels of a block: its colour cast. */
export function photoCast(data, scale = 1) {
    const s = new Float64Array(3);
    let sa = 0, sb = 0, count = 0;
    for (let i = 0; i < data.length; i += 3) {
        srgbToOklab(data[i] / scale, data[i + 1] / scale, data[i + 2] / scale, s);
        if (Math.hypot(s[1], s[2]) < CAST_CHROMA_MAX) {
            sa += s[1];
            sb += s[2];
            count++;
        }
    }
    if (!count)
        return [0, 0];
    const clip = (v) => Math.min(CAST_LIMIT, Math.max(-CAST_LIMIT, v));
    return [clip(sa / count), clip(sb / count)];
}
const colour = (name, params, pixel, help, skinHue = false, extra = {}) => register({ name, family: "colour", params, pixel, help, skinHue, ...extra });
colour("colour.whiteBalance", { temperature: num(0, -1, 1, "warm +, cool -"), tint: num(0, -1, 1, "magenta +, green -") }, whiteBalance, "White balance in linear light; luminance kept");
colour("colour.exposure", { ev: num(0, -2, 2, "stops") }, exposure, "Exposure in stops");
colour("colour.contrast", { amount: num(0, -0.95, 0.95), pivot: fixed(0.6, 0.2, 0.8) }, contrast, "S-curve contrast on OKLab L through a pivot");
colour("colour.curve", Object.fromEntries(["master", "r", "g", "b"].map((k) => [k, { kind: "points", neutral: IDENTITY, lo: 0, hi: 1 }])), curve, "Monotone tone curves");
colour("colour.hsl", { bands: { kind: "bands", neutral: {}, lo: -Infinity, hi: Infinity } }, hsl, "Eight hue bands in OKLCh", true);
colour("colour.saturation", { amount: num(0, -1, 1) }, saturation, "Chroma scale");
colour("colour.vibrance", { amount: num(0, -1, 1) }, vibrance, "Chroma scale, low chroma first");
colour("colour.splitTone", { shadowHue: angle(), shadowAmount: num(0, 0, 0.12), highlightHue: angle(), highlightAmount: num(0, 0, 0.12),
    balance: num(0, -1, 1) }, splitTone, "Shadow and highlight tints", true);
colour("colour.tint", { hue: angle(), amount: num(0, 0, 0.12) }, tint, "One colour cast, fading at black and white", true);
colour("colour.fade", { amount: num(0, 0, 1), toneHue: angle(), toneAmount: num(0, 0, 0.08) }, fade, "Lifted blacks, softer whites, eased colour, optional shadow tone");
colour("colour.highlightRolloff", { amount: num(0, 0, 1), knee: fixed(0.7, 0.4, 0.95), chroma: num(0, -1, 0, "below 0 cleans colour out of highlights") }, highlightRolloff, "Highlight shoulder");
colour("colour.greyWorld", { amount: num(0, 0, 1), castA: stat(), castB: stat() }, greyWorld, "Removes half the photo's measured colour cast (grey world, lite)", true, { stats: "cast" });
colour("colour.tone", { shadows: num(0, -1, 1), highlights: num(0, -1, 1) }, tone, "Shadow and highlight lift");
colour("colour.channelMixer", { matrix: { kind: "matrix", neutral: IDENTITY3, lo: -2, hi: 2 } }, channelMixer, "3 x 3 channel mix in linear light");
// --- parameters -----------------------------------------------------------------------------
export function scaleFraction(scale, strength) {
    const s = Math.min(1, Math.max(0, strength));
    switch (scale) {
        case "linear": return s;
        case "easeIn": return s * s;
        case "easeOut": return 1 - (1 - s) * (1 - s);
        case "step": return s > 0 ? 1 : 0;
    }
    throw new RangeError(`unknown scale ${JSON.stringify(scale)}`);
}
function bandsOf(value) {
    const out = {};
    for (const [band, e] of Object.entries((value ?? {}))) {
        out[band] = { hue: Number(e.hue ?? 0), chroma: Number(e.chroma ?? 0), light: Number(e.light ?? 0) };
    }
    return out;
}
/** The op's neutral values, overridden by the recipe's targets. */
export function fullParams(spec, given) {
    const out = {};
    for (const [key, p] of Object.entries(spec.params)) {
        const value = key in given ? given[key] : p.neutral;
        if (p.kind === "points")
            out[key] = checkPoints(value);
        else if (p.kind === "bands")
            out[key] = bandsOf(value);
        else if (p.kind === "matrix")
            out[key] = value.map((row) => row.map(Number));
        else
            out[key] = Number(value);
    }
    return out;
}
export function scaleParams(spec, target, fraction) {
    const full = fullParams(spec, target);
    const out = {};
    for (const [key, p] of Object.entries(spec.params)) {
        const value = full[key];
        if (p.kind === "number")
            out[key] = p.neutral + (value - p.neutral) * fraction;
        else if (p.kind === "angle" || p.kind === "fixed" || p.kind === "stat")
            out[key] = value;
        else if (p.kind === "points")
            out[key] = atStrength(value, fraction);
        else if (p.kind === "matrix") {
            // At full scale the target itself, so a mono mix keeps three identical rows (exact greys).
            const m = value;
            out[key] = fraction === 1 ? m : m.map((row, i) => row.map((x, j) => IDENTITY3[i][j] + (x - IDENTITY3[i][j]) * fraction));
        }
        else if (p.kind === "bands") {
            const b = value, scaled = {};
            for (const [band, e] of Object.entries(b))
                scaled[band] = { hue: e.hue * fraction, chroma: e.chroma * fraction, light: e.light * fraction };
            out[key] = scaled;
        }
    }
    return out;
}
/** True when every value that follows strength sits at the op's neutral: the op does nothing.
 * Plans drop such stages (same rule as Python), so strength 0 bakes an exact identity LUT. */
export function isNeutral(name, params) {
    for (const [key, p] of Object.entries(op(name).params)) {
        const value = key in params ? params[key] : p.neutral;
        if (p.kind === "number" && Number(value) !== Number(p.neutral))
            return false;
        if (p.kind === "points" && !value.every(([x, y]) => Math.abs(x - y) < 1e-15))
            return false;
        if (p.kind === "matrix" && !value.every((row, i) => row.every((x, j) => x === IDENTITY3[i][j])))
            return false;
        if (p.kind === "bands" && Object.values(value).some((e) => e.hue !== 0 || e.chroma !== 0 || e.light !== 0))
            return false;
    }
    return true;
}
/** The missing-mask fallback version of one stage's params, or null to drop the stage. */
export function withoutSkinHue(name, params) {
    if (name === "colour.hsl") {
        const bands = {};
        for (const [band, e] of Object.entries(params.bands)) {
            bands[band] = SKIN_BANDS.includes(band) ? { ...e, hue: 0 } : { ...e };
        }
        return { ...params, bands };
    }
    return op(name).skinHue ? null : { ...params };
}
/** Run one colour op over every triple of `rgb` in place (each pixel clipped to [0, 1]). */
export function runOp(name, rgb, params) {
    const spec = op(name);
    if (spec.family !== "colour" || !spec.pixel)
        throw new RangeError(`${name} is not a pointwise colour op`);
    const scratch = new Float64Array(3);
    for (let i = 0; i < rgb.length; i += 3) {
        rgb[i] = clamp01(rgb[i]);
        rgb[i + 1] = clamp01(rgb[i + 1]);
        rgb[i + 2] = clamp01(rgb[i + 2]);
        spec.pixel(rgb, i, params, scratch);
        rgb[i] = clamp01(rgb[i]);
        rgb[i + 1] = clamp01(rgb[i + 1]);
        rgb[i + 2] = clamp01(rgb[i + 2]);
    }
    return rgb;
}
export const linearToOklabPixel = linearToOklab;
