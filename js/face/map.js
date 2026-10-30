/**
 * Face map: the first step for any photo. One reading of the face reader per photo gives every
 * tool the same 478 mesh points in pixels, the head pose, a quality verdict in plain words, named
 * regions as polygons (and masks on demand) and the symmetry score. This file is the pure part
 * (no DOM, runs in node tests); face/map-reader.ts runs the face reader in the browser and keeps
 * the per-photo cache. docs/FACE-MAP.md documents the API for the other tools.
 *
 * Nothing here leaves the device. Skin tone never decides anything: the light check reads the
 * brightest part of the face crop and the share of blown-out pixels, never the average skin
 * brightness, so deep skin in good light passes.
 * Face-mapping credits (licences.json "concepts"): runtime MediaPipe Face Landmarker and
 * MediaPipe Hair Segmenter (Bucket A); concept only, no code copied: face-parsing.PyTorch (named
 * facial region classes), from its README. Author: John Khan.
 */
import { emptyMask, polygon } from "../engines/core/mask.js";
import { CONTOURS, convexHull } from "../data/regions/index.js";
import { headPoseFromMesh } from "../vision/geometry.js";
import { scoreSymmetry } from "./symmetry-score.js";
export const REGION_NAMES = ["face_oval", "forehead", "brows", "eyes", "under_eye", "nose", "cheeks", "lips", "jaw"];
export const REGION_TITLES = {
    face_oval: "Face outline", forehead: "Forehead to hairline", brows: "Brows", eyes: "Eyes", under_eye: "Under the eyes",
    nose: "Nose", cheeks: "Cheeks", lips: "Lips", jaw: "Jaw",
};
/** Mesh index loops and hull sets per region. Pairs follow the anatomy table ([right, left] of
 * the person); the left side is built from the right with MediaPipe's mirror partners. */
const NOSE_SET = [168, 6, 197, 195, 5, 4, 1, 19, 94, 2, 98, 327, 129, 358, 64, 294, 48, 278, 122, 351, 196, 419, 3, 248, 51, 281, 97, 326];
const CHEEK_RIGHT = [116, 117, 118, 101, 36, 205, 187, 147, 123, 50];
const CHEEK_LEFT = [345, 346, 347, 330, 266, 425, 411, 376, 352, 280];
/** Lower lid (lower0) then the third ring below it (lower3), right to left, closing the band. */
const UNDER_RIGHT = [33, 7, 163, 144, 145, 153, 154, 155, 133, 245, 128, 121, 120, 119, 118, 117, 111, 143];
const UNDER_LEFT = [263, 249, 390, 373, 374, 380, 381, 382, 362, 465, 357, 350, 349, 348, 347, 346, 340, 372];
/** The lower face outline from one jaw angle round the chin to the other. The jaw region is the
 * band between it and the same outline drawn JAW_DEPTH of the way in toward the mouth. */
const JAW_OUTLINE = [132, 58, 172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397, 288, 361];
/** ASSUMED: a third of the way from the jaw line to the mouth, checked on the example faces. */
const JAW_DEPTH = 0.33;
/** Upper face outline (right temple over the top to the left temple), then the brow tops back. */
const FOREHEAD_TOP = [162, 21, 54, 103, 67, 109, 10, 338, 297, 332, 284, 251, 389];
const FOREHEAD_BASE = [300, 293, 334, 296, 336, 9, 107, 66, 105, 63, 70];
/** Quality limits. ASSUMED values, checked on the example faces (docs/FACE-MAP.md). */
export const QUALITY = {
    /** pose for mapping at all; the symmetry score has tighter limits of its own */
    yaw: 20, roll: 20, pitch: 25,
    /** pupils at least this many pixels apart: below it the mesh points are a pixel or two apart */
    minPupils: 40,
    /** contrast-normalised focus (Laplacian energy over local contrast) below this is soft */
    minSharpness: 0.035,
    /** the brightest tenth of the face crop darker than this (0..255 luma) is too dark */
    minBright: 60,
    /** more of the face crop than this share blown out (luma > 250) is too bright */
    maxClipped: 0.08,
};
export const NO_FACE = "No face was found in this photo. Use a clear, front-facing photo with the whole face in view.";
const area = (pts) => {
    let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
    for (const [x, y] of pts) {
        xmin = Math.min(xmin, x);
        xmax = Math.max(xmax, x);
        ymin = Math.min(ymin, y);
        ymax = Math.max(ymax, y);
    }
    return (xmax - xmin) * (ymax - ymin);
};
const pick = (pts, ids) => ids.map((i) => pts[i]);
const hull = (pts, ids) => convexHull(pick(pts, ids));
/** Raise the forehead's top edge to the hairline: walk each top point up (away from the chin)
 * until the hair segmenter says hair, at most `reach` of the brow-to-top distance further. */
