import { boxPlane, clamp01, fieldHash, lumaAt, renderClock, seeded, smooth01 } from "../skin/texture-law.js";
/** Flow-following hand-painted ribbons. Hair direction comes ONLY from the source image. */
export function flowRibbons(image, mask, paint, frame, seed = 173) {
    const start = renderClock(), { width: w, height: h } = image, n = w * h;
    if (mask.length !== n || paint.length !== n || (frame && frame.length !== n))
        throw new RangeError("ribbon dimensions mismatch");
    let x0 = w, y0 = h, x1 = -1, y1 = -1, count = 0;
    const colTop = new Int32Array(w).fill(h), colBottom = new Int32Array(w).fill(-1);
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            const i = y * w + x;
            if (mask[i] >= 0.55) {
                x0 = Math.min(x0, x);
                x1 = Math.max(x1, x);
                y0 = Math.min(y0, y);
                y1 = Math.max(y1, y);
                colTop[x] = Math.min(colTop[x], y);
                colBottom[x] = Math.max(colBottom[x], y);
                count++;
            }
        }
    const lift = new Float64Array(n);
    if (count < 24)
        return { lift, metrics: { renderMs: renderClock() - start, ribbonCount: 0, meanLift: 0,
                paintedShare: 0, rootMax: 0, flowCoherence: 0, sourceTexture: "own_photo" } };
    const W = x1 - x0 + 1, H = y1 - y0 + 1, sw = Math.min(w, W + 4), sh = Math.min(h, H + 4);
    const bx = Math.max(0, x0 - 2), by = Math.max(0, y0 - 2);
    const gradients = new Float64Array(sw * sh), cross = new Float64Array(sw * sh), vertical = new Float64Array(sw * sh);
    for (let y = 1; y < sh - 1; y++)
        for (let x = 1; x < sw - 1; x++) {
            const ax = bx + x, ay = by + y, i = y * sw + x;
            if (ax <= 0 || ay <= 0 || ax >= w - 1 || ay >= h - 1)
                continue;
            const gx = (lumaAt(image, ay * w + ax + 1) - lumaAt(image, ay * w + ax - 1)) * 0.5;
            const gy = (lumaAt(image, (ay + 1) * w + ax) - lumaAt(image, (ay - 1) * w + ax)) * 0.5;
            gradients[i] = gx * gx;
            cross[i] = gx * gy;
            vertical[i] = gy * gy;
        }
    const xx = boxPlane(gradients, sw, sh, 3), xy = boxPlane(cross, sw, sh, 3), yy = boxPlane(vertical, sw, sh, 3);
    const orientation = (x, y) => {
        const k = Math.max(0, Math.min(sh - 1, Math.round(y) - by)) * sw + Math.max(0, Math.min(sw - 1, Math.round(x) - bx));
        const trace = xx[k] + yy[k], coherence = Math.hypot(xx[k] - yy[k], 2 * xy[k]) / Math.max(1e-3, trace);
        const theta = 0.5 * Math.atan2(2 * xy[k], xx[k] - yy[k]) + Math.PI / 2;
        const vx = Math.cos(theta), vy = Math.sin(theta), sign = vy < 0 ? -1 : 1;
        return [vx * sign, vy * sign, coherence];
    };
    const random = seeded(seed), workstreams = Math.min(14, Math.max(6, Math.round(W / 29))), radius = Math.max(1.8, Math.min(6.3, W / 76));
    let ribbonCount = 0, coherenceSum = 0;
    const paintRow = (x, y, strength, rad) => {
        const a = Math.max(0, Math.floor(x - rad - 1)), b = Math.min(w - 1, Math.ceil(x + rad + 1));
        const c = Math.max(0, Math.floor(y - rad - 1)), d = Math.min(h - 1, Math.ceil(y + rad + 1));
        for (let py = c; py <= d; py++)
            for (let px = a; px <= b; px++) {
                const i = py * w + px;
                if (mask[i] < 0.5)
                    continue;
                const hairLength = Math.max(1, colBottom[px] - colTop[px]);
                const longitudinal = (py - colTop[px]) / hairLength;
                const rootMelt = smooth01((longitudinal - 0.22) / 0.44);
                if (rootMelt <= 0.003)
                    continue;
                const d2 = ((px - x) / rad) ** 2 + ((py - y) / rad) ** 2;
                const edge = Math.exp(-2.2 * d2);
                const sourceSupport = clamp01(paint[i] * 1.5);
                const frameBoost = frame ? 1 + 0.20 * clamp01(frame[i]) : 1;
                const cell = edge * rootMelt * strength * sourceSupport * frameBoost;
                lift[i] = Math.min(0.86, 1 - (1 - lift[i]) * (1 - clamp01(cell)));
            }
    };
    for (let workstream = 0; workstream < workstreams; workstream++) {
        let x = x0 + (workstream + 0.2 + 0.65 * random()) / workstreams * W;
        const column = Math.max(0, Math.min(w - 1, Math.round(x)));
        let y = colTop[column] + (0.16 + 0.16 * random()) * Math.max(1, colBottom[column] - colTop[column]);
        if (colBottom[column] < colTop[column] || y >= h || mask[Math.floor(y) * w + column] < 0.25)
            continue;
        const strength = 0.42 + 0.29 * random(), width = radius * (0.55 + 0.60 * random());
        let steps = 0, coherences = 0;
        for (; steps < Math.min(h, 1200) && y <= y1; steps++) {
            const ix = Math.round(x), iy = Math.round(y);
            if (ix < 0 || ix >= w || iy < 0 || iy >= h || mask[iy * w + ix] < 0.18)
                break;
            const [vx, vy, coherence] = orientation(x, y);
            coherences += coherence;
            paintRow(x, y, strength, width);
            const drift = 0.15 * Math.sin(steps * 0.09 + workstream * 2.2) + 0.05 * (fieldHash(workstream, steps >> 3, seed) - 0.5);
            x += Math.max(-1.8, Math.min(1.8, vx / Math.max(0.32, vy))) + drift;
            y += 1;
        }
        if (steps > Math.min(12, H * 0.07)) {
            ribbonCount++;
            coherenceSum += coherences / steps;
        }
    }
    let changed = 0, total = 0, rootMax = 0, sum = 0;
    for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
            const i = y * w + x;
            if (mask[i] < 0.5)
                continue;
            const rootShare = (y - colTop[x]) / Math.max(1, colBottom[x] - colTop[x]);
            if (rootShare < 0.17)
                rootMax = Math.max(rootMax, lift[i]);
            if (lift[i] > 0.08)
                changed++;
            sum += lift[i];
            total++;
        }
    return { lift, metrics: { renderMs: renderClock() - start, ribbonCount, meanLift: sum / Math.max(1, total),
            paintedShare: changed / Math.max(1, total), rootMax, flowCoherence: coherenceSum / Math.max(1, ribbonCount),
            sourceTexture: "own_photo" } };
}
