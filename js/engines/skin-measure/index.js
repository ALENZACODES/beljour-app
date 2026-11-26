import { CALIBRATION } from "./generated/calibration.js";
export const CONCERNS = ["acne", "redness", "texture", "pore", "oiliness", "moisture"];
export const LABELS = {
    acne: "Breakouts", redness: "Redness", texture: "Texture", pore: "Pores", oiliness: "Oil", moisture: "Hydration",
};
/** Width the face is resampled to before reading. */
export const FACE_WIDTH = 256;
export const MESH_POINTS = 468;
/** Mesh index sets (MediaPipe Face Mesh). Polygons are convex hulls of these points. */
export const AREAS = {
    cheek_right: [116, 117, 118, 101, 36, 205, 187, 147, 123, 50],
    cheek_left: [345, 346, 347, 330, 266, 425, 411, 376, 352, 280],
    forehead: [103, 67, 109, 10, 338, 297, 332, 333, 299, 337, 151, 108, 69, 104],
    nose: [6, 197, 195, 5, 4, 45, 275, 48, 278, 115, 344, 220, 440, 134, 363],
    chin: [200, 199, 175, 152, 148, 377, 176, 400, 201, 421, 208, 428],
    eye_right: [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246],
    eye_left: [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466],
    face_oval: [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149,
        150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109],
};
export class MeasureRefusal extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}
/* --------------------------------- geometry --------------------------------- */
function hull(points) {
    const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (p.length < 3)
        return p;
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower = [], upper = [];
    for (const q of p) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0)
            lower.pop();
        lower.push(q);
    }
    for (let i = p.length - 1; i >= 0; i--) {
        const q = p[i];
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0)
            upper.pop();
        upper.push(q);
    }
    return lower.slice(0, -1).concat(upper.slice(0, -1));
}
/** 1 inside the polygon (pixel centres, even-odd), else 0. */
export function fillPolygon(poly, w, h) {
    const out = new Uint8Array(w * h);
    if (poly.length < 3)
        return out;
    const ys = poly.map((q) => q[1]);
    const y0 = Math.max(0, Math.floor(Math.min(...ys))), y1 = Math.min(h - 1, Math.ceil(Math.max(...ys)));
    const xs = [];
    for (let y = y0; y <= y1; y++) {
        const cy = y + 0.5;
        xs.length = 0;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            const [xi, yi] = poly[i], [xj, yj] = poly[j];
            if ((yi > cy) !== (yj > cy))
                xs.push(xi + ((cy - yi) / (yj - yi)) * (xj - xi));
        }
        xs.sort((a, b) => a - b);
        for (let k = 0; k + 1 < xs.length; k += 2) {
            const a = Math.max(0, Math.ceil(xs[k] - 0.5)), b = Math.min(w - 1, Math.floor(xs[k + 1] - 0.5));
            for (let x = a; x <= b; x++)
                out[y * w + x] = 1;
        }
    }
    return out;
}
/* --------------------------------- filters --------------------------------- */
/** Mean over a (2r+1)^2 window with edges clamped, via an integral image. */
export function boxBlur(src, w, h, r) {
    const W = w + 1;
    const sat = new Float64Array(W * (h + 1));
    for (let y = 0; y < h; y++) {
        let row = 0;
        for (let x = 0; x < w; x++) {
            row += src[y * w + x];
            sat[(y + 1) * W + x + 1] = sat[y * W + x + 1] + row;
        }
    }
    const out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
        const ya = Math.max(0, y - r), yb = Math.min(h, y + r + 1);
        for (let x = 0; x < w; x++) {
            const xa = Math.max(0, x - r), xb = Math.min(w, x + r + 1);
            const s = sat[yb * W + xb] - sat[ya * W + xb] - sat[yb * W + xa] + sat[ya * W + xa];
            out[y * w + x] = s / ((yb - ya) * (xb - xa));
        }
    }
    return out;
}
function erode(mask, w, h, r) {
    const f = new Float32Array(mask.length);
    for (let i = 0; i < mask.length; i++)
        f[i] = mask[i];
    const m = boxBlur(f, w, h, r);
    const out = new Uint8Array(mask.length);
    for (let i = 0; i < mask.length; i++)
        out[i] = m[i] > 0.999 ? 1 : 0;
    return out;
}
function median(values) {
    if (!values.length)
        return NaN;
    const s = [...values].sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function quantileOf(values, q) {
    if (!values.length)
        return NaN;
    const s = [...values].sort((a, b) => a - b);
    const pos = (s.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
    return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}
/** The whites of the eyes as a light reference: the mean colour of the brightest, least coloured
 * pixels inside both eye openings. The light changes them as it changes the skin, but skin depth
 * does not, so gains that make them a fixed neutral grey undo the light's brightness and tint
 * without judging anyone's skin colour. Gains are clamped; null when the eyes are closed or tiny. */
export function eyeWhiteGains(image, points) {
    const { width: iw, height: ih, channels: ch, data } = image;
    const px = [];
    for (const name of ["eye_right", "eye_left"]) {
        const poly = AREAS[name].map((i) => points[i]);
        const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
        const x0 = Math.max(0, Math.floor(Math.min(...xs))), x1 = Math.min(iw - 1, Math.ceil(Math.max(...xs)));
        const y0 = Math.max(0, Math.floor(Math.min(...ys))), y1 = Math.min(ih - 1, Math.ceil(Math.max(...ys)));
        if (x1 - x0 < 4 || y1 - y0 < 2)
            continue;
        const local = poly.map(([x, y]) => [x - x0, y - y0]);
        const m = fillPolygon(local, x1 - x0 + 1, y1 - y0 + 1);
        for (let y = y0; y <= y1; y++)
            for (let x = x0; x <= x1; x++) {
                if (!m[(y - y0) * (x1 - x0 + 1) + (x - x0)])
                    continue;
                const o = (y * iw + x) * ch, r = data[o], g = data[o + (ch >= 3 ? 1 : 0)], b = data[o + (ch >= 3 ? 2 : 0)];
                const hi = Math.max(r, g, b), lo = Math.min(r, g, b);
                px.push([r, g, b, hi > 0 ? (hi - lo) / hi : 1]);
            }
    }
    if (px.length < 20)
        return null;
    // The brightest 40% of the eye pixels (iris, pupil and lashes are darker), then the less
    // coloured half of those: the whites. Brightness first, so a tinted light can't swap them out.
    const bright = [...px].sort((a, b) => (b[0] + b[1] + b[2]) - (a[0] + a[1] + a[2])).slice(0, Math.ceil(px.length * 0.4));
    bright.sort((a, b) => a[3] - b[3]);
    const top = bright.slice(0, Math.max(5, Math.ceil(bright.length * 0.5)));
    const mean = [0, 1, 2].map((c) => top.reduce((s, p) => s + p[c], 0) / top.length);
    // One brightness gain (wide range: eye whites in dim photos can sit near 100) and a gentler
    // per-channel tint correction, so a clamp on one never skews the other.
    const grey = (mean[0] + mean[1] + mean[2]) / 3;
    const k = Math.min(2.5, Math.max(0.5, EYE_WHITE / Math.max(1, grey)));
    // Chosen on 8-bit values, applied in linear light: the gain that takes each channel's eye-white
    // mean to its target, so the skin keeps its proportions instead of being clipped at white.
    const lin = mean.map((v) => {
        const m = Math.max(1, v), target = m * k * Math.min(1.25, Math.max(0.8, grey / m));
        return decode(target / 255) / decode(m / 255);
    });
    // Dim or shaded eye whites would ask for a very large gain; past 4x (or under 0.35x) the
    // whites are more likely in shadow than the photo underexposed, so the brightness is held there.
    const avg = (lin[0] + lin[1] + lin[2]) / 3, hold = Math.min(1, LINEAR_GAIN_MAX / avg) * Math.max(1, LINEAR_GAIN_MIN / avg);
    return lin.map((v) => v * hold);
}
/** The grey the whites of the eyes are brought to (8-bit). */
export const EYE_WHITE = 160;
/** The brightness change the eye whites may ask for, in linear light. */
export const LINEAR_GAIN_MAX = 4, LINEAR_GAIN_MIN = 0.35;
/** A CIELAB colour with its linear light scaled by `f` (an exposure change; the hue is kept). */
export function exposeLab([L, a, b], f) {
    const finv = (t) => (t > 6 / 29 ? t ** 3 : 3 * (6 / 29) ** 2 * (t - 4 / 29));
    const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
    const x = finv(fx) * f, y = finv(fy) * f, z = finv(fz) * f;
    const gx = labF(x), gy = labF(y), gz = labF(z);
    return [116 * gy - 16, 500 * (gx - gy), 200 * (gy - gz)];
}
/** sRGB to linear light, without a clip at white, so a gain above 1 keeps its proportions. */
const decode = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const labF = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
/** CIELAB from linear RGB (D65), unclipped: skin brought above the eye whites can read over 100. */
function linearLab(lr, lg, lb, out) {
    const x = (0.4124564 * lr + 0.3575761 * lg + 0.1804375 * lb) / 0.95047;
    const y = 0.2126729 * lr + 0.7151522 * lg + 0.072175 * lb;
    const z = (0.0193339 * lr + 0.119192 * lg + 0.9503041 * lb) / 1.08883;
    const fx = labF(x), fy = labF(y), fz = labF(z);
    out[0] = 116 * fy - 16;
    out[1] = 500 * (fx - fy);
    out[2] = 200 * (fy - fz);
}
/** The face's bounding box (with a margin), resampled to FACE_WIDTH by area averaging, as CIELAB. */
function cropFace(image, points, gains = [1, 1, 1]) {
    const oval = AREAS.face_oval.map((i) => points[i]);
    const xs = oval.map((p) => p[0]), ys = oval.map((p) => p[1]);
    const fx0 = Math.min(...xs), fx1 = Math.max(...xs), fy0 = Math.min(...ys), fy1 = Math.max(...ys);
    const faceW = fx1 - fx0;
    if (!(faceW > 0) || !(fy1 - fy0 > 0))
        throw new MeasureRefusal("no_face", "The face points don't describe a face.");
    if (faceW < 120)
        throw new MeasureRefusal("face_too_small", "The face is too small in this photo to read the skin. Use a closer photo.");
    const scale = FACE_WIDTH / faceW;
    const x0 = fx0, y0 = fy0;
    const w = FACE_WIDTH, h = Math.max(8, Math.round((fy1 - fy0) * scale));
    const { width: iw, height: ih, channels: ch, data } = image;
    const L = new Float32Array(w * h), A = new Float32Array(w * h), B = new Float32Array(w * h);
    const lab = [0, 0, 0];
    const step = 1 / scale; // source pixels per output pixel
    const n = Math.max(1, Math.min(4, Math.round(step))); // samples per axis (area-like average)
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            let r = 0, g = 0, b = 0, c = 0;
            for (let sy = 0; sy < n; sy++)
                for (let sx = 0; sx < n; sx++) {
                    const px = Math.min(iw - 1, Math.max(0, Math.floor(x0 + (x + (sx + 0.5) / n) * step)));
                    const py = Math.min(ih - 1, Math.max(0, Math.floor(y0 + (y + (sy + 0.5) / n) * step)));
                    const o = (py * iw + px) * ch;
                    r += data[o];
                    g += data[o + (ch >= 3 ? 1 : 0)];
                    b += data[o + (ch >= 3 ? 2 : 0)];
                    c++;
                }
            linearLab(decode(r / c / 255) * gains[0], decode(g / c / 255) * gains[1], decode(b / c / 255) * gains[2], lab);
            const i = y * w + x;
            L[i] = lab[0];
            A[i] = lab[1];
            B[i] = lab[2];
        }
    }
    const pts = points.map(([px, py]) => [(px - x0) * scale, (py - y0) * scale]);
    return { L, A, B, w, h, pts, scale };
}
/* --------------------------------- reading --------------------------------- */
function areaMask(c, name) {
    return fillPolygon(hull(AREAS[name].map((i) => c.pts[i])), c.w, c.h);
}
function pick(mask, plane) {
    const out = [];
    for (let i = 0; i < mask.length; i++)
        if (mask[i])
            out.push(plane[i]);
    return out;
}
export const TUNING = { spotA: 2.5, spotR: 6 };
/** How much brighter than the T-zone's median, in linear light (CIE Y, 0 to 1), a pixel must be to
 * count as shine: about +12 L* on light-medium skin (L* 60). */
