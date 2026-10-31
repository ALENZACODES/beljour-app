/**
 * Removable adapter: "Older (YouCam, 2 units)" (John, Oct 30, 2026, 7:25 PM ET).
 * The server (api/plumb_api/services/older_youcam.py) runs one YouCam Aging task and returns only a delta
 * pack measured in her photo's geometry: the sag field and a low/mid-band Lab change (sigma 1.6). Nothing of
 * the provider's surface comes back. applyProviderOlder moves HER pixels:
 * - the warp reads her photo at -amount * sag; her own high band is relayed nearest-pixel so pores stay
 *   sharp (texture ratio ~1); on the lips the split is wider (sigma 2.2), so her own lip lines and sheen
 *   come through the warp crisp;
 * - D shades the moved skin (on the lips only its broad part, sigma 4, never the provider's lip texture);
 * - her own mid band (crepe) is raised where it already is, cored so flat skin gets nothing new.
 * Hair stays hers (the mask leaves it out); greying comes from the hair-colour adapter, colour only.
 * Delete this folder and the `providerOlder` hook in hero-layer/appearance-stack and Older is the local
 * engine again. Author: John Khan.
 */
import { olderFeatureTone } from "../local/older-tone.js";
import { clamp, gaussian } from "../core/bands.js";
import { CONTOURS } from "../../data/regions/generated/topology.js";
import { labToSrgb, srgbToLab, toByte } from "../shade/colourspace.js";
import { blendProviderHairColour } from "../haircolour/provider-hair.js";
export const OLDER_ACTION = "older-youcam";
export const OLDER_UNITS = 2;
export const OLDER_HAIR_HEX = "#E2E2DE"; // lighter silver (35-45% of strands at full Older); #CFCFCB read too dark at the stronger age
const MAGIC = 0x31444c4f; // "OLD1" little endian
export const FOLD_SHARPEN = 1.8;
/** most extra hood (fraction of IOD) the side the provider sagged less gets, to match the other side */
export const HOOD_MATCH_MAX = 0.03;
/** Extra lateral lid hooding at amount 1, as a share of the eye distance (skin above the lid slides down). */
export const LID_HOOD = 0.035;
export const PROVIDER_FINE_CAP = 0.6;
/**
 * Older (YouCam) stop -> share of the provider's change. Stops 1-3 are linear (default 3 = 0.6). The shipped max is
 * capped at the old stop 4 (0.8): at the full 1.0 the jaw folds read as painted shading and the cheek pores soften
 * (7-7.5/10 at 200%), at 0.8 both pass 8. Stop 4 sits between.
 */
