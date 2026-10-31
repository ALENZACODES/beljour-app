import { apply, fromFunction } from "../engines/warp/field.js";
import { Q3_MINIMUM, safeStrength } from "../engines/warp/fold.js";
import { anchorPoint } from "./anchors.js";
export const FUN_WARP_LABEL = "Fun warp: a playful distortion for fun, not your real face shape. A simulation.";
export const WARPS = ["big-eyes", "tiny-face", "long-face", "chubby-cheeks", "puffer", "alien-head", "wide-smile",
    "mini-mouth", "bulge", "mirror"];
export const MAX_AMOUNT = 0.6;
export const GRID_STEP = 6;
function bumps(kind, f) {
    const w = f.width, at = (a) => anchorPoint(f, a);
    const shift = (p, dx, dy) => [p[0] + (dx * f.u[0] + dy * f.v[0]) * w, p[1] + (dx * f.u[1] + dy * f.v[1]) * w];
    switch (kind) {
        case "big-eyes": return [f.points[468], f.points[473]].map((p) => ({ at: p, radius: 0.24 * w, amount: 0.45 }));
        case "tiny-face": return [{ at: f.centre, radius: 0.85 * w, amount: -0.4 }];
        case "long-face": return [{ at: shift(at("chin"), 0, -0.1), radius: 0.75 * w, amount: 0.55, across: 0.15, along: 1 }];
        case "chubby-cheeks": return [at("cheek-left"), at("cheek-right")].map((p) => ({ at: shift(p, 0, 0.05), radius: 0.36 * w, amount: 0.55 }));
        case "puffer": return [{ at: shift(at("mouth"), 0, -0.05), radius: 0.62 * w, amount: 0.45 }];
        case "alien-head": return [{ at: shift(at("forehead"), 0, 0.12), radius: 0.75 * w, amount: 0.5 },
            { at: at("chin"), radius: 0.35 * w, amount: -0.4 }];
        case "wide-smile": return [{ at: at("mouth"), radius: 0.36 * w, amount: 0.5, across: 1, along: 0.15 }];
        case "mini-mouth": return [{ at: at("mouth"), radius: 0.28 * w, amount: -0.5 }];
        case "bulge": return [{ at: at("nose"), radius: 0.38 * w, amount: 0.55 }];
        case "mirror": return [];
    }
}
/** The backward map of the warp at full amount (scaled by `share`): where each output pixel reads. */
export function warpMap(kind, f, share) {
    const list = bumps(kind, f);
    return (x, y) => {
        let sx = x, sy = y;
        for (const b of list) {
            const dx = x - b.at[0], dy = y - b.at[1];
            const r2 = (dx * dx + dy * dy) / (b.radius * b.radius);
            if (r2 >= 1)
                continue;
            const k = Math.max(-MAX_AMOUNT, Math.min(MAX_AMOUNT, b.amount)) * share * (1 - r2) ** 2;
            // Split the offset along the face's axes so a bump can act mostly across or along the face.
            const du = dx * f.u[0] + dy * f.u[1], dv = dx * f.v[0] + dy * f.v[1];
            const ku = k * (b.across ?? 1), kv = k * (b.along ?? 1);
            sx -= ku * du * f.u[0] + kv * dv * f.v[0];
            sy -= ku * du * f.u[1] + kv * dv * f.v[1];
        }
        return [sx, sy];
    };
}
/** The reference path: the warp engine's full-resolution field and its own fold guard
 * (engines/warp/fold.ts safeStrength) with a linear-light resample. Slow; kept so the fast
 * path below is tested against it. */
