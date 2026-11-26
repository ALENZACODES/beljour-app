/** LS5 fibre strands: Poisson-disk seeds on visible scalp, structure-tensor direction,
 * anti-aliased curved fibres drawn until the scalp share is cut by the target
 * (Light / Medium / Full = 30 / 55 / 80%), plus spray and powder as smoother renders.
 * Mirrors api/plumb_api/engines/concealer/strands.py (parity/spikes-r7.json).
 * Inspiration: MediaPipe Hair Segmenter (hair masks, runtime data), Bridson Poisson-disk
 * sampling (dart throwing with a minimum distance) and the structure tensor orientation
 * of Bigun and Granlund (local strand direction); concept only, no code copied.
 * Hair fibre simulation on this photo, a photo-based estimate, not a diagnosis.
 * Author: John Khan.
 */
import { decode, encode, floatImage, requireColour, requireMask } from "../core/buffer.js";
import { ciede2000 } from "../core/colour.js";
import { boxMean, gradient } from "../core/filters.js";
import { feather } from "../core/mask.js";
import { XorShift32 } from "../fill/patchmatch.js";
import { labOfLinear, labPlanes, linearOf, valueNoise } from "./fibre.js";
import { validateLevel } from "../../commerce/strength.js";
export const VERSION = "fibre-spike-r7/1";
export const LABEL = "Hair fibre simulation on this photo. A photo-based estimate, not a diagnosis.";
export const LEVELS = { light: 37.5, medium: 68.75, full: 100 };
export const MAX_CUT = 0.8;
export const PRODUCTS = ["fibres", "spray", "powder"];
export const LENGTH_PX = [4, 14], WIDTH_PX = [1, 2];
export const ANGLE_JITTER_DEGREES = 12, BEND = 0.15, ROOT_SHARE = 0.3, ROOT_DARKEN = 3, TIP_FADE = 0.35;
export const TENSOR_SPAN = 18;
export const SHADING = 0.25, SHADING_LIMIT = 6, COHERENT = 0.2, MIN_SCALE = 0.5, FEATHER_SHARE = 0.02;
export const MAX_FIBRES = 80000, OVERLAP = 0.55;
export const OPACITY = { fibres: 1, spray: 0.95, powder: 0.85 };
/** Product fibre control in tenths; the legacy 0..100 renderer remains available. */
export function cutForLevel(level) {
    return cutFor((validateLevel(level) - 1) * 25);
}
export function cutFor(amount) {
    const value = typeof amount === "string" ? LEVELS[amount] : amount;
    if (typeof amount === "string" && !(amount in LEVELS))
        throw new RangeError(`level must be one of ${Object.keys(LEVELS).join(", ")}`);
    if (!(Number.isFinite(value) && value >= 0 && value <= 100))
        throw new RangeError("amount must be 0..100");
    return MAX_CUT * value / 100;
}
const plane = (w, h, data) => ({ width: w, height: h, channels: 1, data });
export function orientation(img, hair, radius = 6) {
    const w = img.width, h = img.height, n = w * h, lab = labPlanes(img);
    const [gx, gy] = gradient(plane(w, h, lab.L));
    const xx = new Float64Array(n), xy = new Float64Array(n), yy = new Float64Array(n), m = new Float64Array(n);
    let sxx = 0, sxy = 0, syy = 0;
    for (let i = 0; i < n; i++) {
        m[i] = hair[i] ? 1 : 0;
        xx[i] = m[i] * gx.data[i] * gx.data[i];
        xy[i] = m[i] * gx.data[i] * gy.data[i];
        yy[i] = m[i] * gy.data[i] * gy.data[i];
        sxx += xx[i];
        sxy += xy[i];
        syy += yy[i];
    }
    const jxx = boxMean(plane(w, h, xx), radius).data, jxy = boxMean(plane(w, h, xy), radius).data;
    const jyy = boxMean(plane(w, h, yy), radius).data, weight = boxMean(plane(w, h, m), radius).data;
    const theta = new Float64Array(n), coherence = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        const trace = jxx[i] + jyy[i];
        theta[i] = 0.5 * Math.atan2(2 * jxy[i], jxx[i] - jyy[i]) + Math.PI / 2;
        coherence[i] = trace > 1e-12 && weight[i] > 0.05 ? Math.sqrt((jxx[i] - jyy[i]) ** 2 + 4 * jxy[i] * jxy[i]) / Math.max(trace, 1e-12) : 0;
    }
    return { theta, coherence, dominant: 0.5 * Math.atan2(2 * sxy, sxx - syy) + Math.PI / 2 };
}
/** Dart throwing on candidates in an xorshift32-shuffled order at sub-pixel spots (same draws as Python). */
export function poissonSeeds(candidates, width, height, weights, radius, limit, rng) {
    const order = [];
    for (let i = 0; i < width * height; i++)
        if (candidates[i])
            order.push(i);
    for (let i = order.length - 1; i > 0; i--) {
        const j = rng.below(i + 1);
        const t = order[i];
        order[i] = order[j];
        order[j] = t;
    }
    const cell = Math.max(radius, 1), cols = Math.floor(width / cell) + 1, rows = Math.floor(height / cell) + 1;
    const grid = new Map(), r2 = radius * radius, kept = [];
    for (const idx of order) {
        if (kept.length >= limit)
            break;
        const threshold = Math.floor(weights[idx] * 1000 + 1e-9);
        if (rng.below(1000) >= threshold)
            continue;
        const x = idx % width + (rng.below(1000) + 0.5) / 1000;
        const y = Math.floor(idx / width) + (rng.below(1000) + 0.5) / 1000;
        const gx = Math.floor(x / cell), gy = Math.floor(y / cell);
        let clash = false;
        for (let cy = Math.max(0, gy - 1); cy < Math.min(rows, gy + 2) && !clash; cy++) {
            for (let cx = Math.max(0, gx - 1); cx < Math.min(cols, gx + 2) && !clash; cx++) {
                for (const [px, py] of grid.get(cy * cols + cx) ?? [])
                    if ((px - x) ** 2 + (py - y) ** 2 < r2) {
                        clash = true;
                        break;
                    }
            }
        }
        if (clash)
            continue;
        const key = gy * cols + gx;
        const list = grid.get(key);
        if (list)
            list.push([x, y]);
        else
            grid.set(key, [[x, y]]);
        kept.push([x, y]);
    }
    return kept;
}
export const scaleOf = (width, height) => Math.max(MIN_SCALE, Math.max(width, height) / 1024);
export function buildFibres(seeds, orient, width, shade, lightness, scale, rng) {
    if (!seeds.length)
        return [];
    const local = seeds.map(([x, y]) => lightness[Math.floor(y) * width + Math.floor(x)]);
    const reference = local.reduce((s, v) => s + v, 0) / local.length, jitter = ANGLE_JITTER_DEGREES * Math.PI / 180;
    return seeds.map(([x, y], k) => {
        const i = Math.floor(y) * width + Math.floor(x);
        let t = orient.coherence[i] >= COHERENT ? orient.theta[i] : orient.dominant;
        if (Math.cos(t - orient.dominant) < 0)
            t += Math.PI;
        const phi = t + (rng.below(2001) - 1000) / 1000 * jitter;
        const length = (LENGTH_PX[0] + (LENGTH_PX[1] - LENGTH_PX[0]) * rng.below(10001) / 10000) * scale;
        const fw = WIDTH_PX[0] + (WIDTH_PX[1] - WIDTH_PX[0]) * rng.below(10001) / 10000;
        const bend = (rng.below(2001) - 1000) / 1000 * BEND;
        const hue = rng.below(3600) / 10 * Math.PI / 180;
        const size = 1 + 2 * rng.below(10001) / 10000;
        const dl = (rng.below(2001) - 1000) / 1000 * 0.5;
        const shading = Math.max(-SHADING_LIMIT, Math.min(SHADING_LIMIT, SHADING * (local[k] - reference)));
        const body = [shade[0] + dl * size + shading, shade[1] + size * Math.cos(hue), shade[2] + size * Math.sin(hue)];
        const root = [body[0] - ROOT_DARKEN, body[1], body[2]];
        const dx = Math.cos(phi), dy = Math.sin(phi), x0 = x, y0 = y;
        const x2 = x0 + dx * length, y2 = y0 + dy * length;
        const x1 = x0 + dx * length / 2 - dy * bend * length, y1 = y0 + dy * length / 2 + dx * bend * length;
        const points = [];
        for (let s4 = 0; s4 < 5; s4++) {
            const s = s4 / 4, a = (1 - s) * (1 - s), b = 2 * (1 - s) * s, c = s * s;
            points.push([a * x0 + b * x1 + c * x2, a * y0 + b * y1 + c * y2]);
        }
        return { points, width: fw, body: linearOf(body), root: linearOf(root) };
    });
}
const copyCanvas = (c) => ({ ...c, alpha: Float64Array.from(c.alpha), colour: Float64Array.from(c.colour), totals: [...c.totals] });
export function drawFibre(canvas, f, withColour = true) {
    const { width: w, height: h } = canvas, xs = f.points.map((p) => p[0]), ys = f.points.map((p) => p[1]), pad = f.width / 2 + 1;
    const left = Math.max(0, Math.floor(Math.min(...xs) - pad)), right = Math.min(w, Math.ceil(Math.max(...xs) + pad) + 1);
    const top = Math.max(0, Math.floor(Math.min(...ys) - pad)), bottom = Math.min(h, Math.ceil(Math.max(...ys) + pad) + 1);
    for (let y = top; y < bottom; y++)
        for (let x = left; x < right; x++) {
            const px = x + 0.5, py = y + 0.5;
            let best = Infinity, along = 0;
            for (let k = 0; k < 4; k++) {
                const [ax, ay] = f.points[k], dx = f.points[k + 1][0] - ax, dy = f.points[k + 1][1] - ay, length2 = dx * dx + dy * dy;
                const t = length2 > 0 ? Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / length2)) : 0;
                const ex = px - (ax + t * dx), ey = py - (ay + t * dy), d = Math.sqrt(ex * ex + ey * ey);
                if (d < best) {
                    best = d;
                    along = (k + t) / 4;
                }
            }
            const i = y * w + x;
            const a = Math.min(1, Math.max(0, f.width / 2 + 0.5 - best)) * (1 - TIP_FADE * along) * canvas.zone[i];
            const old = canvas.alpha[i], next = old + a * (1 - old);
            if (canvas.target[i] && old < 0.5 && next >= 0.5)
                canvas.covered++;
            canvas.alpha[i] = next;
            if (withColour) {
                const mix = Math.max(0, 1 - along / ROOT_SHARE);
                for (let c = 0; c < 3; c++) {
                    const col = f.body[c] + (f.root[c] - f.body[c]) * mix;
                    canvas.colour[i * 3 + c] = canvas.colour[i * 3 + c] * (1 - a) + col * a;
                    canvas.totals[c] += col * a;
                }
                canvas.weight += a;
            }
        }
}
export function coveredAfterBlur(canvas, radius) {
    const blurred = boxMean(plane(canvas.width, canvas.height, canvas.alpha), radius).data, soft = new Float64Array(blurred.length);
    let covered = 0;
    for (let i = 0; i < soft.length; i++) {
        soft[i] = blurred[i] * canvas.zone[i];
        if (canvas.target[i] && soft[i] >= 0.5)
            covered++;
    }
    return { covered, soft };
}
function smoothSearch(canvas, fibres, target, blurR, batch) {
    let k = 0;
    while (k < fibres.length) {
        const snap = copyCanvas(canvas), start = k;
        for (const f of fibres.slice(k, k + batch))
            drawFibre(canvas, f, false);
        k = Math.min(fibres.length, k + batch);
        if (coveredAfterBlur(canvas, blurR).covered >= target) {
            let lo = start, hi = k;
            while (hi - lo > 1) {
                const mid = Math.floor((lo + hi) / 2), trial = copyCanvas(snap);
                for (const f of fibres.slice(start, mid))
                    drawFibre(trial, f, false);
                if (coveredAfterBlur(trial, blurR).covered >= target)
                    hi = mid;
                else
                    lo = mid;
            }
            const final = copyCanvas(snap);
            for (const f of fibres.slice(start, hi))
                drawFibre(final, f, false);
            return { used: hi, reached: true, canvas: final };
        }
    }
    return { used: fibres.length, reached: false, canvas };
}
export function renderFibres(img, zone, scalp, shade, options = {}) {
    const now = options.now ?? (() => (globalThis.performance ? performance.now() : Date.now()));
    const started = now();
    requireColour(img);
    const product = options.product ?? "fibres", seed = options.seed ?? 7;
    if (!PRODUCTS.includes(product))
        throw new RangeError(`product must be one of ${PRODUCTS.join(", ")}`);
    if (!(shade.length === 3 && shade.every(Number.isFinite)))
        throw new RangeError("shade must be a finite Lab triple");
    const w = img.width, h = img.height, n = w * h, cut = cutFor(options.amount ?? "medium");
    requireMask(zone, w, h);
    const hard = floatImage(w, h, 1);
    let any = false;
    for (let i = 0; i < n; i++)
        if (zone.data[i] >= 0.5) {
            hard.data[i] = 1;
            any = true;
        }
    if (!any)
        throw new RangeError("the zone is empty");
    const scale = scaleOf(w, h), featherPx = Math.max(2, FEATHER_SHARE * Math.max(w, h));
    const weightMask = feather(hard, featherPx, "inside"), weight = Float64Array.from(weightMask.data);
    const seedsOn = new Uint8Array(n), scalpOn = new Uint8Array(n), hairOn = new Uint8Array(n);
    let zonePx = 0, scalpPx = 0;
    for (let i = 0; i < n; i++) {
        const inZone = hard.data[i] > 0, core = weight[i] >= 0.5;
        seedsOn[i] = scalp[i] && inZone ? 1 : 0;
        scalpOn[i] = seedsOn[i] && core ? 1 : 0;
        hairOn[i] = options.hair ? (options.hair[i] ? 1 : 0) : (inZone && !seedsOn[i] ? 1 : 0);
        if (core)
            zonePx++;
        if (scalpOn[i])
            scalpPx++;
    }
    if (!zonePx)
        throw new RangeError("the zone is too small for its feather");
    const target = Math.ceil(scalpPx * cut - 1e-9);
    let canvas = { width: w, height: h, alpha: new Float64Array(n), colour: new Float64Array(n * 3), zone: weight, target: scalpOn, covered: 0, weight: 0, totals: [0, 0, 0] };
    let used = 0, reached = target === 0;
    const blurR = Math.max(1, Math.round(2 * scale));
    if (target > 0) {
        const rng = new XorShift32(seed), orient = orientation(img, hairOn, Math.max(6, Math.round(TENSOR_SPAN * scale))), lab = labPlanes(img);
        const lightness = boxMean(plane(w, h, lab.L), Math.max(2, Math.round(4 * scale))).data;
        const meanArea = (LENGTH_PX[0] + LENGTH_PX[1]) / 2 * scale * (WIDTH_PX[0] + WIDTH_PX[1]) / 2;
        const estimate = Math.ceil(target / (meanArea * OVERLAP)), limit = Math.min(MAX_FIBRES, 6 * estimate + 100);
        const radius = Math.max(1, 0.7 * Math.sqrt(scalpPx / limit));
        const seeds = poissonSeeds(seedsOn, w, h, weight, radius, limit, rng);
        const fibres = buildFibres(seeds, orient, w, shade, lightness, scale, rng);
        if (product === "fibres") {
            for (const f of fibres) {
                drawFibre(canvas, f);
                used++;
                if (canvas.covered >= target) {
                    reached = true;
                    break;
                }
            }
        }
        else {
            const res = smoothSearch(canvas, fibres, target, blurR, Math.max(16, Math.floor(estimate / 24)));
            used = res.used;
            reached = res.reached;
            canvas = res.canvas;
        }
    }
    const base = decode(img), outLin = floatImage(w, h, 3, true);
    let labMean, covered, alpha = canvas.alpha;
    if (product === "fibres") {
        for (let i = 0; i < n; i++)
            for (let c = 0; c < 3; c++)
                outLin.data[i * 3 + c] = base.data[i * 3 + c] * (1 - alpha[i]) + canvas.colour[i * 3 + c];
        labMean = canvas.weight > 0 ? labOfLinear(canvas.totals.map((t) => t / canvas.weight)) : [...shade];
        covered = canvas.covered;
    }
    else {
        const res = coveredAfterBlur(canvas, blurR);
        covered = res.covered;
        alpha = res.soft.map((v) => v * OPACITY[product]);
        const tint = linearOf(shade), light = linearOf([shade[0] + 1.5, shade[1], shade[2]]), dark = linearOf([shade[0] - 1.5, shade[1], shade[2]]);
        const totals = [0, 0, 0];
        let total = 0;
        for (let y = 0; y < h; y++)
            for (let x = 0; x < w; x++) {
                const i = y * w + x, mottle = product === "powder" ? valueNoise(x / 2, y / 2, seed) : 0;
                for (let c = 0; c < 3; c++) {
                    const col = product === "powder" ? dark[c] * (1 - mottle) + light[c] * mottle : tint[c];
                    outLin.data[i * 3 + c] = base.data[i * 3 + c] * (1 - alpha[i]) + col * alpha[i];
                    totals[c] += col * alpha[i];
                }
                total += alpha[i];
            }
        labMean = total > 0 ? labOfLinear(totals.map((t) => t / total)) : [...shade];
    }
    const rgb = encode(outLin);
    let image = rgb;
    if (img.channels === 4) {
        image = { width: w, height: h, channels: 4, data: new Uint8Array(n * 4) };
        for (let i = 0; i < n; i++) {
            image.data.set(rgb.data.subarray(i * 3, i * 3 + 3), i * 4);
            image.data[i * 4 + 3] = img.data[i * 4 + 3];
        }
    }
    const editMask = floatImage(w, h, 1);
    for (let i = 0; i < n; i++)
        editMask.data[i] = weight[i] > 0 ? 1 : 0;
    const before = scalpPx / zonePx;
    return { image, alpha, editMask, label: LABEL, metrics: {
            product, cut_target: cut, fibres_used: used, reached, scalp_share_before: before, scalp_share_after: (scalpPx - covered) / zonePx,
            scalp_share_target: before * (1 - cut), covered_px: covered, target_px: target, fibre_lab: labMean,
            fibre_delta_e: ciede2000(labMean, shade), feather_px: featherPx, core_px: zonePx, scale, seconds: (now() - started) / 1000, version: VERSION
        } };
}
//# sourceMappingURL=strands.js.map