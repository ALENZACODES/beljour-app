export function feather(source, w, h, radius = 2) { let current = new Float32Array(source); for (let pass = 0; pass < radius; pass++) {
    const next = new Float32Array(current.length);
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            let sum = 0, n = 0;
            for (let dy = -1; dy <= 1; dy++)
                for (let dx = -1; dx <= 1; dx++) {
                    const xx = Math.max(0, Math.min(w - 1, x + dx)), yy = Math.max(0, Math.min(h - 1, y + dy));
                    sum += current[yy * w + xx];
                    n++;
                }
            next[y * w + x] = sum / n;
        }
    current = next;
} return current; }
export function boundary(mask, w, h) { const out = new Float32Array(mask.length); for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
        let low = 1;
        for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
                const xx = Math.max(0, Math.min(w - 1, x + dx)), yy = Math.max(0, Math.min(h - 1, y + dy));
                low = Math.min(low, mask[yy * w + xx]);
            }
        out[y * w + x] = Math.max(0, mask[y * w + x] - low);
    } return out; }
export function scalpBand(mask, w, h, width = 4) { let out = boundary(mask, w, h); for (let pass = 1; pass < width; pass++) {
    const next = new Float32Array(out);
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++)
            for (let dy = -1; dy <= 1; dy++)
                for (let dx = -1; dx <= 1; dx++) {
                    const xx = Math.max(0, Math.min(w - 1, x + dx)), yy = Math.max(0, Math.min(h - 1, y + dy));
                    next[y * w + x] = Math.max(next[y * w + x], out[yy * w + xx]);
                }
    out = next;
} for (let i = 0; i < out.length; i++)
    out[i] = Math.max(0, Math.min(1, out[i] * (1 - mask[i] * 0.35))); return out; }
export function rootBand(mask, photo, g, depth = .12) { const out = new Float32Array(mask.length); const faceH = Math.abs(g.chin[1] - g.crown[1]); const bottom = g.crown[1] + depth * faceH; for (let y = 0; y < photo.height; y++) {
    const yn = y / Math.max(photo.height - 1, 1);
    if (yn >= g.crown[1] - .02 && yn <= bottom)
        for (let x = 0; x < photo.width; x++)
            out[y * photo.width + x] = mask[y * photo.width + x];
} return feather(out, photo.width, photo.height, 1); }
export function lowerHair(mask, photo, g, split = .55) { const out = new Float32Array(mask.length); const threshold = g.crown[1] + Math.abs(g.chin[1] - g.crown[1]) * split; for (let y = 0; y < photo.height; y++) {
    const yn = y / Math.max(photo.height - 1, 1);
    if (yn >= threshold)
        for (let x = 0; x < photo.width; x++)
            out[y * photo.width + x] = mask[y * photo.width + x];
} return out; }
export function sideRegion(mask, w, side) { const out = new Float32Array(mask.length); for (let i = 0; i < mask.length; i++) {
    const x = i % w;
    const left = x / (w - 1) <= .5;
    out[i] = (side === "left" ? left : !left) ? mask[i] : 0;
} return out; }
export function extensionMask(mask, photo, g, lengthRatio, volume) { const out = new Float32Array(mask); const extra = Math.round(photo.height * lengthRatio * .35); for (let y = 0; y < photo.height; y++) {
    const sy = Math.max(0, y - extra);
    const yn = y / Math.max(photo.height - 1, 1);
    const taper = Math.max(0, 1 - Math.max(0, yn - g.chin[1]) * (.45 + .4 * (1 - volume)));
    for (let x = 0; x < photo.width; x++)
        out[y * photo.width + x] = Math.max(out[y * photo.width + x], mask[sy * photo.width + x] * taper);
} return out; }
export function topperMask(mask, photo, g, amount) { const out = new Float32Array(mask); const cx = g.crown[0] * (photo.width - 1), cy = g.crown[1] * (photo.height - 1), fw = Math.abs(g.right_temple[0] - g.left_temple[0]), fh = Math.abs(g.chin[1] - g.crown[1]), rx = Math.max(4, fw * photo.width * (.42 + .25 * amount)), ry = Math.max(4, fh * photo.height * (.18 + .12 * amount)); for (let y = 0; y < photo.height; y++)
    for (let x = 0; x < photo.width; x++) {
        const hit = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
        if (hit)
            out[y * photo.width + x] = Math.max(out[y * photo.width + x], amount);
    } return out; }
export function fringeMask(mask, photo, g, amount) { const out = new Float32Array(mask); const left = g.left_temple[0] * photo.width, right = g.right_temple[0] * photo.width, top = g.crown[1] * photo.height, bottom = top + Math.abs(g.chin[1] - g.crown[1]) * photo.height * (.20 + .18 * amount); for (let y = 0; y < photo.height; y++)
    for (let x = 0; x < photo.width; x++) {
        const arch = top + ((x - (left + right) / 2) / Math.max(right - left, 1)) ** 2 * photo.height * .05;
        if (x >= left && x <= right && y >= arch && y <= bottom)
            out[y * photo.width + x] = Math.max(out[y * photo.width + x], .65 + .35 * amount);
    } return out; }
export function foilPattern(mask, w, count, phase = 0) { const out = new Float32Array(mask.length); for (let i = 0; i < mask.length; i++) {
    const x = (i % w) / Math.max(w - 1, 1);
    const stripe = .5 + .5 * Math.cos((x + phase) * Math.PI * Math.max(count, 1));
    out[i] = stripe > .55 ? mask[i] : 0;
} return out; }
