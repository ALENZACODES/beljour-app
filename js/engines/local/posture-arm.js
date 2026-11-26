/**
 * The near arm as its own layer for side-view posture edits (Author: John Khan).
 *
 * A trunk or pelvis move must not drag the arm with it: the hand stayed on the rotated thigh and the forearm bent
 * with the waist. The arm is found from the shoulder, elbow, wrist and hand points (capsules along the bones, a
 * little wider than an adult limb) refined by colour where the arm differs from what lies behind it (skin over a
 * shirt or trousers); a sleeve the colour of the shirt keeps the capsule outline. The body under the arm is
 * rebuilt from the person's own clothing (PatchMatch over the visible body only), the body is moved, and the arm
 * goes back on top, moved rigidly with the shoulder it hangs from (or not at all when the shoulder stays).
 * Face and body mapping: concept only, no code copied, after MediaPipe Pose Landmarker (body landmarks as the joint points).
 */
import { floatImage } from "../core/buffer.js";
import { dilate, erode } from "../core/mask.js";
import { patchMatch } from "../fill/patchmatch.js";
/** Capsule radii as shares of the torso (shoulder to hip): upper arm, forearm, hand; the hand runs a little past
 * its point. Colour decides only between CORE and OUTER times the radius. */
export const ARM_RADIUS = [0.085, 0.065, 0.075], HAND_REACH = 0.05, ARM_CORE = 0.7, ARM_OUTER = 1.35;
/** The top of the upper arm joins the shoulder: its weight ramps in over this share of the shoulder-elbow bone. */
export const ARM_TOP_RAMP = 0.3;
/** Colours this far apart (RGB distance) count as different, so colour may trim the capsule. */
export const ARM_COLOUR_GAP = 28;
function bones(points, torso) {
    const { shoulder, elbow, wrist, hand } = points;
    if (!shoulder || !elbow || !wrist)
        return null;
    const out = [{ a: shoulder, b: elbow, r: ARM_RADIUS[0] * torso, top: true }, { a: elbow, b: wrist, r: ARM_RADIUS[1] * torso, top: false }];
    const tip = hand ?? [wrist[0] + (wrist[0] - elbow[0]) * 0.35, wrist[1] + (wrist[1] - elbow[1]) * 0.35];
    const len = Math.hypot(tip[0] - wrist[0], tip[1] - wrist[1]) || 1;
    const end = [tip[0] + (tip[0] - wrist[0]) / len * HAND_REACH * torso, tip[1] + (tip[1] - wrist[1]) / len * HAND_REACH * torso];
    out.push({ a: wrist, b: end, r: ARM_RADIUS[2] * torso, top: false });
    return out;
}
/** Distance (in radii) from a pixel to a bone, the position along it (0..1) and the bone's top weight. */
function nearest(x, y, bs) {
    let best = { d: Infinity, k: -1, t: 0, w: 1 };
    bs.forEach((b, k) => {
        const vx = b.b[0] - b.a[0], vy = b.b[1] - b.a[1], L2 = vx * vx + vy * vy || 1;
        const t = Math.max(0, Math.min(1, ((x - b.a[0]) * vx + (y - b.a[1]) * vy) / L2));
        const d = Math.hypot(x - b.a[0] - t * vx, y - b.a[1] - t * vy) / b.r;
        if (d < best.d) {
            const u = b.top ? Math.min(1, t / ARM_TOP_RAMP) : 1;
            best = { d, k, t, w: u * u * (3 - 2 * u) };
        }
    });
    return best;
}
/** Soft arm matte (0..1, inside the person matte), or null when the arm points are missing. */
export function armMatte(image, matte, points, torso) {
    const bs = bones(points, torso);
    if (!bs)
        return null;
    const W = image.width, H = image.height, ch = image.channels, n = W * H;
    let x0 = W, y0 = H, x1 = 0, y1 = 0;
    for (const b of bs)
        for (const p of [b.a, b.b]) {
            const m = b.r * ARM_OUTER * 1.5;
            x0 = Math.min(x0, p[0] - m);
            x1 = Math.max(x1, p[0] + m);
            y0 = Math.min(y0, p[1] - m);
            y1 = Math.max(y1, p[1] + m);
        }
    const X0 = Math.max(0, Math.floor(x0)), X1 = Math.min(W - 1, Math.ceil(x1)), Y0 = Math.max(0, Math.floor(y0)), Y1 = Math.min(H - 1, Math.ceil(y1));
    // Per bone and per eighth along it: mean colour of the arm core and of the body just outside the capsule.
    const BINS = 8, sums = new Float64Array(bs.length * BINS * 2 * 4);
    const info = new Map();
    for (let y = Y0; y <= Y1; y++)
        for (let x = X0; x <= X1; x++) {
            const i = y * W + x, q = nearest(x, y, bs);
            if (q.d > ARM_OUTER * 1.5)
                continue;
            info.set(i, q);
            if (!(matte[i] >= 0.9))
                continue;
            const side = q.d <= ARM_CORE * 0.8 ? 0 : q.d >= ARM_OUTER * 1.1 ? 1 : -1;
            if (side < 0)
                continue;
            const s = ((q.k * BINS + Math.min(BINS - 1, Math.floor(q.t * BINS))) * 2 + side) * 4;
            for (let c = 0; c < 3; c++)
                sums[s + c] += image.data[i * ch + c];
            sums[s + 3]++;
        }
    const mean = (k, bin, side) => {
        const s = ((k * BINS + bin) * 2 + side) * 4;
        return sums[s + 3] >= 6 ? [sums[s] / sums[s + 3], sums[s + 1] / sums[s + 3], sums[s + 2] / sums[s + 3]] : null;
    };
    const out = new Float32Array(n);
    for (const [i, q] of info) {
        const bin = Math.min(BINS - 1, Math.floor(q.t * BINS));
        let geo = q.d <= ARM_CORE ? 1 : q.d >= ARM_OUTER ? 0 : 1 - (q.d - ARM_CORE) / (ARM_OUTER - ARM_CORE);
        const a = mean(q.k, bin, 0), b = mean(q.k, bin, 1);
        if (a && b && Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) >= ARM_COLOUR_GAP) {
            // Colour: nearer the arm's own colour than the colour behind it.
            const p = [image.data[i * ch], image.data[i * ch + 1], image.data[i * ch + 2]];
            const da = Math.hypot(p[0] - a[0], p[1] - a[1], p[2] - a[2]), db = Math.hypot(p[0] - b[0], p[1] - b[1], p[2] - b[2]);
            const share = Math.min(1, Math.max(0, 0.5 + (db - da) / (da + db + 1e-6) * 2));
            geo = q.d <= ARM_OUTER ? share : 0;
        }
        out[i] = Math.min(1, Math.max(0, geo * q.w * matte[i]));
    }
    // One pass of a 3x3 mean softens the colour decision's speckle.
    const soft = new Float32Array(n);
    for (let y = Y0; y <= Y1; y++)
        for (let x = X0; x <= X1; x++) {
            let s = 0, k = 0;
            for (let dy = -1; dy <= 1; dy++)
                for (let dx = -1; dx <= 1; dx++) {
                    const yy = y + dy, xx = x + dx;
                    if (yy < 0 || yy >= H || xx < 0 || xx >= W)
                        continue;
                    s += out[yy * W + xx];
                    k++;
                }
            soft[y * W + x] = s / k;
        }
    return soft;
}
/** Where the body continues behind the arm: the body without the arm, closed over gaps up to the arm's width,
 * inside the arm's own area. Arm parts against the background (an elbow or hand past the outline) stay out. */
