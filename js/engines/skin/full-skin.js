import { boxPlane, clamp01, lumaAt, softMask } from "./texture-law.js";
/** Conservative same-image, connected skin extension. Not a replacement for an actual parsing mask.
 * It will NOT invent coverage across an occluder; callers must gate uncertain neck/ear regions.
 */
export function extendVisibleSkin(image, initial, excluded) {
    const { width: w, height: h, channels: ch } = image, n = w * h;
    if (initial.length !== n || (excluded && excluded.length !== n) || (ch !== 3 && ch !== 4)) {
        throw new RangeError("skin and exclusion masks must match RGB/RGBA image");
    }
    let x0 = w, x1 = 0, y0 = h, y1 = 0, seedCount = 0;
    const samples = [[], [], []];
    for (let y = 0; y < h; y += 2)
        for (let x = 0; x < w; x += 2) {
            const i = y * w + x;
            if (initial[i] <= 0.94 || (excluded && excluded[i] > 0.05))
                continue;
            x0 = Math.min(x0, x);
            x1 = Math.max(x1, x);
            y0 = Math.min(y0, y);
            y1 = Math.max(y1, y);
            seedCount++;
            if (samples[0].length < 3500 || (seedCount % 7 === 0 && samples[0].length < 7000)) {
                const o = i * ch, r = image.data[o], g = image.data[o + 1], b = image.data[o + 2];
                samples[0].push(r - g);
                samples[1].push(b - g);
                samples[2].push(lumaAt(image, i));
            }
        }
    if (seedCount < 24)
        return { alpha: new Float64Array(n), expandedPixels: 0, confidence: 0, coverageComplete: false };
    const median = (a) => { a.sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; };
    const rg = median(samples[0]), bg = median(samples[1]), l = median(samples[2]);
    const bw = Math.max(8, x1 - x0), bh = Math.max(8, y1 - y0);
    const bounds = {
        minX: Math.max(0, Math.floor(x0 - 0.22 * bw)), maxX: Math.min(w - 1, Math.ceil(x1 + 0.22 * bw)),
        minY: Math.max(0, Math.floor(y0 - 0.18 * bh)), maxY: Math.min(h - 1, Math.ceil(y1 + 0.85 * bh)),
    };
    const orig = Float64Array.from(initial, clamp01), expanded = Uint8Array.from(orig, v => v > 0.6 ? 1 : 0);
    const q = new Int32Array(n);
    let head = 0, tail = 0;
    for (let i = 0; i < n; i++)
        if (orig[i] >= 0.95 && !(excluded && excluded[i] > 0))
            q[tail++] = i;
    const photoY = new Float64Array(n);
    for (let i = 0; i < n; i++)
        photoY[i] = lumaAt(image, i);
    const local = boxPlane(photoY, w, h, 2);
    const compatible = (i) => {
        if (excluded && excluded[i] > 0.05)
            return false;
        const o = i * ch, rr = image.data[o], gg = image.data[o + 1], bb = image.data[o + 2];
        const chroma = Math.hypot((rr - gg) - rg, (bb - gg) - bg);
        const lum = photoY[i];
        // The dark-hair/beard and red-lips guards deliberately err on the side of refusing coverage.
        const hairLike = lum < l * 0.47 && Math.abs(lum - local[i]) > 9;
        const lipLike = rr - gg > rg + 16 && bb - gg < bg - 11;
        return chroma < 24 && lum >= l - 53 && lum <= l + 49 && !hairLike && !lipLike;
    };
    while (head < tail) {
        const i = q[head++], x = i % w, y = (i - x) / w;
        if (y < bounds.minY || y > bounds.maxY)
            continue;
        const neighbors = [x > bounds.minX ? i - 1 : -1, x < bounds.maxX ? i + 1 : -1,
            y > bounds.minY ? i - w : -1, y < bounds.maxY ? i + w : -1];
        for (const j of neighbors)
            if (j >= 0 && !expanded[j] && compatible(j)) {
                expanded[j] = 1;
                q[tail++] = j;
            }
    }
    let added = 0, edgeConflict = 0;
    for (let i = 0; i < n; i++) {
        if (expanded[i] && orig[i] < 0.5)
            added++;
        if (orig[i] > 0.8 && !expanded[i])
            edgeConflict++;
    }
    const combined = new Float64Array(n);
    for (let i = 0; i < n; i++)
        combined[i] = Math.max(orig[i], expanded[i]);
    const feathered = softMask(combined, w, h, Math.max(2, Math.min(6, Math.round(bh * 0.012))));
    for (let i = 0; i < n; i++) {
        // Keep evidence-backed skin completely opaque and guard excluded hair/eyes/lips.
        feathered[i] = excluded && excluded[i] > 0 ? 0 : Math.max(orig[i] * (1 - (excluded?.[i] ?? 0)), feathered[i]);
    }
    const confidence = clamp01(1 - edgeConflict / Math.max(1, seedCount * 4));
    // Not asserted complete merely because the flood fill stops: that is unknowable without full parsing.
    return { alpha: feathered, expandedPixels: added, confidence, coverageComplete: false };
}
