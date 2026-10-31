/** W98 Lighting Simulator in the browser: "See this look in: Daylight / Office / Evening".
 * Mirrors api/plumb_api/engines/shade/lighting.py (parity/shade-w6.json): CIE daylight locus,
 * Kim et al. Planckian approximation with a Duv offset, Bradford adaptation, partial eye
 * adaptation and exposure, per-item ΔE shifts and pass/fail for declared pairs. It can fail a
 * look; it never flatters. Colours are three numbers, not spectra, and screens are not
 * calibrated: both limits are stated in every report. Author: John Khan.
 */
import { ciede2000 } from "../core/colour.js";
import { SHADE_DATA } from "./generated/data.js";
import { RGB_TO_XYZ, WHITE, XYZ_TO_RGB, decode, encode, invert3, labToXyz, linearToXyz, matmul, mul, scaleMat, toByte, xyzToLab } from "./colourspace.js";
export const LABEL = "Lighting simulation. Colours are estimates; your screen is not colour-calibrated.";
export const CAVEAT = "Screens are not colour-calibrated, so what you see is an estimate. Shifts are computed from colour "
    + "values, not product spectra, so a product that matches in one light and not in another for spectral "
    + "reasons is not caught here.";
export const VERSION = "lighting-w98/1";
export const BRADFORD = [[0.8951, 0.2664, -0.1614], [-0.7502, 1.7135, 0.0367], [0.0389, -0.0685, 1.0296]];
const BRADFORD_INV = invert3(BRADFORD);
const DATA = SHADE_DATA.lighting;
export function presetIds() { return DATA.presets.map((p) => p.id); }
export function preset(id) {
    const found = DATA.presets.find((p) => p.id === id);
    if (!found)
        throw new RangeError(`unknown lighting preset ${id}`);
    return { ...found };
}
export function planckianXY(cct) {
    if (!Number.isFinite(cct) || cct < 1667 || cct > 25000)
        throw new RangeError("colour temperature must be 1667..25000 K");
    const t = cct;
    const x = t <= 4000
        ? -0.2661239e9 / t ** 3 - 0.2343589e6 / t ** 2 + 0.8776956e3 / t + 0.179910
        : -3.0258469e9 / t ** 3 + 2.1070379e6 / t ** 2 + 0.2226347e3 / t + 0.240390;
    let y;
    if (t <= 2222)
        y = -1.1063814 * x ** 3 - 1.34811020 * x ** 2 + 2.18555832 * x - 0.20219683;
    else if (t <= 4000)
        y = -0.9549476 * x ** 3 - 1.37418593 * x ** 2 + 2.09137015 * x - 0.16748867;
    else
        y = 3.0817580 * x ** 3 - 5.87338670 * x ** 2 + 3.75112997 * x - 0.37001483;
    return [x, y];
}
export function daylightXY(cct) {
    if (!Number.isFinite(cct) || cct < 4000 || cct > 25000)
        throw new RangeError("daylight colour temperature must be 4000..25000 K");
    const t = cct;
    const x = t <= 7000
        ? -4.6070e9 / t ** 3 + 2.9678e6 / t ** 2 + 0.09911e3 / t + 0.244063
        : -2.0064e9 / t ** 3 + 1.9018e6 / t ** 2 + 0.24748e3 / t + 0.237040;
    return [x, -3.0 * x * x + 2.870 * x - 0.275];
}
const toUV = (x, y) => { const d = -2 * x + 12 * y + 3; return [4 * x / d, 6 * y / d]; };
const toXY = (u, v) => { const d = 2 * u - 8 * v + 4; return [3 * u / d, 2 * v / d]; };
export function withDuv(cct, duv) {
    if (!Number.isFinite(duv) || Math.abs(duv) > 0.02)
        throw new RangeError("Duv must be within +/-0.02");
    const [x, y] = planckianXY(cct);
    if (duv === 0)
        return [x, y];
    const [u0, v0] = toUV(...planckianXY(Math.max(1667, cct - 1)));
    const [u1, v1] = toUV(...planckianXY(Math.min(25000, cct + 1)));
    const tu = u1 - u0, tv = v1 - v0, norm = Math.hypot(tu, tv);
    let nu = tv / norm, nv = -tu / norm;
    if (nv < 0) {
        nu = -nu;
        nv = -nv;
    }
    const [u, v] = toUV(x, y);
    return toXY(u + duv * nu, v + duv * nv);
}
export function xyToWhite(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || y <= 0)
        throw new RangeError("invalid chromaticity");
    return [x / y, 1, (1 - x - y) / y];
}
export function presetWhite(p) {
    if (p.locus === "d65")
        return [...WHITE];
    if (p.locus === "daylight")
        return xyToWhite(...daylightXY(p.cct));
    if (p.locus === "planckian")
        return xyToWhite(...withDuv(p.cct, p.duv));
    throw new RangeError(`unknown locus ${p.locus}`);
}
export function bradford(source, target, degree = 1) {
    if (!Number.isFinite(degree) || degree < 0 || degree > 1)
        throw new RangeError("adaptation degree must be in 0..1");
    const src = mul(BRADFORD, source), dst = mul(BRADFORD, target);
    if (src.some((v) => Math.abs(v) < 1e-9))
        throw new RangeError("source white is degenerate");
    const gain = [0, 1, 2].map((i) => degree * dst[i] / src[i] + (1 - degree));
    const diag = [[gain[0], 0, 0], [0, gain[1], 0], [0, 0, gain[2]]];
    return matmul(matmul(BRADFORD_INV, diag), BRADFORD);
}
export function estimateWhite(pixels) {
    if (pixels.length < 12)
        return null;
    const lin = [0, 0, 0];
    for (const p of pixels)
        for (let c = 0; c < 3; c++)
            lin[c] += decode(p[c]);
    for (let c = 0; c < 3; c++)
        lin[c] /= pixels.length;
    if (Math.min(...lin) <= 1e-6)
        return null;
    const xyz = linearToXyz(lin);
    return [xyz[0] / xyz[1], 1, xyz[2] / xyz[1]];
}
export function neutraliseLab(lab, sceneWhite) {
    if (!sceneWhite)
        return [lab[0], lab[1], lab[2]];
    return xyzToLab(mul(bradford(sceneWhite, WHITE, 1), labToXyz(lab)));
}
export function appearanceMatrix(p) {
    if (p.adaptation < 0 || p.adaptation > 1 || p.intensity <= 0 || p.intensity > 4) {
        throw new RangeError("preset adaptation must be 0..1 and intensity 0..4");
    }
    const scale = p.intensity ** (1 - DATA.exposure_compensation);
    return scaleMat(bradford(WHITE, presetWhite(p), 1 - p.adaptation), scale);
}
export function relightLab(lab, presetId) {
    return xyzToLab(mul(appearanceMatrix(preset(presetId)), labToXyz(lab)));
}
/** Whole-photo preview in linear light; alpha is copied untouched. */
export function relightImage(image, presetId, sceneWhite = null) {
    if (image.channels !== 3 && image.channels !== 4)
        throw new RangeError("lighting preview needs an RGB or RGBA photo");
    let m = appearanceMatrix(preset(presetId));
    if (sceneWhite)
        m = matmul(m, bradford(sceneWhite, WHITE, 1));
    const rgbM = matmul(matmul(XYZ_TO_RGB, m), RGB_TO_XYZ);
    const out = new Uint8ClampedArray(image.data.length);
    for (let i = 0; i < image.width * image.height; i++) {
        const o = i * image.channels;
        const lin = mul(rgbM, [decode(image.data[o]), decode(image.data[o + 1]), decode(image.data[o + 2])]);
        for (let c = 0; c < 3; c++)
            out[o + c] = toByte(encode(lin[c]));
        if (image.channels === 4)
            out[o + 3] = image.data[o + 3];
    }
    return out;
}
const r4 = (v) => Math.round(v * 1e4) / 1e4;
export function simulateLook(items, pairs = [], presets = DATA.shown_first, sceneWhite = null) {
    const names = Object.keys(items);
    if (!names.length)
        throw new RangeError("a look needs at least one item");
    if (!presets.length)
        throw new RangeError("choose at least one lighting preset");
    presets.forEach((p) => preset(p));
    const rules = DATA.rules;
    const base = {};
    for (const name of names) {
        const lab = items[name];
        if (lab.length !== 3 || !lab.every(Number.isFinite))
            throw new RangeError(`item ${name} needs one finite Lab colour`);
        base[name] = neutraliseLab(lab, sceneWhite);
    }
    const lit = {};
    const outItems = {};
    for (const name of names) {
        const row = { daylight_lab: base[name].map(r4), by_preset: {} };
        for (const pid of presets) {
            const shown = relightLab(base[name], pid);
            (lit[pid] ??= {})[name] = shown;
            const shift = ciede2000(base[name], shown);
            row.by_preset[pid] = { lab: shown.map(r4), shift_delta_e: r4(shift), large_shift: shift > rules.large_shift_delta_e };
        }
        outItems[name] = row;
    }
    const outPairs = [];
    const failures = [];
    for (const pair of pairs) {
        if (!(pair.a in base) || !(pair.b in base) || (pair.kind !== "match" && pair.kind !== "contrast")) {
            throw new RangeError("pairs name two items and a kind of match or contrast");
        }
        const entry = { a: pair.a, b: pair.b, kind: pair.kind, by_preset: {} };
        for (const pid of presets) {
            const de = ciede2000(lit[pid][pair.a], lit[pid][pair.b]);
            const ok = pair.kind === "match" ? de <= rules.match_delta_e_max : de >= rules.contrast_delta_e_min;
            entry.by_preset[pid] = { delta_e: r4(de), passed: ok };
            if (!ok)
                failures.push(`${pair.a} and ${pair.b} ${pair.kind === "match" ? "stop matching" : "lose contrast"} in ${preset(pid).label} (ΔE ${de.toFixed(1)})`);
        }
        outPairs.push(entry);
    }
    const holds = failures.length === 0;
    return { format: "beljour-lighting-w98/1", version: VERSION, label: LABEL, caveat: CAVEAT, presets: [...presets],
        items: outItems, pairs: outPairs, verdict: holds ? "holds in every light shown" : "fails: " + failures.join("; "),
        holds, failures };
}
