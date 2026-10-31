/**
 * Gender appearance shading as relit bone structure, not makeup.
 * Replaces round 1's finishGender (additive RGB ellipses of up to ±26 levels, centred on landmarks,
 * same shape on every face and independent of the light direction).
 * Here each channel is a small HEIGHT bump in face coordinates (brow ridge, mandible edge, cheekbone,
 * sub-cheek hollow), lit by the light fitted to this photo; the result is a smooth multiplicative ratio
 * on linear RGB, so pores and grain are scaled, never replaced (Texture Law). Lip colour is a small
 * low-band chroma gain inside the lips only.
 * Amplitudes are per SD unit (see gender-levels.ts) and ASSUMED until calibrated on morphometric data.
 */
import { clamp, gaussian, linToSrgb, lumLin, srgbToLin, toByte } from "../core/bands.js";
import { bumpRatio, fitLight, landmarkNormals, normalImage, toP3 } from "../core/light-model.js";
const RIGHT_BROW = [70, 63, 105, 66, 107], LEFT_BROW = [300, 293, 334, 296, 336];
const JAW = [172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397];
const LIPS = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185];
const SKIN_SAMPLES = [151, 9, 108, 337, 50, 280, 117, 346, 205, 425, 6, 199];
/** Height amplitudes in IOD per SD unit (+ = masculine direction). ASSUMED starting values. */
export const GENDER_RELIEF = { browRidge: 0.022, mandible: 0.016, cheekbone: -0.016, subCheek: 0.008, lipChroma: -0.07 };
export function relightGender(image, mesh, sdSigned) {
    const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
    const { width: w, height: h, channels: ch } = image, n = w * h;
    const out = Uint8Array.from(image.data);
    const p = mesh.map(toP3);
    if (p.length < 468 || Math.abs(sdSigned) < 1e-3)
        return { data: out, lightR2: 0, lightReliable: false, maxRatioDelta: 0, ms: 0 };
    const iod = Math.hypot(p[263][0] - p[33][0], p[263][1] - p[33][1]) * 0.98; // outer corners ~ IOD (ASSUMED ratio)
    const xs = p.slice(0, 468).map((q) => q[0]), ys = p.slice(0, 468).map((q) => q[1]);
    const box = { x0: Math.min(...xs) - 0.2 * iod, y0: Math.min(...ys) - 0.2 * iod, x1: Math.max(...xs) + 0.2 * iod, y1: Math.max(...ys) + 0.2 * iod };
    const N = normalImage(w, h, p, landmarkNormals(p), iod, box);
    const lin = [new Float64Array(n), new Float64Array(n), new Float64Array(n)], Y = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        for (let c = 0; c < 3; c++)
            lin[c][i] = srgbToLin(image.data[i * ch + c]);
        Y[i] = lumLin(lin[0][i], lin[1][i], lin[2][i]);
    }
    const lowY = gaussian(Y, w, h, Math.max(1, 0.03 * iod));
    const samples = [];
    const rad = Math.max(2, Math.round(0.1 * iod));
    for (const k of SKIN_SAMPLES)
        for (let dy = -rad; dy <= rad; dy += 2)
            for (let dx = -rad; dx <= rad; dx += 2) {
                const x = Math.round(p[k][0] + dx), y = Math.round(p[k][1] + dy);
                if (x >= 0 && y >= 0 && x < w && y < h && dx * dx + dy * dy <= rad * rad)
                    samples.push(y * w + x);
            }
    const light = fitLight(lowY, N, samples);
    // Height field (px). Ridges along polylines with a Gaussian cross-section.
    const H = new Float64Array(n), s = sdSigned;
    const ridge = (line, amp, sigma, offset = [0, 0]) => {
        const pad = 3 * sigma;
        const lx = line.map((q) => q[0] + offset[0]), ly = line.map((q) => q[1] + offset[1]);
        for (let y = Math.max(0, Math.floor(Math.min(...ly) - pad)); y <= Math.min(h - 1, Math.ceil(Math.max(...ly) + pad)); y++)
            for (let x = Math.max(0, Math.floor(Math.min(...lx) - pad)); x <= Math.min(w - 1, Math.ceil(Math.max(...lx) + pad)); x++) {
                let best = Infinity, tEnd = 0.5;
                for (let k = 0; k < lx.length - 1; k++) {
                    const dx = lx[k + 1] - lx[k], dy = ly[k + 1] - ly[k], L2 = dx * dx + dy * dy || 1;
                    const t = clamp(((x - lx[k]) * dx + (y - ly[k]) * dy) / L2), d2 = (x - lx[k] - t * dx) ** 2 + (y - ly[k] - t * dy) ** 2;
                    if (d2 < best) {
                        best = d2;
                        tEnd = (k + t) / (lx.length - 1);
                    }
                }
                const taper = Math.sin(Math.PI * clamp(tEnd * 0.9 + 0.05)); // fade at both ends: no hard caps
                H[y * w + x] += amp * taper * Math.exp(-best / (2 * sigma * sigma));
            }
    };
    const down = [-(p[263][1] - p[33][1]) / (iod / 0.98), (p[263][0] - p[33][0]) / (iod / 0.98)]; // face "down"
    const br = GENDER_RELIEF;
    for (const brow of [RIGHT_BROW, LEFT_BROW])
        ridge(brow.map((k) => [p[k][0], p[k][1]]), br.browRidge * iod * s, 0.07 * iod, [-down[0] * 0.04 * iod, -down[1] * 0.04 * iod]);
    ridge(JAW.map((k) => [p[k][0], p[k][1]]), br.mandible * iod * s, 0.045 * iod, [-down[0] * 0.05 * iod, -down[1] * 0.05 * iod]);
    for (const [a, b] of [[116, 123], [345, 352]])
        ridge([[p[a][0], p[a][1]], [p[b][0], p[b][1]]], br.cheekbone * iod * s, 0.08 * iod);
    for (const [a, b] of [[147, 187], [376, 411]])
        ridge([[p[a][0], p[a][1]], [p[b][0], p[b][1]]], -br.subCheek * iod * s, 0.06 * iod);
    const ratio = bumpRatio(H, N, light, w, h, { slopeGain: 1, cavity: 0.03, cavitySigma: 0.05 * iod, min: 0.7, max: 1.25 });
    // Without a reliable light fit, only half the relief is shown (ambiguous light = small, safe changes).
    const k = light.reliable ? 1 : 0.5;
    let maxDelta = 0;
    // lip chroma: feminine (s<0) gains, masculine loses, low band only
    const lipMask = new Float64Array(n);
    {
        const poly = LIPS.map((q) => [p[q][0], p[q][1]]);
        const lx = poly.map((q) => q[0]), ly = poly.map((q) => q[1]);
        for (let y = Math.max(0, Math.floor(Math.min(...ly))); y <= Math.min(h - 1, Math.ceil(Math.max(...ly))); y++)
            for (let x = Math.max(0, Math.floor(Math.min(...lx))); x <= Math.min(w - 1, Math.ceil(Math.max(...lx))); x++) {
                let inside = false;
                for (let a = poly.length - 1, b = 0; b < poly.length; a = b++) {
                    if ((poly[a][1] > y + 0.5) !== (poly[b][1] > y + 0.5) && x + 0.5 < (poly[b][0] - poly[a][0]) * (y + 0.5 - poly[a][1]) / (poly[b][1] - poly[a][1]) + poly[a][0])
                        inside = !inside;
                }
                if (inside)
                    lipMask[y * w + x] = 1;
            }
    }
    const lipSoft = gaussian(lipMask, w, h, Math.max(0.8, 0.012 * iod));
    for (let y = N.y0; y <= N.y1; y++)
        for (let x = N.x0; x <= N.x1; x++) {
            const i = y * w + x, r = 1 + (ratio[i] - 1) * k;
            const lipGain = 1 + br.lipChroma * s * lipSoft[i];
            if (r === 1 && lipGain === 1)
                continue;
            maxDelta = Math.max(maxDelta, Math.abs(r - 1));
            let R = lin[0][i] * r, G = lin[1][i] * r, B = lin[2][i] * r;
            if (lipGain !== 1) {
                const yv = lumLin(R, G, B);
                R = yv + (R - yv) * lipGain;
                G = yv + (G - yv) * lipGain;
                B = yv + (B - yv) * lipGain;
            }
            const j = i * ch;
            out[j] = toByte(linToSrgb(R));
            out[j + 1] = toByte(linToSrgb(G));
            out[j + 2] = toByte(linToSrgb(B));
        }
    return { data: out, lightR2: light.r2, lightReliable: light.reliable, maxRatioDelta: maxDelta,
        ms: (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0 };
}
const BROW_POLY_R = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46], BROW_POLY_L = [300, 293, 334, 296, 336, 285, 295, 282, 283, 276];
const STUBBLE_ZONE = [205, 216, 212, 202, 204, 194, 201, 200, 421, 418, 424, 422, 432, 436, 425, 411, 410, 322, 391, 393, 167, 165, 92, 186, 187];
const polyMask = (w, h, poly, out) => {
    const lx = poly.map((q) => q[0]), ly = poly.map((q) => q[1]);
    for (let y = Math.max(0, Math.floor(Math.min(...ly))); y <= Math.min(h - 1, Math.ceil(Math.max(...ly))); y++)
        for (let x = Math.max(0, Math.floor(Math.min(...lx))); x <= Math.min(w - 1, Math.ceil(Math.max(...lx))); x++) {
            let inside = false;
            for (let a = poly.length - 1, b = 0; b < poly.length; a = b++)
                if ((poly[a][1] > y + 0.5) !== (poly[b][1] > y + 0.5) && x + 0.5 < (poly[b][0] - poly[a][0]) * (y + 0.5 - poly[a][1]) / (poly[b][1] - poly[a][1]) + poly[a][0])
                    inside = !inside;
            if (inside)
                out[y * w + x] = 1;
        }
};
/**
 * Hyper only: what the guarded warp could not reach (gap, in SD units) is carried by non-geometric cues, all
 * multiplicative on linear RGB so the person's own pores and grain are scaled, never replaced.
 * Masculine: brow weight (the brow's own hair pixels deepened) and a stubble shadow (low-band blue-grey
 * darkening over the moustache/chin zone, lips excluded). Feminine: lighter, finer brows and more lip colour.
 * Amplitudes per missing share of the Hyper step (gap / 0.5 SD): ASSUMED, tuned by eye on synthetic samples.
 */