export function hairlineEdge(pts, hair, width, height, reach = 0.8) {
    const top = pick(pts, FOREHEAD_TOP);
    if (!hair || !hair.width || !hair.height)
        return { top, from: "face mesh top" };
    const scale = hair.scale ?? 1, sx = hair.width / width, sy = hair.height / height;
    const at = (x, y) => {
        const hx = Math.round(x * sx), hy = Math.round(y * sy);
        if (hx < 0 || hy < 0 || hx >= hair.width || hy >= hair.height)
            return 1; // off the photo: stop
        return hair.data[hy * hair.width + hx] / scale;
    };
    const chin = pts[152], brow = pts[9];
    const span = Math.hypot(brow[0] - pts[10][0], brow[1] - pts[10][1]);
    const raised = top.map(([x, y]) => {
        const dx = x - chin[0], dy = y - chin[1], n = Math.hypot(dx, dy) || 1;
        const ux = dx / n, uy = dy / n, steps = Math.max(1, Math.round(span * reach));
        let k = 0;
        while (k < steps && at(x + ux * (k + 1), y + uy * (k + 1)) < 0.5)
            k++;
        return [x + ux * k, y + uy * k];
    });
    return { top: raised, from: "hair segmenter" };
}
function jawBand(pts) {
    const outer = pick(pts, JAW_OUTLINE);
    const cx = (pts[1][0] + pts[14][0]) / 2, cy = (pts[1][1] + pts[14][1]) / 2;
    const inner = outer.map(([x, y]) => [x + (cx - x) * JAW_DEPTH, y + (cy - y) * JAW_DEPTH]).reverse();
    return [...outer, ...inner];
}
export function faceRegions(pts, width, height, hair) {
    const edge = hairlineEdge(pts, hair, width, height);
    const loops = {
        face_oval: [pick(pts, CONTOURS.face_oval)],
        forehead: [[...edge.top, ...pick(pts, FOREHEAD_BASE)]],
        brows: [pick(pts, CONTOURS.right_brow), pick(pts, CONTOURS.left_brow)],
        eyes: [pick(pts, CONTOURS.right_eye), pick(pts, CONTOURS.left_eye)],
        under_eye: [pick(pts, UNDER_RIGHT), pick(pts, UNDER_LEFT)],
        nose: [hull(pts, NOSE_SET)],
        cheeks: [hull(pts, CHEEK_RIGHT), hull(pts, CHEEK_LEFT)],
        lips: [pick(pts, CONTOURS.lips_outer)],
        jaw: [jawBand(pts)],
    };
    return { regions: REGION_NAMES.map((name) => ({ name, title: REGION_TITLES[name], polygons: loops[name] })), hairline: edge.from };
}
/** A region as a mask at the photo's size (or a given size), filled by scanline. */
export function regionMaskOf(map, name, size) {
    const w = size?.width ?? map.width, h = size?.height ?? map.height, kx = w / map.width, ky = h / map.height;
    const region = map.regions.find((r) => r.name === name);
    const out = emptyMask(w, h);
    for (const loop of region?.polygons ?? []) {
        const m = polygon(w, h, loop.map(([x, y]) => [x * kx, y * ky]), 2);
        for (let i = 0; i < out.data.length; i++)
            out.data[i] = Math.max(out.data[i], m.data[i]);
    }
    return out;
}
/** Luma of the face crop, at most 160 px across: [values, width, height]. */
function faceCrop(pixels, pts, width, height) {
    const kx = pixels.width / width, ky = pixels.height / height;
    const oval = pick(pts, CONTOURS.face_oval);
    const xs = oval.map((p) => p[0] * kx);
    // the inner face (brows to chin, cheek to cheek), away from hair and background
    const x0 = Math.max(0, Math.floor(Math.min(...xs) + 0.15 * (Math.max(...xs) - Math.min(...xs))));
    const x1 = Math.min(pixels.width, Math.ceil(Math.max(...xs) - 0.15 * (Math.max(...xs) - Math.min(...xs))));
    const y0 = Math.max(0, Math.floor(pts[9][1] * ky)), y1 = Math.min(pixels.height, Math.ceil(pts[152][1] * ky));
    if (x1 - x0 < 8 || y1 - y0 < 8)
        return null;
    const step = Math.max(1, (x1 - x0) / 160);
    const cw = Math.floor((x1 - x0) / step), ch = Math.floor((y1 - y0) / step);
    const out = new Float32Array(cw * ch);
    for (let j = 0; j < ch; j++)
        for (let i = 0; i < cw; i++) {
            const x = Math.min(pixels.width - 1, Math.floor(x0 + i * step)), y = Math.min(pixels.height - 1, Math.floor(y0 + j * step));
            const o = (y * pixels.width + x) * 4;
            out[j * cw + i] = 0.2126 * pixels.rgba[o] + 0.7152 * pixels.rgba[o + 1] + 0.0722 * pixels.rgba[o + 2];
        }
    return [out, cw, ch];
}
/** Focus: mean squared Laplacian over the mean squared local deviation (3x3), so a low-contrast
 * or deep-toned face is not called blurry for being low contrast. 0 for a flat crop. */
