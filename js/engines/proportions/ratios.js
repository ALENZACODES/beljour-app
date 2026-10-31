/**
 * E10 proportion checks against a reference set (mirrors api/plumb_api/engines/proportions/ratios.py).
 *
 * Eight measured ratios: thirds, fifths, face length to width, mouth to nose width, eye and
 * nose width to the eye gap, nose-to-mouth against mouth-to-chin, upper to lower lip.
 * Vertical lengths run along the fitted midline and the fifths across it, so roll does not
 * change them. Reference sets: golden, classical, custom. Never a score and never advice.
 * Face-mapping credits (licences.json "concepts"): runtime data from MediaPipe Face
 * Landmarker (Bucket A); concept only, no code copied: Farkas anthropometry (thirds, fifths,
 * neoclassical canons) and YouCam API documentation (Plumb's golden-ratio pairs).
 *
 * Author: John Khan.
 */
import { LANDMARKS, RATIOS, REFERENCE_SETS } from "../../data/face/generated/anatomy.js";
import { checkMesh, fitMidline, frame } from "./symmetry.js";
export const CLOSE_PERCENT = 3;
export const NOTICEABLE_PERCENT = 8;
export const NOTE = "Measured on the face mesh in this photo. Faces vary; a difference from a reference is not a problem " +
    "to fix, and nothing here is a score. The upper third starts at the top of the mesh, not the hairline.";
export function measureValues(points) {
    checkMesh(points);
    const line = fitMidline(points);
    const pt = (n) => points[LANDMARKS[n]];
    const dist = (a, b) => Math.hypot(pt(b)[0] - pt(a)[0], pt(b)[1] - pt(a)[1]);
    const along = (...names) => {
        let x = 0, y = 0;
        for (const n of names) {
            x += pt(n)[0];
            y += pt(n)[1];
        }
        return frame([x / names.length - line.cx, y / names.length - line.cy], line)[1];
    };
    const across = (n) => frame([pt(n)[0] - line.cx, pt(n)[1] - line.cy], line)[0];
    const top = along("mesh_top"), brow = along("brow_mid"), base = along("subnasale"), chin = along("chin");
    const stomion = along("stomion_upper", "stomion_lower");
    const length = chin - top;
    if (!(length > 1e-9))
        throw new RangeError("the face has no length; the mesh is degenerate");
    const edges = ["right_face_edge", "right_eye_outer", "right_eye_inner", "left_eye_inner", "left_eye_outer", "left_face_edge"].map(across);
    const width = edges[5] - edges[0];
    if (!(width > 1e-9))
        throw new RangeError("the face has no width; the mesh is degenerate");
    const gap = dist("right_eye_inner", "left_eye_inner"), nose = dist("right_ala", "left_ala");
    if (!(gap > 1e-9 && nose > 1e-9))
        throw new RangeError("eye gap and nose width must be positive");
    const eye = (dist("right_eye_outer", "right_eye_inner") + dist("left_eye_inner", "left_eye_outer")) / 2;
    const lowerLip = along("lower_lip_bottom") - along("stomion_lower");
    return {
        midline: line,
        values: {
            thirds: [(brow - top) / length, (base - brow) / length, (chin - base) / length],
            fifths: edges.slice(1).map((e, i) => (e - edges[i]) / width),
            face_length_width: length / width,
            mouth_nose_width: dist("right_mouth", "left_mouth") / nose,
            eye_width_gap: eye / gap,
            nose_width_gap: nose / gap,
            lips_chin: (stomion - base) / (chin - stomion),
            upper_lower_lip: lowerLip > 1e-9 ? (along("stomion_upper") - along("upper_lip_top")) / lowerLip : Infinity,
        },
    };
}
export function difference(value, reference) {
    if (Array.isArray(value) && Array.isArray(reference)) {
        if (value.length !== reference.length)
            throw new RangeError("reference must have one share per part");
        const total = reference.reduce((s, v) => s + v, 0);
        let worst = 0;
        value.forEach((v, i) => { const gap = 100 * (v - reference[i] / total); if (Math.abs(gap) > Math.abs(worst))
            worst = gap; });
        return worst;
    }
    if (Array.isArray(value) || Array.isArray(reference))
        throw new RangeError("a share list needs a share list reference");
    return (100 * (value - reference)) / reference;
}
export function plain(key, diff) {
    if (diff === null)
        return "This reference set has no value for this ratio.";
    const size = Math.abs(diff);
    if (size < CLOSE_PERCENT)
        return "Close to the reference.";
    const amount = size < NOTICEABLE_PERCENT ? "a little" : "noticeably";
    if (key === "thirds" || key === "fifths")
        return `One part is ${amount} ${diff > 0 ? "larger" : "smaller"} than an even split.`;
    return `${amount[0].toUpperCase()}${amount.slice(1)} ${diff > 0 ? "above" : "below"} the reference.`;
}
export function checkCustom(custom) {
    const out = {};
    for (const [key, value] of Object.entries(custom)) {
        if (!(key in RATIOS))
            throw new RangeError(`unknown ratio ${key}`);
        const k = key;
        if (k === "thirds" || k === "fifths") {
            const parts = k === "thirds" ? 3 : 5;
            if (!Array.isArray(value) || value.length !== parts || !value.every((v) => Number.isFinite(v) && v > 0))
                throw new RangeError(`${k} needs ${parts} positive numbers`);
            out[k] = [...value];
        }
        else {
            if (typeof value !== "number" || !(Number.isFinite(value) && value > 0))
                throw new RangeError(`${k} needs one positive number`);
            out[k] = value;
        }
    }
    return out;
}
export function measure(points, referenceSet = "golden", custom = {}) {
    if (!REFERENCE_SETS.includes(referenceSet))
        throw new RangeError(`reference set must be one of ${REFERENCE_SETS.join(", ")}`);
    const mine = checkCustom(custom);
    const { midline, values } = measureValues(points);
    const ratios = Object.keys(RATIOS).map((key) => {
        const spec = RATIOS[key];
        const refs = spec.references;
        const raw = referenceSet === "custom" ? mine[key] ?? null : refs[referenceSet] ?? null;
        const reference = raw === null ? null : Array.isArray(raw) ? [...raw] : raw;
        const value = values[key];
        const diff = reference === null || (typeof value === "number" && !Number.isFinite(value)) ? null : difference(value, reference);
        return { key, label: spec.label, parts: spec.parts, value, reference, differencePercent: diff, plain: plain(key, diff) };
    });
    return { referenceSet, midline, ratios, note: NOTE };
}
