import { multibandBlend } from "../engines/core/blend.js";
import { dilate, feather } from "../engines/core/mask.js";
export const ALIGN_MAX = 0.035; // fit residual (RMS) as a share of the eye distance; ASSUMED
export const GAIN_RANGE = [0.7, 1.4]; // colour gain limits per channel; ASSUMED
export const BLEND_LEVELS = 4; // pyramid levels for the seam; ASSUMED
const PAD = 1 << (BLEND_LEVELS + 1);
export const TRANSFER_REFUSALS = {
    pose_mismatch: "The two photos do not line up here (different head angle or expression), so nothing was moved.",
    outside_photo: "Part of this area is outside the other photo.",
    empty_region: "There is no area to move.",
};
export class TransferError extends RangeError {
    code;
    constructor(code) {
        super(TRANSFER_REFUSALS[code]);
        this.code = code;
        this.name = "TransferError";
    }
}
export function fitSimilarity(from, to) {
    if (from.length !== to.length || from.length < 2)
        throw new RangeError("similarity needs two or more matching points");
    const n = from.length;
    let fx = 0, fy = 0, gx = 0, gy = 0;
    for (let i = 0; i < n; i++) {
        fx += from[i][0];
        fy += from[i][1];
        gx += to[i][0];
        gy += to[i][1];
    }
    fx /= n;
    fy /= n;
    gx /= n;
    gy /= n;
    let sxx = 0, sab = 0, sba = 0;
    for (let i = 0; i < n; i++) {
        const x = from[i][0] - fx, y = from[i][1] - fy, u = to[i][0] - gx, v = to[i][1] - gy;
        sxx += x * x + y * y;
        sab += x * u + y * v;
        sba += x * v - y * u;
    }
    if (!(sxx > 1e-12))
        throw new RangeError("similarity points must not coincide");
    const a = sab / sxx, b = sba / sxx, tx = gx - a * fx + b * fy, ty = gy - b * fx - a * fy;
    let err = 0;
    for (let i = 0; i < n; i++) {
        const [x, y] = from[i];
        err += (a * x - b * y + tx - to[i][0]) ** 2 + (b * x + a * y + ty - to[i][1]) ** 2;
    }
    return { a, b, tx, ty, rms: Math.sqrt(err / n), scale: Math.hypot(a, b) };
}
export function mapPoint(s, [x, y]) { return [s.a * x - s.b * y + s.tx, s.b * x + s.a * y + s.ty]; }
/** The donor -> target inverse of a similarity. */
export function inverse(s) {
    const d = s.a * s.a + s.b * s.b, a = s.a / d, b = -s.b / d;
    return { a, b, tx: -(a * s.tx - b * s.ty), ty: -(b * s.tx + a * s.ty), rms: s.rms, scale: 1 / s.scale };
}
function sample(img, x, y, c) {
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, w = img.width, ch = img.channels;
    const at = (xx, yy) => img.data[(Math.min(img.height - 1, Math.max(0, yy)) * w + Math.min(w - 1, Math.max(0, xx))) * ch + c];
    return (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy;
}
/** Replace `region` (target-frame mask, 0..1) with the aligned donor. `iod` scales the fit check. */
export function transferRegion(target, targetPoints, donor, donorPoints, region, anchors, iod, featherPx) {
    const { width, height, channels } = target;
    const fit = fitSimilarity(anchors.map((i) => targetPoints[i]), anchors.map((i) => donorPoints[i]));
    if (fit.rms > ALIGN_MAX * iod * fit.scale)
        throw new TransferError("pose_mismatch");
    const weight = feather(region, Math.max(1, Math.round(featherPx)), "inside");
    let x0 = width, y0 = height, x1 = -1, y1 = -1;
    for (let i = 0; i < width * height; i++)
        if (weight.data[i] > 0) {
            const x = i % width, y = (i / width) | 0;
            x0 = Math.min(x0, x);
            x1 = Math.max(x1, x);
            y0 = Math.min(y0, y);
            y1 = Math.max(y1, y);
        }
    if (x1 < 0)
        throw new TransferError("empty_region");
    for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) {
        const [u, v] = mapPoint(fit, [x, y]);
        if (u < 0 || v < 0 || u > donor.width - 1 || v > donor.height - 1)
            throw new TransferError("outside_photo");
    }
    // Crop around the region so the pyramid blend stays local.
    const cx0 = Math.max(0, x0 - PAD), cy0 = Math.max(0, y0 - PAD), cx1 = Math.min(width - 1, x1 + PAD), cy1 = Math.min(height - 1, y1 + PAD);
    const cw = cx1 - cx0 + 1, chh = cy1 - cy0 + 1;
    const base = { width: cw, height: chh, channels: 4, data: new Uint8Array(cw * chh * 4) };
    const over = { width: cw, height: chh, channels: 4, data: new Uint8Array(cw * chh * 4) };
    const ring = dilate(region, Math.max(2, Math.round(featherPx)));
    const stats = [0, 1, 2].map(() => ({ t: 0, tt: 0, d: 0, dd: 0, n: 0 }));
    for (let y = 0; y < chh; y++)
        for (let x = 0; x < cw; x++) {
            const gx = x + cx0, gy = y + cy0, gi = gy * width + gx, ci = y * cw + x, [u, v] = mapPoint(fit, [gx, gy]);
            const inRing = ring.data[gi] > 0.5 && region.data[gi] < 0.5;
            for (let c = 0; c < 3; c++) {
                const t = target.data[gi * channels + c], d = sample(donor, u, v, c);
                base.data[ci * 4 + c] = t;
                over.data[ci * 4 + c] = Math.round(d);
                if (inRing) {
                    const s = stats[c];
                    s.t += t;
                    s.tt += t * t;
                    s.d += d;
                    s.dd += d * d;
                    s.n++;
                }
            }
            base.data[ci * 4 + 3] = 255;
            over.data[ci * 4 + 3] = 255;
        }
    const gains = [], offsets = [];
    for (const s of stats) {
        if (s.n < 8) {
            gains.push(1);
            offsets.push(0);
            continue;
        }
        const tm = s.t / s.n, dm = s.d / s.n, ts = Math.sqrt(Math.max(0, s.tt / s.n - tm * tm)), ds = Math.sqrt(Math.max(0, s.dd / s.n - dm * dm));
        const gain = Math.min(GAIN_RANGE[1], Math.max(GAIN_RANGE[0], ds > 1e-6 ? ts / ds : 1));
        gains.push(gain);
        offsets.push(tm - gain * dm);
    }
    for (let i = 0; i < cw * chh; i++)
        for (let c = 0; c < 3; c++) {
            over.data[i * 4 + c] = Math.min(255, Math.max(0, Math.round(over.data[i * 4 + c] * gains[c] + offsets[c])));
        }
    const cropWeight = { width: cw, height: chh, channels: 1, data: new Float32Array(cw * chh) };
    for (let y = 0; y < chh; y++)
        for (let x = 0; x < cw; x++)
            cropWeight.data[y * cw + x] = weight.data[(y + cy0) * width + x + cx0];
    const blended = multibandBlend(base, over, cropWeight, BLEND_LEVELS);
    const data = Uint8ClampedArray.from(target.data);
    let changed = 0;
    for (let y = 0; y < chh; y++)
        for (let x = 0; x < cw; x++) {
            const ci = y * cw + x;
            if (cropWeight.data[ci] <= 0)
                continue;
            const gi = (y + cy0) * width + x + cx0;
            let differs = false;
            for (let c = 0; c < 3; c++) {
                const value = blended.data[ci * 4 + c];
                if (data[gi * channels + c] !== value)
                    differs = true;
                data[gi * channels + c] = value;
            }
            if (differs)
                changed++;
        }
    return { image: { width, height, channels, data }, changed, fit, gains, offsets, weight };
}
//# sourceMappingURL=region-transfer.js.map