/**
 * Teeth whitening v3: ratio lift on a soft enamel mask, translucency found per arch.
 * Keeps from round 1's relightEnamel: the anatomical selector (findEnamel), specular guard, b* reduced
 * proportionally (never toward a constant), the selection feather. Changes:
 *  - translucency: round 1 marks the bottom 31% of the WHOLE mouth's teeth rows as "tips"; with both
 *    arches showing, that is the lower teeth's bodies (and the lower incisal edges, at the top of the
 *    lower arch, are missed). Here each column is split into upper/lower runs and each run's own incisal
 *    edge (bottom of upper, top of lower) is used, gated by low chroma / relatively blue enamel;
 *  - lift is a GAIN on linear luminance (shading ratios gum->tip and tooth->tooth are kept), chosen so the
 *    75th-percentile L* reaches its target; round 1 adds the same L* everywhere (contrast kept in L*
 *    units, but dark interproximal shading is lifted as much as bright enamel);
 *  - speckle holes inside teeth (pixels findEnamel rejected) are closed, so no unlifted dots remain;
 *  - render-time numbers: shading range ratio, translucency contrast kept, max L*, b* floor, edge step.
 */
import { clamp, gaussian, smoothstep, now } from "../core/bands.js";
const pct = (v, q) => { const s = v.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))))]; };
export function relightEnamelRatio(image, lab, selected, opening, strength, labToRgb, rgbToLab, stomionY) {
    const t0 = now(), { width: w, height: h, channels: ch } = image, n = w * h;
    if (selected.length !== n || opening.length !== n || lab.length !== n)
        throw new RangeError("enamel dimensions mismatch");
    if (!(Number.isFinite(strength) && strength >= 0 && strength <= 100))
        throw new RangeError("strength must be 0..100");
    const out = Uint8Array.from(image.data), weight = new Float64Array(n), amount = strength / 100;
    const blank = { image: out, weight, meanLift: 0, maxL: 0, holesClosed: 0, shadingRangeRatio: 1, translucencyKept: 1, minB: 0, edgeStep: 0, renderMs: 0 };
    const teethL = [];
    for (let i = 0; i < n; i++)
        if (selected[i])
            teethL.push(lab[i][0]);
    if (teethL.length < 8 || amount === 0)
        return { ...blank, renderMs: now() - t0 };
    // 1) close speckle holes: a rejected pixel surrounded by enamel on >= 5 of 8 sides and not dark (not a gap)
    const sel = Uint8Array.from(selected), l20 = pct(teethL, 0.2);
    let holes = 0;
    for (let y = 1; y < h - 1; y++)
        for (let x = 1; x < w - 1; x++) {
            const i = y * w + x;
            if (sel[i] || opening[i] < 0.5 || lab[i][0] < l20 - 6)
                continue;
            let k = 0;
            for (let dy = -1; dy <= 1; dy++)
                for (let dx = -1; dx <= 1; dx++)
                    if ((dx || dy) && selected[i + dy * w + dx])
                        k++;
            if (k >= 5) {
                sel[i] = 1;
                holes++;
            }
        }
    // 2) soft mask: blurred selection, re-cut by luminance similarity (edge-aware) and the opening
    const soft = gaussian(Float64Array.from(sel), w, h, 0.9);
    const p = new Float64Array(n);
    for (let i = 0; i < n; i++)
        if (opening[i] >= 0.5 && soft[i] > 0.02)
            p[i] = sel[i] ? Math.max(0.6, soft[i]) : soft[i] * smoothstep(l20 - 12, l20, lab[i][0]);
    // 3) translucency per arch from each column's own incisal edge
    const trans = new Float64Array(n), bTeeth = pct(Array.from({ length: n }, (_, i) => i).filter((i) => sel[i]).map((i) => lab[i][2]), 0.5);
    let x0 = w, x1 = -1, yTop = h, yBot = -1;
    for (let i = 0; i < n; i++)
        if (sel[i]) {
            const x = i % w, y = (i - x) / w;
            x0 = Math.min(x0, x);
            x1 = Math.max(x1, x);
            yTop = Math.min(yTop, y);
            yBot = Math.max(yBot, y);
        }
    const stom = stomionY ?? (yTop + yBot) / 2;
    for (let x = x0; x <= x1; x++) {
        const runs = [];
        let start = -1;
        for (let y = yTop; y <= yBot + 1; y++) {
            const on = y <= yBot && sel[y * w + x] === 1;
            if (on && start < 0)
                start = y;
            if (!on && start >= 0) {
                if (y - start >= 2)
                    runs.push([start, y - 1]);
                start = -1;
            }
        }
        for (const [a, b] of runs) {
            const upper = (a + b) / 2 < stom, len = b - a + 1, zone = Math.max(1.5, 0.28 * len);
            for (let y = a; y <= b; y++) {
                const d = upper ? b - y : y - a; // distance from this run's incisal edge
                const i = y * w + x, near = 1 - smoothstep(0, zone, d);
                const c = Math.hypot(lab[i][1], lab[i][2]);
                trans[i] = near * (1 - smoothstep(6, 16, c)) * smoothstep(-1, 3, bTeeth - lab[i][2]);
            }
        }
    }
    // 4) gain so p75 reaches its target; ratio in linear luminance; b*, a* reduced proportionally
    const p75 = pct(teethL, 0.75), p95 = pct(teethL, 0.95), targetL = Math.min(90, p75 + 9 * amount);
    const Yof = (L) => ((L + 16) / 116) ** 3, gain = Yof(targetL) / Math.max(1e-6, Yof(p75));
    const beforeIn = [], afterIn = [], tBefore = [], tAfter = [], bodyBefore = [], bodyAfter = [];
    let lift = 0, cnt = 0, maxL = -Infinity, minB = Infinity;
    for (let i = 0; i < n; i++) {
        if (p[i] < 0.01)
            continue;
        const [L, a, b] = lab[i];
        const spec = smoothstep(p95 - 2, p95 + 3, L) * (1 - smoothstep(4, 10, Math.hypot(a, b)));
        const wgt = clamp(p[i] * (1 - 0.75 * trans[i]) * (1 - 0.7 * spec));
        if (wgt < 1e-4)
            continue;
        const Ynew = Yof(L) * Math.pow(gain, wgt);
        let Ln = 116 * Math.cbrt(Ynew) - 16;
        if (Ln > 91)
            Ln = 91 + (Ln - 91) * 0.3; // soft shoulder, never paper-white
        const bn = b > 0 ? b * (1 - 0.42 * amount * wgt) : b, an = a * (1 - 0.12 * amount * wgt);
        const rgb = labToRgb([Ln, an, bn]).map((v) => Math.max(0, Math.min(255, Math.round(v))));
        const j = i * ch;
        for (let c = 0; c < 3; c++)
            out[j + c] = rgb[c];
        const back = rgbToLab(rgb);
        weight[i] = wgt;
        lift += back[0] - L;
        cnt++;
        maxL = Math.max(maxL, back[0]);
        minB = Math.min(minB, back[2]);
        if (sel[i]) {
            beforeIn.push(L);
            afterIn.push(back[0]);
            if (trans[i] > 0.4) {
                tBefore.push(b);
                tAfter.push(back[2]);
            }
            else {
                bodyBefore.push(b);
                bodyAfter.push(back[2]);
            }
        }
    }
    const range = (v) => pct(v, 0.9) - pct(v, 0.1);
    const mean = (v) => v.reduce((s, x) => s + x, 0) / Math.max(1, v.length);
    const tk = tBefore.length >= 8 && bodyBefore.length >= 8 ? (mean(bodyAfter) - mean(tAfter)) / Math.max(0.5, mean(bodyBefore) - mean(tBefore)) : 1;
    // edge step: change in L* contrast across the selection border (inside ring vs outside ring)
    let dIn = 0, dOut = 0, ne = 0;
    for (let y = 1; y < h - 1; y++)
        for (let x = 1; x < w - 1; x++) {
            const i = y * w + x;
            if (!sel[i] || opening[i] < 0.5)
                continue;
            for (const j of [i - 1, i + 1, i - w, i + w])
                if (!sel[j] && opening[j] >= 0.5 && lab[j][0] > l20 - 6) {
                    const ai = rgbToLab([out[i * ch], out[i * ch + 1], out[i * ch + 2]])[0], aj = rgbToLab([out[j * ch], out[j * ch + 1], out[j * ch + 2]])[0];
                    dOut += ai - aj;
                    dIn += lab[i][0] - lab[j][0];
                    ne++;
                }
        }
    return { image: out, weight, meanLift: cnt ? lift / cnt : 0, maxL: Number.isFinite(maxL) ? maxL : 0, holesClosed: holes,
        shadingRangeRatio: beforeIn.length > 16 ? range(afterIn) / Math.max(0.5, range(beforeIn)) : 1, translucencyKept: tk,
        minB: Number.isFinite(minB) ? minB : 0, edgeStep: ne ? (dOut - dIn) / ne : 0, renderMs: now() - t0 };
}