export const OLDER_YOUCAM_FRACTION = [0, 0.25, 0.5, 0.75, 0.88, 1];
export function olderYoucamFraction(stop) { return OLDER_YOUCAM_FRACTION[Math.max(0, Math.min(5, Math.round(stop)))]; }
const LIPS = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185];
/** Parse the server's pack (see older_youcam.pack). */
export function parseOlderPack(buf) {
    const v = new DataView(buf);
    if (buf.byteLength < 12 || v.getUint32(0, true) !== MAGIC)
        throw new Error("This Older result could not be read.");
    const width = v.getUint16(4, true), height = v.getUint16(6, true), halfW = v.getUint16(8, true), halfH = v.getUint16(10, true);
    const hn = halfW * halfH, n = width * height;
    if (buf.byteLength !== 12 + 2 * (2 * hn + n + 2 * hn))
        throw new Error("This Older result is incomplete.");
    let off = 12;
    const read = (count, scale) => {
        const out = new Float32Array(count);
        for (let i = 0; i < count; i++, off += 2)
            out[i] = v.getInt16(off, true) / scale;
        return out;
    };
    const fx = read(hn, 32), fy = read(hn, 32), dL = read(n, 100), da = read(hn, 100), db = read(hn, 100);
    return { width, height, halfW, halfH, fx, fy, dL, da, db };
}
function bilinear(a, w, h, x, y) {
    const fx = Math.min(w - 1.001, Math.max(0, x)), fy = Math.min(h - 1.001, Math.max(0, y));
    const x0 = Math.floor(fx), y0 = Math.floor(fy), ax = fx - x0, ay = fy - y0, i = y0 * w + x0;
    const r1 = w > 1 ? 1 : 0, rw = h > 1 ? w : 0;
    return (a[i] * (1 - ax) + a[i + r1] * ax) * (1 - ay) + (a[i + rw] * (1 - ax) + a[i + rw + r1] * ax) * ay;
}
function inPoly(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, yi] = poly[i], [xj, yj] = poly[j];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-9) + xi)
            inside = !inside;
    }
    return inside;
}
/** Her photo aged by `amount` (0..1, 1 = the provider's oldest frame) using the pack's measured change only. */
export function applyProviderOlder(input, pack, face, hair, amount) {
    const { width: w, height: h, channels: ch, data } = input, n = w * h;
    const amt = clamp(amount);
    if (face.length < 468)
        throw new RangeError("Older needs the face points.");
    const sx = pack.width / w, sy = pack.height / h;
    // face ellipse and neck box from the face points, feathered; hair left out
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let k = 0; k < 468; k++) {
        x0 = Math.min(x0, face[k][0]);
        x1 = Math.max(x1, face[k][0]);
        y0 = Math.min(y0, face[k][1]);
        y1 = Math.max(y1, face[k][1]);
    }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = (x1 - x0) * 0.62, ry = (y1 - y0) * 0.62, fh = y1 - y0;
    const hard = new Float32Array(n), wide = new Float32Array(n), lipHard = new Float32Array(n);
    const lips = LIPS.map((k) => face[k]);
    let lx0 = Infinity, ly0 = Infinity, lx1 = -Infinity, ly1 = -Infinity;
    for (const p of lips) {
        lx0 = Math.min(lx0, p[0]);
        lx1 = Math.max(lx1, p[0]);
        ly0 = Math.min(ly0, p[1]);
        ly1 = Math.max(ly1, p[1]);
    }
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            const e = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < 1;
            const neck = y > y1 - 0.1 * fh && y < y1 + 0.75 * fh && Math.abs(x - cx) < 0.42 * (x1 - x0);
            hard[y * w + x] = e || neck ? 1 : 0;
            const ew = ((x - cx) / (1.15 * rx)) ** 2 + ((y - cy) / (1.15 * ry)) ** 2 < 1, nw = y > y1 - 0.1 * fh && y < y1 + 0.8 * fh && Math.abs(x - cx) < 0.5 * (x1 - x0);
            wide[y * w + x] = ew || nw ? 1 : 0;
            if (x >= lx0 - 3 && x <= lx1 + 3 && y >= ly0 - 3 && y <= ly1 + 3 && inPoly(x, y, lips))
                lipHard[y * w + x] = 1;
        }
    const soft = gaussian(hard, w, h, Math.max(4, 0.03 * fh)), lip = gaussian(lipHard, w, h, Math.max(1.5, 0.005 * fh));
    const mask = new Float32Array(n);
    for (let i = 0; i < n; i++)
        mask[i] = soft[i] * (1 - clamp((hair?.data[i] ?? 0) * 1.5));
    // the MOVE uses its own wider, slower weight: a weight that falls off across the jaw line squeezes the contour
    // and smears it at 200%; out here the move dies away over the plain background instead (colour stays on mask)
    const wideS = gaussian(wide, w, h, Math.max(8, 0.08 * fh)), hairS = hair ? gaussian(hair.data, w, h, 3) : undefined;
    const wmask = new Float32Array(n);
    for (let i = 0; i < n; i++)
        wmask[i] = Math.max(mask[i], wideS[i] * (1 - clamp((hairS?.[i] ?? 0) * 1.5)));
    // her low band per channel (sigma 1 on skin, 2.2 on the lips); the rest is her own high band
    const low = [];
    for (let c = 0; c < 3; c++) {
        const plane = new Float32Array(n);
        for (let i = 0; i < n; i++)
            plane[i] = data[i * ch + c];
        const a = gaussian(plane, w, h, 1.4), b = gaussian(plane, w, h, 2.2), out = new Float32Array(n);
        for (let i = 0; i < n; i++)
            out[i] = a[i] * (1 - lip[i]) + b[i] * lip[i];
        low.push(out);
    }
    // the tone/fold change in her geometry; on the lips only its broad part
    const dL = new Float32Array(n), da = new Float32Array(n), db = new Float32Array(n);
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            const i = y * w + x, px = (x + 0.5) * sx - 0.5, py = (y + 0.5) * sy - 0.5, hx = (px + 0.5) / 2 - 0.5, hy = (py + 0.5) / 2 - 0.5;
            dL[i] = bilinear(pack.dL, pack.width, pack.height, px, py);
            da[i] = bilinear(pack.da, pack.halfW, pack.halfH, hx, hy);
            db[i] = bilinear(pack.db, pack.halfW, pack.halfH, hx, hy);
        }
    // Donor Rule: the provider's own surface (its pores, pits, spots, mottling, regenerated crepe) lives in D below
    // ~8 px. D's broad part (sigma 8) is used as is; its finer part only where it is a LINE (a fold: one strong Hessian
    // eigenvalue, the other small), never where it is a spot or pit (both similar). Crepe comes from her own mid band.
    {
        const g4 = gaussian(dL, w, h, 8), lineRaw = new Float32Array(n);
        for (const [sg, thr] of [[4, 0.02]]) {
            const g25 = gaussian(dL, w, h, sg);
            for (let y = 1; y < h - 1; y++)
                for (let x = 1; x < w - 1; x++) {
                    const i = y * w + x;
                    const xx = g25[i - 1] - 2 * g25[i] + g25[i + 1], yy = g25[i - w] - 2 * g25[i] + g25[i + w];
                    const xy = (g25[i + w + 1] + g25[i - w - 1] - g25[i + w - 1] - g25[i - w + 1]) / 4;
                    const mm = (xx + yy) / 2, dd = Math.hypot((xx - yy) / 2, xy), hi = mm + dd, lo = mm - dd;
                    // a dark VALLEY line: strong positive curvature across, little along
                    if (hi > thr)
                        lineRaw[i] = Math.max(lineRaw[i], clamp((hi - 2.5 * Math.abs(lo)) / (hi + 1e-4)));
                }
        }
        const line = gaussian(lineRaw, w, h, 3);
        for (let i = 0; i < n; i++) {
            const fine = dL[i] - g4[i], t = clamp(line[i] * 1.5);
            dL[i] = g4[i] + clamp(fine, -PROVIDER_FINE_CAP, PROVIDER_FINE_CAP) * (1 - t) + fine * t;
        }
    }
    // folds: the provider's frames are soft (generated low-res), so its fold shading is broader than a real fold.
    // Its darkening part is tightened (unsharp on D only, 3 px, scaled by amount); her own pixels are untouched.
    if (FOLD_SHARPEN > 0) {
        const g3 = gaussian(dL, w, h, 3), k = FOLD_SHARPEN * amt;
        // continuous: only where the broad change darkens (no switch at D = 0, which left dotted rims)
        for (let i = 0; i < n; i++)
            dL[i] += k * Math.min(0, dL[i] - g3[i]) * clamp(-g3[i] / 1.5);
    }
    const lipD = [gaussian(dL, w, h, 4), gaussian(da, w, h, 4), gaussian(db, w, h, 4)];
    // her marks stay: the provider's frames are regenerated and drop moles and freckles, which shows in D as small
    // LIGHTENING or de-tinting spots. Fine detail of D may darken (folds, crepe shading) but never lighten more than
    // 0.8 L* above its own broad level, and its fine chroma is held within 1 unit of the broad chroma.
    // on her own strong contours (jaw line, nostril rim, lid edge) only D's broad part: the provider's slightly
    // different contour would otherwise lay a soft ghost edge beside hers (a smear at 200%)
    const Ls = new Float32Array(n);
    for (let i = 0; i < n; i++)
        Ls[i] = 0.2126 * data[i * ch] + 0.7152 * data[i * ch + 1] + 0.0722 * data[i * ch + 2];
    const Lg = gaussian(Ls, w, h, 1.5), edge = new Float32Array(n);
    for (let y = 1; y < h - 1; y++)
        for (let x = 1; x < w - 1; x++) {
            const i = y * w + x, g = Math.hypot(Lg[i + 1] - Lg[i - 1], Lg[i + w] - Lg[i - w]) / 2;
            edge[i] = clamp((g - 3) / 6);
        }
    const edgeS = gaussian(edge, w, h, 2);
    for (let i = 0; i < n; i++) {
        const e = clamp(edgeS[i] * 1.5);
        dL[i] = lipD[0][i] + (dL[i] - lipD[0][i]) * (1 - e);
        dL[i] = Math.min(dL[i], lipD[0][i] + 0.8);
        da[i] = lipD[1][i] + clamp(da[i] - lipD[1][i], -1, 1);
        db[i] = lipD[2][i] + clamp(db[i] - lipD[2][i], -1, 1);
    }
    for (let i = 0; i < n; i++)
        if (lip[i] > 0.001) {
            dL[i] = dL[i] * (1 - lip[i]) + lipD[0][i] * lip[i];
            da[i] = da[i] * (1 - lip[i]) + lipD[1][i] * lip[i];
            db[i] = db[i] * (1 - lip[i]) + lipD[2][i] * lip[i];
        }
    // Lid hooding: the skin between the lateral upper lid and the brow slides down a little (read from above), fading
    // to nothing AT the lid line so the lashes and lid margin stay where they are; the crease fold shows less lid.
    const hood = new Float32Array(n);
    if (LID_HOOD > 0 && amt > 0) {
        const iodH = Math.hypot(face[263][0] - face[33][0], face[263][1] - face[33][1]) || 60;
        // Hood symmetry (r4, John's 9.2 bar): the provider sags one brow-to-lid fold more than the other (her left
        // kept more lid showing). Its downward move over each lateral window is measured; the side moved less gets
        // the difference as extra hood (at most HOOD_MATCH_MAX x IOD), so both lids end up equally hooded.
        const sag = [[159, 33], [386, 263]].map(([t, l]) => {
            const top = face[t], cx = 0.55 * top[0] + 0.45 * face[l][0], cy = top[1] - 0.1 * iodH;
            let sw = 0, sm = 0;
            for (let y = Math.max(0, Math.floor(cy - 0.1 * iodH)); y <= Math.min(h - 1, Math.ceil(cy + 0.05 * iodH)); y += 1)
                for (let x = Math.max(0, Math.floor(cx - 0.15 * iodH)); x <= Math.min(w - 1, Math.ceil(cx + 0.15 * iodH)); x += 1) {
                    const px = (x + 0.5) * sx - 0.5, py = (y + 0.5) * sy - 0.5, hx = (px + 0.5) / 2 - 0.5, hy = (py + 0.5) / 2 - 0.5;
                    sm += amt * wmask[y * w + x] * bilinear(pack.fy, pack.halfW, pack.halfH, hx, hy) / sy;
                    sw++;
                }
            return sw ? sm / sw : 0;
        });
        const extra = [0, 1].map((k) => Math.min(HOOD_MATCH_MAX * iodH * amt, Math.max(0, sag[1 - k] - sag[k])));
        let side = 0;
        for (const [lidIds, , lateral] of [[[33, 246, 161, 160, 159, 158, 157, 173, 133], 105, 33], [[263, 466, 388, 387, 386, 385, 384, 398, 362], 334, 263]]) {
            const lid = lidIds.map((k) => face[k]).sort((a, b) => a[0] - b[0]);
            const top = face[lidIds[4]], c = [0.55 * top[0] + 0.45 * face[lateral][0], top[1] - 0.06 * iodH];
            const rx = 0.2 * iodH, ry = 0.09 * iodH, depth = LID_HOOD * iodH * amt + extra[side++];
            for (let y = Math.max(0, Math.floor(c[1] - 3 * ry)); y <= Math.min(h - 1, Math.ceil(top[1] + 0.05 * iodH)); y++)
                // full Gaussian support in x (cutting it at the lid corners left a step in the brow tail)
                for (let x = Math.max(0, Math.floor(c[0] - 3 * rx)); x <= Math.min(w - 1, Math.ceil(c[0] + 3 * rx)); x++) {
                    // lid line y at this x (piecewise linear over the upper lid points)
                    let ly = lid[0][1];
                    for (let k = 0; k < lid.length - 1; k++)
                        if (x >= lid[k][0] && x <= lid[k + 1][0]) {
                            const t = (x - lid[k][0]) / ((lid[k + 1][0] - lid[k][0]) || 1);
                            ly = lid[k][1] + t * (lid[k + 1][1] - lid[k][1]);
                        }
                    if (x > lid[lid.length - 1][0])
                        ly = lid[lid.length - 1][1];
                    const above = clamp((ly - 1.5 - y) / (0.035 * iodH)); // 0 at the lid line, 1 a little above it
                    const g = Math.exp(-0.5 * (((x - c[0]) / rx) ** 2 + ((y - c[1]) / ry) ** 2));
                    hood[y * w + x] = Math.max(hood[y * w + x], depth * g * above * above);
                }
        }
    }
    // move: output reads her photo at -amt * sag (bilinear low band + nearest own high band)
    const L = new Float32Array(n), L0 = new Float32Array(n), A = new Float32Array(n), B = new Float32Array(n), editMask = new Float32Array(n), src = new Int32Array(n);
    let maxMove = 0;
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            const i = y * w + x, m = mask[i], wm = wmask[i];
            const px = (x + 0.5) * sx - 0.5, py = (y + 0.5) * sy - 0.5, hx = (px + 0.5) / 2 - 0.5, hy = (py + 0.5) / 2 - 0.5;
            const fx = wm > 1e-3 ? (-amt * wm * bilinear(pack.fx, pack.halfW, pack.halfH, hx, hy)) / sx : 0;
            const fy = (wm > 1e-3 ? (-amt * wm * bilinear(pack.fy, pack.halfW, pack.halfH, hx, hy)) / sy : 0) - hood[i];
            maxMove = Math.max(maxMove, Math.hypot(fx, fy));
            const qx = x + fx, qy = y + fy, nx = Math.min(w - 1, Math.max(0, Math.round(qx))), ny = Math.min(h - 1, Math.max(0, Math.round(qy))), q = ny * w + nx;
            src[i] = q;
            const rgb = [0, 1, 2].map((c) => bilinear(low[c], w, h, qx, qy) + data[q * ch + c] - low[c][q]);
            const lab = srgbToLab([rgb[0], rgb[1], rgb[2]]);
            L0[i] = lab[0];
            const k = amt * m;
            // multiplicative in (L* + 16) (i.e. a ratio on luminance^(1/3)): her texture scales with the shading change
            // instead of riding on top at full contrast inside a darker fold
            const lowL = k > 0 ? srgbToLab([bilinear(low[0], w, h, qx, qy), bilinear(low[1], w, h, qx, qy), bilinear(low[2], w, h, qx, qy)])[0] : lab[0];
            L[i] = lab[0] + bilinear(dL, w, h, qx, qy) * k * clamp((lab[0] + 16) / (lowL + 16), 0.5, 1.5);
            A[i] = lab[1] + bilinear(da, w, h, qx, qy) * k;
            B[i] = lab[2] + bilinear(db, w, h, qx, qy) * k;
            editMask[i] = m > 0.02 || Math.hypot(fx, fy) > 0.05 ? 1 : 0;
        }
    // her own mid band (crepe) raised where it exists, cored; measured on her moved pixels, not on D
    const m1 = gaussian(L0, w, h, 1.5), m5 = gaussian(L0, w, h, 5);
    for (let i = 0; i < n; i++) {
        const m = mask[i];
        if (m < 1e-3 && !editMask[i])
            continue;
        const mid = m1[i] - m5[i], core = 1 - clamp((Math.abs(mid) - 1.5) / 2.5);
        L[i] = clamp(L[i] + 0.35 * amt * m * core * mid, 0, 100);
    }
    const marks = restoreMarks(input, face, hair, mask, src, L, A, B);
    const out = new Uint8Array(data);
    for (let i = 0; i < n; i++) {
        if (mask[i] < 1e-3 && !editMask[i])
            continue;
        const rgb = labToSrgb([L[i], A[i], B[i]]);
        for (let c = 0; c < 3; c++)
            out[i * ch + c] = toByte(rgb[c]);
    }
    return { image: { width: w, height: h, channels: ch, data: out }, editMask: { width: w, height: h, channels: 1, data: editMask },
        metrics: { amount: amt, max_move_px: Math.round(maxMove * 10) / 10, donor_texture_pixels: 0, mark_pixels: marks } };
}
/**
 * Her moles and freckles are her own surface (Donor Rule): the provider's frames are regenerated and fade them,
 * and the crepe and tone changes soften them further. Small dark spots of the ORIGINAL (darker than their own
 * surround by > 2.5 L*, on skin, away from eyes, brows, lips and hair) are found as a soft pigment mask, and in the
 * output each one's full detail against its own surround (L, a, b) is put back exactly as it was, at the place the
 * move carried it to. Returns the number of mark pixels restored.
 */
