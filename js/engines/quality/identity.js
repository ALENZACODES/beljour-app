/**
 * Identity lock with a lower-face check. SFace leans on the eyes, so a whole-face cosine can stay high
 * while the jaw, chin, lips or mouth turn into someone else's. Three independent measurements:
 *
 *  1. whole:   SFace cosine(input, output).
 *  2. chimera: SFace cosine(input, C) where C = output with the INPUT's upper face pasted back above the
 *              nose base. The eyes are now identical by construction, so any drop is caused by the lower
 *              face alone. (Ratio to the input's self-similarity, which is 1 for a deterministic embedder.)
 *  3. shape:   re-run the face mesh ON THE OUTPUT PIXELS and compare a lower-face shape signature
 *              (jaw widths at 8 heights, chin height, mouth width, lip heights, lip-to-chin, nose width,
 *              jaw angles), all in % of IOD. Planned points are not accepted: the gate measures the picture.
 *
 * SFace: OpenCV Zoo face_recognition_sface_2021dec, Apache-2.0 (ASSUMED: verify the licence file of the
 * exact copy you ship), ~37 MB fp32 / ~10 MB int8 ONNX (ASSUMED sizes), runs in ONNX Runtime Web (wasm).
 * OpenCV documents cosine >= 0.363 as "same person"; an edit gate must be much stricter, so the
 * thresholds below are starting values to calibrate on the synthetic test set (ASSUMED).
 */
import { clamp } from "../core/bands.js";
import { toP3 } from "../core/light-model.js";
export const OVAL_PAIRS = [
    [132, 361], [58, 288], [172, 397], [136, 365], [150, 379], [149, 378], [176, 400], [148, 377],
];
export const SIGNATURE_NAMES = [
    ...OVAL_PAIRS.map(([a, b]) => `jaw_w_${a}_${b}`),
    "chin_height", "mouth_width", "upper_lip", "lower_lip", "lip_to_chin", "nose_width", "nose_to_lip", "jaw_angle_r", "jaw_angle_l",
];
const d = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
export function iodOf(p) {
    if (p.length >= 478)
        return d(p[468], p[473]);
    const r = [(p[33][0] + p[133][0]) / 2, (p[33][1] + p[133][1]) / 2, 0], l = [(p[362][0] + p[263][0]) / 2, (p[362][1] + p[263][1]) / 2, 0];
    return d(r, l);
}
const angle = (a, v, b) => {
    const ax = a[0] - v[0], ay = a[1] - v[1], bx = b[0] - v[0], by = b[1] - v[1];
    return Math.acos(clamp((ax * bx + ay * by) / ((Math.hypot(ax, ay) * Math.hypot(bx, by)) || 1), -1, 1)) * 180 / Math.PI;
};
/** Lower-face signature in % of IOD (angles in degrees / 2, so 1 unit is comparable in size). */
export function lowerFaceSignature(raw) {
    const p = raw.map(toP3);
    if (p.length < 468)
        throw new RangeError("lower-face signature needs the 468/478-point mesh");
    const s = 100 / iodOf(p);
    return [
        ...OVAL_PAIRS.map(([a, b]) => d(p[a], p[b]) * s),
        d(p[2], p[152]) * s, d(p[61], p[291]) * s, d(p[0], p[13]) * s, d(p[14], p[17]) * s, d(p[17], p[152]) * s,
        d(p[129], p[358]) * s, d(p[2], p[0]) * s, angle(p[234], p[172], p[152]) / 2, angle(p[454], p[397], p[152]) / 2,
    ];
}
export function lowerFaceDrift(before, after, ignore = []) {
    const a = lowerFaceSignature(before), b = lowerFaceSignature(after), per = {};
    let max = 0, ss = 0, c = 0, worst = "";
    SIGNATURE_NAMES.forEach((name, k) => {
        const v = Math.abs(b[k] - a[k]);
        per[name] = v;
        if (ignore.some((g) => name.startsWith(g)))
            return;
        ss += v * v;
        c++;
        if (v > max) {
            max = v;
            worst = name;
        }
    });
    return { maxIod: max, rmsIod: Math.sqrt(ss / Math.max(1, c)), worst, perFeature: per };
}
/** Output with the input's upper face pasted back above the nose base (smooth 0.12 IOD seam). */
export function lowerChimera(input, output, inputMesh) {
    if (input.width !== output.width || input.height !== output.height || input.channels !== output.channels)
        throw new RangeError("chimera size mismatch");
    const p = inputMesh.map(toP3), iod = iodOf(p), w = input.width, h = input.height, ch = input.channels;
    let ax = p[263][0] - p[33][0], ay = p[263][1] - p[33][1];
    const la = Math.hypot(ax, ay) || 1;
    ax /= la;
    ay /= la;
    const dx = -ay, dy = ax, nose = p[2], band = 0.12 * iod;
    const out = Uint8Array.from(output.data);
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            const v = (x - nose[0]) * dx + (y - nose[1]) * dy; // + below the nose base
            const tUpper = 1 - clamp((v + band) / (2 * band));
            if (tUpper <= 0)
                continue;
            const j = (y * w + x) * ch;
            for (let c = 0; c < 3; c++)
                out[j + c] = Math.round(output.data[j + c] * (1 - tUpper) + input.data[j + c] * tUpper);
        }
    return out;
}
export const cosine = (a, b) => {
    let s = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) {
        s += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
    }
    return s / (Math.sqrt(na * nb) || 1);
};
/** Starting thresholds (ASSUMED; calibrate on the synthetic set: p5 of same-person edits that pass blind review). */
export const IDENTITY_LIMITS = {
    "full-beard": { whole: 0.55, chimera: 0.6, shapeMax: 3.0, shapeRms: 1.5, ignore: ["jaw_w"] }, // jaw widths checked by beardJawCheck instead
    "gender-normal": { whole: 0.75, chimera: 0.75, shapeMax: 6, shapeRms: 3, ignore: [] },
    "gender-extra": { whole: 0.65, chimera: 0.65, shapeMax: 10, shapeRms: 5, ignore: [] },
    "gender-hyper": { whole: 0.55, chimera: 0.55, shapeMax: 14, shapeRms: 7, ignore: [] },
    posture: { whole: 0.92, chimera: 0.92, shapeMax: 1.5, shapeRms: 0.8, ignore: [] },
    illustration: { whole: 0.45, chimera: 0.45, shapeMax: 3, shapeRms: 1.5, ignore: [] },
    freckles: { whole: 0.9, chimera: 0.9, shapeMax: 1.2, shapeRms: 0.7, ignore: [] },
    tan: { whole: 0.88, chimera: 0.88, shapeMax: 1.2, shapeRms: 0.7, ignore: [] },
    older: { whole: 0.65, chimera: 0.65, shapeMax: 6, shapeRms: 3, ignore: [] },
    younger: { whole: 0.7, chimera: 0.7, shapeMax: 4, shapeRms: 2, ignore: [] },
    teeth: { whole: 0.93, chimera: 0.93, shapeMax: 1.2, shapeRms: 0.7, ignore: [] },
    "hair-fibres": { whole: 0.93, chimera: 0.95, shapeMax: 1.2, shapeRms: 0.7, ignore: [] },
    balayage: { whole: 0.85, chimera: 0.95, shapeMax: 1.2, shapeRms: 0.7, ignore: [] },
};
/**
 * Full identity check. `noiseIod` is the measured re-landmarking noise floor (run the mesh twice on the
 * untouched input with 1 px jitter); drift below it is not counted.
 */
