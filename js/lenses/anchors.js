export const MESH_POINTS = 478;
export const ANCHORS = ["forehead", "eyes", "brows", "nose", "cheeks", "cheek-left", "cheek-right",
    "chin", "mouth", "face", "ear-left", "ear-right"];
/** Mesh points for each anchor; two points mean their midpoint. Left and right are as seen in
 * the picture (the subject's right cheek is on the picture's left). */
export const ANCHOR_POINTS = {
    forehead: [10], eyes: [468, 473], brows: [105, 334], nose: [1], cheeks: [205, 425],
    "cheek-left": [205], "cheek-right": [425], chin: [152], mouth: [61, 291], face: [10, 152],
    "ear-left": [234], "ear-right": [454],
};
export const MOUTH_OPEN_AT = 0.06; // inner lip gap / face height; ASSUMED
export const BROW_RAISE_AT = 0.12; // brow-to-lid gap / face height; ASSUMED
export const MIN_FORESHORTEN = 0.35; // a prop never narrows below this share; ASSUMED
export const NOSE_DEPTH = 0.5; // nose tip in front of the irises, in eye distances; ASSUMED
export const WIDTH_PER_EYES = 2.08; // face width over eye distance on a front view; ASSUMED
export const MAX_YAW = 0.95; // sine of the largest turn the frame will read
const ok = (p) => !!p && Number.isFinite(p[0]) && Number.isFinite(p[1]);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
/** The face frame, or null when there is no usable face (wrong point count, missing eyes). */
export function faceFrame(points) {
    if (!points || points.length !== MESH_POINTS)
        return null;
    const need = [1, 10, 152, 468, 473, 13, 14, 105, 334, 159, 386];
    if (!need.every((i) => ok(points[i])))
        return null;
    const eyeL = points[468], eyeR = points[473], iod = dist(eyeL, eyeR);
    if (!(iod > 1e-3))
        return null;
    const roll = Math.atan2(eyeR[1] - eyeL[1], eyeR[0] - eyeL[0]);
    const u = [Math.cos(roll), Math.sin(roll)], v = [-Math.sin(roll), Math.cos(roll)];
    const across = mid(eyeL, eyeR);
    const off = (points[1][0] - across[0]) * u[0] + (points[1][1] - across[1]) * u[1];
    const tan = off / iod / NOSE_DEPTH;
    const yaw = Math.max(-MAX_YAW, Math.min(MAX_YAW, tan / Math.sqrt(1 + tan * tan)));
    const trueIod = iod / Math.sqrt(1 - yaw * yaw);
    const sideL = points[234], sideR = points[454];
    const span = ok(sideL) && ok(sideR) ? dist(sideL, sideR) : 0;
    const width = Math.max(span, WIDTH_PER_EYES * trueIod);
    const height = dist(points[10], points[152]);
    if (!(height > 1e-3))
        return null;
    const lips = dist(points[13], points[14]) / height;
    const brow = (dist(points[105], points[159]) + dist(points[334], points[386])) / 2 / height;
    return { centre: mid(points[10], points[152]), u, v, roll, width, height, yaw, depth: NOSE_DEPTH * trueIod,
        mouthOpen: lips > MOUTH_OPEN_AT, browRaise: brow > BROW_RAISE_AT, points };
}
/** The anchor's position in pixels. */
export function anchorPoint(frame, anchor) {
    const ids = ANCHOR_POINTS[anchor];
    if (!ids)
        throw new RangeError(`no lens anchor ${JSON.stringify(anchor)}`);
    if (ids.length === 1)
        return frame.points[ids[0]];
    return mid(frame.points[ids[0]], frame.points[ids[1]]);
}
/** Where a square prop box lands: `offset` and `scale` are in face widths along the face's own
 * axes, `turn` is extra degrees, `depth` is how far the prop stands in front of its anchor in nose
 * depths (below 0: worn around the head, behind the anchor). */
export function place(frame, anchor, offset, scale, turn = 0, depth = 0) {
    const a = anchorPoint(frame, anchor), w = frame.width;
    const turned = Math.sqrt(Math.max(0, 1 - frame.yaw * frame.yaw));
    const across = offset[0] * w * turned + frame.yaw * depth * frame.depth;
    const x = a[0] + across * frame.u[0] + offset[1] * w * frame.v[0];
    const y = a[1] + across * frame.u[1] + offset[1] * w * frame.v[1];
    // A flat prop narrows by cos(turn); one worn around the head (depth below 0) is round, so it
    // keeps half of what a flat one would lose.
    const narrow = Math.max(MIN_FORESHORTEN, depth < 0 ? 1 - (1 - turned) / 2 : turned);
    const half = scale * w / 2;
    return { centre: [x, y], angle: frame.roll + turn * Math.PI / 180, halfW: half * narrow, halfH: half };
}
//# sourceMappingURL=anchors.js.map