export function genderCues(image, mesh, gapSigned) {
    const { width: w, height: h, channels: ch } = image, n = w * h;
    const out = Uint8Array.from(image.data);
    const p = mesh.map(toP3);
    if (p.length < 468 || Math.abs(gapSigned) < 1e-3)
        return out;
    const g = clamp(Math.abs(gapSigned) / 0.5), masc = gapSigned > 0;
    const iod = Math.hypot(p[263][0] - p[33][0], p[263][1] - p[33][1]);
    const pt = (k) => [p[k][0], p[k][1]];
    const Y = new Float64Array(n);
    for (let i = 0; i < n; i++)
        Y[i] = lumLin(srgbToLin(image.data[i * ch]), srgbToLin(image.data[i * ch + 1]), srgbToLin(image.data[i * ch + 2]));
    const brow = new Float64Array(n);
    polyMask(w, h, BROW_POLY_R.map(pt), brow);
    polyMask(w, h, BROW_POLY_L.map(pt), brow);
    const browS = gaussian(brow, w, h, Math.max(1, 0.02 * iod));
    // local skin level around the brows (wide blur) tells hair pixels (darker) from skin between hairs
    const Yw = gaussian(Y, w, h, Math.max(3, 0.08 * iod));
    const zone = new Float64Array(n), lips = new Float64Array(n);
    if (masc) {
        polyMask(w, h, STUBBLE_ZONE.map(pt), zone);
        polyMask(w, h, LIPS.map(pt), lips);
    }
    else
        polyMask(w, h, LIPS.map(pt), lips);
    const zoneS = masc ? gaussian(zone, w, h, Math.max(2, 0.06 * iod)) : zone;
    const lipS = gaussian(lips, w, h, Math.max(1, 0.015 * iod));
    for (let i = 0; i < n; i++) {
        const b = browS[i], z = masc ? zoneS[i] * (1 - lipS[i]) : 0, l = lipS[i];
        if (b < 1e-3 && z < 1e-3 && l < 1e-3)
            continue;
        const j = i * ch;
        let R = srgbToLin(image.data[j]), G = srgbToLin(image.data[j + 1]), B = srgbToLin(image.data[j + 2]);
        if (b >= 1e-3) {
            const hair = clamp((1 - Y[i] / Math.max(1e-4, Yw[i])) / 0.35); // 0 skin .. 1 clearly darker than surround
            const r = masc ? 1 - 0.45 * g * b * hair : 1 + 0.35 * g * b * hair;
            R *= r;
            G *= r;
            B *= r;
        }
        if (z >= 1e-3) {
            R *= 1 - 0.2 * g * z;
            G *= 1 - 0.18 * g * z;
            B *= 1 - 0.12 * g * z;
        }
        if (!masc && l >= 1e-3) {
            const yv = lumLin(R, G, B), k = 1 + 0.4 * g * l;
            R = yv + (R - yv) * k;
            G = yv + (G - yv) * k;
            B = yv + (B - yv) * k;
        }
        out[j] = toByte(linToSrgb(R));
        out[j + 1] = toByte(linToSrgb(G));
        out[j + 2] = toByte(linToSrgb(B));
    }
    return out;
}
