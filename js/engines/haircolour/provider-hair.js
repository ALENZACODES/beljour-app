import { labToSrgb, srgbToLab, toByte } from "../shade/colourspace.js";
import { clamp, gaussian } from "../core/bands.js";
const BROWS = [70, 63, 105, 66, 107, 336, 296, 334, 293, 300];
/** A natural brown matched to the brows (hue) and skin undertone, as #RRGGBB. */
export function naturalHairHex(image, face) {
    const { width: w, height: h, channels: ch, data } = image, v = [];
    const iod = Math.hypot(face[263][0] - face[33][0], face[263][1] - face[33][1]) || 60, r = Math.max(2, Math.round(0.016 * iod));
    for (const k of BROWS)
        for (let dy = -r; dy <= r; dy++)
            for (let dx = -r; dx <= r; dx++) {
                const x = Math.round(face[k][0] + dx), y = Math.round(face[k][1] + dy);
                if (x < 0 || y < 0 || x >= w || y >= h)
                    continue;
                const j = (y * w + x) * ch;
                v.push(srgbToLab([data[j], data[j + 1], data[j + 2]]));
            }
    v.sort((p, q) => p[0] - q[0]);
    const dark = v.slice(0, Math.max(1, v.length >> 1)), med = (i) => dark.map((x) => x[i]).sort((p, q) => p - q)[dark.length >> 1] ?? 0;
    const hue = Math.min(1.2, Math.max(0.9, Math.atan2(med(2), med(1)) || 1.05)), L = Math.min(42, Math.max(28, med(0) - 6));
    const rgb = labToSrgb([L, 15 * Math.cos(hue), 15 * Math.sin(hue)]);
    return "#" + rgb.map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, "0")).join("");
}
/** The provider's hair over the local render, inside the hair mask only (>= 0.5 full, 0.15-0.5 feathered). */
export function compositeProviderHair(base, provider, hair) {
    const { width: w, height: h, channels: ch } = base, out = new Uint8Array(base.data);
    const sx = provider.width / w, sy = provider.height / h, pc = provider.channels;
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            const i = y * w + x, m = hair.data[i];
            if (m < 0.15)
                continue;
            const t = m >= 0.5 ? 1 : (m - 0.15) / 0.35;
            // bilinear sample (the provider may return the photo a pixel narrower or wider)
            const fx = Math.min(provider.width - 1.001, Math.max(0, (x + 0.5) * sx - 0.5)), fy = Math.min(provider.height - 1.001, Math.max(0, (y + 0.5) * sy - 0.5));
            const x0 = Math.floor(fx), y0 = Math.floor(fy), ax = fx - x0, ay = fy - y0;
            for (let c = 0; c < 3; c++) {
                const p = (xx, yy) => provider.data[(yy * provider.width + xx) * pc + c];
                const v = (p(x0, y0) * (1 - ax) + p(x0 + 1, y0) * ax) * (1 - ay) + (p(x0, y0 + 1) * (1 - ax) + p(x0 + 1, y0 + 1) * ax) * ay;
                out[i * ch + c] = Math.round(out[i * ch + c] * (1 - t) + v * t);
            }
        }
    return { ...base, data: out };
}
/**
 * Older's grey (John, Oct 30, 2026, 7:54 PM ET): the provider's grey is taken as COLOUR ONLY. Each hair pixel keeps
 * her own strand contrast (its ratio to her own low band, sigma 2) at the provider's lock level, never brighter
 * than anything the provider has within 2 px (no edge sparkle); chroma is the provider's, lightly smoothed and
 * desaturated. Flyaways just outside the mask (pixels already darker than the background) move half way toward
 * the new lock level by their own coverage. Nothing is drawn. `strength` 0..1.
 */