export function sharpness(luma, w, h) {
    let lap = 0, dev = 0, n = 0;
    for (let y = 1; y < h - 1; y++)
        for (let x = 1; x < w - 1; x++) {
            const i = y * w + x, c = luma[i];
            const l = luma[i - 1] + luma[i + 1] + luma[i - w] + luma[i + w] - 4 * c;
            const m = (luma[i - 1] + luma[i + 1] + luma[i - w] + luma[i + w] + luma[i - w - 1] + luma[i - w + 1] + luma[i + w - 1] + luma[i + w + 1] + c) / 9;
            lap += l * l;
            dev += (c - m) ** 2 + 1;
            n++;
        }
    return n ? lap / dev / 100 : 0;
}
/** The brightest tenth (90th percentile luma) and the blown-out share. */
export function exposure(luma) {
    const sorted = Float32Array.from(luma).sort();
    let clipped = 0;
    for (const v of luma)
        if (v > 250)
            clipped++;
    return { bright: sorted[Math.floor(sorted.length * 0.9)] ?? 0, clipped: luma.length ? clipped / luma.length : 0 };
}
function check(id, level, title, message) { return { id, level, title, message }; }
export function qualityChecks(faceCount, pts, pose, pixels, width, height) {
    if (!pts || !faceCount)
        return [check("found", "fail", "Face found", NO_FACE)];
    const checks = [check("found", "pass", "Face found", "A face was found and mapped with 478 points.")];
    checks.push(faceCount === 1 ? check("one", "pass", "One face", "One face in the photo.")
        : check("one", "warn", "One face", `${faceCount} faces in the photo: the largest one is mapped. Crop to one face for the clearest reading.`));
    if (pose) {
        const turned = Math.abs(pose.yawDegrees) > QUALITY.yaw, tilted = Math.abs(pose.rollDegrees) > QUALITY.roll, nodded = Math.abs(pose.pitchDegrees) > QUALITY.pitch;
        checks.push(turned || tilted || nodded
            ? check("frontal", "warn", "Facing the camera", turned ? "The head is turned to one side. Face the camera directly." : tilted ? "The head is tilted. Keep it level." : "The chin is tipped well up or down. Look straight ahead.")
            : check("frontal", "pass", "Facing the camera", "Facing the camera."));
    }
    const pupils = Math.hypot(pts[468][0] - pts[473][0], pts[468][1] - pts[473][1]);
    checks.push(pupils >= QUALITY.minPupils ? check("size", "pass", "Large enough", "The face is large enough to map in detail.")
        : check("size", "warn", "Large enough", "The face is small in this photo. Move closer or crop in for a finer map."));
    const crop = pixels ? faceCrop(pixels, pts, width, height) : null;
    if (crop) {
        const focus = sharpness(...crop), light = exposure(crop[0]);
        checks.push(focus >= QUALITY.minSharpness ? check("sharp", "pass", "Sharp", "The face is in focus.")
            : check("sharp", "warn", "Sharp", "The face looks soft or blurred. Hold still or tap to focus."));
        checks.push(light.bright < QUALITY.minBright ? check("light", "warn", "Light", "It is dark. Face a window or a lamp.")
            : light.clipped > QUALITY.maxClipped ? check("light", "warn", "Light", "Part of the face is too bright. Move out of direct light.")
                : check("light", "pass", "Light", "Light is good enough to map."));
    }
    return checks;
}
function summarise(checks) {
    const failed = checks.find((c) => c.level === "fail");
    if (failed)
        return { ok: false, summary: failed.message };
    const warned = checks.filter((c) => c.level === "warn");
    return { ok: true, summary: warned.length ? `Mapped. ${warned.length === 1 ? "One thing" : `${warned.length} things`} to improve: ${warned.map((c) => c.message).join(" ")}` : "Mapped. Every check passed." };
}
/** Build the map from a face reading. Pure: the same reading gives the same map. */
export function buildFaceMap(input) {
    const { width, height } = input;
    const empty = (status, reason) => {
        const checks = status === "no_face" ? qualityChecks(0, null, null, null, width, height) : [];
        return { status, width, height, points: null, points3: null, normalized: null, faces: [], allNormalized: [], blendshapes: {}, pose: null,
            quality: { ok: false, checks, summary: reason }, regions: [], hairline: null,
            symmetry: { ok: false, code: "no_mesh", message: reason }, reason };
    };
    if (input.unavailable)
        return empty("unavailable", input.unavailable);
    const usable = input.faces.filter((f) => f.landmarks?.length === 478);
    if (!usable.length)
        return empty("no_face", NO_FACE);
    const inPixels = usable.map((f) => ({ f, px: f.landmarks.map((p) => [p.x * width, p.y * height]) }))
        .sort((a, b) => area(b.px) - area(a.px));
    const chosen = inPixels[0];
    const points = chosen.px, normalized = chosen.f.landmarks.map((p) => ({ x: p.x, y: p.y, z: p.z }));
    const points3 = normalized.map((p) => [p.x * width, p.y * height, (p.z ?? 0) * width]);
    let pose = null;
    try {
        const read = headPoseFromMesh(normalized, width, height);
        pose = { yawDegrees: read.yawDegrees, pitchDegrees: read.pitchDegrees, rollDegrees: read.rollDegrees };
    }
    catch {
        pose = null;
    }
    const checks = qualityChecks(inPixels.length, points, pose, input.pixels ?? null, width, height);
    const { regions, hairline } = faceRegions(points, width, height, input.hair);
    const symmetry = pose ? scoreSymmetry(points3, pose) : { ok: false, code: "degenerate", message: "The head pose could not be read in this photo." };
    return {
        status: "mapped", width, height, points, points3, normalized, faces: inPixels.map((x) => x.px),
        allNormalized: inPixels.map((x) => x.f.landmarks.map((p) => ({ x: p.x, y: p.y, z: p.z }))),
        blendshapes: { ...(chosen.f.blendshapes ?? {}) }, pose, quality: { checks, ...summarise(checks) }, regions, hairline, symmetry, reason: "",
    };
}
/** Which region (if any) a pixel falls in, smallest first so an eye wins over the face outline. */
export function regionAt(map, x, y) {
    const inside = (loop) => {
        let hit = false;
        for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
            const [xi, yi] = loop[i], [xj, yj] = loop[j];
            if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
                hit = !hit;
        }
        return hit;
    };
    const hits = map.regions.filter((r) => r.polygons.some(inside));
    return hits.sort((a, b) => a.polygons.reduce((s, p) => s + area(p), 0) - b.polygons.reduce((s, p) => s + area(p), 0))[0] ?? null;
}
//# sourceMappingURL=map.js.map