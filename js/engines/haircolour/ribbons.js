/**
 * Balayage ribbons v3: geodesic root-to-end coordinate, widening flow-following ribbons, ratio lift.
 * Keeps from round 1's flowRibbons: structure-tensor flow, root melt, face-frame boost, paint intent,
 * per-ribbon strength jitter, the root/painted-share metrics. Fixes:
 *  - "root" was each IMAGE COLUMN's top hair pixel; beside the face that is the shoulder-length hair's
 *    top, so lengths were treated as roots. Here t = geodesic distance THROUGH the hair mask from the
 *    scalp line, normalised: roots are roots wherever the hair falls;
 *  - ribbons only traced straight down (y += 1); here they follow the flow both ways, away from the root;
 *  - constant width -> width grows toward the ends (hand-painted look), money piece near the face;
 *  - additive L* lift -> per-channel RATIO lift on linear RGB with a highlight shoulder, so each strand's
 *    own light/shadow structure survives (the hair version of the Texture Law);
 *  - its luminance-correlation gate passes any additive lift by construction; the gate here is strand
 *    log-contrast kept (1-px band SD of log Y inside ribbons, after/before).
 */
import { clamp, flowField, gaussian, highBand, labToLin, linearPlanes, linToSrgb, lumLin, poissonDisk, rng, smoothstep, toByte, bandStats, now } from "../core/bands.js";
/** Geodesic distance through the mask from seed pixels (3 forward/backward chamfer sweeps). */
export function geodesic(mask, seeds, w, h) {
    const d = new Float64Array(w * h).fill(Infinity);
    for (let i = 0; i < w * h; i++)
        if (seeds[i] > 0 && mask[i] >= 0.5)
            d[i] = 0;
    const S2 = Math.SQRT2;
    for (let pass = 0; pass < 3; pass++) {
        for (let y = 0; y < h; y++)
            for (let x = 0; x < w; x++) {
                const i = y * w + x;
                if (mask[i] < 0.5)
                    continue;
                if (x > 0)
                    d[i] = Math.min(d[i], d[i - 1] + 1);
                if (y > 0) {
                    d[i] = Math.min(d[i], d[i - w] + 1);
                    if (x > 0)
                        d[i] = Math.min(d[i], d[i - w - 1] + S2);
                    if (x < w - 1)
                        d[i] = Math.min(d[i], d[i - w + 1] + S2);
                }
            }
        for (let y = h - 1; y >= 0; y--)
            for (let x = w - 1; x >= 0; x--) {
                const i = y * w + x;
                if (mask[i] < 0.5)
                    continue;
                if (x < w - 1)
                    d[i] = Math.min(d[i], d[i + 1] + 1);
                if (y < h - 1) {
                    d[i] = Math.min(d[i], d[i + w] + 1);
                    if (x < w - 1)
                        d[i] = Math.min(d[i], d[i + w + 1] + S2);
                    if (x > 0)
                        d[i] = Math.min(d[i], d[i + w - 1] + S2);
                }
            }
    }
    return d;
}
export function planRibbons(img, mask, o = {}) {
    const { width: w, height: h, channels: ch } = img, n = w * h;
    let x0 = w, x1 = -1, y0 = h, y1 = -1;
    for (let i = 0; i < n; i++)
        if (mask[i] >= 0.5) {
            const x = i % w, y = (i - x) / w;
            x0 = Math.min(x0, x);
            x1 = Math.max(x1, x);
            y0 = Math.min(y0, y);
            y1 = Math.max(y1, y);
        }
    const lift = new Float64Array(n), warm = new Float64Array(n);
    if (x1 < 0)
        return { lift, warm, t: new Float64Array(n), ribbons: 0, widthGrowth: 1, ribbonLiftSd: 0 };
    const topY = o.scalpTopY ?? y0 + 0.1 * (y1 - y0);
    const seeds = new Float64Array(n);
    for (let y = y0; y <= Math.min(y1, Math.round(topY)); y++)
        for (let x = x0; x <= x1; x++)
            if (mask[y * w + x] >= 0.5)
                seeds[y * w + x] = 1;
    const dist = geodesic(mask, seeds, w, h), finite = [];
    for (let i = 0; i < n; i++)
        if (Number.isFinite(dist[i]) && mask[i] >= 0.5)
            finite.push(dist[i]);
    finite.sort((a, b) => a - b);
    const D = Math.max(1, finite[Math.floor(0.95 * (finite.length - 1))] ?? 1);
    const t = Float64Array.from(dist, (v, i) => (mask[i] >= 0.5 && Number.isFinite(v) ? clamp(v / D) : 0));
    const lum = new Float64Array(n);
    for (let i = 0; i < n; i++)
        lum[i] = 0.2126 * img.data[i * ch] + 0.7152 * img.data[i * ch + 1] + 0.0722 * img.data[i * ch + 2];
    const flow = flowField(lum, w, h, 1, 3);
    // "auto" intent covering most of the hair is treated as no intent (it caused the whole-head tint)
    let intentShare = 0, hairPx = 0;
    if (o.intent)
        for (let i = 0; i < n; i++)
            if (mask[i] >= 0.5) {
                hairPx++;
                if (o.intent[i] > 0.05)
                    intentShare++;
            }
    const useIntent = !!o.intent && hairPx > 0 && intentShare / hairPx < 0.6;
    const S = clamp(0.07 * (x1 - x0 + 1), 8, 70), r = rng(o.seed ?? 173);
    const pts = poissonDisk(w, h, (x, y) => S * (o.frame && o.frame[Math.floor(y) * w + Math.floor(x)] > 0.3 ? 0.7 : 1), (x, y) => {
        const i = Math.floor(y) * w + Math.floor(x);
        return mask[i] >= 0.5 && t[i] >= 0.16 && t[i] <= 0.42 && (!useIntent || (o.intent[i] ?? 0) > 0.05);
    }, o.seed ?? 173, 600, 20, { x0, y0, x1: x1 + 1, y1: y1 + 1 });
    const widthsEarly = [], widthsLate = [], liftsR = [];
    let ribbons = 0;
    for (const [sx, sy] of pts) {
        if (r() < 0.5)
            continue; // leave neighbours untouched: balayage is selective
        const i0 = Math.floor(sy) * w + Math.floor(sx), inFrame = o.frame ? clamp(o.frame[i0]) : 0;
        const L = (0.75 + 0.4 * r()) * (1 + 0.25 * inFrame), W0 = S * (0.08 + 0.07 * r()) * (1 + 0.3 * inFrame), wm = 0.7 + 0.6 * r();
        liftsR.push(L);
        let x = sx, y = sy, px = 0, py = 0, steps = 0;
        while (steps++ < 3 * h) {
            const k = Math.round(y) * w + Math.round(x);
            if (k < 0 || k >= n || mask[k] < 0.4)
                break;
            let tx = flow.tx[k], ty = flow.ty[k];
            // head away from the root: choose the sign that increases t; then keep heading
            const ahead = Math.round(y + 2 * ty) * w + Math.round(x + 2 * tx), behind = Math.round(y - 2 * ty) * w + Math.round(x - 2 * tx);
            if (steps === 1) {
                if ((t[ahead] ?? 0) < (t[behind] ?? 0)) {
                    tx = -tx;
                    ty = -ty;
                }
            }
            else if (tx * px + ty * py < 0) {
                tx = -tx;
                ty = -ty;
            }
            px = tx;
            py = ty;
            const tt = t[k], wid = W0 * (0.45 + 1.1 * tt);
            (tt < 0.35 ? widthsEarly : tt > 0.75 ? widthsLate : []).push(wid);
            const R = Math.ceil(2 * wid);
            for (let yy = Math.max(0, Math.round(y) - R); yy <= Math.min(h - 1, Math.round(y) + R); yy++)
                for (let xx = Math.max(0, Math.round(x) - R); xx <= Math.min(w - 1, Math.round(x) + R); xx++) {
                    const q = yy * w + xx;
                    if (mask[q] < 0.5)
                        continue;
                    // distance across the ribbon only (perpendicular to the flow) -> long, strand-aligned ribbons
                    const across = Math.abs((xx - x) * -ty + (yy - y) * tx), along = Math.abs((xx - x) * tx + (yy - y) * ty);
                    if (along > 1.2)
                        continue;
                    // graded along the length (light at mid-lengths, strongest at the ends), soft feathered sides
                    const along01 = 0.35 + 0.65 * smoothstep(0.3, 0.95, t[q]);
                    const v = L * along01 * Math.exp(-(across * across) / (2 * (1.5 * wid) ** 2)) * smoothstep(0.16, 0.5, t[q]);
                    if (v > lift[q]) {
                        lift[q] = v;
                        warm[q] = wm;
                    }
                }
            x += tx;
            y += ty; // run to the real end of the hair (t is clamped at its 95th percentile)
        }
        ribbons++;
    }
    const m = (a) => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);
    const lm = m(liftsR), lsd = Math.sqrt(m(liftsR.map((v) => (v - lm) ** 2)));
    // a light blur melts ribbon edges into the neighbouring strands (still strand-aligned: the sides were Gaussian)
    const soft = gaussian(lift, w, h, 1.2);
    return { lift: Float64Array.from(soft, (v, i) => (mask[i] >= 0.5 ? clamp(v) : 0)), warm, t, ribbons, widthGrowth: widthsEarly.length && widthsLate.length ? m(widthsLate) / m(widthsEarly) : 1, ribbonLiftSd: lsd };
}
/** Ratio recolour toward a target colour (Lab), per channel in linear light, with a highlight shoulder. */
/** Share of the own log high band eased where a strand is fully lifted (keeps display texture near the source). */
export const LIFT_DETAIL_EASE = 0.2;
export function ratioLift(img, mask, plan, targetLab, strength) {
    const t0 = now(), { width: w, height: h, channels: ch } = img, n = w * h;
    const lin = linearPlanes(img);
    // base = median hair colour (linear); target chroma kept near the person's own warmth
    const idx = [];
    for (let i = 0; i < n; i++)
        if (mask[i] >= 0.5)
            idx.push(i);
    const med = [0, 1, 2].map((c) => { const v = idx.filter((_, k) => k % 3 === 0).map((i) => lin[c][i]).sort((a, b) => a - b); return v[v.length >> 1] ?? 0.05; });
    const tgt = labToLin(targetLab[0], targetLab[1], targetLab[2]).map((v) => Math.max(1e-4, v));
    const baseY = Math.max(1e-4, lumLin(med[0], med[1], med[2])), tgtY = lumLin(tgt[0], tgt[1], tgt[2]);
    // per-channel gain = luminance ratio x (hue ratio pulled 50% toward neutral: own warmth preserved)
    const lumRatio = Math.min(3.5, tgtY / baseY); // a session-1 lift beyond ~3.5x luminance reads as paint, not hair
    const gain = [0, 1, 2].map((c) => lumRatio * Math.pow((tgt[c] / tgtY) / Math.max(1e-4, med[c] / baseY), 0.5));
    const Y0 = new Float64Array(n);
    for (let i = 0; i < n; i++)
        Y0[i] = Math.log(1e-4 + lumLin(lin[0][i], lin[1][i], lin[2][i]));
    const a = clamp(strength);
    // Stronger settings also fill more of each ribbon's soft edge (lift^(1.3 - 0.6a): ^0.85 at the default 0.75,
    // ^0.7 at full), so the maximum reads as more and wider lightening, not only a little brighter.
    const spread = 1.3 - 0.6 * a;
    // A multiplicative lift keeps log contrast but raises it in display values (texture 1.22 by the luma gate):
    // in the lifted strands the own log high band (sigma 1) is eased by up to 20%, so detail reads near the source.
    const hb0 = highBand(Y0, w, h, 1);
    const data = Uint8ClampedArray.from(img.data), Y1 = Float64Array.from(Y0);
    let painted = 0, rootMax = 0, hair = 0;
    for (const i of idx) {
        hair++;
        const f = Math.pow(plan.lift[i], 1 + (spread - 1) * smoothstep(0.15, 0.35, plan.t[i])) * a; // roots keep their own ramp
        if (plan.t[i] < 0.15)
            rootMax = Math.max(rootMax, f);
        if (f < 0.005)
            continue;
        if (f > 0.08)
            painted++;
        const yIn = Math.exp(Y0[i]), shoulder = 1 - 0.6 * smoothstep(0.3, 0.8, yIn); // bright strands lift less (no clipping)
        const out = [0, 1, 2].map((c) => {
            const wv = plan.warm[i] > 0 ? plan.warm[i] : 1; // blurred ribbon edges carry no warmth jitter of their own
            const gc = 1 + (gain[c] * (c === 0 ? wv ** 0.15 : c === 2 ? wv ** -0.15 : 1) - 1) * f * shoulder;
            return lin[c][i] * gc * Math.exp(-LIFT_DETAIL_EASE * Math.min(1, f) * hb0[i]);
        });
        const j = i * ch;
        for (let c = 0; c < 3; c++)
            data[j + c] = toByte(linToSrgb(out[c]));
        Y1[i] = Math.log(1e-4 + lumLin(out[0], out[1], out[2]));
    }
    const ribbonIdx = idx.filter((i) => plan.lift[i] * a > 0.3);
    const before = bandStats(highBand(Y0, w, h, 1), ribbonIdx), after = bandStats(highBand(Y1, w, h, 1), ribbonIdx);
    return { data, logContrastKept: before.sd > 1e-9 ? after.sd / before.sd : 1, rootMax, paintedShare: hair ? painted / hair : 0, ms: now() - t0 };
}
