import { clamp, darkRidges, gaussian, rng, smoothstep } from "../core/bands.js";
import { labToSrgb, srgbToLab, toByte } from "../shade/colourspace.js";
import { CONTOURS } from "../../data/regions/generated/topology.js";
const UPPER = [185, 40, 39, 37, 0, 267, 269, 270, 409], LOWER = [146, 91, 181, 84, 17, 314, 405, 321, 375];
function down(face) {
    const ex = face[263][0] - face[33][0], ey = face[263][1] - face[33][1], d = Math.hypot(ex, ey) || 1;
    return [-ey / d, ex / d, d];
}
/** Outer lip contour moved outward (upper up, lower down) by up to `share` IOD at the centre. */
export function lipFullness(face, target, share) {
    const [dx, dy, iod] = down(face), out = target.map((p) => [p[0], p[1]]);
    const cx = (face[61][0] + face[291][0]) / 2, half = Math.max(1, Math.hypot(face[291][0] - face[61][0], face[291][1] - face[61][1]) / 2);
    for (const [ids, sgn, k] of [[UPPER, -1, 1], [LOWER, 1, 0.8]])
        for (const i of ids) {
            const taper = 0.35 + 0.65 * clamp(1 - Math.abs(face[i][0] - cx) / half) ** 0.7, m = sgn * share * k * iod * taper;
            out[i] = [out[i][0] + dx * m, out[i][1] + dy * m];
        }
    return out;
}
/** Mid-face volume: the malar fat pads ride up a little (cheek points moved up by up to `share` IOD, tapered). */
const MALAR = [50, 101, 118, 117, 123, 147, 187, 205, 36, 280, 330, 347, 346, 352, 376, 411, 425, 266];
export function cheekLift(face, target, share) {
    const [dx, dy, iod] = down(face), out = target.map((p) => [p[0], p[1]]);
    for (const i of MALAR) {
        const k = i === 50 || i === 280 || i === 205 || i === 425 ? 1 : 0.6;
        out[i] = [out[i][0] - dx * share * k * iod, out[i][1] - dy * share * k * iod];
    }
    return out;
}
/**
 * Younger: the crepe and fine-line scale (between the pore band and the fold band) is attenuated on the skin
 * (cheeks, under-eyes, forehead, neck), and the cheeks' low-frequency tone is evened. The pore band (finer than
 * `poreSigma`) is not touched, eyes, brows, lips and nostrils are left out, and marks are held.
 * Older uses a negative amount: the person's own crepe is strengthened (same coring, own texture only, the Donor
 * Rule holds) and the cheeks' own low-frequency unevenness grows.
 */
