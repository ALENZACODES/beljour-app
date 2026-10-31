/**
 * Hair fibres v3: strands that follow the hair's own flow ACROSS the gap, coloured by real strands.
 * Keeps from round 1's renderFibresTexture: crown crop, same-photo donor strands, the grey-root refusal
 * (coherent light strands are hair, not scalp), coverage limits, deterministic seed.
 * Fixes:
 *  - direction: round 1 reads the structure tensor AT the scalp pixel, where there is no strand signal, so
 *    fibre directions there are noise (cross-hatching). Here the doubled-angle flow is inpainted into the
 *    gap from the surrounding hair (coherence-weighted normalised convolution);
 *  - strands start at the gap's edges and on blue-noise seeds inside it (no clumps), are traced along the
 *    inpainted flow with a tapered width, and carry the 1-D colour PROFILE of a nearby real strand
 *    (sampled along that strand's own streamline), so sheen and shade vary along each fibre;
 *  - coverage target: about 72% of the visible scalp covered at strength 50 (15-30% still shows).
 */
import { clamp, flowField, gaussian, inpaintFlow, poissonDisk, rng, now } from "../core/bands.js";
/** How each product sits on the scalp. Fibres: long strands. Spray: short fine strands, more tint on the
 * scalp. Powder: very short, matte (no sheen along the strand), most tint. Colours always come from her strands. */
const PRODUCT_LOOK = {
    fibres: { len: [14, 22], width: [0.4, 0.25], opacity: [0.6, 0.3], dust: 0.25, matte: false },
    spray: { len: [6, 10], width: [0.3, 0.15], opacity: [0.4, 0.25], dust: 0.55, matte: false },
    powder: { len: [3, 5], width: [0.45, 0.2], opacity: [0.45, 0.25], dust: 0.7, matte: true },
};
/** Gain on the donor's own high band: part-opaque fibres over the scalp lose about 40% of it where they are sparse
 * (DETAIL_GAIN_SPARSE); where fibres already cover the pixel at full strength the stack keeps more of it, so the gain
 * eases toward DETAIL_GAIN_FULL: gain = SPARSE - (SPARSE - FULL) x cover x amount^3 (the default, amount 0.71,
 * keeps most of the sparse gain; full strength reaches about 1.2 where the gap is filled). */
export const DETAIL_GAIN_SPARSE = 1.7, DETAIL_GAIN_FULL = 1.2;
/** Strands seeded in the gap are at most PART_LEN_BASE + PART_LEN_PER_PX x (distance to the nearer gap edge) long,
 * and a strand whose chord is more than MAX_OFF_FLOW_DEG off her own hair's flow at its donor is dropped:
 * long fibres laid across a parting read as level brown streaks. */
