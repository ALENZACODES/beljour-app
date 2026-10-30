/** The reshape brush: push, bloat, pinch and restore, with Freeze to protect an area, behind the
 * same identity guard the face shape tools use.
 *
 * The strokes build one backward displacement field D (output pixel p reads the photo at p + D(p)),
 * dab by dab and in stroke order, so a later dab moves what the earlier ones made:
 *   push     content follows the drag:          D(p) = u + D(p + u), u = -a * drag
 *   bloat    content swells from the dab centre: u = -RATE * a * (p - c)
 *   pinch    content draws toward it:           u = +RATE * a * (p - c)
 *   restore  the field goes back toward none:   D(p) = (1 - s) * D(p)
 *   freeze   adds to a protect mask F (s, as paint), and every later stroke is weighted by (1 - F);
 *            the eraser thaws.
 * where a is a dab's flow x pressure x falloff x stroke opacity, and s is a whole stroke's
 * coverage as the paint brushes build it (mask.ts), so Restore at 50% opacity takes back half.
 * Then the guard, in this order:
 *   1. eyes and teeth (from face points, when the photo has them) move only as a whole: inside each
 *      eye and the mouth opening the field is its mean, so their shape cannot be pulled out of true;
 *   2. no pixel moves more than MAX_IOD_SHARE of the eye distance (the face shape tools' cap);
 *   3. the warp at the layer's strength must stay fold-free (the warp engine's Jacobian check,
 *      Q3 > 0.2), or its strength is backed off by bisection until it is.
 * A pixel the field leaves in place keeps its exact bytes, so Restore over everything gives the
 * photo back exactly. Author: John Khan.
 */
