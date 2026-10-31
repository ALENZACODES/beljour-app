/**
 * 'Sancerre cartoon' v2: illustrator's finish, scale-aware.
 * Artistic exception to the Texture Law (agreed with round 1): photographic grain is NOT kept; the
 * finish must instead be clean. Differences from round 1's single separable bilateral + Canny:
 *  - per-face scale: radii and line widths follow each face's IOD, so a 40 px background face gets a
 *    40 px face's filter, not the main portrait's (the cause of the muddy background faces);
 *  - XDoG lines with a SHARPNESS test (fine DoG must dominate the coarse DoG): soft shading edges such
 *    as the collarbone shadow and neck folds do not become ink;
 *  - connected-component cleanup: ink components smaller or shorter than a scale-dependent minimum are
 *    deleted, so no specks or blotches survive; nothing from the source is pasted back as raw darkness.
 */
import { clamp, gaussian, smoothstep } from "../core/bands.js";
const lumaOf = (rgb, n) => { const o = new Float64Array(n); for (let i = 0; i < n; i++)
    o[i] = 0.2126 * rgb[i * 3] + 0.7152 * rgb[i * 3 + 1] + 0.0722 * rgb[i * 3 + 2]; return o; };
const RANGE_LUT = new Float64Array(2049);
for (let k = 0; k <= 2048; k++)
    RANGE_LUT[k] = Math.exp(-k / 128); // exp(-x) for x in [0, 16]
