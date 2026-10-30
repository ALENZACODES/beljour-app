/**
 * Face map in the browser: runs the face reader (and the hair segmenter, when this build has it)
 * once per photo through vision/client.ts, builds the map with face/map.ts and keeps it, so every
 * tool that asks about the same photo gets the same map without a second reading.
 *
 * The photo's pixels go to the vision worker on this device and nowhere else. A tool passes a
 * key that names the photo (a Studio source id, a picture URL); a tool without one gets a key
 * tied to the image object. docs/FACE-MAP.md.
 * Face-mapping credits (licences.json "concepts"): runtime MediaPipe Face Landmarker and
 * MediaPipe Hair Segmenter (Bucket A) through the E05 worker; concept only, no code copied:
 * no other project. Author: John Khan.
 */
import { toRGBA } from "../engines/core/buffer.js";
import { defaultVisionClient } from "../vision/client.js";
import { faceReaderReady, stagedModels } from "../vision/staged.js";
import { boundsFromMesh, headPoseFromMesh } from "../vision/geometry.js";
import { buildFaceMap } from "./map.js";
import { scoreSymmetry } from "./symmetry-score.js";
/** The face reader works on at most this many pixels on the long side; points come back
 * normalised, so the map is still in the photo's own pixels. */
export const READ_SIDE = 1280;
export const CACHE_SIZE = 12;
export const READER_MISSING = "The face reader is not installed in this build, so this photo cannot be mapped here.";
const cache = new Map();
const objectKeys = new WeakMap();
let nextKey = 1;
function isBytes(source) {
    return typeof source.channels === "number" && !!source.data;
}
export function sizeOf(source) {
    if (isBytes(source))
        return { width: source.width, height: source.height };
    if (typeof HTMLImageElement !== "undefined" && source instanceof HTMLImageElement)
        return { width: source.naturalWidth, height: source.naturalHeight };
    return { width: source.width, height: source.height };
}
/** A canvas can be drawn over, so one without a key is read afresh each time (never cached);
 * a picture is keyed by its address, a byte image by the object. */
function keyOf(source, key) {
    if (key)
        return key;
    if (typeof HTMLCanvasElement !== "undefined" && source instanceof HTMLCanvasElement)
        return null;
    if (typeof HTMLImageElement !== "undefined" && source instanceof HTMLImageElement && source.currentSrc)
        return `img:${source.currentSrc}`;
    let k = objectKeys.get(source);
    if (!k) {
        k = `image:${nextKey++}`;
        objectKeys.set(source, k);
    }
    return k;
}
/** RGBA at reading size, optionally mirrored left to right. A byte image small enough to read
 * as it is skips the canvas (and so also works where there is no DOM, as in the tests). */
