/**
 * Face symmetry score for the Face map: how the two sides of the face line up in this photo.
 *
 * Method (docs/FACE-MAP.md has the long form):
 * 1. Fit the facial midline through the central mesh points (forehead, nose bridge, nose tip,
 *    philtrum, lips, chin: anatomy MIDLINE) by principal axis, so the line follows the face, not
 *    the image centre.
 * 2. Express every point in that line's frame: u across the face, v down it. A tilted head (roll)
 *    is removed exactly by this change of frame.
 * 3. Mirror each paired point (u, v) to (-u, v) and measure how far it lands from its partner,
 *    in units of the distance between the pupils (mesh points 468 and 473), so photo size and
 *    distance from the camera do not matter.
 * 4. Average per region (eyes, brows, cheeks, mouth, jaw, nose) and over the six regions, and map
 *    the mean offset to 0..100 (100 = the two sides line up exactly).
 * A head turned to one side (yaw) makes the near side look wider in any flat photo, so the score
 * is refused above YAW_LIMIT, and the result carries a range: the same face re-posed by
 * +-REPOSE_DEGREES of turn on its own 3D mesh.
 *
 * It measures geometry in one photo. It is not a beauty or attractiveness score, says nothing
 * about health, and is never used to rank people.
 * Face-mapping credits (licences.json "concepts"): runtime MediaPipe Face Landmarker
 * (Bucket A); concept only, no code copied: dlib and OpenFace (left/right landmark pairs) and
 * Farkas anthropometry (midline and paired measurements), from their documentation.
 * Author: John Khan.
 */
import { FEATURE_PAIRS, MIDLINE } from "../data/face/generated/anatomy.js";
import { fitLine } from "./symmetry.js";
export const SCORE_REGIONS = ["eyes", "brows", "cheeks", "mouth", "jaw", "nose"];
export const REGION_LABELS = {
    eyes: "Eyes", brows: "Brows", cheeks: "Cheeks", mouth: "Mouth", jaw: "Jaw", nose: "Nose",
};
export const PUPILS = [468, 473];
/**
 * Pose limits, measured on 12 AI-generated example faces and their mirrored copies
 * (docs/FACE-MAP.md, "Thresholds"). Re-posing a real mesh on its own 3D points by 1 degree of
 * turn moved the score by about 5 points; the mirrored photo, read again by the face reader,
 * differed by 0 to 4 points. The 24 front-facing portraits read |yaw| 0.4 to 3.0 degrees, so 4
 * degrees passes a photo taken facing the camera and refuses one turned enough for the turn
 * itself to swamp the reading. Roll is removed exactly by the midline frame; its limit only keeps
 * the mesh fit in the range it was trained for (ASSUMED 15). Ten degrees of nod moved the offset
 * by under 0.002 pupil distances (about 1 point) and the pose estimate reads 2 to 12 degrees of
 * pitch on these frontal portraits, so its limit is wide (ASSUMED 20).
 */
export const YAW_LIMIT = 4;
export const ROLL_LIMIT = 15;
export const PITCH_LIMIT = 20;
/** The re-posing used for the range: one degree of turn either way (the photo and its mirror
 * disagreed on the turn by up to 1.9 degrees, 0.6 on average). */
export const REPOSE_DEGREES = 1;
/** A mean offset of this many pupil distances or more scores 0. ASSUMED: puts the example faces
 * at 77 to 95 and the jaw (the noisiest outline points) mostly above 60. */
export const ZERO_AT = 0.2;
/** A side difference smaller than this (in pupil distances, about 1 mm on an adult face) is
 * called level or even. ASSUMED. */
