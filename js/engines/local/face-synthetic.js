/** A synthetic, mirror-symmetric 478-point face mesh (tests, the R7 lab demo and LS8 timing).
 * Port of api/plumb_api/engines/proportions/synthetic.symmetric_face; same coordinates.
 * No photo, no person: made-up coordinates. Inspiration: Farkas anthropometry (thirds and
 * fifths used to lay out the face, from the book) and MediaPipe Face Landmarker (mesh index
 * layout, runtime data); concept only, no code copied.
 * Author: John Khan.
 */
import { CONTOURS } from "../../data/regions/generated/topology.js";
import { FEATURE_PAIRS, MESH_POINTS } from "../../data/face/generated/anatomy.js";
const MIDLINE_HEIGHTS = [
    [10, 0.0], [151, 0.08], [9, 0.30], [8, 0.33], [168, 0.37], [6, 0.42], [197, 0.47], [195, 0.52], [5, 0.56],
    [4, 0.59], [1, 0.61], [19, 0.63], [94, 0.645], [2, 0.66], [164, 0.69], [0, 0.72], [13, 0.765], [14, 0.775],
    [17, 0.82], [18, 0.86], [200, 0.9], [199, 0.93], [175, 0.97], [152, 1.0]
];
export function symmetricFace(width = 400, height = 500, faceWidth = 220, faceLength = 300) {
    const cx = width / 2, top = (height - faceLength) / 2;
    const pts = Array.from({ length: MESH_POINTS }, () => [0, 0]);
    const filled = new Array(MESH_POINTS).fill(false);
    const put = (i, x, y) => { pts[i] = [x, y]; filled[i] = true; };
    const mirror = (right, left) => put(left, 2 * cx - pts[right][0], pts[right][1]);
    const ell = (ex, ey, rx, ry, a) => [ex + rx * Math.cos(a), ey + ry * Math.sin(a)];
    const fy = (share) => top + share * faceLength;
    const oval = CONTOURS.face_oval, n = oval.length;
    oval.forEach((idx, k) => put(idx, ...ell(cx, fy(0.5), faceWidth / 2, faceLength / 2, -Math.PI / 2 + 2 * Math.PI * k / n)));
    const eyeW = faceWidth / 5, eyeCx = cx - eyeW, right = CONTOURS.right_eye, left = CONTOURS.left_eye, m = right.length;
    for (let k = 0; k < m; k++) {
        put(right[k], ...ell(eyeCx, fy(0.40), eyeW / 2, eyeW / 5, Math.PI - 2 * Math.PI * k / m));
        mirror(right[k], left[k]);
    }
    put(468, eyeCx, fy(0.40));
    [469, 470, 471, 472].forEach((idx, k) => put(idx, ...ell(eyeCx, fy(0.40), eyeW / 6, eyeW / 6, Math.PI / 2 * k)));
    mirror(468, 473);
    [[469, 476], [470, 475], [471, 474], [472, 477]].forEach(([r, l]) => mirror(r, l));
    const rb = CONTOURS.right_brow, lb = CONTOURS.left_brow;
    for (let k = 0; k < rb.length; k++) {
        const t = k / (rb.length - 1);
        put(rb[k], eyeCx - eyeW * 0.6 + 1.2 * eyeW * t, fy(0.31) - 6 * Math.sin(Math.PI * t));
        mirror(rb[k], lb[k]);
    }
    const mouthW = 1.5 * (faceWidth / 5);
    for (const [loop, inner] of [[CONTOURS.lips_outer, false], [CONTOURS.lips_inner, true]]) {
        loop.forEach((idx, k) => {
            const angle = Math.PI - 2 * Math.PI * k / loop.length, rx = inner ? mouthW / 2 - 6 : mouthW / 2;
            const up = inner ? fy(0.77) - fy(0.765) : fy(0.77) - fy(0.72), down = inner ? fy(0.775) - fy(0.77) : fy(0.82) - fy(0.77);
            const [x] = ell(cx, fy(0.77), rx, 1.0, angle);
            put(idx, x, fy(0.77) + (Math.sin(angle) > 0 ? down : up) * Math.sin(angle));
        });
    }
    for (const [idx, share] of MIDLINE_HEIGHTS)
        put(idx, cx, fy(share));
    const noseHalf = eyeW / 2;
    const noseOffsets = [[0.9, 0.64], [1.0, 0.62], [0.8, 0.60], [0.7, 0.55]];
    FEATURE_PAIRS.nose.forEach(([r, l], k) => { put(r, cx - noseOffsets[k][0] * noseHalf, fy(noseOffsets[k][1])); mirror(r, l); });
    const cheekOffsets = [[1.6, 0.52], [1.8, 0.62], [2.2, 0.47], [2.4, 0.42]];
    FEATURE_PAIRS.cheeks.forEach(([r, l], k) => { put(r, cx - cheekOffsets[k][0] * eyeW, fy(cheekOffsets[k][1])); mirror(r, l); });
    const rest = [];
    for (let i = 0; i < MESH_POINTS; i++)
        if (!filled[i])
            rest.push(i);
    for (let k = 0; k < rest.length - 1; k += 2) {
        put(rest[k], cx - 10 - (k % 60), fy(0.15 + 0.6 * (k / rest.length)));
        mirror(rest[k], rest[k + 1]);
    }
    if (rest.length % 2)
        put(rest[rest.length - 1], cx, fy(0.5));
    return pts;
}
/** The LS7 drawn face points: 360 x 400 photo, same proportions as beard/synthetic.face_points. */
export const beardFacePoints = (width = 360, height = 400) => symmetricFace(width, height, 0.56 * width, 0.68 * height);
/** Rotate a mesh about its mean point (image plane), as proportions/synthetic.rolled does. */
export function rolledFace(points, degrees) {
    let cx = 0, cy = 0;
    for (const p of points) {
        cx += p[0];
        cy += p[1];
    }
    cx /= points.length;
    cy /= points.length;
    const a = degrees * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    return points.map(([x, y]) => [(x - cx) * c - (y - cy) * s + cx, (x - cx) * s + (y - cy) * c + cy]);
}
//# sourceMappingURL=face-synthetic.js.map