import { blur } from "../engines/core/mask.js";
import { regionMask } from "../data/regions/index.js";
import { renderLayers } from "../ui/shell/pipeline.js";
import { composeFace } from "./face-picker.js";
import { auditPersonEdit } from "./face-region-audit.js";
export const MULTI_FACE_VERSION = "beljour-multi-face/1";
export const MIN_FACES = 2;
export const MAX_FACES = 6; // the vision runtime's face limit (vision/runners.ts)
export const FEATHER = 0.04; // soft edge radius as a share of the face oval's width; ASSUMED
export const MULTI_FACE_REFUSALS = {
    too_few_faces: "Per-face editing needs a photo with at least two faces.",
    too_many_faces: `Per-face editing handles up to ${MAX_FACES} faces at a time.`,
    invalid_face: "A face needs its full set of 478 points inside the photo.",
    faces_overlap: "Two faces overlap in this photo, so their edits cannot be kept apart.",
    isolation_failed: "An edit reached outside its face, so it was not applied. Your original is unchanged.",
    unknown_face: "There is no face with that number in this photo.",
};
export class MultiFaceError extends RangeError {
    code;
    constructor(code) {
        super(MULTI_FACE_REFUSALS[code]);
        this.code = code;
        this.name = "MultiFaceError";
    }
}
/** Hard oval and soft-edged edit weight for every face; overlapping ovals are refused. */
export function faceRegions(faces, width, height) {
    const out = faces.map((face) => {
        const oval = regionMask("face_oval", face, width, height, { normalized: false, supersample: 2 });
        const hard = new Float32Array(oval.data.length);
        let minX = width, maxX = -1, pixels = 0;
        for (let i = 0; i < hard.length; i++) {
            if (oval.data[i] <= 0)
                continue;
            hard[i] = 1;
            pixels++;
            const x = i % width;
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
        }
        if (!pixels)
            throw new MultiFaceError("invalid_face");
        // The soft edge stays inside the oval: blur the hard mask, then keep only its inner part.
        const radius = Math.max(1, Math.round(FEATHER * (maxX - minX + 1)));
        const blurred = blur({ width, height, channels: 1, data: hard }, radius);
        const soft = new Float32Array(hard.length);
        for (let i = 0; i < soft.length; i++)
            soft[i] = hard[i] ? Math.min(1, Math.max(0, blurred.data[i] * 2 - 1)) : 0;
        return { hard, soft, pixels };
    });
    for (let a = 0; a < out.length; a++)
        for (let b = a + 1; b < out.length; b++) {
            for (let i = 0; i < out[a].hard.length; i++)
                if (out[a].hard[i] && out[b].hard[i])
                    throw new MultiFaceError("faces_overlap");
        }
    return out;
}
function checkedFace(points, width, height) {
    if (!Array.isArray(points) || points.length !== 478 || points.some((p) => !Array.isArray(p) || p.length < 2
        || !Number.isFinite(p[0]) || !Number.isFinite(p[1]) || p[0] < 0 || p[1] < 0 || p[0] > width - 1 || p[1] > height - 1)) {
        throw new MultiFaceError("invalid_face");
    }
    return points.map(([x, y]) => [x, y]);
}
/** One group photo's per-face edits. The source photo is never written. */
export class MultiFaceEdit {
    source;
    faces;
    regions;
    edits;
    constructor(source, faces) {
        this.source = source;
        if (faces.length < MIN_FACES)
            throw new MultiFaceError("too_few_faces");
        if (faces.length > MAX_FACES)
            throw new MultiFaceError("too_many_faces");
        const { width, height } = source.image;
        this.faces = faces.map((face) => checkedFace(face, width, height));
        this.regions = faceRegions(this.faces, width, height);
        this.edits = this.faces.map(() => []);
    }
    index(face) {
        if (!Number.isInteger(face) || face < 0 || face >= this.faces.length)
            throw new MultiFaceError("unknown_face");
        return face;
    }
    /** Replace one face's edits (a copy is kept; the layers keep their own settings). */
    setEdits(face, layers) {
        this.edits[this.index(face)] = layers.filter((l) => l.enabled && l.opacity > 0 && l.strength > 0).map((l) => ({ ...l, parameters: { ...l.parameters } }));
    }
    editsFor(face) { return this.edits[this.index(face)].map((l) => ({ ...l, parameters: { ...l.parameters } })); }
    /** Give every face the same edits as `face` ("All"). */
    copyToAll(face) {
        const layers = this.editsFor(face);
        this.edits.forEach((_, i) => { this.edits[i] = layers.map((l) => ({ ...l, parameters: { ...l.parameters } })); });
    }
    /** Render every face's edits from the original and keep each inside its own face. */
    render() {
        const { width, height, channels } = this.source.image;
        if (channels !== 3 && channels !== 4)
            throw new RangeError("the group photo must be RGB or RGBA");
        const original = Uint8ClampedArray.from(this.source.image.data);
        let current = original;
        const outcomes = [];
        for (let face = 0; face < this.faces.length; face++) {
            const layers = this.edits[face];
            if (!layers.length) {
                outcomes.push({ face, edits: 0, changed: 0, audit: null });
                continue;
            }
            const rendered = renderLayers({ ...this.source, face: this.faces[face] }, layers).image;
            const edited = new Uint8ClampedArray(current.length);
            for (let i = 0; i < width * height; i++) {
                for (let c = 0; c < 3; c++)
                    edited[i * channels + c] = rendered.data[i * rendered.channels + c];
                if (channels === 4)
                    edited[i * 4 + 3] = current[i * 4 + 3];
            }
            const others = this.regions.filter((_, j) => j !== face).map((r) => r.hard);
            const next = composeFace(current, edited, this.regions[face].soft, others, width, height, channels);
            const audit = auditPersonEdit({ data: current, width, height, channels }, { data: next, width, height, channels }, this.regions[face].soft, others);
            if (!audit.passed && audit.status !== "no_measured_effect")
                throw new MultiFaceError("isolation_failed");
            outcomes.push({ face, edits: layers.length, changed: audit.changed_in_selection, audit });
            current = next;
        }
        let changedPixels = 0;
        for (let i = 0; i < width * height; i++) {
            for (let c = 0; c < channels; c++)
                if (current[i * channels + c] !== original[i * channels + c]) {
                    changedPixels++;
                    break;
                }
        }
        const editedFaces = outcomes.filter((o) => o.edits > 0).length;
        return { image: { width, height, channels, data: current }, faces: outcomes, changedPixels, editedFaces,
            untouchedFaces: this.faces.length - editedFaces };
    }
}