export function funWarpReference(image, f, kind, share) {
    const build = (s) => fromFunction(image.width, image.height, warpMap(kind, f, s), GRID_STEP);
    const safe = safeStrength(build, { requested: share });
    return { image: apply(image, safe.field), strengthUsed: safe.strength, reduced: safe.reduced };
}
// --- the fast path: one coarse grid, an exact fold check on it, one bilinear resample ---------
export const FAST_STEP = 12; // grid spacing in pixels; ASSUMED, the bumps are far wider than this
/** The pixel box the bumps can move (outside it the map is exactly the identity). */
function moveBox(list, width, height) {
    if (!list.length)
        return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const b of list) {
        x0 = Math.min(x0, b.at[0] - b.radius);
        y0 = Math.min(y0, b.at[1] - b.radius);
        x1 = Math.max(x1, b.at[0] + b.radius);
        y1 = Math.max(y1, b.at[1] + b.radius);
    }
    x0 = Math.max(0, Math.floor(x0));
    y0 = Math.max(0, Math.floor(y0));
    x1 = Math.min(width - 1, Math.ceil(x1));
    y1 = Math.min(height - 1, Math.ceil(y1));
    return x1 > x0 && y1 > y0 ? [x0, y0, x1, y1] : null;
}
/** Displacements (source - pixel) of the full-amount map on grid nodes covering the box. */
function gridOf(kind, f, box, step) {
    const [x0, y0, x1, y1] = box, nx = Math.ceil((x1 - x0) / step) + 1, ny = Math.ceil((y1 - y0) / step) + 1;
    const map = warpMap(kind, f, 1), dx = new Float64Array(nx * ny), dy = new Float64Array(nx * ny);
    for (let j = 0; j < ny; j++)
        for (let i = 0; i < nx; i++) {
            const x = x0 + i * step, y = y0 + j * step, [sx, sy] = map(x, y);
            dx[j * nx + i] = sx - x;
            dy[j * nx + i] = sy - y;
        }
    return { x0, y0, nx, ny, step, dx, dy };
}
/** The smallest Jacobian determinant of the bilinear map the grid defines, at strength s. The
 * determinant of a bilinear patch is bilinear in the cell coordinates, so its minimum over a
 * cell is at a corner: checking every cell corner is exact for the map that is applied. */
export function gridMinDet(g, s) {
    let min = Infinity;
    const { nx, ny, dx, dy, step } = g;
    for (let j = 0; j + 1 < ny; j++)
        for (let i = 0; i + 1 < nx; i++) {
            const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
            // At each corner: the x slope from that corner's horizontal cell edge, the y slope from its
            // vertical one. Displacement slopes are scaled by s; the identity adds 1 on the diagonal.
            for (const [h0, h1, v0, v1] of [[a, b, a, c], [a, b, b, d], [c, d, a, c], [c, d, b, d]]) {
                const ux = 1 + s * (dx[h1] - dx[h0]) / step, uy = s * (dy[h1] - dy[h0]) / step;
                const vx = s * (dx[v1] - dx[v0]) / step, vy = 1 + s * (dy[v1] - dy[v0]) / step;
                min = Math.min(min, ux * vy - uy * vx);
            }
        }
    return min;
}
/** The largest strength up to `share` whose grid map never folds (Q3 minimum, fold.ts). */
export function safeShare(g, share, minimum = Q3_MINIMUM) {
    if (gridMinDet(g, share) >= minimum)
        return share;
    let lo = 0, hi = share;
    for (let k = 0; k < 14; k++) {
        const mid = (lo + hi) / 2;
        if (gridMinDet(g, mid) >= minimum)
            lo = mid;
        else
            hi = mid;
    }
    return lo;
}
/** Bilinear read of the source at (sx, sy), edge-clamped, into out at pixel index o. */
function sampleInto(src, out, o, sx, sy, w, h, ch) {
    const x = Math.min(w - 1, Math.max(0, sx)), y = Math.min(h - 1, Math.max(0, sy));
    const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1), fx = x - x0, fy = y - y0;
    const a = (y0 * w + x0) * ch, b = (y0 * w + x1) * ch, c = (y1 * w + x0) * ch, d = (y1 * w + x1) * ch;
    for (let k = 0; k < 3; k++) {
        const top = src[a + k] + fx * (src[b + k] - src[a + k]), bottom = src[c + k] + fx * (src[d + k] - src[c + k]);
        out[o + k] = top + fy * (bottom - top) + 0.5;
    }
}
/** Apply a fun warp at `share` (0..1): one coarse grid, its exact fold check (the strength is
 * lowered until no cell folds), then one bilinear resample inside the box the warp can move. */
