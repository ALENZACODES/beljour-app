/** A soft key light on her face, from the face mesh.
 *
 * The head is treated as a smooth rounded form fitted to the face points (an ellipsoid across the
 * face frame: wider than tall, centred between the eyes and the mouth). Its surface direction at
 * each pixel, against a light from the chosen side and a little in front, gives a half-Lambert
 * shading: the side toward the light lifts, the far side and under the jaw settle. The change is a
 * gain in linear light (so texture, colour and highlights ride along, like real light), feathered
 * past the face into hair and neck, and normalised so her face's average brightness stays where it
 * was: relight models the light, it never lightens her skin overall.
 * Author: John Khan.
 */
import { amountOf, blur, linearCrop, polygonMask, rectAround, writeLinear, cropMask } from "./photo-ops.js";
import { faceFrame, grown, meshProblem, raisedOval, skinMap, toFace, toPhoto } from "./face-regions.js";
export const LABEL = "Lighting simulation. The average brightness of your face is kept.";
/** Light directions in the face's own axes (u to image right, v down the face, w toward the camera). */
export const KEY_SIDES = Object.freeze({
    left: [-0.8, -0.15, 0.58], right: [0.8, -0.15, 0.58], "upper-left": [-0.6, -0.55, 0.58], "upper-right": [0.6, -0.55, 0.58],
});
export function keyLight(image, mesh, strength, side, masks = {}) {
    if (!Object.hasOwn(KEY_SIDES, side))
        throw new RangeError(`side must be one of ${Object.keys(KEY_SIDES).join(", ")}`);
    const e = amountOf(strength);
    const problem = meshProblem(mesh, image.width, image.height);
    if (problem)
        throw new RangeError(problem);
    if (e === 0)
        return { image: Uint8Array.from(image.data), label: LABEL, metrics: { unchanged: true } };
    const f = faceFrame(mesh), iod = f.iod;
    const head = grown(raisedOval(mesh, f, 0.75), 0.45 * iod);
    const rect = rectAround(head, 0.6 * iod, image.width, image.height), n = rect.w * rect.h;
    // Where the light acts: the head (feathered), and the person area around it when known.
    const region = blur(polygonMask(head, rect, 2), rect.w, rect.h, 0.25 * iod);
    if (masks.person) {
        const person = cropMask(masks.person, image.width, rect);
        for (let i = 0; i < n; i++)
            region[i] = Math.max(region[i] * (0.4 + 0.6 * person[i]), 0.35 * person[i] * region[i]);
    }
    const [lx, ly, lz] = KEY_SIDES[side], len = Math.hypot(lx, ly, lz);
    const ru = 1.35, rv = 1.75, cv = 0.65; // ASSUMED head form, in eye distances
    const shade = new Float32Array(n);
    for (let y = 0; y < rect.h; y++)
        for (let x = 0; x < rect.w; x++) {
            const [u, v] = toFace(f, rect.x0 + x + 0.5, rect.y0 + y + 0.5);
            let nu = u / ru, nv = (v - cv) / rv;
            const r2 = nu * nu + nv * nv;
            if (r2 > 1) {
                const r = Math.sqrt(r2);
                nu /= r;
                nv /= r;
            }
            const nw = Math.sqrt(Math.max(0, 1 - nu * nu - nv * nv));
            const lambert = (nu * lx + nv * ly + nw * lz) / len;
            shade[y * rect.w + x] = 0.5 * (1 + lambert);
        }
    // Keep her face's average: mean shading over her skin, weighted by how bright each pixel is.
    const map = skinMap(image, mesh), rgb = linearCrop(image, rect);
    let num = 0, den = 0;
    for (let y = 0; y < map.rect.h; y++)
        for (let x = 0; x < map.rect.w; x++) {
            const k = map.skin[y * map.rect.w + x];
            if (!(k > 0))
                continue;
            const gx = map.rect.x0 + x - rect.x0, gy = map.rect.y0 + y - rect.y0;
            if (gx < 0 || gy < 0 || gx >= rect.w || gy >= rect.h)
                continue;
            const i = gy * rect.w + gx, lum = 0.2126 * rgb[0][i] + 0.7152 * rgb[1][i] + 0.0722 * rgb[2][i];
            num += k * lum * shade[i];
            den += k * lum;
        }
    const mean = den > 0 ? num / den : 0.5, depth = 1.15 * e; // ASSUMED: at 100 the lit side is about 45% brighter than the far side
    const weight = new Float32Array(n), out = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < n; i++) {
        const gain = Math.min(1.6, Math.max(0.55, 1 + region[i] * depth * (shade[i] - mean)));
        lo = Math.min(lo, gain);
        hi = Math.max(hi, gain);
        for (let c = 0; c < 3; c++)
            out[c][i] = Math.min(1, rgb[c][i] * gain);
        weight[i] = region[i] > 0.002 ? 1 : 0;
    }
    const [cx, cy] = toPhoto(f, 0, cv);
    return { image: writeLinear(image, rect, out, weight), label: LABEL,
        metrics: { side, amount: Math.round(e * 1000) / 1000, gain_min: Math.round(lo * 1000) / 1000, gain_max: Math.round(hi * 1000) / 1000,
            face_centre: `${Math.round(cx)},${Math.round(cy)}` } };
}