export const SIDE_NOTICE = 0.015;
/** The range most of the example faces fall in, for the plain "typical range" sentence. */
export const TYPICAL_RANGE = [75, 95];
export const TURN_MESSAGE = "Turn to face the camera: your head is turned, and a turn changes how the two sides look in a flat photo.";
export function offsetToScore(offset) {
    return Math.max(0, Math.min(100, Math.round(100 * (1 - offset / ZERO_AT))));
}
/** u (across the face, + toward photo-right when the face is upright) and v (down the face). */
export function toFrame(points, line) {
    return points.map((p) => {
        const vx = p[0] - line.cx, vy = p[1] - line.cy;
        return [vx * line.dy - vy * line.dx, vx * line.dx + vy * line.dy, p[2] ?? 0];
    });
}
function midlineOf(points) {
    return fitLine(MIDLINE.map((i) => [points[i][0], points[i][1]]));
}
/** Raw offsets in a frame where the midline is u = 0. Nothing is rounded. */
export function measureFrame(frame) {
    const [r, l] = PUPILS;
    const pupil = Math.hypot(frame[r][0] - frame[l][0], frame[r][1] - frame[l][1]);
    if (!(pupil > 1e-6))
        throw new RangeError("pupils are not apart");
    const offsets = {};
    for (const name of SCORE_REGIONS) {
        const pairs = FEATURE_PAIRS[name];
        let sum = 0;
        for (const [a, b] of pairs)
            sum += Math.hypot(frame[a][0] + frame[b][0], frame[a][1] - frame[b][1]);
        offsets[name] = sum / pairs.length / pupil;
    }
    return { offsets, pupil };
}
const mean = (values) => values.reduce((s, v) => s + v, 0) / values.length;
const overall = (offsets) => mean(SCORE_REGIONS.map((n) => offsets[n]));
/** Turn (about the face's own vertical axis) and nod a frame-space mesh, then re-fit the midline. */
export function repose(frame, yawDegrees, pitchDegrees = 0) {
    const a = (yawDegrees * Math.PI) / 180, b = (pitchDegrees * Math.PI) / 180;
    const zc = mean(frame.map((p) => p[2] ?? 0)), vc = mean(frame.map((p) => p[1]));
    const turned = frame.map(([u, v, z = 0]) => {
        const dz = z - zc;
        const u2 = u * Math.cos(a) + dz * Math.sin(a), z2 = -u * Math.sin(a) + dz * Math.cos(a);
        const dv = v - vc;
        return [u2, vc + dv * Math.cos(b) + z2 * Math.sin(b), z2 + zc];
    });
    return toFrame(turned, midlineOf(turned));
}
/** Which photo side sits higher (smaller v) or wider (larger |u|), in plain words. */
function sideLine(name, frame, pupil) {
    const pairs = FEATURE_PAIRS[name];
    // Each pair's two points, sorted by which photo side they are on (u < 0 is photo-left).
    const sides = pairs.map(([a, b]) => frame[a][0] <= frame[b][0] ? [frame[a], frame[b]] : [frame[b], frame[a]]);
    const word = (d) => (Math.abs(d) >= 2.5 * SIDE_NOTICE ? "a little" : "slightly");
    if (name === "nose") {
        const lean = mean(sides.map(([p, q]) => (p[0] + q[0]) / 2)) / pupil;
        return Math.abs(lean) < SIDE_NOTICE ? "Sits on the midline." : `Sits ${word(lean)} toward the photo-${lean < 0 ? "left" : "right"} side.`;
    }
    if (name === "cheeks" || name === "jaw") {
        const wider = mean(sides.map(([p, q]) => Math.abs(p[0]) - Math.abs(q[0]))) / pupil;
        return Math.abs(wider) < SIDE_NOTICE ? "Both sides about as wide." : `The photo-${wider > 0 ? "left" : "right"} side is ${word(wider)} wider.`;
    }
    const points = name === "mouth" ? [[61, 291]].map(([a, b]) => frame[a][0] <= frame[b][0] ? [frame[a], frame[b]] : [frame[b], frame[a]]) : sides;
    const lower = mean(points.map(([p, q]) => p[1] - q[1])) / pupil;
    const what = name === "mouth" ? "mouth corner" : name === "eyes" ? "eye" : "brow";
    return Math.abs(lower) < SIDE_NOTICE ? `Both ${name === "mouth" ? "corners" : name} about level.` : `The photo-${lower > 0 ? "right" : "left"} ${what} sits ${word(lower)} higher.`;
}
/** Pose gate: a refusal with a plain reason, or null when the pose is frontal enough. */
export function poseRefusal(pose) {
    if (![pose.yawDegrees, pose.pitchDegrees, pose.rollDegrees].every(Number.isFinite))
        return { ok: false, code: "degenerate", message: "The face could not be measured in this photo." };
    if (Math.abs(pose.yawDegrees) > YAW_LIMIT)
        return { ok: false, code: "turned", message: TURN_MESSAGE };
    if (Math.abs(pose.rollDegrees) > ROLL_LIMIT)
        return { ok: false, code: "tilted", message: "Hold your head level: it is tilted a lot in this photo." };
    if (Math.abs(pose.pitchDegrees) > PITCH_LIMIT)
        return { ok: false, code: "nodded", message: "Look straight at the camera: your chin is tipped well up or down." };
    return null;
}
/**
 * Score one face. `points` are the 478 mesh points in pixels (z optional, for the range);
 * `pose` is the head pose from vision/geometry.ts. `mirrorScore`, when the mirrored photo was
 * measured too, widens the range to include it.
 */