/** Salt-and-pepper selection on her own strand ratio (pixel / local mean, linear light). ASSUMED by eye. */
/** Flyaway search reach (fraction of width) and the chroma above which a pixel is skin, not a strand. ASSUMED. */
export const FLY_REACH = 0.05, FLY_CHROMA = 14;
export const SALT_FROM = 0.65, SALT_TO = 1.3, SALT_FLOOR = 0.2, SALT_LIFT = 1.15, PEPPER_LIFT = 0.4;
const smooth01 = (t) => { const u = Math.max(0, Math.min(1, t)); return u * u * (3 - 2 * u); };
export function blendProviderHairColour(base, provider, hair, strength) {
    const { width: w, height: h, channels: ch } = base, n = w * h, s = clamp(strength), out = new Uint8Array(base.data);
    if (s <= 0)
        return { ...base, data: out };
    const sx = provider.width / w, sy = provider.height / h, pc = provider.channels;
    const Lb = new Float32Array(n), Ab = new Float32Array(n), Bb = new Float32Array(n), Lp = new Float32Array(n), Ap = new Float32Array(n), Bp = new Float32Array(n);
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            const i = y * w + x, j = i * ch, lb = srgbToLab([base.data[j], base.data[j + 1], base.data[j + 2]]);
            Lb[i] = lb[0];
            Ab[i] = lb[1];
            Bb[i] = lb[2];
            const fx = Math.min(provider.width - 1.001, Math.max(0, (x + 0.5) * sx - 0.5)), fy = Math.min(provider.height - 1.001, Math.max(0, (y + 0.5) * sy - 0.5));
            const x0 = Math.floor(fx), y0 = Math.floor(fy), ax = fx - x0, ay = fy - y0, rgb = [0, 0, 0];
            for (let c = 0; c < 3; c++) {
                const p = (xx, yy) => provider.data[(yy * provider.width + xx) * pc + c];
                rgb[c] = (p(x0, y0) * (1 - ax) + p(x0 + 1, y0) * ax) * (1 - ay) + (p(x0, y0 + 1) * (1 - ax) + p(x0 + 1, y0 + 1) * ax) * ay;
            }
            const lp = srgbToLab([rgb[0], rgb[1], rgb[2]]);
            Lp[i] = lp[0];
            Ap[i] = lp[1];
            Bp[i] = lp[2];
        }
    const lin = (L) => (L > 8 ? ((L + 16) / 116) ** 3 : L / 903.3), unlin = (Y) => (Y > 0.008856 ? 116 * Math.cbrt(Math.max(0, Y)) - 16 : 903.3 * Y);
    const Yb = Float32Array.from(Lb, lin), Yp = Float32Array.from(Lp, lin);
    const gb = gaussian(Yb, w, h, 2), gp = gaussian(Yp, w, h, 2), ga = gaussian(Ap, w, h, 1), gB = gaussian(Bp, w, h, 1);
    // provider's local maximum (5x5), separable
    const rowMax = new Float32Array(n), pmax = new Float32Array(n);
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            let m = 0;
            for (let d = -2; d <= 2; d++) {
                const xx = Math.min(w - 1, Math.max(0, x + d));
                m = Math.max(m, Yp[y * w + xx]);
            }
            rowMax[y * w + x] = m;
        }
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            let m = 0;
            for (let d = -2; d <= 2; d++) {
                const yy = Math.min(h - 1, Math.max(0, y + d));
                m = Math.max(m, rowMax[yy * w + x]);
            }
            pmax[y * w + x] = m;
        }
    // ceiling: no strand brighter than the provider's own brightest 3% of the hair core (no white sparkle at the edge)
    const core = [];
    for (let i = 0; i < n; i += 2)
        if (hair.data[i] > 0.8)
            core.push(Yp[i]);
    core.sort((p, q) => p - q);
    const ceil = core.length ? core[Math.floor(core.length * 0.97)] : 1;
    const Lo = Float32Array.from(Lb), Ao = Float32Array.from(Ab), Bo = Float32Array.from(Bb);
    for (let i = 0; i < n; i++) {
        const t = clamp((hair.data[i] - 0.15) / 0.35) * s;
        if (t <= 0)
            continue;
        // Salt and pepper, not a grey wash (John's 9.2 bar, Oct 30): her own brighter strands (above their local
        // mean) turn silver, a little brighter than the provider's local level; her darker strands stay close to her
        // own colour, lifted only a quarter of the way. Which strand greys is decided by HER strand pattern.
        const r = Yb[i] / (gb[i] + 1e-4), sel = SALT_FLOOR + (1 - SALT_FLOOR) * smooth01((r - SALT_FROM) / (SALT_TO - SALT_FROM));
        const silver = Math.min(r * (gp[i] + 1e-4) * SALT_LIFT, pmax[i] * SALT_LIFT, Math.max(ceil, Yb[i]));
        const pepper = Yb[i] + (Math.min(r * (gp[i] + 1e-4), pmax[i]) - Yb[i]) * PEPPER_LIFT;
        const Yn = pepper + (silver - pepper) * sel;
        Lo[i] = Lb[i] + (unlin(Yn) - Lb[i]) * t;
        Ao[i] = Ab[i] + (ga[i] * 0.7 - Ab[i]) * t;
        Bo[i] = Bb[i] + (gB[i] * 0.7 - Bb[i]) * t;
    }
    // Flyaways (r4, John's 9.2 bar): a soft alpha matte in linear light. Each near-neutral pixel outside the mask that
    // is darker than the local background is read as strand coverage alpha = (bg - Y) / (bg - strand), and its strand
    // part is re-coloured to the new lock level: out = alpha * strand' + (1 - alpha) * bg. Colour only, her own
    // strands, nothing drawn; skin (chromatic) and the background itself are left alone.
    const reach = Math.max(6, Math.round(FLY_REACH * w)), inside = new Float32Array(n), bgw = new Float32Array(n), lw = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        inside[i] = hair.data[i] > 0.15 ? 1 : 0;
        bgw[i] = hair.data[i] < 0.05 ? 1 : 0;
        lw[i] = Yb[i] * bgw[i];
    }
    const near = gaussian(inside, w, h, reach / 2), bgN = gaussian(lw, w, h, 12), bgD = gaussian(bgw, w, h, 12);
    const y0 = [], y1 = [];
    for (let i = 0; i < n; i += 3)
        if (hair.data[i] > 0.8) {
            y0.push(gb[i]);
            y1.push(lin(Lo[i]));
        }
    const med = (a) => (a.sort((p, q) => p - q), a.length ? a[a.length >> 1] : 0.03);
    const Y0 = med(y0), Y1 = y1.length ? y1.reduce((p, q) => p + q, 0) / y1.length : Y0;
    for (let i = 0; i < n; i++) {
        if (hair.data[i] >= 0.15 || near[i] < 0.01)
            continue;
        const C = Math.hypot(Ab[i], Bb[i]), neutral = clamp((FLY_CHROMA - C) / 6);
        if (neutral <= 0)
            continue;
        const bg = bgD[i] > 1e-3 ? bgN[i] / bgD[i] : Yb[i];
        if (bg - Yb[i] < 0.012 * bg)
            continue; // background noise, not a strand
        const alpha = clamp((bg - Yb[i]) / Math.max(1e-3, bg - Y0));
        const strand = clamp((Yb[i] - (1 - alpha) * bg) / Math.max(alpha, 0.05), 0, 1);
        const Yn = alpha * (strand + (Y1 - Y0)) + (1 - alpha) * bg;
        const k = s * neutral * clamp(near[i] / 0.05);
        Lo[i] = Lb[i] + (unlin(Math.max(0, Yn)) - Lb[i]) * k;
    }
    for (let i = 0; i < n; i++) {
        if (Lo[i] === Lb[i] && Ao[i] === Ab[i] && Bo[i] === Bb[i])
            continue;
        const rgb = labToSrgb([clamp(Lo[i], 0, 100), Ao[i], Bo[i]]);
        for (let c = 0; c < 3; c++)
            out[i * ch + c] = toByte(rgb[c]);
    }
    return { ...base, data: out };
}
/** Browser only, after an explicit click: send this photo to YouCam for one hair-colour task (1 unit). */
export async function requestProviderHair(image, hex, onUpdate, { intensity = 75, shine = 40 } = {}) {
    const { api } = await import("../../api.js");
    const { applyStyling, finishedImage } = await import("../../ui/styling-tasks.js");
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
    const photo = await api.uploadPhoto(blob);
    try {
        const outcome = await applyStyling({ photo_id: photo.photo_id, action: "hair-color", options: { color: hex, intensity, shine } }, onUpdate);
        const bitmap = await createImageBitmap(await (await fetch(api.resultUrl(finishedImage(outcome)))).blob());
        const c2 = document.createElement("canvas");
        c2.width = bitmap.width;
        c2.height = bitmap.height;
        const x2 = c2.getContext("2d");
        if (!x2)
            throw new Error("This browser cannot read the result.");
        x2.drawImage(bitmap, 0, 0);
        const px = x2.getImageData(0, 0, bitmap.width, bitmap.height).data, data = new Uint8Array(bitmap.width * bitmap.height * 3);
        for (let i = 0; i < bitmap.width * bitmap.height; i++)
            for (let c = 0; c < 3; c++)
                data[i * 3 + c] = px[i * 4 + c];
        return { width: bitmap.width, height: bitmap.height, channels: 3, data };
    }
    finally {
        try {
            await api.deletePhoto(photo.photo_id);
        }
        catch { /* the photo expires with the session */ }
    }
}