export function smoothCrepe(img, support, face, amount, hold) {
    const { width: w, height: h, channels: ch, data } = img;
    if (!amount)
        return 0;
    const iod = down(face)[2];
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let i = 0; i < w * h; i++)
        if (support[i] > 0.05) {
            const x = i % w, y = (i - x) / w;
            x0 = Math.min(x0, x);
            x1 = Math.max(x1, x);
            y0 = Math.min(y0, y);
            y1 = Math.max(y1, y);
        }
    if (x1 < 0)
        return 0;
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1, n = bw * bh;
    const L = new Float64Array(n), A = new Float64Array(n), B = new Float64Array(n), S = new Float64Array(n), keep = new Float64Array(n);
    const pts = face.map((p) => [p[0], p[1]]);
    const polys = [[33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246], [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466],
        [70, 63, 105, 66, 107, 55, 65, 52, 53, 46], [300, 293, 334, 296, 336, 285, 295, 282, 283, 276],
        [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146], [98, 97, 2, 326, 327, 294, 278, 344, 440, 275, 4, 45, 220, 115, 48, 64]].map((p) => p.map((k) => pts[k]));
    for (let y = 0; y < bh; y++)
        for (let x = 0; x < bw; x++) {
            const X = x + x0, Y = y + y0, i = y * bw + x, j = (Y * w + X) * ch, lab = srgbToLab([data[j], data[j + 1], data[j + 2]]);
            L[i] = lab[0];
            A[i] = lab[1];
            B[i] = lab[2];
            S[i] = support[Y * w + X];
            let f = 0;
            for (const p of polys)
                if (inPoly(X, Y, p)) {
                    f = 1;
                    break;
                }
            keep[i] = Math.max(f, hold[Y * w + X]);
        }
    const keepS = gaussian(keep, bw, bh, Math.max(2, 0.03 * iod));
    const sp = Math.max(1.8, 0.013 * iod), sf = Math.max(4, 0.04 * iod), sl = Math.max(8, 0.1 * iod);
    const gp = gaussian(L, bw, bh, sp), gf = gaussian(L, bw, bh, sf), gl = gaussian(L, bw, bh, sl);
    const ap = gaussian(A, bw, bh, sp), af = gaussian(A, bw, bh, sf), bp = gaussian(B, bw, bh, sp), bf = gaussian(B, bw, bh, sf);
    const cheeks = [pts[50], pts[280]], rC = 0.32 * iod;
    // a man's skin texture (shaved beard zone, coarser grain) carries more of his identity: a quarter of the crepe change
    const hb = gaussian(L, bw, bh, 1.5), sdBox = (c, r) => {
        let s1 = 0, s2 = 0, q = 0;
        for (let y = Math.round(c[1] - r); y <= Math.round(c[1] + r); y++)
            for (let x = Math.round(c[0] - r); x <= Math.round(c[0] + r); x++) {
                if (x < x0 || x > x1 || y < y0 || y > y1)
                    continue;
                const i = (y - y0) * bw + (x - x0), v = L[i] - hb[i];
                s1 += v;
                s2 += v * v;
                q++;
            }
        return q > 4 ? Math.sqrt(Math.max(0, s2 / q - (s1 / q) ** 2)) : 0;
    };
    const cheekSd = (sdBox(pts[50], 0.1 * iod) + sdBox(pts[280], 0.1 * iod)) / 2;
    const masc = smoothstep(1.47, 1.62, cheekSd > 0 ? sdBox([(pts[17][0] + pts[152][0]) / 2, (pts[17][1] + pts[152][1]) / 2], 0.12 * iod) / cheekSd : 1);
    amount *= 1 - 0.75 * masc;
    let changed = 0;
    for (let y = 0; y < bh; y++)
        for (let x = 0; x < bw; x++) {
            const i = y * bw + x, s = S[i] * (1 - Math.min(1, keepS[i] * 1.5 + keep[i]));
            if (s < 0.01)
                continue;
            const X = x + x0, Y = y + y0;
            const k = Math.min(0.6, amount) * s; // 40-60% of the crepe band at 100
            // soft coring: crepe is low-amplitude texture; larger mid-band swings are structure (lid folds, lip and nose
            // edges, stubble shadow) that identity rests on, and are left alone
            const m = gp[i] - gf[i], core = 1 - smoothstep(1.5, 4, Math.abs(m));
            let dL = -k * core * m, dA = -0.5 * k * core * (ap[i] - af[i]), dB = -0.5 * k * core * (bp[i] - bf[i]);
            let c = 0;
            for (const q of cheeks)
                c = Math.max(c, Math.exp(-((X - q[0]) ** 2 + (Y - q[1]) ** 2) / (2 * rC * rC)));
            // cheeks: low-frequency tone evened (blotches toward the cheek's own broad level), dark patches lifted more
            const lowDev = gf[i] - gl[i];
            dL -= c * s * Math.min(1, amount) * 0.45 * (lowDev < 0 ? lowDev : 0.5 * lowDev);
            if (Math.abs(dL) + Math.abs(dA) + Math.abs(dB) < 0.05)
                continue;
            const rgb = labToSrgb([clamp(L[i] + dL, 0, 100), A[i] + dA, B[i] + dB]), j = (Y * w + X) * ch;
            for (let q = 0; q < 3; q++)
                data[j + q] = toByte(rgb[q]);
            changed++;
        }
    return changed;
}
function inPoly(x, y, poly) {
    let inside = false;
    for (let a = poly.length - 1, b = 0; b < poly.length; a = b++)
        if ((poly[a][1] > y) !== (poly[b][1] > y) && x < (poly[b][0] - poly[a][0]) * (y - poly[a][1]) / (poly[b][1] - poly[a][1]) + poly[a][0])
            inside = !inside;
    return inside;
}
/** Sclera: brighter and less red in the low band. Returns pixels changed. */
export function brightenEyeWhites(img, face, amount) {
    if (!(amount > 0))
        return 0;
    const { width: w, height: h, channels: ch, data } = img;
    let changed = 0;
    for (const contour of [CONTOURS.right_eye, CONTOURS.left_eye]) {
        const poly = contour.map((k) => face[k]);
        const xs = poly.map((q) => q[0]), ys = poly.map((q) => q[1]);
        const x0 = Math.max(0, Math.floor(Math.min(...xs))), x1 = Math.min(w - 1, Math.ceil(Math.max(...xs)));
        const y0 = Math.max(0, Math.floor(Math.min(...ys))), y1 = Math.min(h - 1, Math.ceil(Math.max(...ys)));
        const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
        if (bw < 4 || bh < 3)
            continue;
        const L = new Float64Array(bw * bh), A = new Float64Array(bw * bh), B = new Float64Array(bw * bh), inside = new Uint8Array(bw * bh);
        const Ls = [];
        for (let y = y0; y <= y1; y++)
            for (let x = x0; x <= x1; x++) {
                const k = (y - y0) * bw + (x - x0), j = (y * w + x) * ch, lab = srgbToLab([data[j], data[j + 1], data[j + 2]]);
                L[k] = lab[0];
                A[k] = lab[1];
                B[k] = lab[2];
                if (inPoly(x + 0.5, y + 0.5, poly)) {
                    inside[k] = 1;
                    Ls.push(lab[0]);
                }
            }
        if (Ls.length < 12)
            continue;
        Ls.sort((a, b) => a - b);
        const lCut = Ls[Math.floor(0.55 * Ls.length)];
        const sel = new Float64Array(bw * bh);
        for (let k = 0; k < sel.length; k++)
            if (inside[k])
                sel[k] = smoothstep(lCut - 4, lCut + 4, L[k]) * (1 - smoothstep(18, 30, Math.hypot(A[k], B[k])));
        const soft = gaussian(sel, bw, bh, 0.8), aLow = gaussian(A, bw, bh, 1.6), bLow = gaussian(B, bw, bh, 1.6);
        for (let y = y0; y <= y1; y++)
            for (let x = x0; x <= x1; x++) {
                const k = (y - y0) * bw + (x - x0), s = soft[k] * (inside[k] ? 1 : 0);
                if (s < 0.02)
                    continue;
                const nl = L[k] + 5 * amount * s, na = A[k] - 0.6 * amount * s * Math.max(0, aLow[k]), nb = B[k] - 0.4 * amount * s * Math.max(0, bLow[k] - 2);
                const rgb = labToSrgb([Math.min(96, nl), na, nb]), j = (y * w + x) * ch;
                for (let c = 0; c < 3; c++)
                    data[j + c] = toByte(rgb[c]);
                changed++;
            }
    }
    return changed;
}
/** Median Lab of the darker half of small patches around landmarks (brows: the hairs, not the skin between them). */
function patchLab(L, img, pts, r, darkerHalf) {
    const { width: w, height: h, channels: ch, data } = img, v = [];
    for (const q of pts)
        for (let dy = -r; dy <= r; dy++)
            for (let dx = -r; dx <= r; dx++) {
                const x = Math.round(q[0] + dx), y = Math.round(q[1] + dy);
                if (x < 0 || y < 0 || x >= w || y >= h)
                    continue;
                const j = (y * w + x) * ch;
                v.push(srgbToLab([data[j], data[j + 1], data[j + 2]]));
            }
    void L;
    if (!v.length)
        return [50, 8, 14];
    v.sort((p, q) => p[0] - q[0]);
    const use = darkerHalf ? v.slice(0, Math.max(1, v.length >> 1)) : v, med = (k) => use.map((x) => x[k]).sort((p, q) => p - q)[use.length >> 1];
    return [med(0), med(1), med(2)];
}
/**
 * Grey/white hair -> a natural colour as a LUMINANCE-PRESERVING RAMP, not a tint over silver.
 * The person's own per-pixel hair lightness (their strands, speculars and shadows) is mapped through a real hair
 * colour gradient: deep warm brown in the shadows and at the roots, mid brown, golden at the highlights. So own
 * highlights stay highlights (golden, not white), own shadows stay shadows, and the strand texture is the person's.
 * - Shade picked from the brows (their own hair colour) and the skin's undertone: hue 49-72 degrees, ramp lightness
 *   from the brows.
 * - Varied tone between strands: mid-scale ribbons along the hair's flow change hue and chroma (and +-2 L*).
 * - Edges and flyaways: the mapping is blended by the segmenter's own confidence, so thin hair over the background
 *   stays partly see-through, and nothing outside the hair is touched (no halo).
 * All lengths follow the eye distance (Studio 1024x1536 and the small renders behave alike).
 */
