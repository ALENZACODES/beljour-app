export const GLASS_OPACITY = 0.5;
export const STEP = 26; // largest colour step between neighbours inside one lens (RGB distance)
export const SPREADS = [170, 120, 80, 50]; // distances from the seed's colour tried, widest first
export const MIN_SHARE = 0.01, MAX_SHARE = 0.3; // a lens covers this share of the picture
export const OPEN_SHARE = 0.002; // at most this share of its pixels may touch the outside
const dist = (d, i, j) => Math.hypot(d[i] - d[j], d[i + 1] - d[j + 1], d[i + 2] - d[j + 2]);
/** The lens region grown from (x, y), or null when it is not lens-sized or not enclosed by the
 * frame (it touches the transparent outside, so it has run into the frame itself). The widest
 * colour spread that stays enclosed wins, so gradient lenses are taken whole. */
export function lensRegion(sprite, x, y) {
    for (const spread of SPREADS) {
        const found = grownRegion(sprite, x, y, spread);
        if (found)
            return found;
    }
    return null;
}
function grownRegion(sprite, x, y, spread) {
    const n = sprite.side, d = sprite.data, x0 = Math.round(x), y0 = Math.round(y);
    if (x0 < 0 || y0 < 0 || x0 >= n || y0 >= n || d[(y0 * n + x0) * 4 + 3] < 128)
        return null;
    const seed = (y0 * n + x0) * 4, mask = new Uint8Array(n * n), stack = [y0 * n + x0];
    mask[y0 * n + x0] = 1;
    let count = 0, open = 0;
    const limit = MAX_SHARE * n * n;
    while (stack.length) {
        const p = stack.pop(), px = p % n, py = (p - px) / n;
        if (++count > limit)
            return null;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const qx = px + dx, qy = py + dy;
            if (qx < 0 || qy < 0 || qx >= n || qy >= n)
                return null; // reached the edge: not enclosed
            const q = qy * n + qx;
            if (mask[q])
                continue;
            const qi = q * 4;
            if (d[qi + 3] < 128) {
                open++;
                continue;
            }
            if (dist(d, qi, p * 4) > STEP || dist(d, qi, seed) > spread)
                continue;
            mask[q] = 1;
            stack.push(q);
        }
    }
    return count >= MIN_SHARE * n * n && open <= OPEN_SHARE * count ? mask : null;
}
/** Square dilation (on = 1) or erosion (on = 0) of radius r, as two 1-D passes. */
function grow(mask, n, r, on) {
    const pass = (src, horizontal) => {
        const out = new Uint8Array(src);
        for (let a = 0; a < n; a++) {
            let last = -Infinity; // last index along the line holding `on`
            const at = (b) => (horizontal ? a * n + b : b * n + a);
            for (let b = 0; b < n; b++) {
                if (src[at(b)] === on)
                    last = b;
                if (b - last <= r)
                    out[at(b)] = on;
            }
            last = Infinity;
            for (let b = n - 1; b >= 0; b--) {
                if (src[at(b)] === on)
                    last = b;
                if (last - b <= r)
                    out[at(b)] = on;
            }
        }
        return out;
    };
    return pass(pass(mask, true), false);
}
/** Close small gaps (temple arms, glints) inside the lens: dilate then erode. */
export function closeMask(mask, n, r) {
    return grow(grow(mask, n, r, 1), n, r, 0);
}
/** A copy of the glasses picture with its lenses see-through, from seeds in picture pixels.
 * Seeds that do not grow a lens-sized region are tried a little further out, then dropped. */
export function glassSprite(sprite, seeds, opacity = GLASS_OPACITY) {
    const n = sprite.side, all = new Uint8Array(n * n);
    let lenses = 0;
    const step = Math.max(2, Math.round(n * 0.02));
    for (const [sx, sy] of seeds) {
        let found = null;
        for (let ring = 0; ring <= 4 && !found; ring++) {
            for (const [ox, oy] of ring === 0 ? [[0, 0]] : [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
                const x = sx + ox * ring * step, y = sy + oy * ring * step;
                if (all[Math.round(y) * n + Math.round(x)]) {
                    found = null;
                    ring = 99;
                    break;
                } // already a lens
                found = lensRegion(sprite, x, y);
                if (found)
                    break;
            }
        }
        if (!found)
            continue;
        lenses++;
        const closed = closeMask(found, n, Math.max(1, Math.round(n * 0.022)));
        for (let i = 0; i < all.length; i++)
            if (closed[i] && sprite.data[i * 4 + 3] >= 128)
                all[i] = 1;
    }
    const data = new Uint8ClampedArray(sprite.data);
    for (let i = 0; i < all.length; i++)
        if (all[i])
            data[i * 4 + 3] = Math.round(data[i * 4 + 3] * opacity);
    return { sprite: { side: n, data }, lenses };
}
