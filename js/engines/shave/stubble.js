/**
 * Stubble from the person's own beard: blue-noise follicles (no grid, no clumps), short hairs grown
 * along a jaw-following direction field, each hair coloured from the ORIGINAL beard at that spot
 * (so a grey chin stays grey, a dark moustache zone stays dark), plus the sub-skin blue-grey
 * shadow of cut hair at the 5 o'clock setting. Hair is a new structure lying on the skin; the skin
 * between hairs keeps its quilted own-skin texture (Texture Law).
 */
import { clamp, gaussian, hash01, maskedGaussian, poissonDisk, rng, smoothstep } from "../core/bands.js";
export function renderStubble(s) {
    const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
    const { w, h, iod, L, a, b } = s, n = w * h;
    const vis = Float64Array.from(s.visibility, (v) => clamp(v));
    // Hair length (visible part) and how much of each hair shows above the skin.
    const lenIod = 0.003 + 0.016 * (1 - smoothstep(0.28, 0.55, s.finish));
    const showHair = 1 - smoothstep(0.45, 0.7, s.finish);
    const shadow = (s.shadow ?? true ? 1 : 0) * smoothstep(0.25, 0.5, s.finish) * (1 - smoothstep(0.55, 0.75, s.finish));
    // Sub-skin shadow of cut hair: low band, blue-grey (Lab b down, L down), never a texture.
    if (shadow > 0) {
        const S = gaussian(vis, w, h, Math.max(1, 0.012 * iod));
        for (let i = 0; i < n; i++)
            if (S[i] > 0.01) {
                const k = S[i] * shadow;
                L[i] -= 2.6 * k;
                a[i] -= 0.7 * k;
                b[i] -= 3.2 * k;
            }
    }
    let x0 = w, y0 = h, x1 = 0, y1 = 0;
    for (let i = 0; i < n; i++)
        if (vis[i] > 0.02) {
            const x = i % w, y = (i - x) / w;
            x0 = Math.min(x0, x);
            y0 = Math.min(y0, y);
            x1 = Math.max(x1, x);
            y1 = Math.max(y1, y);
        }
    if (x1 <= x0 || showHair <= 0.01)
        return { follicles: 0, meanNN: 0, nnCV: 0, greyShare: 0, ms: 0 };
    // Local hair colour from the original beard (masked mean over hair pixels only).
    const sig = Math.max(1.5, 0.04 * iod);
    const hc = s.original.map((p) => maskedGaussian(p, s.hairMask, w, h, sig));
    const spacing = Math.max(1.4, 0.019 * iod), r = rng(s.seed ?? 911);
    const pts = poissonDisk(w, h, () => spacing, (x, y) => { const i = Math.floor(y) * w + Math.floor(x); return vis[i] > 0.02 && hash01(Math.floor(x * 4), Math.floor(y * 4), 77) < vis[i]; }, s.seed ?? 911, 60000, 20, { x0, y0, x1: x1 + 1, y1: y1 + 1 });
    let grey = 0;
    const len = lenIod * iod, sw = 0.42;
    for (const [px, py] of pts) {
        const i = Math.floor(py) * w + Math.floor(px);
        // growth direction: down, splaying outward from the chin midline; jitter +/- 20 degrees
        const u = (px - s.chin[0]) * s.across[0] + (py - s.chin[1]) * s.across[1];
        let dx = s.down[0] + 0.45 * Math.sign(u) * s.across[0] * smoothstep(0, 0.6 * iod, Math.abs(u));
        let dy = s.down[1] + 0.45 * Math.sign(u) * s.across[1] * smoothstep(0, 0.6 * iod, Math.abs(u));
        const jit = (r() - 0.5) * 0.7, c = Math.cos(jit), sn = Math.sin(jit);
        [dx, dy] = [dx * c - dy * sn, dx * sn + dy * c];
        const m = Math.hypot(dx, dy) || 1;
        dx /= m;
        dy /= m;
        const hL = hc[0][i], hA = hc[1][i], hB = hc[2][i];
        if (Math.hypot(hA, hB) < 6 && hL > 45)
            grey++;
        const op = vis[i] * showHair * (0.55 + 0.35 * r());
        const l = Math.max(0.6, len * (0.6 + 0.6 * r()));
        const steps = Math.max(2, Math.ceil(l / 0.35));
        for (let k = 0; k <= steps; k++) {
            const t = k / steps, cx = px + dx * l * t, cy = py + dy * l * t, taper = 1 - 0.45 * t;
            for (let yy = Math.floor(cy - 1); yy <= Math.ceil(cy + 1); yy++)
                for (let xx = Math.floor(cx - 1); xx <= Math.ceil(cx + 1); xx++) {
                    if (xx < 0 || yy < 0 || xx >= w || yy >= h)
                        continue;
                    const q = yy * w + xx, d2 = (xx + 0.5 - cx) ** 2 + (yy + 0.5 - cy) ** 2;
                    const al = clamp(op * taper * Math.exp(-d2 / (2 * sw * sw)) / (1 + 0.6 * steps / Math.max(1, l)));
                    if (al < 0.003)
                        continue;
                    L[q] += al * (hL - L[q]);
                    a[q] += al * (hA - a[q]);
                    b[q] += al * (hB - b[q]);
                }
        }
    }
    // blue-noise quality: coefficient of variation of nearest-neighbour distances (grid ~0, clumps > 0.5)
    let sum = 0, sum2 = 0;
    const cellSize = spacing * 2, gw = Math.ceil(w / cellSize) + 1, grid = new Map();
    pts.forEach(([x, y], k) => { const key = Math.floor(y / cellSize) * gw + Math.floor(x / cellSize); (grid.get(key) ?? grid.set(key, []).get(key)).push(k); });
    const sample = pts.length > 3000 ? 3000 : pts.length;
    for (let k = 0; k < sample; k++) {
        const [x, y] = pts[Math.floor(k * pts.length / sample)];
        let best = Infinity;
        const gx = Math.floor(x / cellSize), gy = Math.floor(y / cellSize);
        for (let yy = gy - 1; yy <= gy + 1; yy++)
            for (let xx = gx - 1; xx <= gx + 1; xx++)
                for (const j of grid.get(yy * gw + xx) ?? []) {
                    const d = Math.hypot(pts[j][0] - x, pts[j][1] - y);
                    if (d > 0 && d < best)
                        best = d;
                }
        if (Number.isFinite(best)) {
            sum += best;
            sum2 += best * best;
        }
    }
    const mean = sum / Math.max(1, sample), sd = Math.sqrt(Math.max(0, sum2 / Math.max(1, sample) - mean * mean));
    return { follicles: pts.length, meanNN: mean, nnCV: mean > 0 ? sd / mean : 0, greyShare: pts.length ? grey / pts.length : 0,
        ms: (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0 };
}