export async function identityCheck(tool, input, output, inputMesh, scorer, relandmark, noiseIod = 0.8) {
    const lim = IDENTITY_LIMITS[tool], failures = [], unknown = [];
    const pIn = inputMesh.map(toP3);
    let whole = null, chim = null, shape = null;
    let outMesh = null;
    if (relandmark)
        outMesh = await relandmark(output);
    if (!relandmark)
        unknown.push("output was not re-landmarked: shape drift unmeasured");
    else if (!outMesh || outMesh.length < 468)
        failures.push("no face found in the output");
    if (outMesh && outMesh.length >= 468) {
        shape = lowerFaceDrift(inputMesh, outMesh, lim.ignore);
        if (shape.maxIod - noiseIod > lim.shapeMax)
            failures.push(`lower-face shape drift ${shape.maxIod.toFixed(2)}% IOD at ${shape.worst} > ${lim.shapeMax}`);
        if (shape.rmsIod - noiseIod / 2 > lim.shapeRms)
            failures.push(`lower-face shape RMS ${shape.rmsIod.toFixed(2)}% IOD > ${lim.shapeRms}`);
    }
    if (!scorer)
        unknown.push("no SFace scorer: embedding identity unmeasured");
    else {
        const eIn = await scorer.embed(input, pIn);
        const pOut = outMesh && outMesh.length >= 468 ? outMesh.map(toP3) : pIn;
        whole = cosine(eIn, await scorer.embed(output, pOut));
        const chimeraImg = { width: input.width, height: input.height, channels: input.channels, data: lowerChimera(input, output, inputMesh) };
        chim = cosine(eIn, await scorer.embed(chimeraImg, pIn));
        if (whole < lim.whole)
            failures.push(`SFace whole ${whole.toFixed(3)} < ${lim.whole}`);
        if (chim < lim.chimera)
            failures.push(`SFace lower-face chimera ${chim.toFixed(3)} < ${lim.chimera}`);
    }
    return { status: failures.length ? "FAIL" : unknown.length ? "UNKNOWN" : "PASS", whole, chimera: chim, shape, failures, unknown };
}
/**
 * Beard-specific jaw check: removing a beard may only move the jaw contour INWARD (the beard's thickness
 * comes off), by at most `maxIn` % IOD, and never outward. Outward = the tool invented a fatter jaw.
 */
export function beardJawCheck(before, after, maxIn = 7, tol = 0.8) {
    const a = lowerFaceSignature(before), b = lowerFaceSignature(after);
    let worstOut = 0, worstIn = 0;
    for (let k = 0; k < OVAL_PAIRS.length; k++) {
        const dlt = b[k] - a[k];
        worstOut = Math.max(worstOut, dlt);
        worstIn = Math.max(worstIn, -dlt);
    }
    return { pass: worstOut <= tol && worstIn <= maxIn, worstOut, worstIn };
}