function bilateralPass(src, w, h, r, horizontal, sigmaR) {
    const out = new Float64Array(src.length), inv = 128 / (2 * sigmaR * sigmaR);
    const sp = Float64Array.from({ length: r + 1 }, (_, k) => Math.exp(-(k * k) / (2 * Math.max(0.5, r / 1.5) ** 2)));
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 3;
            let sr = 0, sg = 0, sb = 0, sw = 0;
            for (let t = -r; t <= r; t++) {
                const xx = horizontal ? Math.min(w - 1, Math.max(0, x + t)) : x, yy = horizontal ? y : Math.min(h - 1, Math.max(0, y + t));
                const j = (yy * w + xx) * 3, d = (src[i] - src[j]) ** 2 + (src[i + 1] - src[j + 1]) ** 2 + (src[i + 2] - src[j + 2]) ** 2;
                const wt = sp[Math.abs(t)] * RANGE_LUT[Math.min(2048, (d * inv) | 0)];
                sr += wt * src[j];
                sg += wt * src[j + 1];
                sb += wt * src[j + 2];
                sw += wt;
            }
            out[i] = sr / sw;
            out[i + 1] = sg / sw;
            out[i + 2] = sb / sw;
        }
    return out;
}
function abstraction(rgb, w, h, r, iterations) {
    let a = rgb;
    for (let k = 0; k < iterations; k++) {
        // alternate axis order each iteration to cancel the separable filter's directional bias
        a = k % 2 === 0 ? bilateralPass(bilateralPass(a, w, h, r, true, 22), w, h, r, false, 22)
            : bilateralPass(bilateralPass(a, w, h, r, false, 22), w, h, r, true, 22);
    }
    return a;
}
/** Remove ink components with fewer than minPx pixels or a bounding extent under minSpan. */
function cleanComponents(mask, w, h, minPx, minSpan) {
    const seen = new Uint8Array(w * h), q = new Int32Array(w * h);
    let removed = 0;
    for (let s = 0; s < w * h; s++) {
        if (!mask[s] || seen[s])
            continue;
        let head = 0, tail = 0, x0 = w, y0 = h, x1 = 0, y1 = 0;
        q[tail++] = s;
        seen[s] = 1;
        while (head < tail) {
            const i = q[head++], x = i % w, y = (i - x) / w;
            if (x < x0)
                x0 = x;
            if (x > x1)
                x1 = x;
            if (y < y0)
                y0 = y;
            if (y > y1)
                y1 = y;
            for (let dy = -1; dy <= 1; dy++)
                for (let dx = -1; dx <= 1; dx++) {
                    const xx = x + dx, yy = y + dy;
                    if (xx < 0 || yy < 0 || xx >= w || yy >= h)
                        continue;
                    const j = yy * w + xx;
                    if (mask[j] && !seen[j]) {
                        seen[j] = 1;
                        q[tail++] = j;
                    }
                }
        }
        const cx = (x0 + x1) >> 1, cy = (y0 + y1) >> 1;
        if (tail < minPx(cx, cy) || Math.max(x1 - x0, y1 - y0) + 1 < minSpan(cx, cy)) {
            for (let k = 0; k < tail; k++)
                mask[q[k]] = 0;
            removed++;
        }
    }
    return { removed };
}
export function cartoonV2(rgb, w, h, faces = []) {
    const t0 = typeof performance !== "undefined" ? performance.now() : Date.now(), n = w * h;
    if (rgb.length !== n * 3)
        throw new RangeError("cartoon: rgb size mismatch");
    const s0 = clamp(Math.min(w, h) / 640, 0.6, 3);
    // per-pixel scale: faces override the global scale (smaller faces -> finer filters, thinner lines)
    const S = new Float64Array(n).fill(s0), faceW = new Float64Array(n);
    for (const f of faces) {
        const sf = clamp((f.iod ?? 0.42 * f.w) / 60, 0.3, 3), gx = 0.2 * f.w, gy = 0.2 * f.h;
        for (let y = Math.max(0, Math.floor(f.y - gy)); y < Math.min(h, Math.ceil(f.y + f.h + gy)); y++)
            for (let x = Math.max(0, Math.floor(f.x - gx)); x < Math.min(w, Math.ceil(f.x + f.w + gx)); x++) {
                const i = y * w + x;
                S[i] = Math.min(S[i], sf);
                faceW[i] = 1;
            }
    }
    const Ss = gaussian(S, w, h, 4 * s0), faceSoft = gaussian(faceW, w, h, 3 * s0);
    const rBig = Math.max(1, Math.round(2 * s0)), rSmall = 1;
    const coarse = abstraction(rgb, w, h, rBig, 2), fine = faces.length ? abstraction(rgb, w, h, rSmall, 2) : coarse;
    const abs = new Float64Array(n * 3), lum = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        const t = clamp((Ss[i] - 0.4) / Math.max(1e-3, s0 - 0.4));
        for (let c = 0; c < 3; c++)
            abs[i * 3 + c] = fine[i * 3 + c] * (1 - t) + coarse[i * 3 + c] * t;
        lum[i] = 0.2126 * abs[i * 3] + 0.7152 * abs[i * 3 + 1] + 0.0722 * abs[i * 3 + 2];
    }
    // XDoG lines at two scales, blended by the scale map; sharpness gate rejects soft shading edges.
    const dog = (sig) => { const a = gaussian(lum, w, h, sig), b = gaussian(lum, w, h, 1.6 * sig); return Float64Array.from(a, (v, i) => v - 0.98 * b[i]); };
    const sBig = 0.9 * s0, dBig = dog(sBig), dWide = dog(2.2 * sBig), dSmall = faces.length ? dog(0.7) : dBig, dSmallWide = faces.length ? dog(1.6) : dWide;
    const ink = new Float64Array(n), mask = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
        const t = clamp((Ss[i] - 0.4) / Math.max(1e-3, s0 - 0.4));
        const D = dSmall[i] * (1 - t) + dBig[i] * t, Dw = dSmallWide[i] * (1 - t) + dWide[i] * t;
        const eps = 1.6 + 1.2 * faceSoft[i]; // fewer, cleaner lines inside faces
        if (D > -eps)
            continue;
        const sharp = Math.abs(D) / (Math.abs(Dw) + 1e-6);
        if (sharp < 0.55)
            continue; // wide, soft gradient = shading, not a contour
        ink[i] = clamp(Math.tanh(0.25 * (-D - eps))) * smoothstep(0.55, 0.9, sharp);
        if (ink[i] > 0.15)
            mask[i] = 1;
    }
    const minPx = (x, y) => Math.max(6, 10 * Ss[y * w + x] ** 2 * (1 + faceSoft[y * w + x]));
    const minSpan = (x, y) => Math.max(4, 5 * Ss[y * w + x]);
    const cleaned = cleanComponents(mask, w, h, minPx, minSpan);
    for (let i = 0; i < n; i++)
        if (!mask[i])
            ink[i] = 0;
    const inkSoft = gaussian(ink, w, h, 0.5);
    // Tone (v3): the staircase is cut in the face's OWN relative shading (luminance over a wide local base),
    // read from a smoothed luminance, so bands follow the light instead of jumping where the absolute level
    // crosses a fixed threshold (that made the bright and pink-grey patches on forehead, beard and neck).
    // Then a tone gate: the cartoon's low band is rescaled to the photo's own low band, so no skin tone is
    // lightened or darkened as a whole; ink goes on after the gate.
    const Lb = gaussian(lum, w, h, 2 * s0), base = gaussian(lum, w, h, 12 * s0);
    const toned = new Float64Array(n * 3), lumT = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        const rel = clamp(Lb[i] / Math.max(4, base[i]), 0, 2), t = rel / 0.2, f = Math.floor(t);
        const q = Math.max(0.1, (f + smoothstep(0.3, 0.7, t - f)) * 0.2);
        const scale = clamp(0.3 + 0.7 * q / Math.max(0.05, rel), 0.72, 1.3);
        for (let c = 0; c < 3; c++) {
            const v = abs[i * 3 + c] * scale;
            toned[i * 3 + c] = lum[i] * scale + (v - lum[i] * scale) * 1.06;
        }
        lumT[i] = lum[i] * scale;
    }
    const lowIn = gaussian(lumaOf(rgb, n), w, h, 10 * s0), lowOut = gaussian(lumT, w, h, 10 * s0);
    const out = new Float64Array(n * 3), Lpre = new Float64Array(n);
    let lineCount = 0;
    for (let i = 0; i < n; i++) {
        const g = clamp(lowIn[i] / Math.max(2, lowOut[i]), 0.8, 1.25);
        Lpre[i] = lumT[i] * g;
        const k = clamp(inkSoft[i] * (1 - 0.35 * faceSoft[i]));
        if (k > 0.15)
            lineCount++;
        for (let c = 0; c < 3; c++) {
            const sat = toned[i * 3 + c] * g;
            const dark = sat * 0.28; // ink = a deep shade of the local colour, not grey
            out[i * 3 + c] = clamp(sat * (1 - k) + dark * k, 0, 255);
        }
    }
    // Blotch audit: small dark islands (not ink) that are much darker than their surroundings.
    const Lo = new Float64Array(n);
    for (let i = 0; i < n; i++)
        Lo[i] = 0.2126 * out[i * 3] + 0.7152 * out[i * 3 + 1] + 0.0722 * out[i * 3 + 2];
    const local = gaussian(Lo, w, h, 4 * s0), blot = new Uint8Array(n);
    for (let i = 0; i < n; i++)
        if (!mask[i] && Lo[i] < local[i] - 25)
            blot[i] = 1;
    const blotches = cleanComponents(blot, w, h, () => 40, () => 0).removed; // islands < 40 px counted
    const specksLeft = cleanComponents(Uint8Array.from(mask), w, h, (x, y) => minPx(x, y), (x, y) => minSpan(x, y)).removed;
    // Tone gate (skin-tone check): inside the face boxes the low band (sigma 6*s0, patch scale) of the result must stay
    // (before ink: lines are drawn, not tone) within 4% of the photo's own (no lightening, darkening or patches), with the mean within 1%.
    let tIn = 0, tOut = 0, tN = 0, drift = 0;
    if (faces.length) {
        const lo = gaussian(Lpre, w, h, 6 * s0), li = gaussian(lumaOf(rgb, n), w, h, 6 * s0);
        for (let i = 0; i < n; i++)
            if (faceW[i]) {
                tIn += li[i];
                tOut += lo[i];
                tN++;
                if (Math.abs(lo[i] - li[i]) > 0.04 * Math.max(20, li[i]))
                    drift++;
            }
    }
    const toneDL = tN ? (tOut - tIn) / Math.max(1, tIn) : 0, toneDrift = tN ? drift / tN : 0;
    return { rgb: out, metrics: { toneDL, toneDrift, toneGate: toneDL <= 0.01 && toneDL >= -0.03 && toneDrift <= 0.02, lineShare: lineCount / n, specksRemoved: cleaned.removed, specksLeft, blotches, faces: faces.length,
            ms: (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0 } };
}
