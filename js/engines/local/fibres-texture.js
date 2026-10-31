import { boxPlane, byte, clamp01, fieldHash, lumaAt, renderClock, seeded } from "../skin/texture-law.js";
const LABEL = "Hair-fibre simulation using sampled strands from this photo. Not a physical product prediction.";
/** Scalp gaps are a candidate, not proof of baldness; coherent grey-root strands are protected. */
export function renderFibresTexture(img, zone, scalp, _shade, options = {}) {
    const start = renderClock(), { width: w, height: h, channels: ch } = img, n = w * h;
    if ((ch !== 3 && ch !== 4) || img.data.length !== n * ch || zone.data.length !== n || scalp.length !== n
        || (options.hair && options.hair.length !== n))
        throw new RangeError("fibre image/mask dimensions mismatch");
    const emptyMetrics = (code) => ({ fibres: 0, strands_drawn: 0, covered_scalp: 0, scalp_pixels: 0,
        refused_grey_root_px: 0, render_ms: renderClock() - start, status: "refused",
        reason_code: code, texture_source: "own_photo" });
    const amount = clamp01((options.amount ?? 50) / 100), seed = options.seed ?? 17;
    if (!Number.isFinite(options.amount ?? 50) || amount === 0)
        return { image: { ...img, data: Uint8Array.from(img.data) },
            label: LABEL, metrics: emptyMetrics("zero_strength") };
    let x0 = w, x1 = 0, y0 = h, y1 = 0;
    for (let i = 0; i < n; i++)
        if (zone.data[i] > 0.2) {
            const x = i % w, y = (i - x) / w;
            x0 = Math.min(x0, x);
            x1 = Math.max(x1, x);
            y0 = Math.min(y0, y);
            y1 = Math.max(y1, y);
        }
    if (x0 >= x1 || y0 >= y1)
        return { image: { ...img, data: Uint8Array.from(img.data) },
            label: "No crown region is visible.", metrics: emptyMetrics("empty_crown") };
    const pad = 4, bx0 = Math.max(1, x0 - pad), bx1 = Math.min(w - 2, x1 + pad);
    const by0 = Math.max(1, y0 - pad), by1 = Math.min(h - 2, y1 + pad), sw = bx1 - bx0 + 1, sh = by1 - by0 + 1;
    const yn = sw * sh, lum = new Float64Array(yn);
    for (let y = 0; y < sh; y++)
        for (let x = 0; x < sw; x++)
            lum[y * sw + x] = lumaAt(img, (y + by0) * w + x + bx0);
    const jxx = new Float64Array(yn), jyy = new Float64Array(yn), jxy = new Float64Array(yn);
    for (let y = 1; y < sh - 1; y++)
        for (let x = 1; x < sw - 1; x++) {
            const i = y * sw + x, gx = 0.5 * (lum[i + 1] - lum[i - 1]), gy = 0.5 * (lum[i + sw] - lum[i - sw]);
            jxx[i] = gx * gx;
            jyy[i] = gy * gy;
            jxy[i] = gx * gy;
        }
    const Jxx = boxPlane(jxx, sw, sh, 2), Jyy = boxPlane(jyy, sw, sh, 2), Jxy = boxPlane(jxy, sw, sh, 2);
    const ux = new Float64Array(yn), uy = new Float64Array(yn), confidence = new Float64Array(yn);
    for (let i = 0; i < yn; i++) {
        const trace = Jxx[i] + Jyy[i], coherence = Math.hypot(Jxx[i] - Jyy[i], 2 * Jxy[i]) / Math.max(0.001, trace);
        const theta = 0.5 * Math.atan2(2 * Jxy[i], Jxx[i] - Jyy[i]) + Math.PI / 2;
        ux[i] = Math.cos(theta);
        uy[i] = Math.sin(theta);
        confidence[i] = coherence * clamp01(trace / 27);
    }
    const candidate = [], donor = [];
    let greyProtected = 0;
    for (let y = by0; y <= by1; y++)
        for (let x = bx0; x <= bx1; x++) {
            const i = y * w + x, k = (y - by0) * sw + x - bx0;
            if (zone.data[i] <= 0.35)
                continue;
            if ((options.hair?.[i] ?? 0) > 0.75 && confidence[k] > 0.30)
                donor.push(i);
            if (scalp[i] <= 0.45)
                continue;
            // High directional coherence is evidence of grey/white strands, not exposed scalp.
            if (confidence[k] >= 0.49) {
                greyProtected++;
                continue;
            }
            if (zone.data[i] >= 0.8)
                candidate.push(i);
        }
    if (donor.length < 24 || candidate.length < 16)
        return { image: { ...img, data: Uint8Array.from(img.data) },
            label: "No reliable bare scalp and matching donor strands; grey roots are not filled as bald patches.",
            metrics: { ...emptyMetrics("no_reliable_scalp_or_hair"), scalp_pixels: candidate.length, refused_grey_root_px: greyProtected } };
    const out = new Uint8Array(img.data), covered = new Float64Array(yn), random = seeded(seed);
    let count = 0, coverage = 0;
    const desired = Math.min(0.30, 0.09 + 0.33 * amount) * candidate.length;
    const maximum = Math.min(1400, Math.max(80, Math.ceil(candidate.length * 0.22)));
    for (let k = 0; k < maximum && coverage < desired; k++) {
        const pos = candidate[Math.floor(random() * candidate.length)], x = pos % w, y = (pos - x) / w;
        const local = (y - by0) * sw + x - bx0;
        if (covered[local] > 0.18 || confidence[local] > 0.38)
            continue;
        const directionX = ux[local], directionY = uy[local];
        // Choose an actual photographed strand close to the insertion site whenever possible.
        let source = -1, bestScore = Infinity;
        for (let j = 0; j < 24; j++) {
            const d = donor[Math.floor(fieldHash(x + k * 7, y + j * 11, seed + j) * donor.length)];
            const dx = (d % w) - x, dy = Math.floor(d / w) - y;
            const score = Math.hypot(dx, dy) + 20 * random();
            if (score < bestScore) {
                bestScore = score;
                source = d;
            }
        }
        if (source < 0)
            continue;
        const sx = source % w, sy = Math.floor(source / w), length = 5 + Math.floor(10 * random());
        const thickness = 0.62 + 0.25 * random(), sign = random() < 0.5 ? -1 : 1;
        let fibreTouched = 0;
        for (let t = 0; t < length; t++) {
            const f = t - length * 0.5, bend = Math.sin(Math.PI * t / length) * (random() - 0.5) * 0.35;
            const px = x + sign * directionX * f - directionY * bend;
            const py = y + sign * directionY * f + directionX * bend;
            const ox = Math.floor(px), oy = Math.floor(py);
            const donorX = Math.max(bx0, Math.min(bx1, Math.round(sx + directionX * f)));
            const donorY = Math.max(by0, Math.min(by1, Math.round(sy + directionY * f)));
            const dj = (donorY * w + donorX) * ch;
            for (let yy = oy - 1; yy <= oy + 1; yy++)
                for (let xx = ox - 1; xx <= ox + 1; xx++) {
                    if (xx < bx0 || xx > bx1 || yy < by0 || yy > by1)
                        continue;
                    const i = yy * w + xx, a = (yy - by0) * sw + xx - bx0;
                    if (scalp[i] < 0.38 || zone.data[i] < 0.65 || confidence[a] > 0.55)
                        continue;
                    const distance = Math.hypot(xx + 0.5 - px, yy + 0.5 - py);
                    const antiAlias = clamp01(1.22 - distance / thickness), alpha = antiAlias * (0.30 + 0.34 * amount);
                    const allowed = Math.min(alpha, Math.max(0, 0.65 - covered[a]));
                    if (allowed <= 0.002)
                        continue;
                    const j = i * ch;
                    for (let c = 0; c < 3; c++)
                        out[j + c] = byte(out[j + c] * (1 - allowed) + img.data[dj + c] * allowed);
                    covered[a] += allowed;
                    fibreTouched++;
                }
        }
        if (fibreTouched) {
            count++;
            coverage += fibreTouched * 0.16;
        }
    }
    let totalCover = 0;
    for (let i = 0; i < yn; i++)
        totalCover += covered[i];
    const coverageRatio = totalCover / candidate.length;
    return { image: { ...img, data: out }, label: LABEL,
        metrics: { fibres: count, strands_drawn: count, covered_scalp: coverageRatio, scalp_pixels: candidate.length,
            refused_grey_root_px: greyProtected, render_ms: renderClock() - start, status: count ? "applied" : "refused",
            reason_code: count ? "" : "no_verified_strands", texture_source: "own_photo" } };
}
