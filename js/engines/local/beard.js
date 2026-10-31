/** LS7 local beard strands (plan §7.3 M29, §7.12): stubble, short boxed, moustache with
 * length, density, colour, edge and neckline. Mirrors api/plumb_api/engines/beard/.
 * Inspiration: MediaPipe Face Landmarker (478-point mesh indices, runtime data),
 * face-parsing.PyTorch (a named beard and lip area); concept only,
 * no code copied. Strand drawing reuses the LS5 strand engine (strands.ts).
 * Beard simulation on this photo.
 * Author: John Khan.
 */
import { byteImage, decode, encode, floatImage, requireColour, roundHalfEven } from "../core/buffer.js";
import { ciede2000, hexToLab } from "../core/colour.js";
import { boxMean } from "../core/filters.js";
import { dilate, feather, polygon, subtract, union } from "../core/mask.js";
import { XorShift32 } from "../fill/patchmatch.js";
import { faceFrame } from "../shape/geometry.js";
import { CONTOURS, regionMask } from "../../data/regions/index.js";
import { LANDMARKS } from "../../data/face/generated/anatomy.js";
import { hashNoise } from "../../quality/harness.js";
import { labOfLinear, labPlanes, linearOf } from "./fibre.js";
import { capsule } from "./figures.js";
import { drawFibre, poissonSeeds } from "./strands.js";
export const VERSION = "beard-spike-r7/1";
export const LABEL = "Beard simulation on this photo.";
const OVAL = CONTOURS.face_oval;
export const JAW_START = OVAL.indexOf(323), JAW_END = OVAL.indexOf(93);
export const NECK_START = OVAL.indexOf(288), NECK_END = OVAL.indexOf(58);
export const UPPER_LIP = [291, 409, 270, 269, 267, 0, 37, 39, 40, 185, 61];
export const NECKLINES = { high: 0, natural: 0.18, low: 0.4 };
export const EDGES = { sharp: null, faded: 0.1 };
export const MOUSTACHE_FEATHER = 0.6, MOUSTACHE_TOP = 0.9;
export const CHEEK_SHARE = 0.6, TOP_SHARE = 0.55, NOSE_GAP = 0.05, LIP_MARGIN = 0.05, CORNER_OUT = 0.12;
export const STYLES = {
    stubble: { region: "full", length: [0.008, 0.02], density: 900, width: [0.6, 1.0], shadow: 0.1 },
    short_boxed: { region: "full", length: [0.035, 0.08], density: 600, width: [0.8, 1.3], shadow: 0.04 },
    // Moustache: dense, longer and wider strands with a stronger under-shadow so it reads at the default strength.
    moustache: { region: "moustache", length: [0.07, 0.15], density: 2600, width: [1.0, 1.7], shadow: 0.25 },
};
export const LENGTHS = { 1: 0.6, 2: 0.8, 3: 1.0, 4: 1.25, 5: 1.5 };
export const DENSITIES = [1, 2, 3, 4];
export const OUTWARD = 0.6, JITTER_DEGREES = 14, ROOT_DARKEN = 2, SHADING = 0.2, MAX_STRANDS = 120000;
const add = (a, b, s = 1) => [a[0] + s * b[0], a[1] + s * b[1]];
const lerp = (a, b, t) => [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
export function outline(face, f, region) {
    const { across, down, iod } = f;
    const mouthR = face[LANDMARKS.right_mouth], mouthL = face[LANDMARKS.left_mouth];
    const topR = lerp(mouthR, face[LANDMARKS.right_ala], TOP_SHARE), topL = lerp(mouthL, face[LANDMARKS.left_ala], TOP_SHARE);
    const nose = add(face[LANDMARKS.subnasale], down, NOSE_GAP * iod);
    if (region === "moustache") {
        // A full moustache fills most of the upper lip, up to just under the nose.
        const lip = UPPER_LIP.map((i) => add(face[i], down, -0.015 * iod));
        const mTopR = lerp(mouthR, face[LANDMARKS.right_ala], MOUSTACHE_TOP), mTopL = lerp(mouthL, face[LANDMARKS.left_ala], MOUSTACHE_TOP);
        const mNose = add(face[LANDMARKS.subnasale], down, 0.01 * iod);
        return [add(mouthL, across, 0.05 * iod), ...lip, add(mouthR, across, -0.05 * iod), mTopR, mNose, mTopL];
    }
    if (region !== "full")
        throw new RangeError("region must be full or moustache");
    const jaw = OVAL.slice(JAW_START, JAW_END + 1).map((i) => face[i]);
    return [...jaw, lerp(face[93], mouthR, CHEEK_SHARE), add(mouthR, across, -CORNER_OUT * iod), topR, nose, topL,
        add(mouthL, across, CORNER_OUT * iod), lerp(face[323], mouthL, CHEEK_SHARE)];
}
export function beardArea(face, width, height, { region = "full", neckline = "natural", edge = "faded" } = {}) {
    if (!(neckline in NECKLINES))
        throw new RangeError(`neckline must be one of ${Object.keys(NECKLINES).join(", ")}`);
    if (!(edge in EDGES))
        throw new RangeError(`edge must be one of ${Object.keys(EDGES).join(", ")}`);
    const f = faceFrame(face);
    let hard = polygon(width, height, outline(face, f, region), 4);
    const depth = NECKLINES[neckline] * f.iod;
    if (region === "full" && depth > 0) {
        const jaw = OVAL.slice(NECK_START, NECK_END + 1).map((i) => face[i]);
        hard = union(hard, polygon(width, height, [...jaw, ...[...jaw].reverse().map((p) => add(p, f.down, depth))], 4));
    }
    const lips = polygon(width, height, CONTOURS.lips_outer.map((i) => face[i]), 2);
    hard = subtract(hard, dilate(lips, LIP_MARGIN * f.iod));
    const on = floatImage(width, height, 1);
    let any = false;
    for (let i = 0; i < on.data.length; i++)
        if (hard.data[i] >= 0.5) {
            on.data[i] = 1;
            any = true;
        }
    if (!any)
        throw new RangeError("the beard area is empty for this face");
    let radius = EDGES[edge];
    if (radius !== null && region === "moustache")
        radius *= MOUSTACHE_FEATHER;
    return { hard: on, weight: feather(on, radius === null ? 0.75 : Math.max(1, radius * f.iod), "inside"), frame: f };
}
export function targetLab(colour) {
    if (typeof colour === "string")
        return hexToLab(colour);
    if (colour.length !== 3 || !colour.every(Number.isFinite))
        throw new RangeError("colour must be a hex string or a finite Lab triple");
    return [...colour];
}
export function growth(uNorm, across, down, moustache) {
    const side = uNorm >= 0 ? 1 : -1;
    const v = moustache ? [0.9 * side * across[0] + 0.5 * down[0], 0.9 * side * across[1] + 0.5 * down[1]]
        : [down[0] + OUTWARD * side * Math.min(1, Math.abs(uNorm)) * across[0], down[1] + OUTWARD * side * Math.min(1, Math.abs(uNorm)) * across[1]];
    const n = Math.hypot(v[0], v[1]);
    return [v[0] / n, v[1] / n];
}
export function renderBeard(img, face, options = {}) {
    const now = options.now ?? (() => (globalThis.performance ? performance.now() : Date.now()));
    const started = now();
    requireColour(img);
    const style = options.style ?? "short_boxed", length = options.length ?? 3, density = options.density ?? 4;
    const edge = options.edge ?? "faded", neckline = options.neckline ?? "natural", seed = options.seed ?? 11;
    if (!(style in STYLES))
        throw new RangeError(`style must be one of ${Object.keys(STYLES).join(", ")}`);
    if (!(length in LENGTHS) || !DENSITIES.includes(density))
        throw new RangeError("length must be 1..5 and density 1..4");
    const spec = STYLES[style], target = targetLab(options.colour ?? "#3B2A22"), w = img.width, h = img.height, n = w * h;
    const a = beardArea(face, w, h, { region: spec.region, neckline, edge }), f = a.frame;
    const weight = Float64Array.from(a.weight.data);
    let areaPx = 0;
    for (const v of a.hard.data)
        if (v > 0)
            areaPx++;
    const count = Math.min(MAX_STRANDS, Math.round(spec.density * density / 4 * areaPx / (f.iod * f.iod)));
    const radius = Math.max(0.75, 0.75 * Math.sqrt(areaPx / Math.max(count, 1)));
    const rng = new XorShift32(seed);
    const seeds = poissonSeeds(a.hard.data, w, h, weight, radius, count, rng);
    const lab = labPlanes(img), lightness = boxMean({ width: w, height: h, channels: 1, data: lab.L }, Math.max(1, Math.round(f.iod * 0.05))).data;
    const local = seeds.map(([x, y]) => lightness[Math.floor(y) * w + Math.floor(x)]);
    const reference = local.length ? local.reduce((s, v) => s + v, 0) / local.length : 0;
    const pxScale = Math.min(1.5, Math.max(0.6, f.iod / 180)), [lo, hi] = spec.length, jitter = JITTER_DEGREES * Math.PI / 180;
    const strands = seeds.map(([x, y], k) => {
        const u = (x - f.centre[0]) * f.across[0] + (y - f.centre[1]) * f.across[1];
        const g = growth(u / (f.iod / 2), f.across, f.down, spec.region === "moustache");
        const angle = Math.atan2(g[1], g[0]) + (rng.below(2001) - 1000) / 1000 * jitter;
        const size = (lo + (hi - lo) * rng.below(10001) / 10000) * LENGTHS[length] * f.iod;
        const sw = (spec.width[0] + (spec.width[1] - spec.width[0]) * rng.below(10001) / 10000) * pxScale;
        const bend = (rng.below(2001) - 1000) / 1000 * 0.2, hue = rng.below(3600) / 10 * Math.PI / 180;
        const mag = 1 + 1.5 * rng.below(10001) / 10000, shade = Math.max(-5, Math.min(5, SHADING * (local[k] - reference)));
        const body = [target[0] + shade, target[1] + mag * Math.cos(hue), target[2] + mag * Math.sin(hue)];
        const dx = Math.cos(angle), dy = Math.sin(angle), x0 = x, y0 = y, x2 = x0 + dx * size, y2 = y0 + dy * size;
        const x1 = x0 + dx * size / 2 - dy * bend * size, y1 = y0 + dy * size / 2 + dx * bend * size;
        const points = [];
        for (let s4 = 0; s4 < 5; s4++) {
            const s = s4 / 4, c0 = (1 - s) * (1 - s), c1 = 2 * (1 - s) * s, c2 = s * s;
            points.push([c0 * x0 + c1 * x1 + c2 * x2, c0 * y0 + c1 * y1 + c2 * y2]);
        }
        return { points, width: sw, body: linearOf(body), root: linearOf([body[0] - ROOT_DARKEN, body[1], body[2]]) };
    });
    const canvas = { width: w, height: h, alpha: new Float64Array(n), colour: new Float64Array(n * 3), zone: weight, target: new Uint8Array(n), covered: 0, weight: 0, totals: [0, 0, 0] };
    for (const s of strands)
        drawFibre(canvas, s);
    const base = decode(img), shadow = spec.shadow * density / 4;
    for (let i = 0; i < n; i++) {
        const k = 1 - shadow * weight[i];
        for (let c = 0; c < 3; c++)
            base.data[i * 3 + c] = base.data[i * 3 + c] * k * (1 - canvas.alpha[i]) + canvas.colour[i * 3 + c];
    }
    const rgb = encode(base);
    let image = rgb;
    if (img.channels === 4) {
        image = { width: w, height: h, channels: 4, data: new Uint8Array(n * 4) };
        for (let i = 0; i < n; i++) {
            image.data.set(rgb.data.subarray(i * 3, i * 3 + 3), i * 4);
            image.data[i * 4 + 3] = img.data[i * 4 + 3];
        }
    }
    const meanLab = canvas.weight > 0 ? labOfLinear(canvas.totals.map((t) => t / canvas.weight)) : target;
    let coreSum = 0, coreCount = 0;
    for (let i = 0; i < n; i++)
        if (weight[i] >= 0.5) {
            coreSum += canvas.alpha[i];
            coreCount++;
        }
    return { image, alpha: canvas.alpha, editMask: a.hard, label: LABEL, metrics: { style, length, density, edge, neckline,
            strands: strands.length, area_px: areaPx, iod: f.iod, coverage: coreCount ? coreSum / coreCount : 0, strand_lab: meanLab,
            target_lab: target, strand_delta_e: ciede2000(meanLab, target), shadow, seconds: (now() - started) / 1000, version: VERSION } };
}
// Synthetic clean-shaven face (drawn, no person) ---------------------------------------------
export const SKIN = [198, 156, 132], LIPS = [168, 92, 96], BROWS = [70, 52, 42], EYES = [236, 236, 232];
export const HAIR_LAB = [24, 6, 9];
export function facePhoto(points, width, height, seed = 1) {
    const img = new Float64Array(width * height * 3), noise = hashNoise(seed, width, height), f = faceFrame(points), chin = points[152];
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 3;
            img[i] = 150 + 30 * y / height;
            img[i + 1] = 170 + 20 * x / width;
            img[i + 2] = 190 - 20 * y / height;
        }
    const opts = { normalized: false };
    const layers = [
        [capsule(width, height, chin, [chin[0], height + 10], 0.22 * f.length), SKIN], [regionMask("face_oval", points, width, height, opts), SKIN],
        [regionMask("lips", points, width, height, opts), LIPS], [regionMask("brows", points, width, height, opts), BROWS],
        [regionMask("eyes", points, width, height, opts), EYES],
    ];
    for (const [mask, tone] of layers) {
        for (let i = 0; i < width * height; i++) {
            const m = mask.data[i], keep = Math.fround(1 - m);
            for (let c = 0; c < 3; c++)
                img[i * 3 + c] = img[i * 3 + c] * keep + (tone[c] + 8 * noise[i]) * m;
        }
    }
    const out = byteImage(width, height, 3);
    for (let i = 0; i < img.length; i++)
        out.data[i] = Math.min(255, Math.max(0, roundHalfEven(img[i])));
    return out;
}