export function recolourGrey(img, hair, face, amount, seed = 7) {
    const { width: w, height: h, channels: ch, data } = img, n = w * h;
    const none = { pixels: 0, greyShareBefore: 0, greyShareAfter: 0, highBandRatio: 1, hueDeg: 0 };
    if (!(amount > 0))
        return none;
    const iod = down(face)[2];
    const L = new Float64Array(n), A = new Float64Array(n), B = new Float64Array(n);
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let i = 0; i < n; i++)
        if (hair[i] > 0.08) {
            const x = i % w, y = (i - x) / w;
            x0 = Math.min(x0, x);
            x1 = Math.max(x1, x);
            y0 = Math.min(y0, y);
            y1 = Math.max(y1, y);
        }
    if (x1 < 0)
        return none;
    for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
            const i = y * w + x, j = i * ch, lab = srgbToLab([data[j], data[j + 1], data[j + 2]]);
            L[i] = lab[0];
            A[i] = lab[1];
            B[i] = lab[2];
        }
    const rB = Math.max(2, Math.round(0.016 * iod)), rS = Math.max(3, Math.round(0.03 * iod));
    const brow = patchLab(null, img, [70, 63, 105, 66, 107, 336, 296, 334, 293, 300].map((k) => face[k]), rB, true);
    const skinT = patchLab(null, img, [117, 346, 205, 425].map((k) => face[k]), rS, false);
    const browC = Math.hypot(brow[1], brow[2]), hb = Math.atan2(brow[2], brow[1]), hs = Math.atan2(skinT[2], skinT[1]);
    const wB = smoothstep(5, 12, browC), hue = Math.min(1.25, Math.max(0.85, wB * hb + (1 - wB) * hs + 0.15));
    // ramp ends from the brows: darker brows -> darker hair
    const Lhi = clamp(brow[0] + 10, 46, 60), Llo = Lhi - 40;
    const sig = Math.max(1.5, 0.012 * iod);
    const lowL = gaussian(L, w, h, sig), lowA = gaussian(A, w, h, sig), lowB = gaussian(B, w, h, sig);
    // the person's own lightness range in the grey hair
    const lv = [];
    for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x += 2) {
            const i = y * w + x;
            if (hair[i] > 0.5)
                lv.push(L[i]);
        }
    lv.sort((p, q) => p - q);
    const pct = (f) => (lv.length ? lv[Math.min(lv.length - 1, Math.floor(f * lv.length))] : 50 + 40 * (f - 0.5));
    const p03 = pct(0.03), p98 = Math.max(p03 + 15, pct(0.98));
    // flow, for tone ribbons along the strands
    const g = gaussian(L, w, h, Math.max(1.2, 0.005 * iod)), jxx = new Float64Array(n), jyy = new Float64Array(n), jxy = new Float64Array(n);
    for (let y = Math.max(1, y0); y <= Math.min(h - 2, y1); y++)
        for (let x = Math.max(1, x0); x <= Math.min(w - 2, x1); x++) {
            const i = y * w + x, gx = g[i + 1] - g[i - 1], gy = g[i + w] - g[i - w];
            jxx[i] = gx * gx;
            jyy[i] = gy * gy;
            jxy[i] = gx * gy;
        }
    const ts = Math.max(3, 0.015 * iod), Jxx = gaussian(jxx, w, h, ts), Jyy = gaussian(jyy, w, h, ts), Jxy = gaussian(jxy, w, h, ts);
    const r = rng(seed), coarse0 = new Float64Array(n);
    for (let i = 0; i < n; i++)
        coarse0[i] = r() - 0.5;
    const coarse = gaussian(coarse0, w, h, Math.max(2, 0.014 * iod));
    let cs = 0, cn = 0;
    for (let i = 0; i < n; i += 7) {
        cs += coarse[i] * coarse[i];
        cn++;
    }
    const csd = Math.sqrt(cs / Math.max(1, cn)) || 1;
    const Kc = Math.max(14, Math.round(0.1 * iod));
    const oval = CONTOURS.face_oval.map((k) => face[k]);
    let grey0 = 0, grey1 = 0, cnt = 0, hb0 = 0, hb1 = 0, px = 0;
    const hiBand = Float64Array.from(L, (v, i) => v - lowL[i]);
    for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
            const i = y * w + x, m = hair[i];
            if (m < 0.08)
                continue;
            const greyness = (1 - smoothstep(8, 16, Math.hypot(lowA[i], lowB[i]))) * smoothstep(38, 54, lowL[i]);
            if (m > 0.5) {
                cnt++;
                if (greyness > 0.5)
                    grey0++;
            }
            if (greyness < 0.02)
                continue;
            const th = 0.5 * Math.atan2(2 * Jxy[i], Jxx[i] - Jyy[i]) + Math.PI / 2, tx = Math.cos(th), ty = Math.sin(th);
            let rb = 0, rc = 0;
            for (let k = -Kc; k <= Kc; k += 2) {
                const xx = Math.round(x + tx * k), yy = Math.round(y + ty * k);
                if (xx < 0 || yy < 0 || xx >= w || yy >= h)
                    continue;
                rb += coarse[yy * w + xx];
                rc++;
            }
            const ribbon = rc ? Math.tanh((rb / rc) / (csd / Math.sqrt(rc / 2)) * 0.6) : 0;
            let dmin = Infinity;
            for (const q of oval)
                dmin = Math.min(dmin, Math.hypot(x - q[0], y - q[1]));
            const root = 1 - smoothstep(0.02 * iod, 0.3 * iod, dmin);
            // own lightness -> ramp position (a gentle S keeps mids in the brown, highlights golden)
            const u = clamp((L[i] - p03) / (p98 - p03)), uc = Math.pow(u, 1.25);
            const lT = Llo + (Lhi - Llo) * uc - 5 * root * (1 - u) + 2 * ribbon;
            const hueT = hue - 0.08 * (1 - uc) + 0.1 * uc + 0.07 * ribbon; // redder in shadow, golden in light
            const cT = (5 + 8 * Math.sin(Math.PI * clamp((lT - Llo + 6) / (Lhi - Llo + 12))) + 5 * uc) * (1 + 0.12 * ribbon) * (0.85 + 0.25 * Math.min(1.1, amount));
            // below full amount the brightest strands keep their silver (salt and pepper), the rest take the full ramp
            const k = clamp(Math.min(1, 1.6 * amount) * greyness) * smoothstep(0.08, 0.6, m) * (1 - (1 - Math.min(1, amount)) * smoothstep(0.55, 0.9, u));
            const nl = L[i] + (lT - L[i]) * k, na = A[i] + (cT * Math.cos(hueT) - A[i]) * k, nb = B[i] + (cT * Math.sin(hueT) - B[i]) * k;
            const rgb = labToSrgb([clamp(nl, 0, 100), na, nb]), j = i * ch;
            for (let q = 0; q < 3; q++)
                data[j + q] = toByte(rgb[q]);
            px++;
            if (m > 0.5) {
                hb0 += hiBand[i] ** 2;
                L[i] = nl;
                if (greyness * (1 - k) > 0.5)
                    grey1++;
            }
        }
    const lowN = gaussian(L, w, h, sig);
    for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
            const i = y * w + x;
            if (hair[i] > 0.5 && (1 - smoothstep(8, 16, Math.hypot(lowA[i], lowB[i]))) * smoothstep(38, 54, lowL[i]) >= 0.02)
                hb1 += (L[i] - lowN[i]) ** 2;
        }
    return { pixels: px, greyShareBefore: cnt ? grey0 / cnt : 0, greyShareAfter: cnt ? grey1 / cnt : 0, highBandRatio: hb0 > 0 ? Math.sqrt(hb1 / hb0) : 1, hueDeg: hue * 180 / Math.PI };
}
/**
 * Older: grey hair from the person's OWN strands. Nothing is drawn: no flow-smeared noise strands (they read as
 * silver scribbles at 200%). Which strands turn first follows the photo's own strand contrast (the lighter strands
 * of each lock, read from the high band), under a broad, slowly varying share that is higher at the temples and
 * along the hairline. A greyed pixel keeps its own strand texture (high band, a little stronger) on a lighter,
 * nearly colourless low band, so the hair reads as salt and pepper rather than a wash or painted lines.
 */