export function scoreSymmetry(points, pose, mirrorScore) {
    if (!points || points.length < 478)
        return { ok: false, code: "no_mesh", message: "No face was found, so there is nothing to measure." };
    const refused = poseRefusal(pose);
    if (refused)
        return refused;
    let line, frame, measured;
    try {
        line = midlineOf(points);
        frame = toFrame(points, line);
        measured = measureFrame(frame);
    }
    catch {
        return { ok: false, code: "degenerate", message: "The face could not be measured in this photo." };
    }
    const regions = SCORE_REGIONS.map((name) => ({
        name, label: REGION_LABELS[name], offset: Math.round(measured.offsets[name] * 10000) / 10000,
        score: offsetToScore(measured.offsets[name]), side: sideLine(name, frame, measured.pupil),
    }));
    const score = offsetToScore(overall(measured.offsets));
    const variants = [-REPOSE_DEGREES, REPOSE_DEGREES].map((deg) => offsetToScore(overall(measureFrame(repose(frame, deg)).offsets)));
    if (mirrorScore !== undefined && Number.isFinite(mirrorScore))
        variants.push(Math.round(mirrorScore));
    const lo = Math.min(score, ...variants), hi = Math.max(score, ...variants);
    return {
        ok: true, score, range: [lo, hi], uncertainty: Math.max(score - lo, hi - score), regions, midline: line,
        rollDegrees: Math.round((Math.atan2(-line.dx, line.dy) * 180 / Math.PI) * 10) / 10,
        pupilDistance: Math.round(measured.pupil * 10) / 10,
    };
}
/** Every index the score reads, with its partner: the pairs, the pupils and the midline (itself). */
export const MIRROR_PARTNER = (() => {
    const m = new Map();
    for (const pairs of Object.values(FEATURE_PAIRS))
        for (const [a, b] of pairs) {
            m.set(a, b);
            m.set(b, a);
        }
    m.set(PUPILS[0], PUPILS[1]);
    m.set(PUPILS[1], PUPILS[0]);
    return m;
})();
/** The same mesh as the face reader would return it on the mirrored photo: x flipped and each
 * left point swapped with its right partner. The score is the same by construction. */
export function mirrorMesh(points, width) {
    return points.map((_, i) => {
        const p = points[MIRROR_PARTNER.get(i) ?? i];
        return (p.length > 2 ? [width - p[0], p[1], p[2]] : [width - p[0], p[1]]);
    });
}
export const SYMMETRY_NOTE = "This measures how the two sides of the face line up in this photo, after allowing for a tilted head. "
    + `Most faces score between ${TYPICAL_RANGE[0]} and ${TYPICAL_RANGE[1]}; nobody's two sides match exactly. `
    + "It is not a beauty or attractiveness score, it is not medical, and it is never used to compare people.";
