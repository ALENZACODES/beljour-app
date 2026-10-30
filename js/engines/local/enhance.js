/** LS6 enhance pipeline metrics (plan §8.3, M1, M2, M4, M7): analysis, denoise, deblur
 * fallback, tone, the one-tap modes, synthetic degradations with ground truth and Q11.
 * Mirrors api/plumb_api/engines/repair/{analyse,denoise,restore,synthetic}.py.
 * Inspiration (published methods, written from the papers): Donoho and Johnstone wavelet
 * noise estimation, He Sun and Tang guided filter, Tomasi and Manduchi bilateral filter,
 * Buades Coll and Morel non-local means; concept only, no code copied. No learned model.
 * Local enhancement on this photo; no detail is invented.
 * Author: John Khan.
 */
import { byteImage, decode, encode, encodeChannel, requireColour, roundHalfEven } from "../core/buffer.js";
import { rgbToLab } from "../core/colour.js";
import { boxMean, convolve, gradient, quantile } from "../core/filters.js";
import { guidedFilter } from "../core/mask.js";
import { hashNoise } from "../../quality/harness.js";
import { classifyFromAnalysis, planRescue } from "./photo-condition.js";
import { MAX_EXPOSURE_GAIN, boundedExposure, guardOutput, restoreFadedContrast, safetyReport } from "./enhance-safety.js";
import { faceWeights, meteredLuminance } from "./face-tone.js";
export const VERSION = "enhance-condition-r12/1";
export const LABEL = "Local enhancement on this photo; no detail is invented.";
export const MAD_SCALE = 0.6745, REBLUR_SIGMA = 2, MOTION_COHERENCE = 0.25, BLOCK = 8;
const plane = (w, h, data) => ({ width: w, height: h, channels: 1, data });
// Step 1: analyse --------------------------------------------------------------------------
export function luma255(img) {
    requireColour(img);
    const n = img.width * img.height, out = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        const p = i * img.channels;
        out[i] = 0.299 * img.data[p] + 0.587 * img.data[p + 1] + 0.114 * img.data[p + 2];
    }
    return plane(img.width, img.height, out);
}
export function noiseSigma(p) {
    const h = Math.floor(p.height / 2) * 2, w = Math.floor(p.width / 2) * 2;
    if (h < 4 || w < 4)
        throw new RangeError("the photo is too small to estimate noise");
    const hh = [];
    for (let y = 0; y < h; y += 2)
        for (let x = 0; x < w; x += 2) {
            const a = p.data[y * p.width + x], b = p.data[y * p.width + x + 1], c = p.data[(y + 1) * p.width + x], d = p.data[(y + 1) * p.width + x + 1];
            hh.push(Math.abs((a - b - c + d) / 2));
        }
    return quantile(hh, 0.5) / MAD_SCALE;
}
export function gaussianKernel(sigma) {
    if (!(Number.isFinite(sigma) && sigma > 0 && sigma <= 32))
        throw new RangeError("sigma must be in (0, 32]");
    const radius = Math.max(1, Math.ceil(3 * sigma)), k = new Float64Array(2 * radius + 1);
    let sum = 0;
    for (let i = 0; i < k.length; i++) {
        const x = i - radius;
        k[i] = Math.exp(-(x * x) / (2 * sigma * sigma));
        sum += k[i];
    }
    for (let i = 0; i < k.length; i++)
        k[i] /= sum;
    return k;
}
export const gaussian = (p, sigma) => { const k = gaussianKernel(sigma); return convolve(convolve(p, k, 0), k, 1); };
export function laplacianVariance(p) {
    const w = p.width, vals = [];
    for (let y = 1; y < p.height - 1; y++)
        for (let x = 1; x < w - 1; x++) {
            const i = y * w + x;
            vals.push(p.data[i - 1] + p.data[i + 1] + p.data[i - w] + p.data[i + w] - 4 * p.data[i]);
        }
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    return vals.reduce((s, v) => s + (v - mean) * (v - mean), 0) / vals.length;
}
export function gradientEnergy(p) {
    const [gx, gy] = gradient(p);
    let s = 0;
    for (let i = 0; i < gx.data.length; i++)
        s += gx.data[i] * gx.data[i] + gy.data[i] * gy.data[i];
    return s / gx.data.length;
}
export function blurSigma(p, reblur = REBLUR_SIGMA) {
    const e0 = gradientEnergy(p);
    if (e0 <= 1e-12)
        return 0;
    const ratio = Math.min(gradientEnergy(gaussian(p, reblur)) / e0, 0.999999);
    return reblur * ratio / Math.sqrt(1 - ratio * ratio);
}
export function motion(p) {
    const [gx, gy] = gradient(p);
    let sxx = 0, sxy = 0, syy = 0;
    for (let i = 0; i < gx.data.length; i++) {
        sxx += gx.data[i] * gx.data[i];
        sxy += gx.data[i] * gy.data[i];
        syy += gy.data[i] * gy.data[i];
    }
    const trace = sxx + syy;
    if (trace <= 1e-12)
        return [0, 0];
    const coherence = Math.sqrt((sxx - syy) ** 2 + 4 * sxy * sxy) / trace;
    const blurDeg = (0.5 * Math.atan2(2 * sxy, sxx - syy) + Math.PI / 2) * 180 / Math.PI;
    return [coherence, ((blurDeg + 90) % 180 + 180) % 180 - 90];
}
export function blockiness(p, block = BLOCK) {
    const w = p.width, h = p.height;
    let border = 0, nb = 0, inner = 0, ni = 0;
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w - 1; x++) {
            const d = Math.abs(p.data[y * w + x + 1] - p.data[y * w + x]);
            if (x % block === block - 1) {
                border += d;
                nb++;
            }
            else {
                inner += d;
                ni++;
            }
        }
    for (let y = 0; y < h - 1; y++)
        for (let x = 0; x < w; x++) {
            const d = Math.abs(p.data[(y + 1) * w + x] - p.data[y * w + x]);
            if (y % block === block - 1) {
                border += d;
                nb++;
            }
            else {
                inner += d;
                ni++;
            }
        }
    if (!nb || !ni)
        return 0;
    return Math.max(0, border / nb - inner / ni);
}
export function analyse(img) {
    const y = luma255(img), lin = decode(img), n = img.width * img.height;
    let lum = 0, dark = 0, bright = 0;
    const means = [0, 0, 0];
    for (let i = 0; i < n; i++) {
        const r = lin.data[i * 3], g = lin.data[i * 3 + 1], b = lin.data[i * 3 + 2];
        lum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
        means[0] += r;
        means[1] += g;
        means[2] += b;
        if (y.data[i] <= 2)
            dark++;
        if (y.data[i] >= 253)
            bright++;
    }
    lum /= n;
    for (let c = 0; c < 3; c++)
        means[c] /= n;
    const gains = means.map((m) => (m > 1e-9 ? means[1] / m : 1));
    const lab = rgbToLab(means.map((m) => encodeChannel(m) * 255));
    const sigmaBlur = blurSigma(y), [coherence, direction] = motion(y);
    const kind = sigmaBlur < 0.8 ? "none" : coherence >= MOTION_COHERENCE ? "motion" : "defocus";
    return { noise_sigma: noiseSigma(y), laplacian_variance: laplacianVariance(y), blur_sigma: sigmaBlur, motion_coherence: coherence,
        motion_degrees: direction, blur_type: kind, blockiness: blockiness(y), mean_luminance: lum,
        ev_offset: Math.log2(0.18 / Math.max(lum, 1e-6)), clipped_dark: dark / n, clipped_bright: bright / n, grey_gains: gains, cast_ab: [lab[1], lab[2]] };
}
// Step 2: denoise --------------------------------------------------------------------------
export const METHODS = ["none", "guided", "bilateral", "nlm"];
export const AUTO_LIMITS = [3, 8, 16];
export const GUIDED_K = 2.5, CHROMA_K = 3.5, BILATERAL_RADIUS = 3, BILATERAL_SPACE = 2, BILATERAL_RANGE = 2.5;
export const NLM_PATCH = 1, NLM_SEARCH = 5, NLM_H = 0.6;
export function choose(sigma) {
    if (!(Number.isFinite(sigma) && sigma >= 0))
        throw new RangeError("sigma must be finite and non-negative");
    for (let k = 0; k < AUTO_LIMITS.length; k++)
        if (sigma < AUTO_LIMITS[k])
            return METHODS[k];
    return "nlm";
}
export function toYcc(img) {
    requireColour(img);
    const n = img.width * img.height, y = new Float64Array(n), cb = new Float64Array(n), cr = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        const p = i * img.channels, r = img.data[p] / 255, g = img.data[p + 1] / 255, b = img.data[p + 2] / 255;
        y[i] = 0.299 * r + 0.587 * g + 0.114 * b;
        cb[i] = b - y[i];
        cr[i] = r - y[i];
    }
    return { w: img.width, h: img.height, y, cb, cr };
}
export function fromYcc(c) {
    const out = byteImage(c.w, c.h, 3);
    for (let i = 0; i < c.y.length; i++) {
        const r = c.y[i] + c.cr[i], b = c.y[i] + c.cb[i], g = (c.y[i] - 0.299 * r - 0.114 * b) / 0.587;
        out.data[i * 3] = Math.min(255, Math.max(0, roundHalfEven(r * 255)));
        out.data[i * 3 + 1] = Math.min(255, Math.max(0, roundHalfEven(g * 255)));
        out.data[i * 3 + 2] = Math.min(255, Math.max(0, roundHalfEven(b * 255)));
    }
    return out;
}
const clampIndex = (v, n) => (v < 0 ? 0 : v >= n ? n - 1 : v);
function guidedYcc(c, sigma, strength) {
    const s = Math.max(sigma, 0.5) / 255 * strength, epsY = (GUIDED_K * s) ** 2, epsC = (CHROMA_K * s) ** 2;
    const g = plane(c.w, c.h, c.y);
    return { ...c, y: Float64Array.from(guidedFilter(g, g, 2, epsY).data), cb: Float64Array.from(guidedFilter(g, plane(c.w, c.h, c.cb), 3, epsC).data),
        cr: Float64Array.from(guidedFilter(g, plane(c.w, c.h, c.cr), 3, epsC).data) };
}
function bilateralYcc(c, sigma, strength) {
    const r = BILATERAL_RADIUS, rs = Math.max(sigma, 0.5) / 255 * BILATERAL_RANGE * strength, n = c.y.length;
    const ay = new Float64Array(n), acb = new Float64Array(n), acr = new Float64Array(n), wy = new Float64Array(n);
    let wc = 0;
    for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
            const space = Math.exp(-(dx * dx + dy * dy) / (2 * BILATERAL_SPACE ** 2));
            for (let y = 0; y < c.h; y++) {
                const sy = clampIndex(y + dy, c.h);
                for (let x = 0; x < c.w; x++) {
                    const i = y * c.w + x, j = sy * c.w + clampIndex(x + dx, c.w), diff = c.y[j] - c.y[i];
                    const wgt = space * Math.exp(-(diff * diff) / (2 * rs * rs));
                    ay[i] += wgt * c.y[j];
                    wy[i] += wgt;
                    acb[i] += space * c.cb[j];
                    acr[i] += space * c.cr[j];
                }
            }
            wc += space;
        }
    const a = Math.min(1, strength), out = { ...c, y: new Float64Array(n), cb: new Float64Array(n), cr: new Float64Array(n) };
    for (let i = 0; i < n; i++) {
        out.y[i] = ay[i] / wy[i];
        out.cb[i] = c.cb[i] + a * (acb[i] / wc - c.cb[i]);
        out.cr[i] = c.cr[i] + a * (acr[i] / wc - c.cr[i]);
    }
    return out;
}
function nlmYcc(c, sigma, strength) {
    const s = Math.max(sigma, 0.5) / 255, h = NLM_H * s * strength, twoVar = 2 * s * s, n = c.y.length;
    const ay = new Float64Array(n), acb = new Float64Array(n), acr = new Float64Array(n), total = new Float64Array(n);
    const diff2 = new Float64Array(n), source = new Int32Array(n);
    for (let dy = -NLM_SEARCH; dy <= NLM_SEARCH; dy++)
        for (let dx = -NLM_SEARCH; dx <= NLM_SEARCH; dx++) {
            for (let y = 0; y < c.h; y++) {
                const sy = clampIndex(y + dy, c.h);
                for (let x = 0; x < c.w; x++) {
                    const i = y * c.w + x, j = sy * c.w + clampIndex(x + dx, c.w), d = c.y[i] - c.y[j];
                    diff2[i] = d * d;
                    source[i] = j;
                }
            }
            const dist = boxMean(plane(c.w, c.h, diff2), NLM_PATCH).data;
            for (let i = 0; i < n; i++) {
                const wgt = Math.exp(-Math.max(dist[i] - twoVar, 0) / (h * h)), j = source[i];
                ay[i] += wgt * c.y[j];
                acb[i] += wgt * c.cb[j];
                acr[i] += wgt * c.cr[j];
                total[i] += wgt;
            }
        }
    const out = { ...c, y: new Float64Array(n), cb: new Float64Array(n), cr: new Float64Array(n) };
    for (let i = 0; i < n; i++) {
        out.y[i] = ay[i] / total[i];
        out.cb[i] = acb[i] / total[i];
        out.cr[i] = acr[i] / total[i];
    }
    return out;
}
export function denoise(img, sigma, { method = "auto", strength = 1 } = {}) {
    if (!(Number.isFinite(strength) && strength >= 0 && strength <= 2))
        throw new RangeError("strength must be 0..2");
    const chosen = method === "auto" ? choose(sigma) : method;
    if (!METHODS.includes(chosen))
        throw new RangeError(`method must be auto or one of ${METHODS.join(", ")}`);
    const c = toYcc(img);
    if (chosen === "none" || strength === 0)
        return { image: fromYcc(c), method: "none" };
    const fn = chosen === "guided" ? guidedYcc : chosen === "bilateral" ? bilateralYcc : nlmYcc;
    return { image: fromYcc(fn(c, sigma, strength)), method: chosen };
}
// Steps 3-4 and the one-tap pipeline --------------------------------------------------------
export const HALO_MARGIN = 0.02, AXIS_TOLERANCE = 22.5;
export const STEPS = ["white_balance", "exposure", "denoise", "deblur", "sharpen", "colour"];
export const MODES = {
    natural: { denoise: 1.0, sharpen: 0.6, exposure_target: 0.18, exposure_weight: 0.5, wb_weight: 0.7, saturation: 1.0 },
    portrait: { denoise: 1.2, sharpen: 0.4, exposure_target: 0.2, exposure_weight: 0.5, wb_weight: 0.7, saturation: 0.95 },
    low_light: { denoise: 1.3, sharpen: 0.3, exposure_target: 0.18, exposure_weight: 0.9, wb_weight: 0.8, saturation: 1.0 },
    backlit: { denoise: 1.0, sharpen: 0.5, exposure_target: 0.22, exposure_weight: 0.8, wb_weight: 0.6, saturation: 1.0 },
    vivid: { denoise: 0.9, sharpen: 0.8, exposure_target: 0.18, exposure_weight: 0.5, wb_weight: 0.7, saturation: 1.15 },
};
export function unsharp(img, sigma, amount, direction = null) {
    if (!(Number.isFinite(amount) && amount >= 0 && amount <= 3))
        throw new RangeError("amount must be 0..3");
    const c = toYcc(img), k = gaussianKernel(Math.min(Math.max(sigma, 0.6), 4)), y = plane(c.w, c.h, c.y);
    let soft;
    if (direction !== null && Math.abs(direction) <= AXIS_TOLERANCE)
        soft = convolve(y, k, 1);
    else if (direction !== null && Math.abs(Math.abs(direction) - 90) <= AXIS_TOLERANCE)
        soft = convolve(y, k, 0);
    else
        soft = convolve(convolve(y, k, 0), k, 1);
    const out = new Float64Array(c.y.length);
    for (let yy = 0; yy < c.h; yy++)
        for (let x = 0; x < c.w; x++) {
            const i = yy * c.w + x;
            let lo = Infinity, hi = -Infinity;
            for (let dy = -1; dy <= 1; dy++)
                for (let dx = -1; dx <= 1; dx++) {
                    const v = c.y[clampIndex(yy + dy, c.h) * c.w + clampIndex(x + dx, c.w)];
                    if (v < lo)
                        lo = v;
                    if (v > hi)
                        hi = v;
                }
            const boosted = c.y[i] + amount * (c.y[i] - soft.data[i]);
            out[i] = Math.min(hi + HALO_MARGIN, Math.max(lo - HALO_MARGIN, boosted));
        }
    return fromYcc({ ...c, y: out });
}
export function tone(img, a, o) {
    const lin = decode(img), n = img.width * img.height;
    const weights = o.faceMask === undefined ? undefined : faceWeights(o.faceMask, img.width, img.height);
    let gains = [1, 1, 1];
    if (o.whiteBalance !== false) {
        const raw = a.grey_gains.map((g) => Math.min(2, Math.max(0.5, g)));
        const norm = 0.2126 * raw[0] + 0.7152 * raw[1] + 0.0722 * raw[2];
        gains = raw.map((g) => 1 + o.wbWeight * (g / norm - 1));
    }
    for (let i = 0; i < n; i++)
        for (let c = 0; c < 3; c++)
            lin.data[i * 3 + c] *= gains[c];
    if (o.exposure !== false) {
        const mean = meteredLuminance(lin, weights);
        const gain = Math.min(MAX_EXPOSURE_GAIN, Math.max(0.25, o.exposureTarget / Math.max(mean, 1e-6))), k = 1 + o.exposureWeight * (gain - 1);
        for (let i = 0; i < lin.data.length; i++)
            lin.data[i] *= k;
    }
    const sat = o.saturation ?? 1;
    if (sat !== 1) {
        for (let i = 0; i < n; i++) {
            const l = 0.2126 * lin.data[i * 3] + 0.7152 * lin.data[i * 3 + 1] + 0.0722 * lin.data[i * 3 + 2];
            for (let c = 0; c < 3; c++)
                lin.data[i * 3 + c] = l + sat * (lin.data[i * 3 + c] - l);
        }
    }
    for (let i = 0; i < lin.data.length; i++)
        lin.data[i] = Math.min(1, Math.max(0, lin.data[i]));
    return guardOutput(img, encode(lin), weights).image;
}
export const classifyPhoto = (image, analysis = analyse(image)) => classifyFromAnalysis(image, analysis);
export function enhance(img, mode = "natural", { strength = 1, steps = {}, method = "auto", faceMask } = {}) {
    if (!(mode in MODES))
        throw new RangeError(`mode must be one of ${Object.keys(MODES).join(", ")}`);
    const before = analyse(img), condition = classifyPhoto(img, before);
    const weights = faceMask === undefined ? undefined : faceWeights(faceMask, img.width, img.height);
    const plan = planRescue(condition, mode, strength, steps);
    if (!["auto", "none", "guided", "bilateral", "nlm"].includes(method))
        throw new RangeError("unknown denoise method");
    const p = MODES[plan.effective_mode] ?? MODES.natural;
    let image = { width: img.width, height: img.height, channels: 3, data: new Uint8Array(img.width * img.height * 3) };
    for (let i = 0; i < img.width * img.height; i++)
        for (let c = 0; c < 3; c++)
            image.data[i * 3 + c] = img.data[i * img.channels + c];
    const log = { mode, strength, condition: condition.primary,
        effective_mode: plan.effective_mode, exposure_applied: false, tone_applied: false, normal_preserved: condition.primary === "normal" };
    if (plan.denoise) {
        const d = denoise(image, before.noise_sigma, { method, strength: p.denoise * strength });
        image = d.image;
        log.denoise = d.method;
    }
    if (plan.deblur) {
        image = unsharp(image, before.blur_sigma, 1.2 * strength, before.blur_type === "motion" ? before.motion_degrees : null);
        log.deblur = `unsharp (${before.blur_type})`;
    }
    if (plan.exposure) {
        const result = boundedExposure(image, p.exposure_target, p.exposure_weight * strength, weights);
        image = result.image;
        Object.assign(log, { exposure_applied: true, tone_applied: true,
            exposure_gain: Math.round(result.applied_gain * 1e8) / 1e8, highlight_pixels_protected: result.rolled_off_pixels });
    }
    if (plan.fade) {
        image = restoreFadedContrast(image, strength);
        Object.assign(log, { fade_contrast: true, tone_applied: true });
    }
    const safe = guardOutput(img, image, weights);
    log.output_mix = Math.round(safe.applied_mix * 1e8) / 1e8;
    image = safe.image;
    if (safe.face_tone)
        Object.assign(log, { face_metering: "supplied_face_mask", skin_lstar_max_rise: safe.face_tone.max_rise });
    if (img.channels === 4) {
        const rgba = byteImage(img.width, img.height, 4);
        for (let i = 0; i < img.width * img.height; i++) {
            for (let c = 0; c < 3; c++)
                rgba.data[i * 4 + c] = image.data[i * 3 + c];
            rgba.data[i * 4 + 3] = img.data[i * 4 + 3];
        }
        image = rgba;
    }
    log.unchanged = image.data.every((value, index) => value === img.data[index]);
    return { image, before, after: analyse(image), steps: log, label: LABEL, condition,
        safety: { ...safetyReport(safe), plan } };
}
// Synthetic ground truth and Q11 ------------------------------------------------------------
export const Q11 = {
    M1: { noise_sigma: 15, sigma_drop: 0.3, psnr_gain: 2 },
    M4: { noise_sigma: 20, sigma_drop: 0.4, psnr_gain: 3 },
    M2: { motion_length: 7, psnr_gain: 1.5 },
};
export function scene(width = 192, height = 160) {
    const out = byteImage(width, height, 3), s = Math.min(width, height);
    const disc = (px, py, cx, cy, r) => Math.min(1, Math.max(0, r + 0.5 - Math.hypot(px - cx, py - cy)));
    const paint = (v, m, col) => { for (let c = 0; c < 3; c++)
        v[c] = v[c] * (1 - m) + col[c] * m; };
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
            const px = x + 0.5, py = y + 0.5;
            const v = [70 + 60 * py / height, 90 + 40 * px / width, 120 + 30 * (px + py) / (width + height)];
            paint(v, disc(px, py, 0.27 * width, 0.35 * height, 0.18 * s), [205, 150, 110]);
            const ring = Math.min(1, Math.max(0, disc(px, py, 0.7 * width, 0.4 * height, 0.2 * s) - disc(px, py, 0.7 * width, 0.4 * height, 0.12 * s)));
            paint(v, ring, [45, 60, 95]);
            paint(v, disc(px, py, 0.7 * width, 0.4 * height, 0.06 * s), [210, 200, 70]);
            paint(v, Math.min(1, Math.max(0, 0.11 * s + 0.5 - (Math.abs(px - 0.45 * width) + Math.abs(py - 0.75 * height)))), [60, 160, 90]);
            paint(v, disc(px, py, 0.85 * width, 0.8 * height, 0.08 * s), [190, 70, 80]);
            for (let c = 0; c < 3; c++)
                out.data[(y * width + x) * 3 + c] = Math.min(255, Math.max(0, roundHalfEven(v[c])));
        }
    return out;
}
const toBytes = (w, h, values) => {
    const out = byteImage(w, h, 3);
    for (let i = 0; i < w * h; i++)
        for (let c = 0; c < 3; c++)
            out.data[i * 3 + c] = Math.min(255, Math.max(0, roundHalfEven(values(i, c))));
    return out;
};
export function addNoise(img, sigma, seed = 1) {
    const w = img.width, h = img.height, fields = [0, 1, 2].map((c) => {
        const sum = new Float64Array(w * h);
        for (let k = 0; k < 4; k++) {
            const f = hashNoise(seed * 16 + c * 4 + k, w, h);
            for (let i = 0; i < sum.length; i++)
                sum[i] += f[i];
        }
        return sum;
    });
    return toBytes(w, h, (i, c) => img.data[i * img.channels + c] + Math.sqrt(3) * sigma * fields[c][i]);
}
function channelPlanes(img) {
    return [0, 1, 2].map((c) => plane(img.width, img.height, Float64Array.from({ length: img.width * img.height }, (_, i) => img.data[i * img.channels + c])));
}
export function blur(img, sigma) {
    const k = gaussianKernel(sigma), planes = channelPlanes(img).map((p) => convolve(convolve(p, k, 0), k, 1));
    return toBytes(img.width, img.height, (i, c) => planes[c].data[i]);
}
export function motionBlur(img, length, axis = 1) {
    if (!(Number.isInteger(length) && length >= 3 && length % 2 === 1) || (axis !== 0 && axis !== 1))
        throw new RangeError("motion length must be odd and >= 3; axis 0 or 1");
    const k = new Float64Array(length).fill(1 / length), planes = channelPlanes(img).map((p) => convolve(p, k, axis));
    return toBytes(img.width, img.height, (i, c) => planes[c].data[i]);
}
function linearScale(img, gains) {
    const lin = decode(img);
    for (let i = 0; i < lin.data.length; i++)
        lin.data[i] = Math.min(1, Math.max(0, lin.data[i] * gains[i % 3]));
    return encode(lin);
}
export const lowLight = (img, factor) => linearScale(img, [factor, factor, factor]);
export const cast = (img, gains) => linearScale(img, gains);
export function blocking(img, amplitude, seed = 5, block = 8) {
    const w = img.width, h = img.height, tw = Math.ceil(w / block), th = Math.ceil(h / block), tiles = hashNoise(seed, tw, th);
    return toBytes(w, h, (i, c) => {
        const x = i % w, y = Math.floor(i / w);
        return img.data[i * img.channels + c] + tiles[Math.floor(y / block) * tw + Math.floor(x / block)] * 2 * amplitude;
    });
}
export function psnr(reference, image) {
    let sum = 0;
    const n = reference.width * reference.height;
    for (let i = 0; i < n; i++)
        for (let c = 0; c < 3; c++) {
            const d = reference.data[i * reference.channels + c] - image.data[i * image.channels + c];
            sum += d * d;
        }
    const mse = sum / (n * 3);
    return mse === 0 ? Infinity : 10 * Math.log10(255 * 255 / mse);
}
export function q11(row, m) {
    const spec = Q11[row], gain = m.psnrAfter - m.psnrBefore, parts = { psnr_gain: gain >= spec.psnr_gain };
    const measured = { psnr_before: m.psnrBefore, psnr_after: m.psnrAfter, psnr_gain: gain };
    if ("sigma_drop" in spec && m.sigmaBefore !== undefined && m.sigmaAfter !== undefined) {
        const drop = m.sigmaBefore > 0 ? 1 - m.sigmaAfter / m.sigmaBefore : 0;
        parts.sigma_drop = drop >= spec.sigma_drop;
        Object.assign(measured, { sigma_before: m.sigmaBefore, sigma_after: m.sigmaAfter, sigma_drop: drop });
    }
    if (m.lapBefore !== undefined && m.lapAfter !== undefined) {
        parts.laplacian_up = m.lapAfter > m.lapBefore;
        Object.assign(measured, { laplacian_before: m.lapBefore, laplacian_after: m.lapAfter });
    }
    const rule = `${row}: PSNR +${spec.psnr_gain} dB` + ("sigma_drop" in spec ? `, noise sigma -${spec.sigma_drop * 100}%` : "");
    return { check: "Q11", row, passed: Object.values(parts).every(Boolean), parts, measured, rule };
}
//# sourceMappingURL=enhance.js.map