export function validateMask(mask, width, height) {
    if (mask.length !== width * height)
        throw new Error("mask length mismatch");
    const out = new Float32Array(mask.length);
    for (let i = 0; i < mask.length; i++) {
        const v = mask[i];
        if (!Number.isFinite(v))
            throw new Error("mask must be finite");
        out[i] = Math.max(0, Math.min(1, v));
    }
    return out;
}
export function binary(mask, threshold = .5) {
    if (threshold < 0 || threshold > 1)
        throw new Error("threshold must be in [0,1]");
    const out = new Uint8Array(mask.length);
    for (let i = 0; i < mask.length; i++)
        out[i] = mask[i] >= threshold ? 1 : 0;
    return out;
}
function at(a, w, h, x, y) { return x >= 0 && x < w && y >= 0 && y < h ? a[y * w + x] : 0; }
export function dilate(mask, w, h, radius = 1) {
    if (radius < 0 || radius > 32)
        throw new Error("radius must be 0..32");
    let src = binary(validateMask(mask, w, h));
    for (let r = 0; r < radius; r++) {
        const next = new Uint8Array(src.length);
        for (let y = 0; y < h; y++)
            for (let x = 0; x < w; x++) {
                let v = 0;
                for (let dy = -1; dy <= 1; dy++)
                    for (let dx = -1; dx <= 1; dx++)
                        v |= at(src, w, h, x + dx, y + dy);
                next[y * w + x] = v;
            }
        src = next;
    }
    return Float32Array.from(src);
}
export function erode(mask, w, h, radius = 1) {
    if (radius < 0 || radius > 32)
        throw new Error("radius must be 0..32");
    let src = binary(validateMask(mask, w, h));
    for (let r = 0; r < radius; r++) {
        const next = new Uint8Array(src.length);
        for (let y = 0; y < h; y++)
            for (let x = 0; x < w; x++) {
                let v = 1;
                for (let dy = -1; dy <= 1; dy++)
                    for (let dx = -1; dx <= 1; dx++)
                        v &= at(src, w, h, x + dx, y + dy);
                next[y * w + x] = v;
            }
        src = next;
    }
    return Float32Array.from(src);
}
export function opening(mask, w, h, radius = 1) { return dilate(erode(mask, w, h, radius), w, h, radius); }
export function closing(mask, w, h, radius = 1) { return erode(dilate(mask, w, h, radius), w, h, radius); }
export function edge(mask, w, h, radius = 1) {
    const a = binary(mask), b = binary(erode(mask, w, h, radius)), out = new Float32Array(mask.length);
    for (let i = 0; i < out.length; i++)
        out[i] = a[i] && !b[i] ? 1 : 0;
    return out;
}
export function union(...masks) {
    if (!masks.length)
        throw new Error("mask required");
    const out = new Float32Array(masks[0].length);
    for (const m of masks) {
        if (m.length !== out.length)
            throw new Error("mask length mismatch");
        for (let i = 0; i < out.length; i++)
            out[i] = Math.max(out[i], m[i]);
    }
    return out;
}
export function intersect(...masks) {
    if (!masks.length)
        throw new Error("mask required");
    const out = new Float32Array(masks[0].length);
    out.fill(1);
    for (const m of masks) {
        if (m.length !== out.length)
            throw new Error("mask length mismatch");
        for (let i = 0; i < out.length; i++)
            out[i] = Math.min(out[i], m[i]);
    }
    return out;
}
export function subtract(mask, exclusion) {
    if (mask.length !== exclusion.length)
        throw new Error("mask length mismatch");
    const out = new Float32Array(mask.length);
    for (let i = 0; i < out.length; i++)
        out[i] = Math.max(0, Math.min(1, mask[i] - exclusion[i]));
    return out;
}
export function feather(mask, w, h, radius = 4) {
    if (radius < 0 || radius > 64)
        throw new Error("radius must be 0..64");
    const src = validateMask(mask, w, h);
    if (radius === 0)
        return src;
    let ring = binary(src), out = Float32Array.from(ring);
    for (let step = 1; step <= radius; step++) {
        const grown = binary(dilate(Float32Array.from(ring), w, h, 1));
        const value = 1 - step / (radius + 1);
        for (let i = 0; i < out.length; i++) {
            if (grown[i] && !ring[i])
                out[i] = Math.max(out[i], value);
            ring[i] = grown[i];
        }
    }
    for (let i = 0; i < out.length; i++)
        out[i] = Math.max(out[i], src[i]);
    return out;
}
export function connectedComponents(mask, w, h) {
    const src = binary(mask), labels = new Int32Array(src.length);
    let label = 0;
    const neighbours = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            const start = y * w + x;
            if (!src[start] || labels[start])
                continue;
            label++;
            const q = [start];
            labels[start] = label;
            for (let qi = 0; qi < q.length; qi++) {
                const pos = q[qi], py = Math.floor(pos / w), px = pos % w;
                for (const [dY, dX] of neighbours) {
                    const ny = py + dY, nx = px + dX;
                    if (nx < 0 || nx >= w || ny < 0 || ny >= h)
                        continue;
                    const n = ny * w + nx;
                    if (src[n] && !labels[n]) {
                        labels[n] = label;
                        q.push(n);
                    }
                }
            }
        }
    return { labels, count: label };
}
export function removeSmallComponents(mask, w, h, minimum = 4) {
    if (minimum < 1)
        throw new Error("minimum must be positive");
    const { labels, count } = connectedComponents(mask, w, h), sizes = new Int32Array(count + 1);
    for (const l of labels)
        sizes[l]++;
    const out = new Float32Array(mask.length);
    for (let i = 0; i < out.length; i++)
        if (labels[i] && sizes[labels[i]] >= minimum)
            out[i] = 1;
    return out;
}
export function stats(mask, w, h) {
    const src = binary(mask);
    let area = 0, x0 = w, y0 = h, x1 = 0, y1 = 0;
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++)
            if (src[y * w + x]) {
                area++;
                x0 = Math.min(x0, x);
                y0 = Math.min(y0, y);
                x1 = Math.max(x1, x + 1);
                y1 = Math.max(y1, y + 1);
            }
    const components = connectedComponents(mask, w, h).count, edges = edge(mask, w, h, 1);
    let edgePixels = 0;
    for (const v of edges)
        if (v > .5)
            edgePixels++;
    return { area, fraction: area / (w * h), x0: area ? x0 : 0, y0: area ? y0 : 0, x1: area ? x1 : 0, y1: area ? y1 : 0, components, edgePixels };
}
export function overlap(a, b) {
    if (a.length !== b.length)
        throw new Error("mask length mismatch");
    const aa = binary(a), bb = binary(b);
    let inter = 0, un = 0, ac = 0, bc = 0;
    for (let i = 0; i < aa.length; i++) {
        if (aa[i])
            ac++;
        if (bb[i])
            bc++;
        if (aa[i] && bb[i])
            inter++;
        if (aa[i] || bb[i])
            un++;
    }
    return { intersection: inter, iou: un ? inter / un : 1, aCovered: ac ? inter / ac : 1, bCovered: bc ? inter / bc : 1 };
}
export function alphaComposite(pixels, w, h, colour, mask, opacity) {
    if (opacity < 0 || opacity > 1)
        throw new Error("opacity must be in [0,1]");
    const m = validateMask(mask, w, h), out = new Uint8ClampedArray(pixels);
    for (let i = 0; i < m.length; i++) {
        const a = m[i] * opacity;
        for (let c = 0; c < 3; c++)
            out[i * 4 + c] = Math.round(pixels[i * 4 + c] * (1 - a) + colour[c] * a);
        out[i * 4 + 3] = pixels[i * 4 + 3];
    }
    return out;
}
export function outsideChangeFraction(before, after, allowed) {
    if (before.length !== after.length || allowed.length * 4 !== before.length)
        throw new Error("length mismatch");
    let n = 0, c = 0;
    for (let i = 0; i < allowed.length; i++)
        if (allowed[i] <= .5) {
            n++;
            if (before[i * 4] !== after[i * 4] || before[i * 4 + 1] !== after[i * 4 + 1] || before[i * 4 + 2] !== after[i * 4 + 2])
                c++;
        }
    return n ? c / n : 0;
}
