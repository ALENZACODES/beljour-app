import { clamp, gaussian } from "../core/bands.js";
import { labToSrgb, srgbToLab, toByte } from "../shade/colourspace.js";
import { CONTOURS } from "../../data/regions/generated/topology.js";
export const FEATURE_CONTRAST_DROP = 0.22; // at amount 1
function inPoly(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, yi] = poly[i], [xj, yj] = poly[j];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-9) + xi)
            inside = !inside;
    }
    return inside;
}
export function olderFeatureTone(input, face, amount) {
    const { width: w, height: h, channels: ch, data } = input;
    const amt = clamp(amount), out = new Uint8Array(data), edit = new Float32Array(w * h);
    const zero = { feature_contrast_before: 0, feature_contrast_after: 0 };
    if (amt <= 0 || face.length < 478)
        return { image: { ...input, data: out }, edit, metrics: zero };
    const iod = Math.hypot(face[263][0] - face[33][0], face[263][1] - face[33][1]) || 60;
    // work box: brows to below the lips
    const pts = [...CONTOURS.right_brow, ...CONTOURS.left_brow, ...CONTOURS.lips_outer, ...CONTOURS.right_eye, ...CONTOURS.left_eye].map((k) => face[k]);
    const pad = Math.round(0.35 * iod);
    const x0 = Math.max(0, Math.floor(Math.min(...pts.map((p) => p[0])) - pad)), x1 = Math.min(w - 1, Math.ceil(Math.max(...pts.map((p) => p[0])) + pad));
    const y0 = Math.max(0, Math.floor(Math.min(...pts.map((p) => p[1])) - pad)), y1 = Math.min(h - 1, Math.ceil(Math.max(...pts.map((p) => p[1])) + pad));
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1, m = bw * bh;
    const L = new Float32Array(m), A = new Float32Array(m), B = new Float32Array(m);
    for (let y = 0; y < bh; y++)
        for (let x = 0; x < bw; x++) {
            const j = ((y + y0) * w + x + x0) * ch, lab = srgbToLab([data[j], data[j + 1], data[j + 2]]), i = y * bw + x;
            L[i] = lab[0];
            A[i] = lab[1];
            B[i] = lab[2];
        }
    const poly = (ids) => ids.map((k) => [face[k][0] - x0, face[k][1] - y0]);
    const fill = (polys) => {
        const mk = new Float32Array(m);
        for (const pg of polys) {
            const xs = pg.map((p) => p[0]), ys = pg.map((p) => p[1]);
            for (let y = Math.max(0, Math.floor(Math.min(...ys))); y <= Math.min(bh - 1, Math.ceil(Math.max(...ys))); y++)
                for (let x = Math.max(0, Math.floor(Math.min(...xs))); x <= Math.min(bw - 1, Math.ceil(Math.max(...xs))); x++)
                    if (inPoly(x, y, pg))
                        mk[y * bw + x] = 1;
        }
        return mk;
    };
    const brows = gaussian(fill([poly(CONTOURS.right_brow), poly(CONTOURS.left_brow)]), bw, bh, Math.max(1.5, 0.02 * iod));
    const lipsHard = fill([poly(CONTOURS.lips_outer)]), lips = gaussian(lipsHard, bw, bh, Math.max(1.5, 0.012 * iod));
    const eyesHard = fill([poly(CONTOURS.right_eye), poly(CONTOURS.left_eye)]);
    // features and their surround: the skin level is the masked blur of everything that is not a feature or the eye
    const feat = new Float32Array(m);
    for (let i = 0; i < m; i++)
        feat[i] = Math.max(brows[i] > 0.05 ? 1 : 0, lips[i] > 0.05 ? 1 : 0, eyesHard[i]);
    const featWide = gaussian(feat, bw, bh, Math.max(2, 0.03 * iod)), wSkin = new Float32Array(m), wl = new Float32Array(m);
    for (let i = 0; i < m; i++) {
        wSkin[i] = featWide[i] < 0.05 ? 1 : 0;
        wl[i] = L[i] * wSkin[i];
    }
    const sk = Math.max(4, 0.12 * iod), skinN = gaussian(wl, bw, bh, sk), skinD = gaussian(wSkin, bw, bh, sk);
    const sc = Math.max(1.2, 0.025 * iod), Lc = gaussian(L, bw, bh, sc), Ac = gaussian(A, bw, bh, sc);
    const k = FEATURE_CONTRAST_DROP * amt;
    let cb = 0, ca = 0, cn = 0;
    const Lo = Float32Array.from(L), Ao = Float32Array.from(A), Bo = Float32Array.from(B);
    for (let i = 0; i < m; i++) {
        const f = Math.max(brows[i], lips[i]);
        if (f < 0.01 || skinD[i] < 1e-3)
            continue;
        const skin = skinN[i] / skinD[i], d = (skin - Lc[i]) * k * f;
        Lo[i] = L[i] + d;
        if (lips[i] > 0.01)
            Ao[i] = A[i] - 0.25 * amt * lips[i] * Math.max(0, Ac[i] - 8); // a little less red, coarse only
        if (f > 0.6) {
            cb += Math.abs(skin - Lc[i]);
            ca += Math.abs(skin - (Lc[i] + d));
            cn++;
        }
    }
    // Eyes are left alone. At 400% a sclera mask spilt onto the caruncle and lower waterline, and on this face the
    // limbal ring is no darker than the iris except under the upper-lid shadow, so the lift only touched the lid line.
    for (let y = 0; y < bh; y++)
        for (let x = 0; x < bw; x++) {
            const i = y * bw + x;
            if (Lo[i] === L[i] && Ao[i] === A[i] && Bo[i] === B[i])
                continue;
            const rgb = labToSrgb([clamp(Lo[i], 0, 100), Ao[i], Bo[i]]), g = (y + y0) * w + x + x0, j = g * ch;
            for (let c = 0; c < 3; c++)
                out[j + c] = toByte(rgb[c]);
            edit[g] = 1;
        }
    const r3 = (v) => Math.round(v * 1000) / 1000;
    return { image: { ...input, data: out }, edit, metrics: { feature_contrast_before: r3(cn ? cb / cn : 0), feature_contrast_after: r3(cn ? ca / cn : 0) } };
}