function restoreMarks(input, face, hair, mask, src, L, A, B) {
    const { width: w, height: h, channels: ch, data } = input, n = w * h;
    const iod = Math.hypot(face[263][0] - face[33][0], face[263][1] - face[33][1]) || 60;
    const SL = new Float32Array(n), SA = new Float32Array(n), SB = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        if (mask[i] < 0.05)
            continue;
        const lab = srgbToLab([data[i * ch], data[i * ch + 1], data[i * ch + 2]]);
        SL[i] = lab[0];
        SA[i] = lab[1];
        SB[i] = lab[2];
    }
    // features to keep out (their darkness is not a mark): eyes, brows, lips, nostrils, dilated
    const feat = new Float32Array(n);
    const polys = [CONTOURS.right_eye, CONTOURS.left_eye, CONTOURS.right_brow, CONTOURS.left_brow, CONTOURS.lips_outer].map((ids) => ids.map((k) => face[k]));
    polys.push([98, 97, 2, 326, 327, 294, 278, 344, 440, 275, 4, 45, 220, 115, 48, 64].map((k) => face[k]));
    for (const pg of polys) {
        const xs = pg.map((p) => p[0]), ys = pg.map((p) => p[1]);
        for (let y = Math.max(0, Math.floor(Math.min(...ys))); y <= Math.min(h - 1, Math.ceil(Math.max(...ys))); y++)
            for (let x = Math.max(0, Math.floor(Math.min(...xs))); x <= Math.min(w - 1, Math.ceil(Math.max(...xs))); x++)
                if (inPoly(x, y, pg))
                    feat[y * w + x] = 1;
    }
    const featD = gaussian(feat, w, h, Math.max(3, 0.04 * iod));
    const ss = Math.max(3, 0.025 * iod), sG = gaussian(SL, w, h, ss), sGa = gaussian(SA, w, h, ss), sGb = gaussian(SB, w, h, ss), s1 = gaussian(SL, w, h, 0.8);
    const P0 = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        if (mask[i] < 0.3 || featD[i] > 0.05 || (hair?.data[i] ?? 0) > 0.05)
            continue;
        const x = i % w;
        if (x < 1 || x >= w - 1 || i < w || i >= n - w)
            continue;
        // a spot, not an edge: the broad surround is nearly flat here (contours and fold edges are skipped)
        const g = Math.hypot(sG[i + 1] - sG[i - 1], sG[i + w] - sG[i - w]) / 2;
        P0[i] = clamp((sG[i] - s1[i] - 2.5) / 3) * clamp((0.9 - g) / 0.4);
    }
    // keep only compact spots: components of the core that are small and round (lid lines, contour shadows, fold
    // edges and the ear rim are long and thin and are dropped)
    const seen = new Uint8Array(n), stack = [], maxArea = (iod / 6) ** 2;
    for (let i0 = 0; i0 < n; i0++) {
        if (seen[i0] || P0[i0] < 0.25)
            continue;
        const comp = [];
        stack.push(i0);
        seen[i0] = 1;
        let xa = Infinity, xb = -Infinity, ya = Infinity, yb = -Infinity;
        while (stack.length) {
            const j = stack.pop(), x = j % w, y = (j - x) / w;
            comp.push(j);
            xa = Math.min(xa, x);
            xb = Math.max(xb, x);
            ya = Math.min(ya, y);
            yb = Math.max(yb, y);
            for (const k of [j - 1, j + 1, j - w, j + w])
                if (k >= 0 && k < n && !seen[k] && P0[k] >= 0.25) {
                    seen[k] = 1;
                    stack.push(k);
                }
        }
        const bwid = xb - xa + 1, bhgt = yb - ya + 1, long = Math.max(bwid, bhgt), short = Math.min(bwid, bhgt);
        const fillR = comp.length / (bwid * bhgt);
        if (comp.length > maxArea || long > 2.2 * short + 2 || fillR < 0.35)
            for (const j of comp)
                P0[j] = 0;
    }
    // the spot's soft edge (below the core threshold) only next to a kept core
    const core = new Float32Array(n);
    for (let i = 0; i < n; i++)
        core[i] = P0[i] >= 0.25 ? 1 : 0;
    const near = gaussian(core, w, h, 1.5);
    for (let i = 0; i < n; i++)
        if (near[i] < 0.05)
            P0[i] = 0;
    const P = gaussian(P0, w, h, 1);
    const oG = gaussian(L, w, h, ss), oGa = gaussian(A, w, h, ss), oGb = gaussian(B, w, h, ss);
    let count = 0;
    for (let i = 0; i < n; i++) {
        const q = src[i], p = clamp(P[q] * 2);
        if (p < 0.02)
            continue;
        L[i] = clamp(L[i] + p * ((SL[q] - sG[q]) - (L[i] - oG[i])), 0, 100);
        A[i] += p * ((SA[q] - sGa[q]) - (A[i] - oGa[i]));
        B[i] += p * ((SB[q] - sGb[q]) - (B[i] - oGb[i]));
        if (p > 0.5)
            count++;
    }
    return count;
}
/** Browser only, after the consent tick and an explicit click: one aging task (2 units), then its delta pack. */
export async function requestProviderOlder(image, onUpdate) {
    const { api } = await import("../../api.js");
    const { appConsent, attestationFor } = await import("../../ui/shell/consent.js");
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext("2d");
    if (!ctx)
        throw new Error("This browser cannot prepare the photo.");
    const rgba = new Uint8ClampedArray(image.width * image.height * 4);
    for (let i = 0; i < image.width * image.height; i++) {
        for (let c = 0; c < 3; c++)
            rgba[i * 4 + c] = image.data[i * image.channels + c];
        rgba[i * 4 + 3] = 255;
    }
    ctx.putImageData(new ImageData(rgba, image.width, image.height), 0, 0);
    const blob = await new Promise((ok, no) => canvas.toBlob((b) => (b ? ok(b) : no(new Error("Could not encode the photo."))), "image/jpeg", 0.95));
    onUpdate?.("Uploading the photo");
    const photo = await api.uploadPhoto(blob);
    try {
        const grant = appConsent.require(photo.photo_id, OLDER_ACTION);
        onUpdate?.(`Running YouCam Aging (${OLDER_UNITS} units)`);
        const reply = await api.olderYoucam({ photo_id: photo.photo_id, consent: attestationFor(grant, photo.photo_id, OLDER_ACTION) });
        const pack = parseOlderPack(await api.olderPack(reply.pack_url));
        pack.ages = { neutral_age: reply.neutral_age, aged_age: reply.aged_age };
        onUpdate?.(reply.cached ? "Older from YouCam ready (saved result, no units)" : `Older from YouCam ready (${reply.units} units)`);
        return pack;
    }
    finally {
        try {
            await api.deletePhoto(photo.photo_id);
        }
        catch { /* the photo expires with the session */ }
    }
}
/** The Older layer from the provider: her photo moved and shaded by the pack at `fraction` (stop/5 x eased
 * strength, so the default stop 3 is 0.6 of the oldest frame), then, when the grey was fetched, the grey as
 * colour only on her own strands at the same fraction. */