export function greyHair(img, hair, face, amount, seed = 5) {
    const { width: w, height: h, channels: ch, data } = img, n = w * h;
    if (!(amount > 0))
        return 0;
    const iod = down(face)[2];
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let i = 0; i < n; i++)
        if (hair[i] > 0.3) {
            const x = i % w, y = (i - x) / w;
            x0 = Math.min(x0, x);
            x1 = Math.max(x1, x);
            y0 = Math.min(y0, y);
            y1 = Math.max(y1, y);
        }
    if (x1 < 0)
        return 0;
    const L = new Float64Array(n), A = new Float64Array(n), B = new Float64Array(n);
    for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
            const i = y * w + x, j = i * ch, lab = srgbToLab([data[j], data[j + 1], data[j + 2]]);
            L[i] = lab[0];
            A[i] = lab[1];
            B[i] = lab[2];
        }
    const sig = Math.max(1.5, 0.012 * iod), lowL = gaussian(L, w, h, sig);
    // the strand contrast's own scale: the spread of the high band over the hair
    let s2 = 0, k2 = 0;
    for (let y = y0; y <= y1; y += 2)
        for (let x = x0; x <= x1; x += 2) {
            const i = y * w + x;
            if (hair[i] >= 0.5) {
                s2 += (L[i] - lowL[i]) ** 2;
                k2++;
            }
        }
    const spread = Math.max(1, Math.sqrt(s2 / Math.max(1, k2)));
    const inner = gaussian(Float64Array.from(hair, (v) => v), w, h, Math.max(1.5, 0.008 * iod));
    // broad, slowly varying share: smooth random field about a fifth of the eye distance across (never strand-scale)
    const r = rng(seed), coarse = new Float64Array(n);
    for (let i = 0; i < n; i++)
        coarse[i] = r();
    const broad = gaussian(coarse, w, h, Math.max(4, 0.2 * iod));
    let bm = 0, bs = 0, bk = 0;
    for (let y = y0; y <= y1; y += 3)
        for (let x = x0; x <= x1; x += 3) {
            const v = broad[y * w + x];
            bm += v;
            bs += v * v;
            bk++;
        }
    bm /= Math.max(1, bk);
    const bsd = Math.max(1e-6, Math.sqrt(Math.max(0, bs / Math.max(1, bk) - bm * bm)));
    const oval = CONTOURS.face_oval.map((k) => face[k]), temples = [face[127], face[356]];
    let px = 0;
    for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
            const i = y * w + x, m = hair[i];
            if (m < 0.3)
                continue;
            const edge = smoothstep(0.55, 0.9, inner[i]);
            if (edge <= 0)
                continue;
            let dmin = Infinity;
            for (const q of oval)
                dmin = Math.min(dmin, Math.hypot(x - q[0], y - q[1]));
            const nearLine = 1 - smoothstep(0.05 * iod, 0.35 * iod, dmin);
            let temple = 0;
            for (const tq of temples)
                temple = Math.max(temple, Math.exp(-((x - tq[0]) ** 2 + (y - tq[1]) ** 2) / (2 * (0.4 * iod) ** 2)));
            const share = clamp(amount * (0.55 + 0.3 * nearLine + 0.45 * temple) * (1 + 0.35 * (broad[i] - bm) / bsd));
            const own = (L[i] - lowL[i]) / spread; // this pixel's own strand contrast, in spreads
            // No per-strand selection: in dark hair the photo's own "strand" contrast is mostly grain and blotches, and
            // picking pixels by it drew bright flecks. The whole lock lightens evenly by a ratio (as more light would), so
            // every strand keeps exactly its own contrast; the share varies only broadly (temples, hairline).
            void own;
            const sel = share;
            const k = sel * edge * Math.min(1, m);
            if (k < 0.01)
                continue;
            // Silver from the pixel's own light: luminance is scaled (a ratio, so every strand keeps its own contrast against
            // its neighbours) until the lock's low band sits at a light grey, with highlights compressed a little; colour
            // fades toward neutral. A wash in L* flattened black hair into a grey slab.
            const Ylow = Math.max(0.004, ((lowL[i] + 16) / 116) ** 3), Yt = ((Math.max(lowL[i], 38 + 0.3 * lowL[i]) + 16) / 116) ** 3;
            const Ypx = ((L[i] + 16) / 116) ** 3, ratio = Ypx / Ylow;
            const Yg = Math.min(0.92, Yt * Math.pow(ratio, 0.85)), Lgrey = 116 * Math.cbrt(Yg) - 16;
            const nl = L[i] + (Lgrey - L[i]) * k;
            const na = A[i] * (1 - 0.8 * k), nb = B[i] * (1 - 0.75 * k) + 1.5 * k;
            const rgb = labToSrgb([clamp(nl, 0, 100), na, nb]), j = i * ch;
            for (let q = 0; q < 3; q++)
                data[j + q] = toByte(rgb[q]);
            px++;
        }
    return px;
}
/** Older soft-tissue descent on the mesh (for the guarded warp): brows drop a little (more at the tail), the
 * nose tip and columella lengthen, and the lateral upper lids hood slightly. Shares of IOD at full amount. */