export function bodyBehindArm(matte, arm, W, H, torso) {
    const body = floatImage(W, H, 1), area = floatImage(W, H, 1);
    for (let i = 0; i < W * H; i++) {
        body.data[i] = matte[i] >= 0.5 && arm[i] < 0.5 ? 1 : 0;
        area.data[i] = arm[i] > 0.02 ? 1 : 0;
    }
    const r = Math.max(2, Math.round(ARM_RADIUS[0] * torso * 1.3));
    const closed = erode(dilate(body, r), r), grown = dilate(area, 2);
    const out = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++)
        out[i] = grown.data[i] > 0 && closed.data[i] >= 0.5 ? 1 : 0;
    return out;
}
/** The image with the arm replaced by the body behind it (the person's own visible clothing, PatchMatch). */
export function removeArm(image, matte, arm, behind, seed = 1) {
    const W = image.width, H = image.height, n = W * H;
    const holeSeed = floatImage(W, H, 1);
    for (let i = 0; i < n; i++)
        if (arm[i] > 0.02)
            holeSeed.data[i] = 1;
    const hole = dilate(holeSeed, 2), source = floatImage(W, H, 1);
    const away = dilate(holeSeed, 4);
    let allowed = 0;
    for (let i = 0; i < n; i++)
        if (matte[i] >= 0.98 && !(away.data[i] > 0)) {
            source.data[i] = 1;
            allowed++;
        }
    const replaced = new Uint8Array(n);
    if (allowed < 64)
        return { image: { ...image, data: Uint8Array.from(image.data) }, replaced };
    const filled = patchMatch(image, hole, { patchRadius: 4, iterations: 6, seed, sourceMask: source }).image;
    // Outside the body (arm against the background) keep the photo; the plate rebuilds that area anyway.
    const out = { ...image, data: Uint8Array.from(image.data) };
    for (let i = 0; i < n; i++)
        if (hole.data[i] > 0 && behind[i] > 0) {
            replaced[i] = 1;
            for (let c = 0; c < image.channels; c++)
                out.data[i * image.channels + c] = filled.data[i * image.channels + c];
        }
    return { image: out, replaced };
}
/** Where the field puts a source point: the output point whose backward map reads it (a few fixed-point steps). */
export function forwardPoint(field, p) {
    const { width: W, height: H } = field;
    let q = [p[0], p[1]];
    for (let k = 0; k < 8; k++) {
        const x = Math.min(W - 1, Math.max(0, Math.round(q[0]))), y = Math.min(H - 1, Math.max(0, Math.round(q[1])));
        const i = y * W + x;
        q = [q[0] + (p[0] - field.mapX.data[i]), q[1] + (p[1] - field.mapY.data[i])];
    }
    return q;
}
//# sourceMappingURL=posture-arm.js.map