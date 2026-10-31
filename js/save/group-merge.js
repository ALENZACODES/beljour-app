import { CONTOURS } from "../data/regions/generated/topology.js";
import { LANDMARKS as L } from "../data/face/generated/anatomy.js";
import { EYE_CLOSED_RATIO } from "../data/regions/index.js";
import { eyeOpening } from "./blink-rescue.js";
import { faceRegions, MAX_FACES, MIN_FACES } from "./multi-face.js";
import { auditPersonEdit } from "./face-region-audit.js";
import { inverse, mapPoint, transferRegion, TransferError } from "./region-transfer.js";
export const MERGE_VERSION = "beljour-group-merge/1";
export const MAX_SHOTS = 6;
export const MATCH_MAX = 0.35; // centre distance in face widths for the same seat; ASSUMED
export const FEATHER = 0.08; // seam feather as a share of the face width; ASSUMED
export const LABEL = "Edited from several shots of this group: some faces come from another shot.";
export const ANCHORS = [...CONTOURS.face_oval, L.right_eye_outer, L.right_eye_inner, L.left_eye_inner,
    L.left_eye_outer, L.nasion, L.nose_tip, L.subnasale];
export const MERGE_REFUSALS = {
    too_few_shots: "Add at least one more shot of the same group.",
    too_many_shots: `Use at most ${MAX_SHOTS} shots at a time.`,
    size_mismatch: "All shots need the same size and framing; take them in one burst.",
    too_few_faces: `The base shot needs ${MIN_FACES} to ${MAX_FACES} faces with face points.`,
    invalid_choice: "That shot does not have this person in it.",
};
export class MergeError extends RangeError {
    code;
    constructor(code) {
        super(MERGE_REFUSALS[code]);
        this.code = code;
        this.name = "MergeError";
    }
}
const centre = (face) => {
    let x = 0, y = 0;
    for (const p of face) {
        x += p[0];
        y += p[1];
    }
    return [x / face.length, y / face.length];
};
const faceWidth = (face) => Math.hypot(face[L.left_face_edge][0] - face[L.right_face_edge][0], face[L.left_face_edge][1] - face[L.right_face_edge][1]);
const openness = (face) => Math.min(eyeOpening(face, "right"), eyeOpening(face, "left"));
/** For each base person, the matching face index in `shot`, or null when the seat is not clear. */
export function matchFaces(base, shot) {
    const nearest = (from, among) => {
        const c = centre(from), w = faceWidth(from);
        let best = null, dist = Infinity;
        among.forEach((face, i) => { const [x, y] = centre(face), d = Math.hypot(x - c[0], y - c[1]); if (d < dist) {
            dist = d;
            best = i;
        } });
        return best !== null && dist <= MATCH_MAX * w ? best : null;
    };
    return base.map((face, person) => {
        const there = nearest(face, shot);
        return there !== null && nearest(shot[there], base) === person ? there : null;
    });
}
export function mergeBestFaces(shots, options = {}) {
    if (shots.length < 2)
        throw new MergeError("too_few_shots");
    if (shots.length > MAX_SHOTS)
        throw new MergeError("too_many_shots");
    const baseIndex = options.base ?? 0, base = shots[baseIndex];
    if (!base)
        throw new MergeError("invalid_choice");
    const { width, height, channels } = base.image;
    if (shots.some((s) => s.image.width !== width || s.image.height !== height || s.image.channels !== channels))
        throw new MergeError("size_mismatch");
    if (base.faces.length < MIN_FACES || base.faces.length > MAX_FACES)
        throw new MergeError("too_few_faces");
    const regions = faceRegions(base.faces, width, height);
    const matches = shots.map((shot, s) => (s === baseIndex ? base.faces.map((_, i) => i) : matchFaces(base.faces, shot.faces)));
    let image = base.image;
    const faces = base.faces.map((face) => face.map(([x, y]) => [x, y]));
    const people = [];
    for (let person = 0; person < base.faces.length; person++) {
        const open = shots.map((shot, s) => { const m = matches[s][person]; return m === null ? null : openness(shot.faces[m]); });
        const chosen = options.choices?.[person];
        if (chosen !== undefined && (open[chosen] === null || open[chosen] === undefined))
            throw new MergeError("invalid_choice");
        let shot = chosen ?? baseIndex;
        if (chosen === undefined)
            open.forEach((v, s) => { if (v !== null && v > (open[shot] ?? -1) + 1e-9)
                shot = s; });
        const label = `Face ${person + 1}`;
        const amount = (s) => (open[s] === null ? "not found" : open[s] < EYE_CLOSED_RATIO ? "eyes closed" : `eyes open ${open[s].toFixed(2)}`);
        if (shot === baseIndex) {
            people.push({ person, shot, openness: open, changed: 0, reason: `${label} kept from shot ${baseIndex + 1} (${amount(baseIndex)}).` });
            continue;
        }
        const donorFace = shots[shot].faces[matches[shot][person]];
        const others = regions.filter((_, j) => j !== person).map((r) => r.hard);
        try {
            const iod = Math.hypot(faces[person][L.left_pupil][0] - faces[person][L.right_pupil][0], faces[person][L.left_pupil][1] - faces[person][L.right_pupil][1]);
            const result = transferRegion(image, base.faces[person], shots[shot].image, donorFace, { width, height, channels: 1, data: regions[person].hard }, ANCHORS, iod, FEATHER * faceWidth(base.faces[person]));
            const audit = auditPersonEdit({ data: image.data, width, height, channels: channels }, { data: result.image.data, width, height, channels: channels }, Float32Array.from(result.weight.data), others);
            if (!audit.passed && audit.status !== "no_measured_effect")
                throw new TransferError("empty_region");
            image = result.image;
            const back = inverse(result.fit);
            faces[person] = donorFace.map((p) => mapPoint(back, p));
            people.push({ person, shot, openness: open, changed: result.changed,
                reason: `${label} from shot ${shot + 1} (${amount(shot)}; shot ${baseIndex + 1}: ${amount(baseIndex)})${chosen !== undefined ? ", your choice" : ""}.` });
        }
        catch (error) {
            if (!(error instanceof TransferError))
                throw error;
            people.push({ person, shot: baseIndex, openness: open, changed: 0, reason: `${label} kept from shot ${baseIndex + 1}: ${error.message}` });
        }
    }
    let changedPixels = 0;
    for (let i = 0; i < width * height; i++) {
        for (let c = 0; c < channels; c++)
            if (image.data[i * channels + c] !== base.image.data[i * channels + c]) {
                changedPixels++;
                break;
            }
    }
    return { image, faces, people, changedPixels, labels: changedPixels ? [LABEL] : [] };
}