import { requireColour } from "../../engines/core/buffer.js";
import { blur, dilate } from "../../engines/core/mask.js";
import { regionMask } from "../../data/regions/index.js";
import { faceFrame, MAX_IOD_SHARE } from "../../engines/shape/geometry.js";
import { apply, identity } from "../../engines/warp/field.js";
import { safeStrength } from "../../engines/warp/fold.js";
import { dabs, falloff, strokeCoverage } from "./mask.js";
/** Bloat and pinch move pixels by this share of their distance to the dab centre per full dab; ASSUMED. */
export const RATE = 0.06;
/** The face parts kept rigid. */
export const RIGID_PARTS = ["right_eye", "left_eye", "mouth_opening"];
/** How far past each rigid part its rigid zone reaches, and its soft edge, as shares of the eye distance; ASSUMED. */
export const RIGID_REACH_IOD = 0.04, RIGID_SOFT_IOD = 0.04;
function sample(plane, width, height, x, y) {
    const cx = Math.min(width - 1, Math.max(0, x)), cy = Math.min(height - 1, Math.max(0, y));
    const x0 = Math.floor(cx), y0 = Math.floor(cy), x1 = Math.min(width - 1, x0 + 1), y1 = Math.min(height - 1, y0 + 1);
    const fx = cx - x0, fy = cy - y0;
    const top = plane[y0 * width + x0] * (1 - fx) + plane[y0 * width + x1] * fx;
    const bottom = plane[y1 * width + x0] * (1 - fx) + plane[y1 * width + x1] * fx;
    return top * (1 - fy) + bottom * fy;
}
/** One moving dab: every pixel inside it reads D at p + u(p). */
function moveDab(f, width, height, dab, hardness, opacity, offset, reach) {
    const x0 = Math.max(0, Math.floor(dab.x - dab.radius)), x1 = Math.min(width - 1, Math.ceil(dab.x + dab.radius));
    const y0 = Math.max(0, Math.floor(dab.y - dab.radius)), y1 = Math.min(height - 1, Math.ceil(dab.y + dab.radius));
    // Reads may reach `reach` pixels past the dab, so they come from a copy taken before this dab.
    const m = Math.ceil(reach) + 2;
    const bx0 = Math.max(0, x0 - m), by0 = Math.max(0, y0 - m), bx1 = Math.min(width - 1, x1 + m), by1 = Math.min(height - 1, y1 + m);
    const bw = bx1 - bx0 + 1, bh = by1 - by0 + 1;
    const ox = new Float64Array(bw * bh), oy = new Float64Array(bw * bh);
    for (let y = 0; y < bh; y++)
        for (let x = 0; x < bw; x++) {
            ox[y * bw + x] = f.dx[(y + by0) * width + x + bx0];
            oy[y * bw + x] = f.dy[(y + by0) * width + x + bx0];
        }
    for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
            const t = Math.hypot(x - dab.x, y - dab.y) / dab.radius;
            if (t >= 1)
                continue;
            const i = y * width + x;
            const a = dab.alpha * falloff(t, hardness) * opacity * (1 - f.freeze[i]);
            if (!(a > 0))
                continue;
            const [ux, uy] = offset(x, y, a);
            const qx = x + ux - bx0, qy = y + uy - by0;
            f.dx[i] = ux + sample(ox, bw, bh, qx, qy);
            f.dy[i] = uy + sample(oy, bw, bh, qx, qy);
        }
}
/** The displacement field and freeze mask the strokes build, before the guard. */
export function strokeField(strokes, width, height) {
    const f = { dx: new Float64Array(width * height), dy: new Float64Array(width * height), freeze: new Float32Array(width * height) };
    for (const stroke of strokes) {
        const list = dabs(stroke, width, height);
        if (stroke.mode === "freeze" || stroke.mode === "erase" || stroke.mode === "restore") {
            // These work like paint: the stroke's own coverage (built up, capped by its opacity), once.
            const cover = strokeCoverage(stroke, width, height);
            for (let i = 0; i < cover.length; i++) {
                const s = cover[i];
                if (!(s > 0))
                    continue;
                if (stroke.mode === "freeze")
                    f.freeze[i] += s * (1 - f.freeze[i]);
                else if (stroke.mode === "erase")
                    f.freeze[i] *= 1 - s;
                else {
                    const a = s * (1 - f.freeze[i]);
                    f.dx[i] *= 1 - a;
                    f.dy[i] *= 1 - a;
                }
            }
            continue;
        }
        if (stroke.mode === "push") {
            for (let k = 1; k < list.length; k++) {
                const vx = list[k].x - list[k - 1].x, vy = list[k].y - list[k - 1].y;
                moveDab(f, width, height, list[k], stroke.hardness, stroke.opacity, (_x, _y, a) => [-a * vx, -a * vy], Math.hypot(vx, vy));
            }
            continue;
        }
        if (stroke.mode === "bloat" || stroke.mode === "pinch") {
            const sign = stroke.mode === "bloat" ? -1 : 1;
            for (const dab of list) {
                moveDab(f, width, height, dab, stroke.hardness, stroke.opacity, (x, y, a) => [sign * RATE * a * (x - dab.x), sign * RATE * a * (y - dab.y)], RATE * dab.radius);
            }
            continue;
        }
        throw new RangeError(`${stroke.mode} is not a reshape stroke`);
    }
    return f;
}
const RIGID_CACHE = new WeakMap();
/** Each rigid part's zone on a photo of this size (kept per face and size: they cost a full-size region raster). */
export function rigidZones(face, width, height) {
    const key = `${width}x${height}`;
    const known = RIGID_CACHE.get(face)?.get(key);
    if (known)
        return known;
    const iod = faceFrame(face).iod;
    const zones = RIGID_PARTS.map((name) => {
        const part = regionMask(name, face, width, height, { normalized: false, supersample: 2 });
        const core = dilate(part, Math.max(1, Math.round(RIGID_REACH_IOD * iod)));
        const soft = blur(core, Math.max(1, Math.round(RIGID_SOFT_IOD * iod)));
        const weight = new Float32Array(width * height), on = new Uint8Array(width * height);
        let x0 = width, y0 = height, x1 = -1, y1 = -1;
        for (let i = 0; i < weight.length; i++) {
            weight[i] = Math.max(core.data[i], soft.data[i]);
            on[i] = core.data[i] > 0 ? 1 : 0;
            if (weight[i] > 0) {
                const x = i % width, y = (i - x) / width;
                x0 = Math.min(x0, x);
                x1 = Math.max(x1, x);
                y0 = Math.min(y0, y);
                y1 = Math.max(y1, y);
            }
        }
        return { core: on, weight, box: [x0, y0, x1, y1] };
    });
    const byFace = RIGID_CACHE.get(face) ?? new Map();
    byFace.set(key, zones);
    RIGID_CACHE.set(face, byFace);
    return zones;
}
/** Guard 1: each eye and the mouth opening moves only as a whole (its mean move). Returns how
 * many parts the strokes reached and it held. */