export function readingPixels(source, mirrored = false) {
    const { width, height } = sizeOf(source);
    const k = Math.min(1, READ_SIDE / Math.max(width, height));
    if (isBytes(source) && k === 1 && !mirrored)
        return { width, height, data: Uint8ClampedArray.from(toRGBA(source)) };
    const w = Math.max(1, Math.round(width * k)), h = Math.max(1, Math.round(height * k));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const g = canvas.getContext("2d", { willReadFrequently: true });
    if (!g)
        throw new Error("This browser cannot draw photos.");
    if (mirrored) {
        g.translate(w, 0);
        g.scale(-1, 1);
    }
    if (isBytes(source)) {
        const full = document.createElement("canvas");
        full.width = width;
        full.height = height;
        full.getContext("2d")?.putImageData(new ImageData(Uint8ClampedArray.from(toRGBA(source)), width, height), 0, 0);
        g.drawImage(full, 0, 0, w, h);
    }
    else
        g.drawImage(source, 0, 0, w, h);
    return g.getImageData(0, 0, w, h);
}
async function hairOf(vision, data) {
    if (!vision.ready("hair-segmentation") || !(await stagedModels()).has("hair-segmenter"))
        return null;
    try {
        const out = await vision.detect("hair-segmentation", { width: data.width, height: data.height, rgba: data.data.slice().buffer }, { maxFaces: 1 });
        const seg = out.ok ? out.output?.segmentation : undefined;
        if (!seg)
            return null;
        // The hair segmenter gives background and hair confidences; hair is the last channel.
        if (seg.channels.length)
            return { width: seg.width, height: seg.height, data: seg.channels[seg.channels.length - 1] };
        if (seg.categoryMask)
            return { width: seg.width, height: seg.height, data: Uint8Array.from(seg.categoryMask, (v) => (v === 1 ? 1 : 0)) };
    }
    catch { /* the forehead then stops at the top of the face mesh, and says so */ }
    return null;
}
async function read(source, options, mirrored) {
    const { width, height } = sizeOf(source);
    const vision = options.vision ?? defaultVisionClient();
    if (!(await (options.ready ?? (() => faceReaderReady(vision)))()))
        return buildFaceMap({ width, height, faces: [], unavailable: READER_MISSING });
    let data;
    try {
        data = readingPixels(source, mirrored);
    }
    catch (e) {
        return buildFaceMap({ width, height, faces: [], unavailable: e instanceof Error ? e.message : "This photo could not be read." });
    }
    const found = await vision.detect("face-landmarks", { width: data.width, height: data.height, rgba: data.data.slice().buffer }, { maxFaces: 6 });
    if (!found.ok)
        return buildFaceMap({ width, height, faces: [], unavailable: found.error ?? "The face reader could not run here." });
    const faces = found.faces ?? [];
    const hair = faces.length && options.hair !== false ? await hairOf(vision, data) : null;
    return buildFaceMap({ width, height, faces: faces.map((f) => ({ landmarks: f.landmarks, blendshapes: f.blendshapes })),
        pixels: { width: data.width, height: data.height, rgba: data.data }, hair });
}
function remember(key, made) {
    cache.delete(key);
    cache.set(key, made);
    while (cache.size > CACHE_SIZE)
        cache.delete(cache.keys().next().value);
    // A failed reading is not kept, so the next ask tries again.
    made.then((m) => { if (m.status === "unavailable")
        cache.delete(key); }, () => cache.delete(key));
    return made;
}
/** The face map of a photo: read once, then the same map for every tool that asks. */
export function faceMapFor(source, options = {}) {
    const key = keyOf(source, options.key);
    if (key === null)
        return read(source, options, false);
    const held = cache.get(key);
    if (held) {
        cache.delete(key);
        cache.set(key, held);
        return held;
    }
    return remember(key, read(source, options, false));
}
/** The map already made for a key, without reading (null when there is none yet). */
export function knownFaceMap(key) { return cache.get(key) ?? null; }
/** Drop one photo's map (or all of them), e.g. when the photo itself changes. */
export function forgetFaceMap(key) { if (key) {
    cache.delete(key);
    cache.delete(`${key}::mirrored`);
}
else
    cache.clear(); }
/** The mirror check: the same photo flipped left to right, read and scored again. A sound
 * method gives the same score within its range; the result widens the range when it does not. */
export async function mirrorCheck(source, options = {}) {
    const key = keyOf(source, options.key) ?? `image:${nextKey++}`;
    const map = await faceMapFor(source, { ...options, key });
    if (map.status !== "mapped" || !map.symmetry.ok || !map.pose)
        return { map, mirrorScore: null };
    const mirrorKey = `${key}::mirrored`;
    const flipped = await (cache.get(mirrorKey) ?? remember(mirrorKey, read(source, { ...options, hair: false }, true)));
    const mirrorScore = flipped.symmetry.ok ? flipped.symmetry.score : null;
    if (mirrorScore === null)
        return { map, mirrorScore };
    return { map: { ...map, symmetry: scoreSymmetry(map.points3, map.pose, mirrorScore) }, mirrorScore };
}
/** The map's faces in the vision client's own form (largest first), for code written against
 * vision/client.ts results. A face whose pose cannot be read is left out, as the client does. */
export function detectedFaces(map) {
    const out = [];
    map.allNormalized.forEach((landmarks, i) => {
        try {
            out.push({ id: `face-${i + 1}`, landmarks, bounds: boundsFromMesh(landmarks), pose: headPoseFromMesh(landmarks, map.width, map.height),
                blendshapes: i === 0 ? { ...map.blendshapes } : {} });
        }
        catch { /* a degenerate face is not offered */ }
    });
    return out;
}
//# sourceMappingURL=map-reader.js.map