export const SAG = { brow: 0.022, browTail: 0.014, noseTip: 0.018, lid: 0.006 };
const BROW_R = [70, 63, 105, 66, 107, 46, 53, 52, 65, 55], BROW_L = [300, 293, 334, 296, 336, 276, 283, 282, 295, 285];
const NOSE_TIP = [1, 2, 4, 5, 19, 94, 141, 370, 125, 354], LID_R = [161, 160, 159, 246], LID_L = [388, 387, 386, 466];
export function olderSag(face, target, share) {
    const [dx, dy, iod] = down(face), out = target.map((p) => [p[0], p[1]]);
    const mv = (i, s) => { out[i] = [out[i][0] + dx * s * iod, out[i][1] + dy * s * iod]; };
    const cx = (face[33][0] + face[263][0]) / 2;
    for (const ids of [BROW_R, BROW_L]) {
        const xs = ids.map((i) => Math.abs(face[i][0] - cx)), lo = Math.min(...xs), hi = Math.max(...xs);
        ids.forEach((i, k) => mv(i, share * (SAG.brow + SAG.browTail * (xs[k] - lo) / Math.max(1, hi - lo))));
    }
    for (const i of NOSE_TIP)
        mv(i, share * SAG.noseTip * (i === 1 || i === 2 || i === 94 ? 1 : 0.6));
    for (const i of [...LID_R, ...LID_L])
        mv(i, share * SAG.lid * (i === 246 || i === 466 || i === 161 || i === 388 ? 1 : 0.5));
    return out;
}
/** Older: brows grey a little, from their own hairs (lighter hairs first), far less than the scalp. */
export function greyBrows(img, face, amount) {
    if (!(amount > 0))
        return 0;
    const { width: w, height: h } = img, iod = down(face)[2];
    const polys = [[70, 63, 105, 66, 107, 55, 65, 52, 53, 46], [300, 293, 334, 296, 336, 285, 295, 282, 283, 276]].map((p) => p.map((k) => face[k]));
    const mask = new Float64Array(w * h);
    for (const poly of polys) {
        const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
        for (let y = Math.max(0, Math.floor(Math.min(...ys) - 3)); y <= Math.min(h - 1, Math.ceil(Math.max(...ys) + 3)); y++)
            for (let x = Math.max(0, Math.floor(Math.min(...xs) - 3)); x <= Math.min(w - 1, Math.ceil(Math.max(...xs) + 3)); x++)
                if (inPoly(x, y, poly))
                    mask[y * w + x] = 1;
    }
    const soft = gaussian(mask, w, h, Math.max(1, 0.012 * iod));
    return greyHair(img, soft, face, amount, 23);
}
/**
 * Younger: lines out, own pores in. Long dark line ridges (crow's feet, forehead, under-eye, perioral, neck rings) are
 * found at three scales (anisotropic, long, not hair, not a mark). Inside each, the low band is inpainted from the skin
 * around it and the high band is replaced by the person's OWN pore texture copied from clean skin beside the line,
 * along the line's normal (own-only quilting: the Donor Rule holds). Pores and grain elsewhere are untouched.
 */
