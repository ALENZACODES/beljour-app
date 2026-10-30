/** Face regions for the face tools, from the 478-point mesh in photo pixels plus optional hair
 * and person masks. Every region-building rule the face tools use lives here, so the tools take
 * landmarks and masks only and can later take the regions from one shared face map instead.
 *
 * The skin map: the mesh face oval, raised to the hairline (the mesh stops mid-forehead), cut by
 * a colour model of her own skin measured on her cheeks and forehead (so it stops at hair,
 * brows, beard and background on its own), minus eyes, brows, lips and nostrils, minus marked or
 * segmented hair, then snapped to real edges with a guided filter and feathered.
 * Author: John Khan.
 */
import { CONTOURS } from "../../data/regions/index.js";
import { blur, guided, labCrop, polygonMask, rectAround, smoothstep, cropMask } from "./photo-ops.js";
export function pt(mesh, i) { return [Number(mesh[i][0]), Number(mesh[i][1])]; }
export function loop(mesh, ids) { return ids.map((i) => pt(mesh, i)); }
export function faceFrame(mesh) {
    const [rx, ry] = pt(mesh, 468), [lx, ly] = pt(mesh, 473);
    const dx = lx - rx, dy = ly - ry, iod = Math.hypot(dx, dy);
    if (!(iod > 4))
        throw new RangeError("The eyes are too close together in this photo to edit the face.");
    return { ox: (rx + lx) / 2, oy: (ry + ly) / 2, ux: dx / iod, uy: dy / iod, iod };
}
/** Face coordinates (IOD units) to photo pixels. */
export function toPhoto(f, u, v) {
    return [f.ox + f.iod * (u * f.ux - v * f.uy), f.oy + f.iod * (u * f.uy + v * f.ux)];
}
export function toFace(f, x, y) {
    const dx = (x - f.ox) / f.iod, dy = (y - f.oy) / f.iod;
    return [dx * f.ux + dy * f.uy, -dx * f.uy + dy * f.ux];
}
/** Every mesh point checked: 478 finite points, mostly inside the photo, a face big enough. */
export function meshProblem(mesh, width, height) {
    if (!mesh || mesh.length !== 478)
        return "The face tools need 478 face points from this photo.";
    let inside = 0;
    for (const p of mesh) {
        const x = Number(p[0]), y = Number(p[1]);
        if (!Number.isFinite(x) || !Number.isFinite(y))
            return "The face points have missing values.";
        if (x >= 0 && x < width && y >= 0 && y < height)
            inside++;
    }
    if (inside < 0.5 * mesh.length)
        return "Most of the face is outside the photo.";
    const [rx, ry] = pt(mesh, 468), [lx, ly] = pt(mesh, 473);
    if (Math.hypot(lx - rx, ly - ry) < 12)
        return "The face is too small in this photo to edit well.";
    return null;
}
/** Points moved outward from a centre by `grow` pixels (a cheap polygon dilation for convex-ish
 * loops; negative shrinks). */
export function grown(points, grow) {
    let cx = 0, cy = 0;
    for (const [x, y] of points) {
        cx += x;
        cy += y;
    }
    cx /= points.length;
    cy /= points.length;
    return points.map(([x, y]) => {
        const d = Math.hypot(x - cx, y - cy) || 1;
        return [x + (x - cx) / d * grow, y + (y - cy) / d * grow];
    });
}
/** The face oval raised to about the hairline: oval points above the brows move up the face by
 * up to 0.55 IOD, most at the top of the forehead. ASSUMED from the example faces; the skin
 * colour model then trims it back to where skin really ends. */
export function raisedOval(mesh, f, lift = 0.55) {
    return loop(mesh, CONTOURS.face_oval).map(([x, y]) => {
        const [, v] = toFace(f, x, y);
        const w = smoothstep(-0.25, -1.1, v);
        return [x + w * lift * f.iod * f.uy, y - w * lift * f.iod * f.ux];
    });
}
/** Nostril openings as small loops around the alar points (mesh 79/309 inner nostril, 64/294 wing). */
function nostrils(mesh, f) {
    const out = [];
    for (const [inner, wing, tip] of [[79, 64, 98], [309, 294, 327]]) {
        const a = pt(mesh, inner), b = pt(mesh, wing), c = pt(mesh, tip);
        const cx = (a[0] + b[0] + c[0]) / 3, cy = (a[1] + b[1] + c[1]) / 3, r = 0.07 * f.iod;
        out.push(Array.from({ length: 12 }, (_, k) => [cx + r * 1.3 * Math.cos(k * Math.PI / 6), cy + r * 0.8 * Math.sin(k * Math.PI / 6)]));
    }
    return out;
}
/** Feature cut-outs (eyes with lashes, brows, lips, nostrils) as soft coverage over the crop. */
export function featureMask(mesh, f, rect) {
    const parts = [
        grown(loop(mesh, CONTOURS.right_eye), 0.07 * f.iod), grown(loop(mesh, CONTOURS.left_eye), 0.07 * f.iod),
        grown(loop(mesh, CONTOURS.right_brow), 0.035 * f.iod), grown(loop(mesh, CONTOURS.left_brow), 0.035 * f.iod),
        grown(loop(mesh, CONTOURS.lips_outer), 0.02 * f.iod), ...nostrils(mesh, f),
    ];
    const out = new Float32Array(rect.w * rect.h);
    for (const part of parts) {
        const m = polygonMask(part, rect, 2);
        for (let i = 0; i < out.length; i++)
            if (m[i] > out[i])
                out[i] = m[i];
    }
    return blur(out, rect.w, rect.h, 0.02 * f.iod);
}
function robust(values) {
    values.sort((p, q) => p - q);
    const med = values[values.length >> 1];
    const dev = values.map((v) => Math.abs(v - med)).sort((p, q) => p - q);
    return [med, 1.4826 * dev[dev.length >> 1]];
}
/** Her skin colour measured on both cheeks, the nose bridge and the mid forehead (small patches
 * the mesh puts on skin in nearly every face), as a median and a robust spread per channel. */
