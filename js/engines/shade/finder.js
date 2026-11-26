/** W6 Foundation Shade Finder with true undertone, in the browser.
 * Mirrors api/plumb_api/engines/shade/finder.py step for step (parity/shade-w6.json):
 * landmark skin zones (no colour threshold), lighting gains that keep luminance, trimmed
 * CIELAB medians, hue-angle undertone (olive first-class), ASSUMED depth bands, CIEDE2000
 * nearest shade in our own reference table, never more than 1 L* lighter than measured,
 * and an honest refusal when the reading is weak. Not tested against real products.
 * Author: John Khan.
 */
import { ciede2000 } from "../core/colour.js";
import { regionMask } from "../../data/regions/index.js";
import { DEEP_REFERENCE } from "./deep-reference.js";
import { SHADE_DATA } from "./generated/data.js";
import { auditPatches } from "./reading.js";
import { decode, linearToXyz, luminance, xyzToLab } from "./colourspace.js";
export const LABEL = "Shade estimate from your photo. Not tested against real products.";
export const VERSION = "shade-w6/1";
export const ZONES = ["cheek_right", "cheek_left", "forehead"];
const T = SHADE_DATA.thresholds;
export const NO_WHITE = { gains: [1, 1, 1], mode: "none", clamped: false };
const round = (v, d) => { const s = 10 ** d; return Math.round(v * s) / s; };
const clamp01 = (v) => Math.max(0, Math.min(1, v));
function point(p) {
    return Array.isArray(p) ? [Number(p[0]), Number(p[1])] :
        [Number(p.x), Number(p.y)];
}
/** Cheek discs and a forehead ellipse inside the landmark skin mask, row-major booleans. */
export function zoneMasks(points, width, height) {
    if (points.length < 478)
        throw new RangeError("shade zones need 478 landmark points in pixels");
    if (Math.min(width, height) < 8)
        throw new RangeError("photo is too small to sample skin");
    const pts = points.map(point);
    if (!pts.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))) {
        throw new RangeError("landmarks must be finite");
    }
    const right = pts[468], left = pts[473];
    let across = [left[0] - right[0], left[1] - right[1]];
    const iod = Math.hypot(across[0], across[1]);
    if (!Number.isFinite(iod) || iod < 4)
        throw new RangeError("eyes are too close together to place skin zones");
    across = [across[0] / iod, across[1] / iod];
    let down = [-across[1], across[0]];
    const mouth = [(pts[61][0] + pts[291][0]) / 2, (pts[61][1] + pts[291][1]) / 2];
    const mid = [(right[0] + left[0]) / 2, (right[1] + left[1]) / 2];
    if ((mouth[0] - mid[0]) * down[0] + (mouth[1] - mid[1]) * down[1] < 0)
        down = [-down[0], -down[1]];
    const skin = regionMask("skin", points, width, height, { normalized: false, supersample: 2 });
    const out = { cheek_right: new Uint8Array(width * height), cheek_left: new Uint8Array(width * height),
        forehead: new Uint8Array(width * height) };
    const cheeks = [
        ["cheek_right", pts[468], pts[61], -1], ["cheek_left", pts[473], pts[291], 1]
    ];
    const centres = cheeks.map(([, eye, corner, side]) => [
        eye[0] + 0.5 * (corner[0] - eye[0]) + side * 0.15 * iod * across[0],
        eye[1] + 0.5 * (corner[1] - eye[1]) + side * 0.15 * iod * across[1]
    ]);
    const brows = SHADE_DATA.brows;
    let bx = 0, by = 0;
    for (const i of brows) {
        bx += pts[i][0];
        by += pts[i][1];
    }
    const fc = [bx / brows.length - 0.35 * iod * down[0], by / brows.length - 0.35 * iod * down[1]];
    const r2 = (0.22 * iod) ** 2;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = y * width + x;
            if (!(skin.data[i] >= 0.5))
                continue;
            for (let k = 0; k < 2; k++) {
                if ((x - centres[k][0]) ** 2 + (y - centres[k][1]) ** 2 <= r2)
                    out[cheeks[k][0]][i] = 1;
            }
            const du = (x - fc[0]) * across[0] + (y - fc[1]) * across[1];
            const dv = (x - fc[0]) * down[0] + (y - fc[1]) * down[1];
            if ((du / (0.4 * iod)) ** 2 + (dv / (0.18 * iod)) ** 2 <= 1)
                out.forehead[i] = 1;
        }
    }
    return out;
}
export function whiteFromPixels(pixels, mode) {
    if (pixels.length < T.minimum_zone_pixels)
        return NO_WHITE;
    const est = [0, 0, 0];
    for (const p of pixels)
        for (let c = 0; c < 3; c++)
            est[c] += decode(p[c]);
    for (let c = 0; c < 3; c++)
        est[c] /= pixels.length;
    if (Math.min(...est) <= 1e-6)
        return NO_WHITE;
    const y = luminance(est);
    const [lo, hi] = T.gain_limits;
    const raw = est.map((v) => y / v);
    const gains = raw.map((v) => Math.min(hi, Math.max(lo, v)));
    return { gains, mode, clamped: gains.some((g, i) => g !== raw[i]) };
}
export function pixelsToLab(pixels, white) {
    return pixels.map((p) => xyzToLab(linearToXyz([0, 1, 2].map((c) => Math.min(1, Math.max(0, decode(p[c]) * white.gains[c]))))));
}
function median(values) {
    const s = [...values].sort((a, b) => a - b);
    const n = s.length, mid = Math.floor(n / 2);
    return n % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
/** Median Lab after trimming the lightest and darkest share by L*, the MAD of L*, kept count. */
export function trimmedStats(lab) {
    const n = lab.length;
    if (n === 0)
        throw new RangeError("no pixels to measure");
    const order = lab.map((v, i) => [v[0], i]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(([, i]) => i);
    const k = Math.floor(n * T.trim_share);
    const keptIdx = n - 2 * k > 0 ? order.slice(k, n - k) : order;
    const kept = keptIdx.map((i) => lab[i]);
    const med = [0, 1, 2].map((c) => median(kept.map((v) => v[c])));
    return { median: med, mad: median(kept.map((v) => Math.abs(v[0] - med[0]))), kept: kept.length };
}
/** Three finite Lab numbers, or RangeError (the same refusal as the Python twin). */
function labTriple(lab) {
    if (!Array.isArray(lab) || lab.length !== 3 || !lab.every((v) => typeof v === "number" && Number.isFinite(v))) {
        throw new RangeError("expected a finite Lab triple");
    }
    const [L, a, b] = lab;
    if (!(L >= 0 && L <= 100) || Math.abs(a) > 200 || Math.abs(b) > 200) {
        throw new RangeError("Lab out of range: L* 0 to 100, a* and b* within 200");
    }
    return [L, a, b];
}
export function undertoneOf(lab) {
    const [, a, b] = labTriple(lab);
    const hue = ((Math.atan2(b, a) * 180 / Math.PI) % 360 + 360) % 360;
    const chroma = Math.hypot(a, b);
    const h = T.undertone_hue_degrees;
    let name;
    if (hue > 180 || hue < h.cool_below)
        name = "cool";
    else if (hue < h.neutral_below)
        name = "neutral";
    else if (hue < h.warm_below)
        name = "warm";
    else
        name = "olive";
    return { undertone: name, hue_angle: hue, chroma, low_chroma: chroma < T.low_chroma };
}
export function depthBand(lightness) {
    if (!Number.isFinite(lightness))
        throw new RangeError("lightness must be finite");
    const edges = T.depth_band_lower_edges;
    for (let i = 0; i < edges.length; i++)
        if (lightness >= edges[i])
            return i + 1;
    return 10;
}
export function matchShades(lab, table = SHADE_DATA.shades) {
    lab = labTriple(lab);
    const out = [];
    for (const row of table) {
        const lighterBy = row.lab[0] - lab[0];
        if (lighterBy > T.never_lighter_allowance)
            continue;
        out.push({ id: row.id, name: row.name, lab: [...row.lab], undertone: row.undertone, depth: row.depth,
            delta_e: ciede2000(lab, row.lab), lighter_by: lighterBy });
    }
    return out.sort((a, b) => a.delta_e - b.delta_e || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
function result(partial) {
    return { format: "beljour-shade-w6/1", version: VERSION, label: LABEL, reason: null, measured_lab: null,
        undertone: null, depth_band: null, depth_band_note: "ASSUMED bands from L*, not a Monk label",
        confidence: { overall: 0 }, best: null, alternative: null, test_plan: null, never_lighter: true,
        tested_against_real_products: false, notes: [], ...partial };
}
function refuse(reason, white, zones, confidence, lab, notes = []) {
    return result({ refused: true, reason, white, zones, confidence: confidence ?? { overall: 0 }, notes,
        measured_lab: lab ? [...lab] : null, undertone: lab ? undertoneOf(lab) : null,
        depth_band: lab ? depthBand(lab[0]) : null });
}
export function findFromPixels(zoneRgb, white = NO_WHITE, table = SHADE_DATA.shades) {
    const C = T.confidence;
    const zones = {};
    const labs = [], medians = [];
    for (const name of ZONES) {
        const pixels = zoneRgb[name] ?? [];
        if (pixels.length < T.minimum_zone_pixels) {
            zones[name] = { pixels: pixels.length, lab: null };
            continue;
        }
        const lab = pixelsToLab(pixels, white);
        const med = trimmedStats(lab).median;
        zones[name] = { pixels: pixels.length, lab: med.map((v) => round(v, 4)) };
        labs.push(lab);
        medians.push(med);
    }
    if (medians.length < 2)
        return refuse("not enough visible skin in the cheek and forehead zones", white, zones);
    const all = labs.flat();
    const { median: med, mad } = trimmedStats(all);
    let spread = 0;
    for (let i = 0; i < medians.length; i++) {
        for (let j = i + 1; j < medians.length; j++) {
            spread = Math.max(spread, ciede2000(medians[i], medians[j]));
        }
    }
    const parts = {
        pixels: clamp01(all.length / C.pixels_for_full),
        spread: clamp01(1 - (mad - C.spread_mad_ok) / C.spread_mad_span),
        zones_agree: clamp01(1 - (spread - C.zone_delta_e_ok) / C.zone_delta_e_span),
        lighting: white.clamped ? C.white_clamped : white.mode === "neutral" ? C.white_neutral
            : white.mode === "grey_world" ? C.white_grey_world : C.white_none,
    };
    const notes = [];
    const tone = undertoneOf(med);
    if (tone.low_chroma) {
        notes.push("Very low colour in the skin reading; the undertone is uncertain.");
        parts.undertone = 0.7;
    }
    if (white.mode === "none")
        notes.push("No neutral reference or background was given, so lighting was not corrected.");
    const candidates = matchShades(med, table);
    if (!candidates.length) {
        return refuse("no shade in our reference table is deep enough; we will not suggest a lighter one", white, zones, { ...parts, overall: 0 }, med, notes);
    }
    const best = candidates[0];
    parts.match = clamp01(1 - (best.delta_e - C.match_delta_e_ok) / C.match_delta_e_span);
    const scores = Object.values(parts);
    const geometric = scores.length && scores.every((value) => value > 0)
        ? Math.exp(scores.reduce((sum, value) => sum + Math.log(value), 0) / scores.length)
        : 0;
    const overall = Math.min(geometric, parts.pixels, parts.spread, parts.zones_agree, parts.match);
    const confidence = { ...parts, overall };
    if (best.delta_e > C.refuse_delta_e_above) {
        return refuse("the closest reference shade is too far from your skin reading", white, zones, confidence, med, notes);
    }
    if (overall < C.refuse_below) {
        return refuse("the reading is not reliable enough to name a shade; try even daylight and a plain background", white, zones, confidence, med, notes);
    }
    const alternative = candidates.length > 1 ? candidates[1] : null;
    const plan = alternative
        ? `Swatch ${best.name} and ${alternative.name} side by side on the jawline. ` +
            `Check them in daylight after 15 minutes; the one that disappears is your shade.`
        : `Swatch ${best.name} on the jawline and check it in daylight after 15 minutes.`;
    return result({ refused: false, white, zones, measured_lab: [...med], undertone: tone, depth_band: depthBand(med[0]),
        confidence, best, alternative, test_plan: plan, notes });
}
function maskPixels(image, mask) {
    const out = [];
    for (let i = 0; i < image.width * image.height; i++) {
        if (mask[i] >= 0.5) {
            out.push([image.data[i * image.channels], image.data[i * image.channels + 1],
                image.data[i * image.channels + 2]]);
        }
    }
    return out;
}
export function whiteBalance(image, options = {}) {
    for (const [mask, mode] of [[options.neutralMask, "neutral"], [options.backgroundMask, "grey_world"]]) {
        if (!mask)
            continue;
        if (mask.length !== image.width * image.height)
            throw new RangeError(`${mode} mask must match the photo size`);
        const found = whiteFromPixels(maskPixels(image, mask), mode);
        if (found.mode !== "none")
            return found;
    }
    return NO_WHITE;
}
/** W6 on one photo (RGB or RGBA bytes) with its 478 landmarks in pixel coordinates. */
export function findShade(image, points, options = {}) {
    if (image.channels !== 3 && image.channels !== 4)
        throw new RangeError("shade finder needs an RGB or RGBA photo");
    if (image.data.length !== image.width * image.height * image.channels) {
        throw new RangeError("photo data does not match its size");
    }
    const zones = zoneMasks(points, image.width, image.height);
    const white = whiteBalance(image, options);
    const zoneRgb = {};
    for (const name of ZONES)
        zoneRgb[name] = maskPixels(image, zones[name]);
    return findFromPixels(zoneRgb, white, options.table);
}
/** Strict cheek-first reader. The legacy parity reader stays available separately. */
export function findReliableShade(image, points, options = {}) {
    if (image.channels !== 3 && image.channels !== 4)
        throw RangeError("Shade finder needs RGB or RGBA.");
    if (image.data.length !== image.width * image.height * image.channels) {
        throw RangeError("Photo byte size is invalid.");
    }
    const zones = zoneMasks(points, image.width, image.height);
    const white = whiteBalance(image, options);
    const C = T.confidence;
    const { samples, audit } = auditPatches(image, zones, white.gains, white.mode, T.minimum_zone_pixels, C.zone_delta_e_ok + C.zone_delta_e_span);
    const table = options.table ?? [...SHADE_DATA.shades, ...DEEP_REFERENCE];
    const found = findFromPixels(samples, white, table);
    if (audit.usable)
        return { result: found, audit };
    const result = { ...found, refused: true, reason: audit.note, best: null,
        alternative: null, test_plan: null, confidence: { ...found.confidence, overall: 0 },
        notes: [...found.notes, `Lighting audit: ${audit.reason}.`] };
    return { result, audit };
}
//# sourceMappingURL=finder.js.map