export function holdRigid(f, width, height, face) {
    if (face?.length !== 478)
        return 0;
    let held = 0;
    for (const zone of rigidZones(face, width, height)) {
        const [x0, y0, x1, y1] = zone.box;
        if (x1 < 0)
            continue;
        let sw = 0, sx = 0, sy = 0, moved = false;
        for (let y = y0; y <= y1; y++)
            for (let x = x0; x <= x1; x++) {
                const i = y * width + x;
                if (zone.weight[i] > 0 && (f.dx[i] !== 0 || f.dy[i] !== 0))
                    moved = true;
                if (zone.core[i]) {
                    sw++;
                    sx += f.dx[i];
                    sy += f.dy[i];
                }
            }
        if (!moved || !sw)
            continue;
        held++;
        const mx = sx / sw, my = sy / sw;
        for (let y = y0; y <= y1; y++)
            for (let x = x0; x <= x1; x++) {
                const i = y * width + x, z = zone.weight[i];
                const zf = z * (1 - f.freeze[i]);
                if (zf > 0) {
                    f.dx[i] += zf * (mx - f.dx[i]);
                    f.dy[i] += zf * (my - f.dy[i]);
                }
            }
    }
    return held;
}
/** Guard 2: no move longer than `cap` pixels. Returns how many pixels it shortened. */
export function capMoves(f, cap) {
    let capped = 0;
    for (let i = 0; i < f.dx.length; i++) {
        const m = Math.hypot(f.dx[i], f.dy[i]);
        if (m > cap) {
            const s = cap / m;
            f.dx[i] *= s;
            f.dy[i] *= s;
            capped++;
        }
    }
    return capped;
}
/** Bounding box of the pixels the field moves, or null. */
export function movedBox(f, width) {
    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
    for (let i = 0; i < f.dx.length; i++) {
        if (f.dx[i] === 0 && f.dy[i] === 0)
            continue;
        const x = i % width, y = (i - x) / width;
        if (x < x0)
            x0 = x;
        if (x > x1)
            x1 = x;
        if (y < y0)
            y0 = y;
        if (y > y1)
            y1 = y;
    }
    return x1 < 0 ? null : [x0, y0, x1, y1];
}
/** The reshape layer's picture: strokes, guard, warp. The warp runs on the moved area plus the
 * cap (a pixel reads at most `cap` away), so its cost follows what was painted. */
export function reshape(img, strokes, options) {
    requireColour(img);
    const { width, height } = img;
    if (!(options.amount >= 0 && options.amount <= 1))
        throw new RangeError("amount must be 0 to 1");
    const iod = options.face?.length === 478 ? faceFrame(options.face).iod : options.fallbackIod;
    const cap = MAX_IOD_SHARE * iod;
    const f = strokeField(strokes, width, height);
    const rigid = holdRigid(f, width, height, options.face);
    const capped = capMoves(f, cap);
    const out = rgbCopy(img);
    const metrics = { max_move_px: 0, cap_px: cap, capped_pixels: capped, rigid_parts: rigid, strength_used: 1, guard_reduced: false };
    const box = movedBox(f, width);
    if (!box || options.amount === 0)
        return { image: { width, height, channels: 3, data: out }, dx: f.dx, dy: f.dy, share: 0, metrics };
    const m = Math.ceil(cap) + 2;
    const cx0 = Math.max(0, box[0] - m), cy0 = Math.max(0, box[1] - m), cx1 = Math.min(width - 1, box[2] + m), cy1 = Math.min(height - 1, box[3] + m);
    const cw = cx1 - cx0 + 1, chh = cy1 - cy0 + 1;
    const build = (share) => {
        const field = identity(cw, chh);
        for (let y = 0; y < chh; y++)
            for (let x = 0; x < cw; x++) {
                const g = (y + cy0) * width + x + cx0, l = y * cw + x;
                field.mapX.data[l] += share * f.dx[g];
                field.mapY.data[l] += share * f.dy[g];
            }
        return field;
    };
    const guarded = safeStrength((s) => build(s * options.amount), { requested: 1 });
    const share = guarded.strength * options.amount;
    const crop = new Uint8Array(cw * chh * 3);
    for (let y = 0; y < chh; y++)
        crop.set(out.subarray(((y + cy0) * width + cx0) * 3, ((y + cy0) * width + cx1 + 1) * 3), y * cw * 3);
    const warped = apply({ width: cw, height: chh, channels: 3, data: crop }, guarded.field);
    let maxMove = 0;
    for (let y = 0; y < chh; y++)
        for (let x = 0; x < cw; x++) {
            const g = (y + cy0) * width + x + cx0, l = y * cw + x;
            if (share === 0 || (f.dx[g] === 0 && f.dy[g] === 0))
                continue;
            maxMove = Math.max(maxMove, share * Math.hypot(f.dx[g], f.dy[g]));
            for (let c = 0; c < 3; c++)
                out[g * 3 + c] = warped.data[l * warped.channels + c];
        }
    return { image: { width, height, channels: 3, data: out }, dx: f.dx, dy: f.dy, share,
        metrics: { ...metrics, max_move_px: maxMove, strength_used: guarded.strength, guard_reduced: guarded.reduced } };
}
function rgbCopy(img) {
    if (img.channels === 3)
        return Uint8Array.from(img.data);
    const out = new Uint8Array(img.width * img.height * 3);
    for (let i = 0; i < img.width * img.height; i++)
        for (let c = 0; c < 3; c++)
            out[i * 3 + c] = img.data[i * 4 + c];
    return out;
}
//# sourceMappingURL=reshape.js.map