export function eraseCreases(img, support, face, amount, hold) {
    const { width: w, height: h, channels: ch, data } = img;
    const res = { creasePixels: 0, meanDepthBefore: 0, meanDepthAfter: 0 };
    if (!(amount > 0))
        return res;
    const iod = down(face)[2];
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let i = 0; i < w * h; i++)
        if (support[i] > 0.3) {
            const x = i % w, y = (i - x) / w;
            x0 = Math.min(x0, x);
            x1 = Math.max(x1, x);
            y0 = Math.min(y0, y);
            y1 = Math.max(y1, y);
        }
    if (x1 < 0)
        return res;
    const pad = Math.ceil(0.08 * iod);
    x0 = Math.max(0, x0 - pad);
    y0 = Math.max(0, y0 - pad);
    x1 = Math.min(w - 1, x1 + pad);
    y1 = Math.min(h - 1, y1 + pad);
    const cw = x1 - x0 + 1, chh = y1 - y0 + 1, n = cw * chh;
    const L = new Float64Array(n), A = new Float64Array(n), B = new Float64Array(n), S = new Float64Array(n), Hm = new Float64Array(n);
    for (let y = 0; y < chh; y++)
        for (let x = 0; x < cw; x++) {
            const gi = (y + y0) * w + x + x0, i = y * cw + x, j = gi * ch, lab = srgbToLab([data[j], data[j + 1], data[j + 2]]);
            L[i] = lab[0];
            A[i] = lab[1];
            B[i] = lab[2];
            S[i] = support[gi];
            Hm[i] = hold ? hold[gi] : 0;
        }
    // skin median (hair below it is not a line)
    const ls = [];
    for (let i = 0; i < n; i += 5)
        if (S[i] > 0.9)
            ls.push(L[i]);
    ls.sort((a, b) => a - b);
    const medL = ls.length ? ls[ls.length >> 1] : 50;
    // line ridges at three scales: anisotropic, long, standing out against this face's own texture
    const C = new Float64Array(n), nX = new Float64Array(n), nY = new Float64Array(n), wid = new Float64Array(n);
    const low = gaussian(L, cw, chh, Math.max(1.5, 0.015 * iod));
    for (const sc of [0.008, 0.014, 0.024].map((f) => Math.max(1, f * iod))) {
        const rd = darkRidges(L, cw, chh, sc);
        const st = [];
        for (let i = 0; i < n; i += 3)
            if (S[i] > 0.9)
                st.push(rd.strength[i]);
        st.sort((a, b) => a - b);
        const thr = st.length ? Math.max(1e-6, st[Math.floor(0.8 * st.length)]) : Infinity;
        const cand = new Uint8Array(n);
        for (let i = 0; i < n; i++)
            if (S[i] > 0.3 && rd.anisotropy[i] >= 0.55 && rd.strength[i] > thr && low[i] > medL - 22)
                cand[i] = 1;
        const R = Math.max(5, Math.round(0.05 * iod));
        for (let y = 0; y < chh; y++)
            for (let x = 0; x < cw; x++) {
                const i = y * cw + x;
                if (!cand[i])
                    continue;
                const tx = -rd.ny[i], ty = rd.nx[i];
                let on = 0, tot = 0;
                for (let k = -R; k <= R; k += 2) {
                    if (!k)
                        continue;
                    tot++;
                    const xx = Math.round(x + tx * k), yy = Math.round(y + ty * k);
                    if (xx < 1 || yy < 1 || xx >= cw - 1 || yy >= chh - 1)
                        continue;
                    let hit = 0;
                    for (let d = -1; d <= 1 && !hit; d++)
                        for (let e = -1; e <= 1 && !hit; e++)
                            if (cand[(yy + d) * cw + xx + e])
                                hit = 1;
                    on += hit;
                }
                const c = smoothstep(0.45, 0.7, on / Math.max(1, tot)) * smoothstep(thr, 2 * thr, rd.strength[i]) * smoothstep(0.55, 0.75, rd.anisotropy[i]);
                if (c > C[i]) {
                    C[i] = c;
                    nX[i] = rd.nx[i];
                    nY[i] = rd.ny[i];
                    wid[i] = sc;
                }
            }
    }
    // widen to the line's own width, keep marks and protected anatomy out
    const Cw = gaussian(C, cw, chh, Math.max(1, 0.006 * iod));
    for (let i = 0; i < n; i++)
        C[i] = Math.min(1, Math.max(C[i], 1.6 * Cw[i])) * (1 - Hm[i]) * S[i];
    // propagate the normal to the widened pixels (nearest strong neighbour within 3 px)
    for (let y = 3; y < chh - 3; y++)
        for (let x = 3; x < cw - 3; x++) {
            const i = y * cw + x;
            if (C[i] < 0.05 || wid[i] > 0)
                continue;
            let best = 0;
            for (let d = -3; d <= 3; d++)
                for (let e = -3; e <= 3; e++) {
                    const q = (y + d) * cw + x + e;
                    if (wid[q] > 0 && C[q] > best) {
                        best = C[q];
                        nX[i] = nX[q];
                        nY[i] = nY[q];
                        wid[i] = wid[q];
                    }
                }
        }
    // inpaint the low band from the skin around the lines (normalised convolution)
    const sigF = Math.max(2, 0.02 * iod), wgt = Float64Array.from(C, (c, i) => (1 - c) * (S[i] > 0.05 ? 1 : 0));
    const fill = (P) => { const num = gaussian(Float64Array.from(P, (v, i) => v * wgt[i]), cw, chh, sigF), den = gaussian(wgt, cw, chh, sigF); return Float64Array.from(num, (v, i) => den[i] > 1e-4 ? v / den[i] : P[i]); };
    const sh = Math.max(0.8, 0.008 * iod);
    const lowL = gaussian(L, cw, chh, sh), lowA = gaussian(A, cw, chh, sh), lowB = gaussian(B, cw, chh, sh);
    const fL = fill(lowL), fA = fill(lowA), fB = fill(lowB);
    const hiL = Float64Array.from(L, (v, i) => v - lowL[i]);
    let dB = 0, dA = 0, cnt = 0;
    for (let y = 0; y < chh; y++)
        for (let x = 0; x < cw; x++) {
            const i = y * cw + x, c = C[i] * amount;
            if (c < 0.01)
                continue;
            // own pores from clean skin beside the line: step along the normal, the cleaner side first
            const dist = Math.max(3, 3.5 * (wid[i] || sh) + 0.01 * iod);
            let src = -1;
            for (const mul of [1, 1.6, 2.3]) {
                for (const sg of [1, -1]) {
                    const xx = Math.round(x + nX[i] * dist * mul * sg), yy = Math.round(y + nY[i] * dist * mul * sg);
                    if (xx < 0 || yy < 0 || xx >= cw || yy >= chh)
                        continue;
                    const q = yy * cw + xx;
                    if (C[q] < 0.15 && S[q] > 0.5 && Hm[q] < 0.5) {
                        src = q;
                        break;
                    }
                }
                if (src >= 0)
                    break;
            }
            const hiNew = src >= 0 ? hiL[src] : hiL[i] * 0.4;
            const nl = L[i] + c * (fL[i] + hiNew - L[i]), na = A[i] + c * (fA[i] - lowA[i]), nb = B[i] + c * (fB[i] - lowB[i]);
            if (C[i] > 0.5) {
                dB += Math.max(0, fL[i] - lowL[i]);
                dA += Math.max(0, fL[i] - (lowL[i] + c * (fL[i] - lowL[i])));
                cnt++;
            }
            const rgb = labToSrgb([clamp(nl, 0, 100), na, nb]), j = ((y + y0) * w + x + x0) * ch;
            for (let q = 0; q < 3; q++)
                data[j + q] = toByte(rgb[q]);
            res.creasePixels++;
        }
    res.meanDepthBefore = cnt ? dB / cnt : 0;
    res.meanDepthAfter = cnt ? dA / cnt : 0;
    return res;
}
/**
 * Young-skin cues, all low-frequency (the high band is not touched): slightly fuller-looking, pinker lips; a little
 * less sallowness on the skin; a soft healthy luminosity on the cheek apples; gaps in a thinned brow filled toward the
 * brow's own colour. Returns pixels changed. Older uses a negative amount: a little sallower, duller cheeks, paler
 * lips, and thinner brows (gaps lightened toward the skin).
 */