export function funWarp(image, f, kind, share) {
    if (!WARPS.includes(kind))
        throw new RangeError(`no fun warp ${JSON.stringify(kind)}`);
    if (!(share >= 0 && share <= 1))
        throw new RangeError("warp share must be 0..1");
    const out = { ...image, data: new Uint8ClampedArray(image.data) };
    if (share === 0)
        return { image: out, strengthUsed: 0, reduced: false };
    if (kind === "mirror")
        return { image: mirrorFace(image, f, share), strengthUsed: share, reduced: false };
    const box = moveBox(bumps(kind, f), image.width, image.height);
    if (!box)
        return { image: out, strengthUsed: share, reduced: false };
    const g = gridOf(kind, f, box, FAST_STEP), used = safeShare(g, share);
    const { width: w, height: h, channels: ch } = image, { x0, y0, nx, ny, step, dx, dy } = g;
    for (let y = box[1]; y <= box[3]; y++) {
        const gy = Math.min(ny - 1.000001, (y - y0) / step), j = Math.floor(gy), ty = gy - j;
        for (let x = box[0]; x <= box[2]; x++) {
            const gx = Math.min(nx - 1.000001, (x - x0) / step), i = Math.floor(gx), tx = gx - i;
            const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
            const ddx = (dx[a] * (1 - tx) + dx[b] * tx) * (1 - ty) + (dx[c] * (1 - tx) + dx[d] * tx) * ty;
            const ddy = (dy[a] * (1 - tx) + dy[b] * tx) * (1 - ty) + (dy[c] * (1 - tx) + dy[d] * tx) * ty;
            if (ddx === 0 && ddy === 0)
                continue;
            sampleInto(image.data, out.data, (y * w + x) * ch, x + used * ddx, y + used * ddy, w, h, ch);
        }
    }
    return { image: out, strengthUsed: used, reduced: used < share };
}
/** The face blended with its own mirror image across the face's midline (the line through the
 * forehead and chin), inside a soft ellipse around the face, so both halves match. Only the
 * ellipse's box is visited. */
export function mirrorFace(image, f, share) {
    const { width: w, height: h, channels: ch } = image;
    const [cx, cy] = f.centre, rx = 0.62 * f.width, ry = 0.62 * f.height, r = Math.max(rx, ry);
    const out = { ...image, data: new Uint8ClampedArray(image.data) }, px = new Uint8ClampedArray(4);
    for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(h - 1, Math.ceil(cy + r)); y++) {
        for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(w - 1, Math.ceil(cx + r)); x++) {
            const dx = x - cx, dy = y - cy;
            const du = dx * f.u[0] + dy * f.u[1], dv = dx * f.v[0] + dy * f.v[1];
            const e = (du / rx) ** 2 + (dv / ry) ** 2;
            // Feathered: full inside the ellipse, fading to nothing at its edge; half and half at the
            // midline is a no-op there, so there is no seam.
            if (e >= 1)
                continue;
            const a = share * 0.5 * Math.min(1, (1 - e) / 0.35);
            // Reflect across the midline: flip the across-face coordinate.
            sampleInto(image.data, px, 0, cx - du * f.u[0] + dv * f.v[0], cy - du * f.u[1] + dv * f.v[1], w, h, ch);
            const o = (y * w + x) * ch;
            for (let k = 0; k < 3; k++)
                out.data[o + k] = Math.round(image.data[o + k] + a * (px[k] - image.data[o + k]));
        }
    }
    return out;
}