export function renderProviderOlder(image, face, hair, pack, greyHair, fraction) {
    const result = applyProviderOlder(image, pack, face, hair, fraction);
    // workstream 01 ideas 3+4 on top of the provider delta: brow/lip contrast down (coarse only), limbal ring and whites dulled
    const tone = olderFeatureTone(result.image, face, fraction);
    result.image = tone.image;
    // the provider leaves the neck below the jaw shadow untouched, so an older face sat on a young neck (r2 review)
    const neckAged = neckAge(result.image, face, hair, fraction);
    result.image = neckAged.image;
    for (let i = 0; i < neckAged.edit.length; i++)
        if (neckAged.edit[i])
            result.editMask.data[i] = 1;
    for (let i = 0; i < tone.edit.length; i++)
        if (tone.edit[i])
            result.editMask.data[i] = 1;
    if (greyHair && hair) {
        result.image = blendProviderHairColour(result.image, greyHair, hair, fraction);
        for (let i = 0; i < hair.data.length; i++)
            if (hair.data[i] > 0.15)
                result.editMask.data[i] = 1;
    }
    return { ...result, metrics: { ...result.metrics, ...tone.metrics, grey_hair: greyHair && hair ? 1 : 0 } };
}
/** Neck ageing from her own neck (the provider gives none below the jaw): her own horizontal creases (valleys of
 * the mid band that run across the neck) deepen and her own crepe band rises, both scaled by the Older amount.
 * Nothing is drawn: a neck without creases gets only the crepe lift. Gains ASSUMED by eye at 200% (r3).
 */
