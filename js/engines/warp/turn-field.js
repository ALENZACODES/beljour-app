/** R13 turn field: make the requested small turn safe instead of backing it off.
 * Silhouette pivot, Taubin-smoothed landmark moves capped at 35% of the shortest
 * adjacent edge relative to neighbours, a ramp that widens with the turn (at least
 * 12% of face width), and per-region bisection of low-Jacobian areas. Q3 > 0.2 is
 * unchanged and the global guard still runs last.
 * Face-mapping inspiration: 3DDFA_V2, FLAME; concept only, no code copied.
 * Mirrors api/plumb_api/engines/shape/turn_field.py. Author: John Khan.
 */
import { floatImage } from "../core/buffer.js";
import { gradient } from "../core/filters.js";
import { distanceTo } from "../core/mask.js";
import { CONTOURS } from "../../data/regions/index.js";
import { FEATURE_PAIRS } from "../../data/face/generated/anatomy.js";
import { makeField } from "./field.js";
import { curve } from "./falloff.js";
import { neighbourGraph } from "./regularize.js";
export const EDGE_STRAIN_SHARE = 0.35;
export const SMOOTHING_PASSES = 2;
export const SMOOTHING_LAMBDA = 0.5;
export const SMOOTHING_MU = -0.53;
export const PROJECTION_PASSES = 6;
export const RAMP_MIN_FACE_SHARE = 0.12;
export const RAMP_FULL_TURN_FACE_SHARE = 0.16;
export const RAMP_PLATEAU_SHARE = 0.45;
export const YAW_FULL = 8;
export const PITCH_FULL = 6;
export const LOCAL_TARGET_DET = 0.25;
export const LOCAL_ROUNDS = 3;
export const LOCAL_BISECTIONS = 10;
export const LOCAL_RADIUS_IOD_SHARE = 0.25;
export const LOCAL_MIN_RADIUS_PX = 6;
export const MAX_COMPONENTS = 64;
export function silhouetteDepth(mesh) {
    const values = CONTOURS.face_oval.map((i) => mesh[i][2]).sort((a, b) => a - b);
    const n = values.length, mid = Math.floor(n / 2);
    return n % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
}
export function faceWidth(points, across) {
    let lo = Infinity, hi = -Infinity;
    for (const i of CONTOURS.face_oval) {
        const span = points[i][0] * across[0] + points[i][1] * across[1];
        lo = Math.min(lo, span);
        hi = Math.max(hi, span);
    }
    return hi - lo;
}
export function rampPx(widthPx, yaw, pitch, deepestPx, rimPx) {
    if (![widthPx, yaw, pitch, deepestPx, rimPx].every(Number.isFinite))
        throw new RangeError("ramp inputs must be finite");
    const amount = Math.min(1, Math.max(Math.abs(yaw) / YAW_FULL, Math.abs(pitch) / PITCH_FULL));
    const share = RAMP_MIN_FACE_SHARE + (RAMP_FULL_TURN_FACE_SHARE - RAMP_MIN_FACE_SHARE) * amount;
    const wanted = share * widthPx;
    const ceiling = RAMP_PLATEAU_SHARE * Math.max(deepestPx - rimPx, 0);
    return Math.max(4, Math.min(wanted, ceiling));
}
function interiorFeatures() {
    const ids = new Set([...CONTOURS.right_eye, ...CONTOURS.left_eye, ...CONTOURS.lips_outer,
        ...CONTOURS.right_brow, ...CONTOURS.left_brow]);
    for (const [a, b] of FEATURE_PAIRS.nose) {
        ids.add(a);
        ids.add(b);
    }
    for (const i of [1, 4, 5, 6, 168, 195, 197, 468, 473])
        ids.add(i);
    return [...ids].sort((a, b) => a - b);
}
export const INTERIOR_FEATURES = interiorFeatures();
/** Mean over interior features of the applied share of each requested move. */
export function featureRetention(before, requested, applied) {
    let total = 0, count = 0;
    for (const i of INTERIOR_FEATURES) {
        const rx = requested[i][0] - before[i][0], ry = requested[i][1] - before[i][1];
        const ax = applied[i][0] - before[i][0], ay = applied[i][1] - before[i][1];
        const size = rx * rx + ry * ry;
        if (!(size > 1e-12))
            continue;
        total += Math.min(1, Math.max(0, (ax * rx + ay * ry) / size));
        count++;
    }
    return count ? total / count : 1;
}
function neighbourMean(delta, graph) {
    return graph.neighbours.map((indices, i) => {
        let mx = 0, my = 0;
        indices.forEach((j, k) => { mx += delta[j][0] * graph.weights[i][k]; my += delta[j][1] * graph.weights[i][k]; });
        return [mx, my];
    });
}
/** Two Taubin passes, then each vertex's move relative to its neighbours is capped. */
export function regulariseTargets(before, proposed, referenceScale, share = EDGE_STRAIN_SHARE, pinned = [], smoothStrainedOnly = false, prepared) {
    if (before.length !== proposed.length)
        throw new RangeError("before and proposed must be matching N x 2 arrays");
    if (![...before, ...proposed].every((p) => Number.isFinite(p[0]) && Number.isFinite(p[1])))
        throw new RangeError("turn targets must be finite");
    if (!(share > 0 && share <= 1))
        throw new RangeError("strain share must be in (0, 1]");
    const graph = prepared ? prepared.forMesh(before, referenceScale) : neighbourGraph(before, referenceScale);
    if (pinned.some((i) => !Number.isInteger(i) || i < 0 || i >= before.length))
        throw new RangeError("pins must be valid landmark indices");
    const locked = new Uint8Array(before.length);
    for (const i of pinned)
        locked[i] = 1;
    const raw = before.map((p, i) => [proposed[i][0] - p[0], proposed[i][1] - p[1]]);
    let delta = raw.map(([x, y], i) => (locked[i] ? [0, 0] : [x, y]));
    const unsmoothed = delta.map(([x, y]) => [x, y]);
    for (let pass = 0; pass < SMOOTHING_PASSES; pass++) {
        for (const factor of [SMOOTHING_LAMBDA, SMOOTHING_MU]) {
            const mean = neighbourMean(delta, graph);
            delta = delta.map(([x, y], i) => (locked[i] ? [0, 0] : [x + factor * (mean[i][0] - x), y + factor * (mean[i][1] - y)]));
        }
    }
    const shortest = new Float64Array(before.length).fill(Infinity);
    for (const [i, j, length] of graph.edges) {
        if (length <= 1e-9)
            continue;
        shortest[i] = Math.min(shortest[i], length);
        shortest[j] = Math.min(shortest[j], length);
    }
    for (let i = 0; i < shortest.length; i++)
        if (!Number.isFinite(shortest[i]))
            shortest[i] = 0;
    if (smoothStrainedOnly) {
        // Authored local patterns keep their shape; only strained vertices and their
        // neighbours take the smoothed move.
        const mean0 = neighbourMean(unsmoothed, graph);
        const spread = new Uint8Array(before.length);
        for (let i = 0; i < before.length; i++) {
            const size = Math.hypot(unsmoothed[i][0] - mean0[i][0], unsmoothed[i][1] - mean0[i][1]);
            if (size > share * shortest[i] + 1e-12) {
                spread[i] = 1;
                for (const j of graph.neighbours[i])
                    spread[j] = 1;
            }
        }
        delta = delta.map((d, i) => (spread[i] ? d : unsmoothed[i]));
    }
    const capped = new Uint8Array(before.length);
    const means = neighbourMean(delta, graph);
    for (let i = 0; i < before.length; i++) {
        const rx = delta[i][0] - means[i][0], ry = delta[i][1] - means[i][1];
        const size = Math.hypot(rx, ry), limit = share * shortest[i];
        if (!locked[i] && size > limit + 1e-12) {
            delta[i] = [means[i][0] + rx * (limit / size), means[i][1] + ry * (limit / size)];
            capped[i] = 1;
        }
    }
    for (let pass = 0; pass < PROJECTION_PASSES; pass++) {
        let changed = false;
        for (const [i, j, length] of graph.edges) {
            const dx = delta[j][0] - delta[i][0], dy = delta[j][1] - delta[i][1];
            const size = Math.hypot(dx, dy), limit = share * length;
            if (size <= limit + 1e-12)
                continue;
            if (locked[i] && locked[j])
                continue;
            const full = 1 - limit / size;
            if (locked[i])
                delta[j] = [delta[j][0] - dx * full, delta[j][1] - dy * full];
            else if (locked[j])
                delta[i] = [delta[i][0] + dx * full, delta[i][1] + dy * full];
            else {
                const k = full * 0.5;
                delta[i] = [delta[i][0] + dx * k, delta[i][1] + dy * k];
                delta[j] = [delta[j][0] - dx * k, delta[j][1] - dy * k];
            }
            capped[i] = 1;
            capped[j] = 1;
            changed = true;
        }
        if (!changed)
            break;
    }
    const groups = new Map();
    before.forEach(([x, y], i) => {
        const key = `${x},${y}`;
        const list = groups.get(key);
        if (list)
            list.push(i);
        else
            groups.set(key, [i]);
    });
    for (const members of groups.values()) {
        if (members.length < 2)
            continue;
        if (members.some((i) => locked[i])) {
            for (const i of members)
                delta[i] = [0, 0];
            continue;
        }
        let sx = 0, sy = 0;
        for (const i of members) {
            sx += delta[i][0];
            sy += delta[i][1];
        }
        for (const i of members)
            delta[i] = [sx / members.length, sy / members.length];
    }
    let strain = 0;
    for (const [i, j, length] of graph.edges) {
        if (length > 1e-9)
            strain = Math.max(strain, Math.hypot(delta[j][0] - delta[i][0], delta[j][1] - delta[i][1]) / length);
    }
    const points = before.map((p, i) => [p[0] + delta[i][0], p[1] + delta[i][1]]);
    let requestedMax = 0, appliedMax = 0, cappedCount = 0;
    raw.forEach(([x, y], i) => {
        requestedMax = Math.max(requestedMax, Math.hypot(x, y));
        appliedMax = Math.max(appliedMax, Math.hypot(delta[i][0], delta[i][1]));
        cappedCount += capped[i];
    });
    const retention = before.length === 478 ? featureRetention(before, proposed, points) : 1;
    return { points, requested_max: requestedMax, applied_max: appliedMax, capped_vertices: cappedCount,
        max_strain: strain, retention };
}
/** 8-connected components as sorted flat index lists, ordered by first raster pixel. */
export function components(bad, width, height) {
    const seen = new Uint8Array(bad.length), out = [];
    for (let start = 0; start < bad.length; start++) {
        if (!bad[start] || seen[start])
            continue;
        const stack = [start], members = [];
        seen[start] = 1;
        while (stack.length) {
            const p = stack.pop();
            members.push(p);
            const y = Math.floor(p / width), x = p - y * width;
            for (let dy = -1; dy <= 1; dy++) {
                const ny = y + dy;
                if (ny < 0 || ny >= height)
                    continue;
                for (let dx = -1; dx <= 1; dx++) {
                    const nx = x + dx;
                    if ((dy === 0 && dx === 0) || nx < 0 || nx >= width)
                        continue;
                    const q = ny * width + nx;
                    if (bad[q] && !seen[q]) {
                        seen[q] = 1;
                        stack.push(q);
                    }
                }
            }
        }
        out.push(members.sort((a, b) => a - b));
    }
    return out;
}
function det(dx, dy, w, h, x0, y0) {
    const mx = floatImage(w, h, 1, true), my = floatImage(w, h, 1, true);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = y * w + x;
            mx.data[i] = dx[i] + (x + x0);
            my.data[i] = dy[i] + (y + y0);
        }
    }
    const [xx, xy] = gradient(mx), [yx, yy] = gradient(my);
    const out = new Float64Array(w * h);
    for (let i = 0; i < out.length; i++)
        out[i] = xx.data[i] * yy.data[i] - xy.data[i] * yx.data[i];
    return out;
}
/** Scale down only the connected areas whose determinant is at or below `target`. */
export function relaxLowJacobian(field, iod, target = LOCAL_TARGET_DET, rounds = LOCAL_ROUNDS) {
    if (!(Number.isFinite(iod) && iod > 0))
        throw new RangeError("iod must be positive");
    const w = field.width, h = field.height, n = w * h;
    const dxFull = new Float64Array(n), dyFull = new Float64Array(n);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = y * w + x;
            dxFull[i] = field.mapX.data[i] - x;
            dyFull[i] = field.mapY.data[i] - y;
        }
    }
    const att = new Float64Array(n).fill(1);
    const radius = Math.max(LOCAL_MIN_RADIUS_PX, LOCAL_RADIUS_IOD_SHARE * iod);
    const reach = Math.ceil(radius) + 2;
    let scaled = 0, done = 0;
    for (let round = 0; round < rounds; round++) {
        const ax = new Float64Array(n), ay = new Float64Array(n);
        for (let i = 0; i < n; i++) {
            ax[i] = dxFull[i] * att[i];
            ay[i] = dyFull[i] * att[i];
        }
        const full = det(ax, ay, w, h, 0, 0);
        const bad = new Uint8Array(n);
        let any = false;
        for (let i = 0; i < n; i++)
            if (full[i] <= target) {
                bad[i] = 1;
                any = true;
            }
        if (!any)
            break;
        done++;
        const comps = components(bad, w, h);
        if (comps.length > MAX_COMPONENTS)
            break;
        const factor = new Float64Array(n).fill(1);
        for (const comp of comps) {
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            for (const p of comp) {
                const y = Math.floor(p / w), x = p - y * w;
                minX = Math.min(minX, x);
                maxX = Math.max(maxX, x);
                minY = Math.min(minY, y);
                maxY = Math.max(maxY, y);
            }
            const x0 = Math.max(0, minX - reach), x1 = Math.min(w, maxX + reach + 1);
            const y0 = Math.max(0, minY - reach), y1 = Math.min(h, maxY + reach + 1);
            const rw = x1 - x0, rh = y1 - y0;
            const region = floatImage(rw, rh);
            for (const p of comp) {
                const y = Math.floor(p / w), x = p - y * w;
                region.data[(y - y0) * rw + (x - x0)] = 1;
            }
            const distance = distanceTo(region);
            const bump = new Float64Array(rw * rh);
            for (let i = 0; i < bump.length; i++)
                bump[i] = curve(1 - distance.data[i] / radius);
            const px0 = Math.max(0, x0 - 1), px1 = Math.min(w, x1 + 1);
            const py0 = Math.max(0, y0 - 1), py1 = Math.min(h, y1 + 1);
            const pw = px1 - px0, ph = py1 - py0;
            const passes = (s) => {
                const cdx = new Float64Array(pw * ph), cdy = new Float64Array(pw * ph);
                for (let y = 0; y < ph; y++) {
                    for (let x = 0; x < pw; x++) {
                        const gx = x + px0, gy = y + py0, gi = gy * w + gx;
                        let local = att[gi];
                        if (gx >= x0 && gx < x1 && gy >= y0 && gy < y1)
                            local *= 1 - (1 - s) * bump[(gy - y0) * rw + (gx - x0)];
                        cdx[y * pw + x] = dxFull[gi] * local;
                        cdy[y * pw + x] = dyFull[gi] * local;
                    }
                }
                const d = det(cdx, cdy, pw, ph, px0, py0);
                let minimum = Infinity;
                for (let y = y0; y < y1; y++)
                    for (let x = x0; x < x1; x++)
                        minimum = Math.min(minimum, d[(y - py0) * pw + (x - px0)]);
                return minimum > target;
            };
            if (passes(1))
                continue;
            let lo = 0, hi = 1;
            for (let k = 0; k < LOCAL_BISECTIONS; k++) {
                const mid = (lo + hi) / 2;
                if (passes(mid))
                    lo = mid;
                else
                    hi = mid;
            }
            scaled++;
            for (let y = y0; y < y1; y++) {
                for (let x = x0; x < x1; x++) {
                    const gi = y * w + x;
                    factor[gi] = Math.min(factor[gi], 1 - (1 - lo) * bump[(y - y0) * rw + (x - x0)]);
                }
            }
        }
        for (let i = 0; i < n; i++)
            att[i] *= factor[i];
    }
    const mapX = floatImage(w, h, 1, true), mapY = floatImage(w, h, 1, true);
    let minScale = Infinity;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = y * w + x;
            mapX.data[i] = x + dxFull[i] * att[i];
            mapY.data[i] = y + dyFull[i] * att[i];
            minScale = Math.min(minScale, att[i]);
        }
    }
    return { field: makeField(mapX, mapY), attenuation: att, regions_scaled: scaled, rounds: done, min_scale: minScale };
}
