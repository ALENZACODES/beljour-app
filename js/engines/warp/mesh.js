/**
 * E06 face-mesh warp (mirrors api/plumb_api/engines/warp/mesh.py): piecewise affine over the
 * triangulated 478-point mesh, held still by an anchor ring around the face outline and the
 * image border. Only mesh points move; the guard lowers the strength until no triangle flips
 * or keeps less than 20% of its area AND the actual backward raster Jacobian is >0.2.
 * Used by face turning (§8.1) and the E08 controls.
 * Face-mapping credits (licences.json "concepts"): runtime data from MediaPipe Face
 * Landmarker (mesh indices, Bucket A); concept only, no code copied: 3DDFA_V2 (dense face
 * mesh driving an image warp) and InsightFace (a face frame fixed by anchor points), from
 * their papers and READMEs.
 *
 * Author: John Khan.
 */
import { CONTOURS } from "../../data/regions/generated/topology.js";
import { triangleFlips, foldReport } from "./fold.js";
import { piecewiseAffine } from "./piecewise.js";
import { borderPins, checkPoints } from "./tps.js";
import { delaunay } from "./triangulate.js";
export const RING_POINTS = 24;
export const MIN_RING_SCALE = 1.05;
const OVAL = CONTOURS.face_oval;
/** Points on an ellipse around the face outline, `scale` times its extent along its axes. */
export function anchorRing(mesh, scale = 1.35, count = RING_POINTS) {
    checkPoints(mesh, "mesh");
    if (!(Number.isFinite(scale) && scale >= MIN_RING_SCALE))
        throw new RangeError(`ring scale must be at least ${MIN_RING_SCALE}`);
    if (!(Number.isInteger(count) && count >= 8))
        throw new RangeError("an anchor ring needs at least 8 points");
    if (mesh.length <= Math.max(...OVAL))
        throw new RangeError("the mesh is missing face outline points");
    const oval = OVAL.map((i) => mesh[i]);
    let cx = 0, cy = 0;
    for (const [x, y] of oval) {
        cx += x;
        cy += y;
    }
    cx /= oval.length;
    cy /= oval.length;
    let sxx = 0, syy = 0, sxy = 0;
    for (const [x, y] of oval) {
        sxx += (x - cx) ** 2;
        syy += (y - cy) ** 2;
        sxy += (x - cx) * (y - cy);
    }
    // principal axis of the symmetric 2 x 2 covariance (larger eigenvalue)
    const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    let mx = Math.cos(theta), my = Math.sin(theta);
    if (my < 0) {
        mx = -mx;
        my = -my;
    }
    const nx = my, ny = -mx;
    let a = 0, b = 0;
    for (const [x, y] of oval) {
        a = Math.max(a, Math.abs((x - cx) * mx + (y - cy) * my));
        b = Math.max(b, Math.abs((x - cx) * nx + (y - cy) * ny));
    }
    a *= scale;
    b *= scale;
    const out = [];
    for (let k = 0; k < count; k++) {
        const t = (2 * Math.PI * k) / count, c = Math.cos(t) * b, s = Math.sin(t) * a;
        out.push([cx + c * nx + s * mx, cy + c * ny + s * my]);
    }
    return out;
}
/** Ring points outside [1, width - 2] x [1, height - 2] are dropped, not clipped onto the edge
 * (clipped points coincided on frame-filling faces); the border pins hold the frame edge. A ring
 * wholly inside the photo gives exactly the same layout as before. Mirrors warp/mesh.py. */
export function layout(mesh, width, height, ringScale = 1.35, ringCount = RING_POINTS) {
    const ring = anchorRing(mesh, ringScale, ringCount).filter(([x, y]) => x >= 1 && x <= width - 2 && y >= 1 && y <= height - 2);
    const points = [...mesh.map((p) => [p[0], p[1]]), ...ring, ...borderPins(width, height)];
    return { points, meshCount: mesh.length, triangles: delaunay(points) };
}
function moved(lay, after, s) {
    return lay.points.map((p, i) => (i < lay.meshCount ? [p[0] + s * (after[i][0] - p[0]), p[1] + s * (after[i][1] - p[1])] : p));
}
export function meshWarp(width, height, before, after, { lay, strength = 1, guard = true, iterations = 12 } = {}) {
    checkPoints(before, "before");
    checkPoints(after, "after");
    if (before.length !== after.length)
        throw new RangeError("before and after must be the same mesh");
    if (!(strength >= 0 && strength <= 1))
        throw new RangeError("strength must be in [0, 1]");
    if (!(Number.isInteger(iterations) && iterations >= 1 && iterations <= 40))
        throw new RangeError("iterations must be an integer from 1 to 40");
    const used0 = lay ?? layout(before, width, height);
    if (used0.meshCount !== before.length || before.some((p, i) => Math.abs(p[0] - used0.points[i][0]) > 1e-8 || Math.abs(p[1] - used0.points[i][1]) > 1e-8)) {
        throw new RangeError("the layout was built for another mesh");
    }
    let dst = moved(used0, after, strength);
    let flips = triangleFlips(used0.points, dst, used0.triangles);
    let used = strength, reduced = false;
    let guardReason = null, evaluations = 0;
    if (guard && !flips.passed) {
        reduced = true;
        guardReason = "triangle_area";
        let lo = 0, hi = strength;
        flips = triangleFlips(used0.points, used0.points, used0.triangles);
        for (let k = 0; k < iterations; k++) {
            const mid = (lo + hi) / 2, rep = triangleFlips(used0.points, moved(used0, after, mid), used0.triangles);
            if (rep.passed) {
                lo = mid;
                flips = rep;
            }
            else
                hi = mid;
        }
        used = lo;
        dst = moved(used0, after, used);
    }
    let result = piecewiseAffine(width, height, used0.points, dst, used0.triangles);
    let jacobian = foldReport(result.field);
    evaluations++;
    if (guard && !jacobian.passed) {
        reduced = true;
        guardReason = guardReason ? "triangle_area_and_raster_q3" : "raster_q3";
        let lo = 0, hi = used;
        let best = piecewiseAffine(width, height, used0.points, used0.points, used0.triangles);
        let bestJacobian = foldReport(best.field), bestFlips = triangleFlips(used0.points, used0.points, used0.triangles);
        if (!(bestJacobian.passed && bestFlips.passed))
            throw new RangeError("mesh layout cannot produce a valid identity warp");
        for (let k = 0; k < iterations; k++) {
            const mid = (lo + hi) / 2, candidateDst = moved(used0, after, mid);
            const candidateFlips = triangleFlips(used0.points, candidateDst, used0.triangles);
            if (!candidateFlips.passed) {
                hi = mid;
                continue;
            }
            const candidate = piecewiseAffine(width, height, used0.points, candidateDst, used0.triangles);
            const candidateJacobian = foldReport(candidate.field);
            evaluations++;
            if (candidateJacobian.passed) {
                lo = mid;
                best = candidate;
                bestJacobian = candidateJacobian;
                bestFlips = candidateFlips;
            }
            else
                hi = mid;
        }
        used = lo;
        result = best;
        jacobian = bestJacobian;
        flips = bestFlips;
    }
    return { result, flips, strengthUsed: used, reduced, jacobian, guardReason, evaluations,
        refused: reduced && used === 0 };
}
//# sourceMappingURL=mesh.js.map