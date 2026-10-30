/**
 * E06 piecewise affine warp over a triangulation (face mesh, anchor rings).
 *
 * Output triangles (`dst`) read their source triangles (`src`) through one affine map
 * each. Triangles are visited in list order and claim pixel centres whose barycentric
 * coordinates are all >= -1e-9 (first claim wins); unclaimed pixels keep the identity map
 * and owner -1. Same formula and order as api/plumb_api/engines/warp/piecewise.py.
 *
 * Author: John Khan.
 */
import { floatImage } from "../core/buffer.js";
import { identity } from "./field.js";
import { checkPoints } from "./tps.js";
import { signedArea } from "./triangulate.js";
export const EDGE_TOLERANCE = 1e-9;
export const DEGENERATE_AREA = 1e-12;
export function checkTriangles(triangles, count) {
    for (const t of triangles) {
        if (!Array.isArray(t) || t.length !== 3 || !t.every((i) => Number.isInteger(i) && i >= 0 && i < count) ||
            t[0] === t[1] || t[1] === t[2] || t[0] === t[2]) {
            throw new RangeError("triangle indices must be three distinct point indices");
        }
    }
}
export function piecewiseAffine(width, height, src, dst, triangles) {
    checkPoints(src, "src");
    checkPoints(dst, "dst");
    if (src.length !== dst.length)
        throw new RangeError("src and dst must have the same number of points");
    checkTriangles(triangles, src.length);
    const field = identity(width, height);
    const owner = new Int32Array(width * height).fill(-1);
    const mx = field.mapX.data, my = field.mapY.data;
    triangles.forEach(([ia, ib, ic], index) => {
        const a = dst[ia], b = dst[ib], c = dst[ic];
        if (Math.abs(signedArea(a, b, c)) <= DEGENERATE_AREA)
            return;
        const x0 = Math.max(0, Math.ceil(Math.min(a[0], b[0], c[0]) - EDGE_TOLERANCE));
        const x1 = Math.min(width - 1, Math.floor(Math.max(a[0], b[0], c[0]) + EDGE_TOLERANCE));
        const y0 = Math.max(0, Math.ceil(Math.min(a[1], b[1], c[1]) - EDGE_TOLERANCE));
        const y1 = Math.min(height - 1, Math.floor(Math.max(a[1], b[1], c[1]) + EDGE_TOLERANCE));
        if (x0 > x1 || y0 > y1)
            return;
        const det = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
        const sa = src[ia], sb = src[ib], sc = src[ic];
        for (let y = y0; y <= y1; y++) {
            for (let x = x0; x <= x1; x++) {
                const i = y * width + x;
                if (owner[i] >= 0)
                    continue;
                const l1 = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / det;
                const l2 = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / det;
                const l3 = 1 - l1 - l2;
                if (l1 < -EDGE_TOLERANCE || l2 < -EDGE_TOLERANCE || l3 < -EDGE_TOLERANCE)
                    continue;
                mx[i] = l1 * sa[0] + l2 * sb[0] + l3 * sc[0];
                my[i] = l1 * sa[1] + l2 * sb[1] + l3 * sc[1];
                owner[i] = index;
            }
        }
    });
    return { field, owner };
}
export function coveredShare(result) {
    let n = 0;
    for (const o of result.owner)
        if (o >= 0)
            n++;
    return n / result.owner.length;
}
/** Covered pixels as a 0/1 mask. */
export function coverageMask(result) {
    const out = floatImage(result.field.width, result.field.height, 1, true);
    for (let i = 0; i < result.owner.length; i++)
        out.data[i] = result.owner[i] >= 0 ? 1 : 0;
    return out;
}
/** 2 x 3 matrix [[a, b, c], [d, e, f]] taking each output vertex to its source vertex. */
export function affineBetween(srcTri, dstTri) {
    if (srcTri.length !== 3 || dstTri.length !== 3)
        throw new RangeError("triangles have three vertices");
    const [p, q, r] = dstTri;
    const det = signedArea(p, q, r);
    if (Math.abs(det) <= DEGENERATE_AREA)
        throw new RangeError("degenerate triangle");
    const row = (k) => {
        const [s0, s1, s2] = [srcTri[0][k], srcTri[1][k], srcTri[2][k]];
        // Solve [x y 1] . [a b c] = s for the three vertices (Cramer's rule)
        const a = (s0 * (q[1] - r[1]) + s1 * (r[1] - p[1]) + s2 * (p[1] - q[1])) / det;
        const b = (s0 * (r[0] - q[0]) + s1 * (p[0] - r[0]) + s2 * (q[0] - p[0])) / det;
        const c = (s0 * (q[0] * r[1] - r[0] * q[1]) + s1 * (r[0] * p[1] - p[0] * r[1]) + s2 * (p[0] * q[1] - q[0] * p[1])) / det;
        return [a, b, c];
    };
    return [row(0), row(1)];
}
export function triangleAreas(points, triangles) {
    checkTriangles(triangles, points.length);
    return triangles.map(([a, b, c]) => signedArea(points[a], points[b], points[c]) / 2);
}
//# sourceMappingURL=piecewise.js.map