export function measureSkin(lab, mesh, f, features) {
    const patches = [[-0.62, 0.62, 0.2], [0.62, 0.62, 0.2], [0, 0.35, 0.08], [0, -0.55, 0.18]];
    const Ls = [], As = [], Bs = [], { rect } = lab;
    for (const [u, v, r] of patches) {
        const [cx, cy] = toPhoto(f, u, v), rad = r * f.iod;
        for (let y = Math.floor(cy - rad); y <= Math.ceil(cy + rad); y++)
            for (let x = Math.floor(cx - rad); x <= Math.ceil(cx + rad); x++) {
                if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 > rad * rad)
                    continue;
                const lx = x - rect.x0, ly = y - rect.y0;
                if (lx < 0 || ly < 0 || lx >= rect.w || ly >= rect.h)
                    continue;
                const i = ly * rect.w + lx;
                if (features[i] > 0.1)
                    continue;
                Ls.push(lab.L[i]);
                As.push(lab.a[i]);
                Bs.push(lab.b[i]);
            }
    }
    if (Ls.length < 30)
        throw new RangeError("Too little skin is visible in this photo for the face tools.");
    const [L, sL] = robust(Ls), [a, sa] = robust(As), [b, sb] = robust(Bs);
    return { L, a, b, sL: Math.max(sL, 4), sa: Math.max(sa, 1.5), sb: Math.max(sb, 1.5), baseA: As[Math.floor(0.3 * (As.length - 1))] };
}
/** The crop around the raised face oval used by every face tool. */
export function faceRect(mesh, f, width, height) {
    return rectAround(raisedOval(mesh, f, 0.75), 0.35 * f.iod, width, height);
}
/** The skin map spread over the whole photo (zero outside the face crop). */
export function fullSkinMask(image, mesh, masks = {}) {
    const map = skinMap(image, mesh, masks), out = new Float32Array(image.width * image.height), { rect } = map;
    for (let y = 0; y < rect.h; y++)
        out.set(map.skin.subarray(y * rect.w, (y + 1) * rect.w), (rect.y0 + y) * image.width + rect.x0);
    return out;
}
/** The skin map described at the top of this file. */
export function skinMap(image, mesh, masks = {}) {
    const f = faceFrame(mesh), rect = faceRect(mesh, f, image.width, image.height), lab = labCrop(image, rect), n = rect.w * rect.h;
    const features = featureMask(mesh, f, rect), stats = measureSkin(lab, mesh, f, features);
    const oval = blur(polygonMask(raisedOval(mesh, f), rect, 2), rect.w, rect.h, 0.03 * f.iod);
    const hair = masks.hair ? cropMask(masks.hair, image.width, rect) : null;
    const person = masks.person ? cropMask(masks.person, image.width, rect) : null;
    const like = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        if (oval[i] <= 0.002)
            continue;
        const dl = lab.L[i] - stats.L;
        // Shadowed skin is darker but keeps its hue; light hair or a bright wall is lighter.
        const zl = dl < 0 ? dl / (stats.sL * 4 + 12) : dl / (stats.sL * 2.5 + 5);
        const za = (lab.a[i] - stats.a) / (stats.sa * 3 + 4), zb = (lab.b[i] - stats.b) / (stats.sb * 3 + 4.5);
        const d2 = zl * zl + za * za + zb * zb;
        like[i] = 1 - smoothstep(0.7, 1.6, d2);
    }
    // Snap the colour model to real edges (hairline, jaw) with the lightness as guide.
    const guide = new Float32Array(n);
    for (let i = 0; i < n; i++)
        guide[i] = lab.L[i] / 100;
    const snapped = guided(guide, like, rect.w, rect.h, Math.max(2, Math.round(0.04 * f.iod)), 0.0015);
    const skin = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        let v = Math.min(1, Math.max(0, snapped[i])) * oval[i] * (1 - features[i]);
        if (hair)
            v *= 1 - smoothstep(0.3, 0.8, hair[i]);
        if (person)
            v *= smoothstep(0.2, 0.6, person[i]);
        skin[i] = v;
    }
    const soft = blur(skin, rect.w, rect.h, 0.012 * f.iod);
    // Running-sum blurs can leave values a rounding step outside 0..1; masks are exactly 0..1.
    for (let i = 0; i < n; i++)
        soft[i] = Math.min(1, Math.max(0, Math.min(soft[i], oval[i]) * (1 - Math.min(1, Math.max(0, features[i])))));
    return { rect, lab, frame: f, skin: soft, features, stats };
}
//# sourceMappingURL=face-regions.js.map