export const SHINE_STEP = 0.15;
export function features(image, points, t = TUNING) {
    if (points.length < MESH_POINTS)
        throw new MeasureRefusal("no_face", "No face was found in this photo.");
    const gains = eyeWhiteGains(image, points);
    const c = cropFace(image, points, gains ?? [1, 1, 1]);
    const { w, h, L, A, B } = c;
    const cheeks = areaMask(c, "cheek_right"), cl = areaMask(c, "cheek_left");
    for (let i = 0; i < cheeks.length; i++)
        cheeks[i] |= cl[i];
    const forehead = areaMask(c, "forehead"), nose = areaMask(c, "nose"), chin = areaMask(c, "chin");
    const skin = new Uint8Array(w * h);
    for (let i = 0; i < skin.length; i++)
        skin[i] = cheeks[i] | forehead[i] | nose[i] | chin[i];
    // Leave out hair, brows and deep shadow: only pixels near the face's own skin lightness count.
    const Lm = median(pick(skin, L));
    for (let i = 0; i < skin.length; i++)
        if (skin[i] && (L[i] < Lm - 28 || L[i] > Lm + 30))
            skin[i] = 0;
    let skinPx = 0;
    for (let i = 0; i < skin.length; i++)
        skinPx += skin[i];
    if (skinPx < 1500)
        throw new MeasureRefusal("no_skin", "Not enough clear skin shows in this photo. Use a front-facing photo with hair back from the face.");
    const inner = erode(skin, w, h, 2);
    const balancedLab = [median(pick(cheeks, L)), median(pick(cheeks, A)), median(pick(cheeks, B))];
    // The skin's own colour, for depth and the shade: the eye whites' tint correction is kept but
    // their brightness change is taken back out, so a face is never made lighter than the camera saw.
    const k = gains ? (gains[0] + gains[1] + gains[2]) / 3 : 1;
    const lab = exposeLab(balancedLab, 1 / k);
    const aMed = median(pick(skin, A));
    // Redness: mean excess of a* over the face's own median on cheeks, nose and chin (after the
    // eye-white balance), so a redder light or a deeper skin tone does not count as redness.
    let redSum = 0, redN = 0;
    for (let i = 0; i < skin.length; i++)
        if (inner[i] && (cheeks[i] || nose[i] || chin[i])) {
            redSum += Math.max(0, A[i] - aMed - 1.5);
            redN++;
        }
    const redness = redN ? redSum / redN : 0;
    // Spots: small red bumps, as an amount rather than a count so one spot more or less near the
    // line does not jump the score. a* smoothed at radius 1 against radius t.spotR (a difference of
    // box means, like a blob detector), where the spot is no brighter than around.
    const a1 = boxBlur(A, w, h, 1), aLocal = boxBlur(A, w, h, t.spotR);
    const l1 = boxBlur(L, w, h, 1), lLocal = boxBlur(L, w, h, t.spotR);
    let spotSum = 0, innerPx = 0;
    for (let i = 0; i < L.length; i++) {
        if (!inner[i])
            continue;
        innerPx++;
        if (l1[i] <= lLocal[i])
            spotSum += Math.max(0, a1[i] - aLocal[i] - t.spotA);
    }
    const acne = innerPx ? (100 * spotSum) / innerPx : 0;
    // Texture: spread of L detail at radius 3 on the cheeks.
    const l3 = boxBlur(L, w, h, 3);
    const tex = [];
    for (let i = 0; i < L.length; i++)
        if (inner[i] && cheeks[i])
            tex.push(Math.abs(L[i] - l3[i]));
    const texture = tex.length ? quantileOf(tex, 0.75) : 0;
    // Pores: pixels darker than their radius-2 mean by 1.5+ on the nose and inner cheeks.
    const l2 = boxBlur(L, w, h, 2);
    let poreHit = 0, poreN = 0;
    for (let i = 0; i < L.length; i++)
        if (inner[i] && (nose[i] || cheeks[i])) {
            poreN++;
            if (l2[i] - L[i] > 1.5)
                poreHit++;
        }
    const pore = poreN ? (100 * poreHit) / poreN : 0;
    // Shine: bright highlights on the forehead and nose, 12+ L* above the area's median (after the
    // eye-white balance, so a brighter light does not count as shine).
    const tz = [];
    for (let i = 0; i < L.length; i++)
        if (skin[i] && (forehead[i] || nose[i]))
            tz.push(L[i]);
    // A highlight is a film of reflected light added on top of the skin, so it is judged in linear
    // light (CIE Y), where the same film adds the same amount on light and deep skin. A fixed step
    // in L* would be about twice as easy to cross on deep skin and read deep skin as oily.
    const lin = (l) => (l > 8 ? ((l + 16) / 116) ** 3 : l / 903.3);
    const yMed = lin(median(tz));
    let shineHit = 0, tzN = 0;
    for (let i = 0; i < L.length; i++)
        if (skin[i] && (forehead[i] || nose[i])) {
            tzN++;
            if (lin(L[i]) > yMed + SHINE_STEP)
                shineHit++;
        }
    const shine = tzN ? (100 * shineHit) / tzN : 0;
    // Dull: fine relief with little sheen (the least certain reading; always marked so).
    const dull = texture / (1 + shine / 4);
    return { features: { redness, acne, texture, pore, shine, dull }, crop: c, skin: skinPx, lab, balanced: gains !== null };
}
/** A raw feature value as a 1..100 score by the calibration table (larger feature, lower score). */
export function scoreOf(name, value) {
    const table = CALIBRATION.tables[name];
    const xs = table.values, ss = table.scores;
    if (value <= xs[0])
        return ss[0];
    if (value >= xs[xs.length - 1])
        return ss[ss.length - 1];
    for (let k = 1; k < xs.length; k++) {
        if (value <= xs[k]) {
            const t = xs[k] === xs[k - 1] ? 0 : (value - xs[k - 1]) / (xs[k] - xs[k - 1]);
            return Math.round((ss[k - 1] + (ss[k] - ss[k - 1]) * t) * 10) / 10;
        }
    }
    return ss[ss.length - 1];
}
const FEATURE_OF = {
    acne: "acne", redness: "redness", texture: "texture", pore: "pore", oiliness: "shine", moisture: "dull",
};
/** Read the six concerns from a photo and its face mesh (pixel coordinates). */
export function measureSkin(image, points) {
    const { features: f, crop, skin, lab } = features(image, points);
    const notes = [];
    const faceWidthPx = FACE_WIDTH / crop.scale;
    const small = faceWidthPx < 220;
    if (small)
        notes.push("The face is small in this photo, so fine details like pores and texture are less certain.");
    if (lab[0] < 30)
        notes.push("The photo is dark, so redness and shine readings are less certain.");
    const readings = CONCERNS.map((concern) => {
        const low = (small && (concern === "pore" || concern === "texture" || concern === "acne")) || concern === "moisture"
            || (lab[0] < 30 && (concern === "redness" || concern === "oiliness"));
        return { concern, label: LABELS[concern], raw_score: scoreOf(FEATURE_OF[concern], f[FEATURE_OF[concern]]), confidence: low ? "low" : "ok" };
    });
    return { readings, features: f, skin_lab: lab, pixels: skin, face_width_px: Math.round(faceWidthPx), notes };
}
//# sourceMappingURL=index.js.map