export const NECK_CREASE_GAIN = 2.6, NECK_CREPE_GAIN = 0.18;
export function neckAge(input, face, hair, amount) {
    const { width: w, height: h, channels: ch, data } = input, n = w * h, amt = clamp(amount);
    const edit = new Uint8Array(n);
    if (amt <= 0 || face.length < 468)
        return { image: input, edit };
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let k = 0; k < 468; k++) {
        x0 = Math.min(x0, face[k][0]);
        x1 = Math.max(x1, face[k][0]);
        y0 = Math.min(y0, face[k][1]);
        y1 = Math.max(y1, face[k][1]);
    }
    const fh = y1 - y0, cx = (x0 + x1) / 2, halfW = 0.34 * (x1 - x0);
    // the box stops above the collarbones (their hollow is bone, not a crease, and read as a smear when deepened)
    const top = Math.max(0, Math.floor(y1 + 0.04 * fh)), bot = Math.min(h - 1, Math.ceil(y1 + 0.45 * fh));
    if (bot <= top + 8)
        return { image: input, edit };
    const L = new Float32Array(n), A = new Float32Array(n), B = new Float32Array(n);
    for (let y = top; y <= bot; y++)
        for (let x = 0; x < w; x++) {
            const i = y * w + x, lab = srgbToLab([data[i * ch], data[i * ch + 1], data[i * ch + 2]]);
            L[i] = lab[0];
            A[i] = lab[1];
            B[i] = lab[2];
        }
    // region: a soft box under the jaw, fading at its four sides; hair left out
    const reg = new Float32Array(n);
    for (let y = top; y <= bot; y++)
        for (let x = 0; x < w; x++) {
            const v = clamp((y - top) / (0.08 * fh)) * clamp((bot - y) / (0.12 * fh)) * clamp((halfW - Math.abs(x - cx)) / (0.1 * (x1 - x0)));
            reg[y * w + x] = v * (1 - clamp((hair?.data[y * w + x] ?? 0) * 1.5));
        }
    const iod = Math.hypot(face[263][0] - face[33][0], face[263][1] - face[33][1]) || 60;
    const s1 = gaussian(L, w, h, Math.max(1, 0.012 * iod)), s2 = gaussian(L, w, h, Math.max(2, 0.05 * iod)), sv = gaussian(L, w, h, Math.max(1.5, 0.02 * iod));
    const out = new Uint8Array(data);
    for (let y = Math.max(1, top); y < Math.min(h - 1, bot); y++)
        for (let x = 1; x < w - 1; x++) {
            const i = y * w + x, r = reg[i];
            if (r <= 0.001)
                continue;
            const mid = s1[i] - s2[i];
            // across-the-neck valley: curvature down the neck clearly larger than along it
            const lyy = sv[i - w] + sv[i + w] - 2 * sv[i], lxx = sv[i - 1] + sv[i + 1] - 2 * sv[i];
            const across = clamp((lyy - Math.abs(lxx)) / 0.08);
            const crease = Math.min(0, mid) * across * NECK_CREASE_GAIN;
            const crepe = (L[i] - s1[i]) * NECK_CREPE_GAIN;
            const dL = amt * r * (Math.max(-4, crease) + crepe);
            if (Math.abs(dL) < 0.05)
                continue;
            const rgb = labToSrgb([L[i] + dL, A[i], B[i]]);
            for (let c = 0; c < 3; c++)
                out[i * ch + c] = toByte(rgb[c]);
            edit[i] = 1;
        }
    return { image: { ...input, data: out }, edit };
}