export function youngCues(img, support, face, amount) {
    const { width: w, height: h, channels: ch, data } = img;
    if (!amount)
        return 0;
    const iod = down(face)[2];
    const pts = face.map((p) => [p[0], p[1]]);
    const lipsO = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146].map((k) => pts[k]);
    const lipsI = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95].map((k) => pts[k]);
    const brows = [[70, 63, 105, 66, 107, 55, 65, 52, 53, 46], [300, 293, 334, 296, 336, 285, 295, 282, 283, 276]].map((p) => p.map((k) => pts[k]));
    const all = [...lipsO, ...brows.flat(), pts[50], pts[280], ...CONTOURS.face_oval.map((k) => pts[k])];
    const x0 = Math.max(0, Math.floor(Math.min(...all.map((p) => p[0])) - 0.2 * iod)), x1 = Math.min(w - 1, Math.ceil(Math.max(...all.map((p) => p[0])) + 0.2 * iod));
    const y0 = Math.max(0, Math.floor(Math.min(...all.map((p) => p[1])) - 0.2 * iod)), y1 = Math.min(h - 1, Math.ceil(Math.max(...all.map((p) => p[1])) + 0.2 * iod));
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1, n = bw * bh;
    const lip = new Float64Array(n), brow = new Float64Array(n), L = new Float64Array(n), A = new Float64Array(n), B = new Float64Array(n), S = new Float64Array(n);
    for (let y = 0; y < bh; y++)
        for (let x = 0; x < bw; x++) {
            const X = x + x0, Y = y + y0, i = y * bw + x, j = (Y * w + X) * ch, lab = srgbToLab([data[j], data[j + 1], data[j + 2]]);
            L[i] = lab[0];
            A[i] = lab[1];
            B[i] = lab[2];
            S[i] = support[Y * w + X];
            if (inPoly(X, Y, lipsO) && !inPoly(X, Y, lipsI))
                lip[i] = 1;
            if (inPoly(X, Y, brows[0]) || inPoly(X, Y, brows[1]))
                brow[i] = 1;
        }
    const lipS = gaussian(lip, bw, bh, Math.max(1, 0.012 * iod)), browS = gaussian(brow, bw, bh, Math.max(1, 0.01 * iod));
    const sig = Math.max(1.5, 0.012 * iod), lowL = gaussian(L, bw, bh, sig), lowA = gaussian(A, bw, bh, sig), lowB = gaussian(B, bw, bh, sig);
    // brow's own colour: the darker third of the brow pixels
    const bl = [];
    for (let i = 0; i < n; i++)
        if (brow[i])
            bl.push(L[i]);
    bl.sort((p, q) => p - q);
    const browL = bl.length ? bl[Math.floor(bl.length / 3)] : 0;
    const skinB = [];
    for (let i = 0; i < n; i += 4)
        if (S[i] > 0.9 && !lip[i])
            skinB.push(lowB[i]);
    skinB.sort((p, q) => p - q);
    const medB = skinB.length ? skinB[skinB.length >> 1] : 15;
    // A man's lip is not made pink (it reads as lipstick). The cue is beard-zone texture: shaved or stubbled chin skin
    // carries more fine texture than the cheeks (men 1.66-3.45x, women 1.29-1.43x on the samples). The lip change
    // also stays inside the lip line.
    const hbP = gaussian(L, bw, bh, 1.5), sdBox = (c, r) => {
        let s1 = 0, s2 = 0, k = 0;
        for (let y = Math.round(c[1] - r); y <= Math.round(c[1] + r); y++)
            for (let x = Math.round(c[0] - r); x <= Math.round(c[0] + r); x++) {
                if (x < x0 || x > x1 || y < y0 || y > y1)
                    continue;
                const i = (y - y0) * bw + (x - x0), v = L[i] - hbP[i];
                s1 += v;
                s2 += v * v;
                k++;
            }
        return k > 4 ? Math.sqrt(Math.max(0, s2 / k - (s1 / k) ** 2)) : 0;
    };
    const chinC = [(pts[17][0] + pts[152][0]) / 2, (pts[17][1] + pts[152][1]) / 2];
    const cheekSd = (sdBox(pts[50], 0.1 * iod) + sdBox(pts[280], 0.1 * iod)) / 2;
    const beardRatio = cheekSd > 0 ? sdBox(chinC, 0.12 * iod) / cheekSd : 1;
    const masc = smoothstep(1.47, 1.62, beardRatio), lipAmt = amount * (1 - 0.75 * masc);
    for (let i = 0; i < n; i++)
        lipS[i] *= lip[i] ? 1 : 0.25;
    const rC = 0.28 * iod, cheeks = [pts[50], pts[280]];
    let changed = 0;
    for (let y = 0; y < bh; y++)
        for (let x = 0; x < bw; x++) {
            const i = y * bw + x, X = x + x0, Y = y + y0;
            let dL = 0, dA = 0, dB = 0;
            const s = S[i] * (1 - lipS[i]) * (1 - browS[i]);
            if (s > 0.01) {
                dB -= s * amount * 1.6 * smoothstep(medB - 4, medB + 4, lowB[i]); // less sallow (yellow) where it is yellowest
                let c = 0;
                for (const q of cheeks)
                    c = Math.max(c, Math.exp(-((X - q[0]) ** 2 + (Y - q[1]) ** 2) / (2 * rC * rC)));
                dL += s * amount * 2.2 * c;
                dA += s * amount * 1.2 * c; // healthy cheek luminosity and flush
            }
            if (lipS[i] > 0.01) {
                dA += lipS[i] * lipAmt * 3.2;
                dB += lipS[i] * lipAmt * 0.4;
                dL -= lipS[i] * lipAmt * 0.8;
            }
            if (browS[i] > 0.01 && bl.length)
                dL -= browS[i] * amount * 0.45 * Math.max(0, lowL[i] - browL - 3);
            if (Math.abs(dL) + Math.abs(dA) + Math.abs(dB) < 0.05)
                continue;
            void lowA;
            const rgb = labToSrgb([clamp(L[i] + dL, 0, 100), A[i] + dA, B[i] + dB]), j = (Y * w + X) * ch;
            for (let q = 0; q < 3; q++)
                data[j + q] = toByte(rgb[q]);
            changed++;
        }
    return changed;
}
