import { blur, dilate, subtract, union } from "../../engines/core/mask.js";
import { regionMask } from "../../data/regions/index.js";
import { faceFrame } from "../../engines/shape/geometry.js";
export const SNAP_NAMES = Object.freeze({
    none: "Off", skin: "Skin", lips: "Lips", eyes: "Eyes, lashes and brows", whites: "Eye whites and teeth", brows: "Brows", hair: "Hair",
});
/** Edge softening of a snapped part, as a share of the eye distance; ASSUMED. */
export const SNAP_FEATHER_IOD = 0.02;
/** How far "eyes" reaches past the eye opening to take in the lash line; ASSUMED. */
export const LASH_REACH_IOD = 0.05;
/** The eye (pupil) distance the shape tools measure faces in (engines/shape/geometry.ts). */
export function eyeDistance(face) {
    return faceFrame(face).iod;
}
/** Which snaps this photo can offer. */
export function availableSnaps(source) {
    const out = ["none"];
    if (source.face?.length === 478)
        out.push("skin", "lips", "eyes", "whites", "brows");
    if (source.hair && source.hair.width === source.width && source.hair.height === source.height)
        out.push("hair");
    return out;
}
function plane(mask) {
    const out = new Float32Array(mask.data.length);
    for (let i = 0; i < out.length; i++)
        out[i] = Math.min(1, Math.max(0, mask.data[i]));
    return out;
}
/** The snap planes the given strokes ask for (only those), at this photo's size. */
export function snapPlanes(source, strokes) {
    const wanted = new Set(strokes.map((s) => s.snap).filter((s) => s !== "none"));
    const out = {};
    if (!wanted.size)
        return out;
    const { width, height, face } = source;
    if (wanted.has("hair") && source.hair && source.hair.width === width && source.hair.height === height)
        out.hair = plane(source.hair);
    if (face?.length !== 478)
        return out;
    const iod = eyeDistance(face);
    const soft = Math.max(1, Math.round(SNAP_FEATHER_IOD * iod));
    const region = (name) => regionMask(name, face, width, height, { normalized: false, supersample: 2 });
    const finish = (mask) => plane(blur(mask, soft));
    if (wanted.has("skin"))
        out.skin = finish(region("skin"));
    if (wanted.has("lips"))
        out.lips = finish(region("lips"));
    if (wanted.has("brows"))
        out.brows = finish(region("brows"));
    if (wanted.has("eyes"))
        out.eyes = finish(union(dilate(region("eyes"), Math.max(1, Math.round(LASH_REACH_IOD * iod))), region("brows")));
    if (wanted.has("whites"))
        out.whites = finish(union(subtract(region("eyes"), dilate(region("irises"), 1)), region("mouth_opening")));
    return out;
}
