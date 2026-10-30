import { dilate, erode, polygon } from "../../engines/core/mask.js";
import { CONTOURS } from "../../data/regions/index.js";
export const CROWN_CLOSE = 0.06, CROWN_WIDER = 0.15, MIN_AREA_SHARE = 0.002, MIN_PIXELS = 200;
export const PLACEMENT_START = 0.35, PLACEMENT_FLOOR = 0.35;
const FOREHEAD_TOP = 10, RIGHT_SIDE = 234, LEFT_SIDE = 454, RIGHT_BROW = 105, LEFT_BROW = 334, RIGHT_EYE = 33, LEFT_EYE = 263;
function usable(source) {
    const hair = source.hair, face = source.face;
    if (!hair || !face || face.length !== 478)
        return null;
    if (hair.width !== source.image.width || hair.height !== source.image.height)
        return null;
    return { w: hair.width, h: hair.height, hair: hair.data };
}
const enough = (n, w, h) => n >= Math.max(MIN_PIXELS, MIN_AREA_SHARE * w * h);
/** The crown: the hair above the brows, inside the face's width (a little wider), with
 * small gaps closed (a dilate then an erode of CROWN_CLOSE x face width) so the parting and thin areas
 * are inside it, and the face's own area left out. */
export function autoCrown(source) {
    const ok = usable(source);
    if (!ok)
        return null;
    const { w, h, hair } = ok, f = source.face;
    const faceW = Math.abs(f[LEFT_SIDE][0] - f[RIGHT_SIDE][0]);
    const cx = (f[LEFT_SIDE][0] + f[RIGHT_SIDE][0]) / 2, half = faceW * (0.5 + CROWN_WIDER);
    // Down to the brows beside the face, so the hairline at the temples is in it; the face is cut out.
    const bottom = Math.max(0, Math.min(h, Math.round(Math.max(f[FOREHEAD_TOP][1], (f[RIGHT_BROW][1] + f[LEFT_BROW][1]) / 2))));
    const x0 = Math.max(0, Math.floor(cx - half)), x1 = Math.min(w - 1, Math.ceil(cx + half));
    const r = Math.max(1, CROWN_CLOSE * faceW);
    const closed = erode(dilate({ width: w, height: h, channels: 1, data: Float32Array.from(hair) }, r), r).data;
    const face = polygon(w, h, CONTOURS.face_oval.map((k) => f[k]), 2).data;
    const data = new Float32Array(w * h);
    let n = 0;
    for (let y = 0; y < bottom; y++)
        for (let x = x0; x <= x1; x++) {
            const i = y * w + x;
            if (closed[i] >= 0.5 && !(face[i] >= 0.5)) {
                data[i] = 1;
                n++;
            }
        }
    return enough(n, w, h) ? { width: w, height: h, channels: 1, data } : null;
}
/** Balayage placement: the hair below eye level, ramping from PLACEMENT_FLOOR to full toward the
 * lowest hair; short hair that ends above the eyes gets the lower part of its own height instead. */
export function autoPlacement(source) {
    const ok = usable(source);
    if (!ok)
        return null;
    const { w, h, hair } = ok, f = source.face;
    let top = h, bottom = -1;
    for (let i = 0; i < w * h; i++)
        if (hair[i] >= 0.5) {
            const y = (i / w) | 0;
            top = Math.min(top, y);
            bottom = Math.max(bottom, y);
        }
    if (bottom < 0)
        return null;
    const eyes = (f[RIGHT_EYE][1] + f[LEFT_EYE][1]) / 2;
    const start = bottom > eyes + 0.05 * h ? eyes : top + PLACEMENT_START * (bottom - top);
    const span = Math.max(1, bottom - start), data = new Float32Array(w * h);
    let n = 0;
    for (let y = Math.max(0, Math.ceil(start)); y <= bottom; y++)
        for (let x = 0; x < w; x++) {
            const i = y * w + x;
            if (hair[i] >= 0.5) {
                data[i] = Math.min(1, PLACEMENT_FLOOR + (1 - PLACEMENT_FLOOR) * (y - start) / span);
                n++;
            }
        }
    return enough(n, w, h) ? { width: w, height: h, channels: 1, data } : null;
}
//# sourceMappingURL=auto-hair.js.map