/** Fine passes: seed spacing (px), share of the strand length and width, and the most-covered root they accept. */
export const FINE_PASSES = 10, FINE_SPACING = 0.6, FINE_LENGTH = 0.6, FINE_WIDTH = 0.7, FINE_ROOT_COVER = 0.97;
export const PART_LEN_BASE = 8, PART_LEN_PER_PX = 1.5, MAX_OFF_FLOW_DEG = 30;
const LABEL = "Hair-fibre simulation: strands follow your own hair's flow and colour. Not a physical product prediction.";
export function renderFibresFlow(img, zone, scalp, _shade, options = {}) {
    const t0 = now(), { width: W, height: H, channels: ch } = img, N = W * H;
    if ((ch !== 3 && ch !== 4) || img.data.length !== N * ch || zone.data.length !== N || scalp.length !== N || (options.hair && options.hair.length !== N))
        throw new RangeError("fibre image/mask dimensions mismatch");
    const amount = clamp((options.amount ?? 50) / 100), seed = options.seed ?? 17;
    const look = PRODUCT_LOOK[options.product ?? "fibres"] ?? PRODUCT_LOOK.fibres;
    const copy = () => ({ width: W, height: H, channels: ch, data: Uint8Array.from(img.data) });
    const refuse = (code, label, extra = {}) => ({ image: copy(), label,
        metrics: { fibres: 0, strands_drawn: 0, covered_scalp: 0, scalp_pixels: 0, refused_grey_root_px: 0, flow_coherence_in_gap: 0,
            render_ms: now() - t0, status: "refused", reason_code: code, texture_source: "own_photo", ...extra } });
    if (amount === 0)
        return refuse("zero_strength", LABEL);
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let i = 0; i < N; i++)
        if (zone.data[i] > 0.2) {
            const x = i % W, y = (i - x) / W;
            x0 = Math.min(x0, x);
            x1 = Math.max(x1, x);
            y0 = Math.min(y0, y);
            y1 = Math.max(y1, y);
        }
    if (x1 <= x0 || y1 <= y0)
        return refuse("empty_crown", "No crown region is visible.");
    const pad = 24;
    x0 = Math.max(0, x0 - pad);
    y0 = Math.max(0, y0 - pad);
    x1 = Math.min(W - 1, x1 + pad);
    y1 = Math.min(H - 1, y1 + pad);
    const w = x1 - x0 + 1, h = y1 - y0 + 1, n = w * h;
    const at = (x, y) => (y + y0) * W + x + x0;
    const lum = new Float64Array(n), hairM = new Float64Array(n), scalpM = new Float64Array(n), zoneM = new Float64Array(n);
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            const i = at(x, y), k = y * w + x, j = i * ch;
            lum[k] = 0.2126 * img.data[j] + 0.7152 * img.data[j + 1] + 0.0722 * img.data[j + 2];
            hairM[k] = clamp(options.hair ? options.hair[i] : 1 - scalp[i]);
            scalpM[k] = clamp(scalp[i]);
            zoneM[k] = clamp(zone.data[i]);
        }
    const f0 = flowField(lum, w, h, 1, 2.5);
    // Local texture (sigma 1): coherence alone is fooled by the gap's own border, which is one straight edge.
    const g2 = new Float64Array(n);
    for (let y = 1; y < h - 1; y++)
        for (let x = 1; x < w - 1; x++) {
            const k = y * w + x;
            g2[k] = (0.5 * (lum[k + 1] - lum[k - 1])) ** 2 + (0.5 * (lum[k + w] - lum[k - w])) ** 2;
        }
    const tex = gaussian(g2, w, h, 1).map(Math.sqrt);
    // grey roots: coherent, light, low-chroma strands where the "scalp" mask fires are hair, not skin
    let grey = 0;
    const candidate = [];
    for (let k = 0; k < n; k++) {
        if (zoneM[k] < 0.6 || scalpM[k] < 0.45)
            continue;
        const i = at(k % w, Math.floor(k / w)), j = i * ch, r = img.data[j], g = img.data[j + 1], b = img.data[j + 2];
        const lowChroma = Math.max(r, g, b) - Math.min(r, g, b) < 18;
        const strandy = f0.coherence[k] >= 0.5 && tex[k] >= 6;
        if (strandy && lowChroma && lum[k] > 120) {
            grey++;
            continue;
        }
        candidate.push(k); // the whole visible scalp, borders included (texture only classifies grey roots)
    }
    if (grey > 0.5 * (grey + candidate.length) && grey > 40)
        return refuse("grey_roots_not_scalp", "This looks like grey or light roots, not bare scalp. Fibres would paint over real hair: try Root touch-up instead.", { refused_grey_root_px: grey });
    // Only solid scalp is a gap: single light strands (grey hairs, highlights) also pass the colour test, and fibres
    // were drawn over them all across the crown (level streaks, texture down to 0.66). Keep pixels where most of a
    // ~2 px neighbourhood is scalp, then grow 2 px back into the candidate set so the gap keeps its edges.
    {
        const dens = new Float64Array(n);
        for (const k of candidate)
            dens[k] = 1;
        const local = gaussian(dens, w, h, 2), core = new Float64Array(n);
        for (const k of candidate)
            if (local[k] >= 0.5)
                core[k] = 1;
        const near = gaussian(core, w, h, 1.5);
        const kept = candidate.filter((k) => core[k] > 0 || near[k] > 0.08);
        candidate.length = 0;
        candidate.push(...kept);
    }
    const donorSupport = Float64Array.from(hairM, (v, k) => (v > 0.7 && scalpM[k] < 0.3 ? 1 : 0));
    let donors = 0;
    for (const v of donorSupport)
        donors += v;
    if (candidate.length < 16 || donors < 40)
        return refuse("no_reliable_scalp_or_hair", "No bare scalp with real hair around it was found.", { scalp_pixels: candidate.length, refused_grey_root_px: grey });
    // Small radii first, so each side of a parting takes its own side's flow before the far side's mixes in.
    const flow = inpaintFlow(f0, donorSupport, w, h, [2, 4, 8, 16, 24]);
    let gapCoh = 0;
    for (const k of candidate)
        gapCoh += flow.coherence[k];
    gapCoh /= candidate.length;
    const isCand = new Uint8Array(n);
    for (const k of candidate)
        isCand[k] = 1;
    // seeds: blue noise over the gap. Coverage grows with strength: about 62% of the gap at amount 0.5, 90% at 1.
    const target = 0.35 + 0.55 * amount;
    const spacing = 1.1; // dense enough for the shorter strands near the parting to reach the target
    const inGap = (x, y) => isCand[Math.floor(y) * w + Math.floor(x)] === 1;
    const seeds = poissonDisk(w, h, () => spacing, inGap, seed, 20000);
    // Fine passes: a second, denser seed set offset from the first, for short thin strands between the first ones.
    const fineSeeds = poissonDisk(w, h, () => FINE_SPACING, inGap, seed + 7, 30000);
    // The gap's own across-direction (normal to its mask's structure-tensor axis) and the nearer edge along it:
    // a fibre lies along her flow, heading away from the parting toward that edge (down, where the flow runs along it).
    const gapAxis = flowField(Float64Array.from(isCand, (v) => 255 * v), w, h, 1, 4);
    const edgeAlong = (x, y, mx, my) => {
        for (let d = 1; d <= 40; d++) {
            const xi = Math.round(x + d * mx), yi = Math.round(y + d * my);
            if (xi < 0 || yi < 0 || xi >= w || yi >= h)
                return 99;
            if (!isCand[yi * w + xi])
                return d;
        }
        return 99;
    };
    const heading = (sx, sy, k) => {
        const mx = -gapAxis.ty[k], my = gapAxis.tx[k], side = edgeAlong(sx, sy, mx, my) <= edgeAlong(sx, sy, -mx, -my) ? 1 : -1;
        const away = (flow.tx[k] * mx + flow.ty[k] * my) * side;
        return Math.abs(away) > 0.3 ? (away > 0 ? 1 : -1) : (flow.ty[k] >= 0 ? 1 : -1);
    };
    const lumLow = gaussian(lum, w, h, 1.2);
    const r = rng(seed + 1), out = Uint8Array.from(img.data), cover = new Float64Array(n);
    const trace = (sx, sy, len, dir, cb) => {
        let x = sx, y = sy, px = 0, py = 0;
        for (let s = 0; s <= len; s += 0.5) {
            const k = Math.min(n - 1, Math.max(0, Math.round(y) * w + Math.round(x)));
            let tx = flow.tx[k] * dir, ty = flow.ty[k] * dir;
            if (s > 0 && tx * px + ty * py < 0) {
                tx = -tx;
                ty = -ty;
            } // keep a consistent heading
            px = tx;
            py = ty;
            cb(x, y, s / len);
            x += 0.5 * tx;
            y += 0.5 * ty;
            if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1)
                break;
        }
    };
    let strands = 0, covered = 0;
    const gapPx = candidate.length;
    // Up to six passes over the seeds (each later pass accepts more-covered roots), then up to FINE_PASSES over a
    // denser seed set with shorter, thinner strands, until the target is met. More fine strands, not a stronger
    // detail boost, fill what the full-length strands left (r3 stopped at 0.82 of the parting at max).
    for (let pass = 0; pass < 6 + FINE_PASSES && covered / gapPx < target; pass++)
        for (const [sx, sy] of (pass < 6 ? seeds : fineSeeds)) {
            if (covered / gapPx >= target)
                break;
            const k0 = Math.floor(sy) * w + Math.floor(sx), fine = pass >= 6;
            if (cover[k0] > (fine ? FINE_ROOT_COVER : Math.min(0.95, 0.6 + 0.1 * pass)))
                continue;
            // donor strand: nearest strong hair pixel along +/- normal, then its own streamline profile
            let dk = -1;
            for (let rad = 2; rad < 40 && dk < 0; rad += 2)
                for (const sgn of [1, -1]) {
                    const x = Math.round(sx - flow.ty[k0] * rad * sgn), y = Math.round(sy + flow.tx[k0] * rad * sgn);
                    if (x >= 0 && y >= 0 && x < w && y < h && donorSupport[y * w + x] > 0 && f0.coherence[y * w + x] > 0.35) {
                        dk = y * w + x;
                        break;
                    }
                }
            // Fine passes only: with no donor across the flow (a wide bare patch), look all round at the same distances.
            // Full-length strands from those donors drew the sideways brown streaks, so only the short thin ones may.
            for (let rad = 2; fine && rad < 40 && dk < 0; rad += 2)
                for (let q = 0; q < 8; q++) {
                    const x = Math.round(sx + rad * Math.cos(q * Math.PI / 4)), y = Math.round(sy + rad * Math.sin(q * Math.PI / 4));
                    if (x >= 0 && y >= 0 && x < w && y < h && donorSupport[y * w + x] > 0 && f0.coherence[y * w + x] > 0.35) {
                        dk = y * w + x;
                        break;
                    }
                }
            if (dk < 0)
                continue;
            const gx = -gapAxis.ty[k0], gy = gapAxis.tx[k0], dNear = Math.min(edgeAlong(sx, sy, gx, gy), edgeAlong(sx, sy, -gx, -gy));
            let len = Math.min(look.len[0] + look.len[1] * r(), PART_LEN_BASE + PART_LEN_PER_PX * dNear) * (fine ? FINE_LENGTH : 1);
            const prof = [], dpts = [];
            trace(dk % w, Math.floor(dk / w), len, 1, (x, y) => { const i = at(Math.round(x), Math.round(y)), j = i * ch; prof.push([img.data[j], img.data[j + 1], img.data[j + 2]]); dpts.push([x, y]); });
            if (prof.length < 3)
                continue;
            if (look.matte) {
                const m = [0, 1, 2].map((q) => prof.reduce((a, c) => a + c[q], 0) / prof.length);
                prof.fill(m);
            }
            const width = (look.width[0] + look.width[1] * r()) * (fine ? FINE_WIDTH : 1), opacity = (look.opacity[0] + look.opacity[1] * r()) * (0.6 + 0.4 * amount), dir = heading(sx, sy, k0);
            {
                // Off the flow: try once at half length (the bend is usually in the far half), else drop the strand.
                const offFlow = (L) => {
                    let ex = sx, ey = sy;
                    trace(sx, sy, L, dir, (x, y) => { ex = x; ey = y; });
                    const cl = Math.hypot(ex - sx, ey - sy);
                    return cl >= 3 && Math.abs(((ex - sx) * f0.tx[dk] + (ey - sy) * f0.ty[dk]) / cl) < Math.cos(MAX_OFF_FLOW_DEG * Math.PI / 180);
                };
                if (offFlow(len)) {
                    if (len >= 8 && !offFlow(len / 2))
                        len = len / 2;
                    else if (len >= 8 && !offFlow(len / 3))
                        len = len / 3;
                    else
                        continue;
                }
            }
            let touched = 0;
            trace(sx, sy, len, dir, (x, y, t) => {
                const at_t = Math.min(prof.length - 1, Math.floor(t * prof.length)), c = prof[at_t], dp = dpts[at_t], taper = Math.min(1, 3 * t + 0.3) * (1 - 0.6 * t * t); // full at the root, fine at the tip
                for (let yy = Math.floor(y - 1); yy <= Math.ceil(y + 1); yy++)
                    for (let xx = Math.floor(x - 1); xx <= Math.ceil(x + 1); xx++) {
                        if (xx < 0 || yy < 0 || xx >= w || yy >= h)
                            continue;
                        const k = yy * w + xx;
                        if (zoneM[k] < 0.5)
                            continue;
                        const d = Math.hypot(xx + 0.5 - x, yy + 0.5 - y), a = clamp(opacity * taper * Math.exp(-(d * d) / (2 * width * width)) * 0.8) * (isCand[k] ? 1 : 0.35);
                        if (a < 0.02)
                            continue;
                        const i = at(xx, yy), j = i * ch;
                        // Her strand detail: the donor's own fine luminance at the same offset from its streamline (sigma 1.2 high band).
                        const dx = Math.min(w - 1, Math.max(0, Math.round(dp[0] + xx - x))), dy = Math.min(h - 1, Math.max(0, Math.round(dp[1] + yy - y)));
                        const gain = DETAIL_GAIN_SPARSE - (DETAIL_GAIN_SPARSE - DETAIL_GAIN_FULL) * Math.min(1, cover[k]) * amount ** 3;
                        const detail = look.matte ? 0 : gain * (lum[dy * w + dx] - lumLow[dy * w + dx]);
                        for (let q = 0; q < 3; q++)
                            out[j + q] = Math.round(Math.min(255, Math.max(0, out[j + q] * (1 - a) + (c[q] + detail) * a)));
                        if (isCand[k]) {
                            const before = cover[k];
                            cover[k] = 1 - (1 - cover[k]) * (1 - a);
                            covered += cover[k] - before;
                        }
                        touched++;
                    }
            });
            if (touched)
                strands++;
        }
    // Fibre "dust": keratin fibres also sit on the scalp between hairs, so the remaining scalp moves part of
    // the way toward the local hair colour (smooth, multiplicative; no texture is generated).
    const hairCol = [0, 1, 2].map((c) => {
        const num = new Float64Array(n), den = new Float64Array(n);
        for (let k = 0; k < n; k++) {
            const q = donorSupport[k];
            num[k] = q * img.data[at(k % w, Math.floor(k / w)) * ch + c];
            den[k] = q;
        }
        const a = gaussian(num, w, h, 6), b = gaussian(den, w, h, 6);
        return Float64Array.from(a, (v, k) => (b[k] > 1e-4 ? v / b[k] : 0));
    });
    const dust = look.dust * amount;
    for (const k of candidate) {
        const left = 1 - cover[k], i = at(k % w, Math.floor(k / w)), j = i * ch;
        if (left <= 0.05 || hairCol[0][k] <= 0)
            continue;
        for (let q = 0; q < 3; q++)
            out[j + q] = Math.round(out[j + q] * (1 - dust * left) + hairCol[q][k] * dust * left);
    }
    return { image: { width: W, height: H, channels: ch, data: out }, label: LABEL, metrics: {
            fibres: strands, strands_drawn: strands, covered_scalp: covered / gapPx, scalp_pixels: gapPx, refused_grey_root_px: grey,
            flow_coherence_in_gap: Math.round(gapCoh * 1000) / 1000, render_ms: now() - t0, status: strands ? "applied" : "refused",
            reason_code: strands ? "" : "no_verified_strands", texture_source: "own_photo"
        } };
}
