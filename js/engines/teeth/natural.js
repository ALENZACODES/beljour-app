/** #31 Teeth whitening with a natural cap, local, from the face mesh. Mirrors
 * api/plumb_api/engines/teeth/natural.py, including its enamel finder (teeth/enamel.py) and
 * mouth observation (teeth/mouth_state.py), in the same order: mesh refusal, mouth must be
 * open, enamel inside the mouth opening only (gaps, tongue, gums and lips never change),
 * L* lifted by at most MAX_LIFT and never above NATURAL_L_CAP, b* lowered toward WARM_B and
 * never below it, rounding nudges then a restore, alpha copied, strength 0 an exact copy.
 * Cap, lift and floor are ASSUMED. Never calls a provider. Optical colour simulation only.
 * Author: John Khan.
 */
import { regionMask } from "../../data/regions/index.js";
import { labToSrgb, srgbToLab, toByte } from "../shade/colourspace.js";
import { median, xy } from "../skin/common.js";
import { meshProblems, REASONS } from "../skin/studio.js";
export const MODULE = "teeth.natural";
export const LABEL = "Teeth colour simulation with a natural cap, not dental treatment or a whitening prediction.";
export const NATURAL_L_CAP = 86.0, MAX_LIFT = 10.0, WARM_B = 9.0, MAX_B_DROP = 8.0;
export const MIN_OPENING_PIXELS = 8, ROUNDING_PASSES = 4, ROUNDING_STEP = 0.5, CLOSED_GAP_RATIO = 0.04;
export const MESSAGES = Object.freeze({
    mouth_closed: "The mouth is closed in this photo, so there are no teeth to whiten.",
    opening_too_small: "The open part of the mouth is too small in this photo.",
    no_teeth_visible: "No teeth are visible inside the open mouth, so nothing was changed.",
});
export function isTeethRefusal(value) {
    return value.refused === true;
}
/** NumPy's default (linear) percentile. */
export function percentile(values, q) {
    const s = [...values].sort((a, b) => a - b), at = (s.length - 1) * q / 100, lo = Math.floor(at);
    return lo + 1 < s.length ? s[lo] + (s[lo + 1] - s[lo]) * (at - lo) : s[lo];
}
/** Inner-lip gap over mouth width (mouth_state.observe). */
export function mouthGapRatio(points) {
    const [ux, uy] = xy(points[13]), [lx, ly] = xy(points[14]), [ax, ay] = xy(points[61]), [bx, by] = xy(points[291]);
    const sx = bx - ax, sy = by - ay, width = Math.hypot(sx, sy);
    if (!(width > 1e-9))
        throw new RangeError("mouth observation requires a measurable lip width");
    return Math.abs(sx * (ly - uy) - sy * (lx - ux)) / width / width;
}
/** ASSUMED, as enamel.OCCLUDER_DE: an opening pixel matches a colour seen just outside the mouth. */
export const OCCLUDER_DE = 4.0;
const oralTissue = (image, lab, i) => {
    const r = Number(image.data[i * image.channels]), g = Number(image.data[i * image.channels + 1]);
    return lab[i][1] - lab[i][2] > 12 && r - g > Math.max(18, r * 0.29);
};
/** The finder's lip ring: offsets (dy, dx) in -3..0 with (dy+3)^2 + (dx+3)^2 <= 9, minus the inside. */
function lipRing(valid, w, h) {
    const ring = [];
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            const i = y * w + x;
            if (valid[i])
                continue;
            let hit = false;
            for (let oy = 0; oy <= 3 && !hit; oy++)
                for (let ox = 0; ox <= 3 && !hit; ox++) {
                    if (ox * ox + oy * oy > 9)
                        continue;
                    const yy = y + oy - 3, xx = x + ox - 3;
                    if (yy >= 0 && xx >= 0 && valid[yy * w + xx])
                        hit = true;
                }
            if (hit)
                ring.push(i);
        }
    return ring;
}
/** enamel.occluder: opening pixels of something crossing the mouth's edge (a hand, a finger),
 * of a colour seen in the lip ring and reached from the opening's edge through that colour
 * (4-neighbour); never red oral tissue. Returns the occluder and the ring pixels of its colour. */
export function occluder(image, lab, valid, ring) {
    const { width: w, height: h } = image, n = w * h;
    const covered = new Uint8Array(n), ringMatch = new Uint8Array(n);
    if (!ring.length)
        return { covered, ringMatch };
    const lim = OCCLUDER_DE * OCCLUDER_DE;
    const d2 = (i, j) => (lab[i][0] - lab[j][0]) ** 2 + (lab[i][1] - lab[j][1]) ** 2 + (lab[i][2] - lab[j][2]) ** 2;
    const near = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
        if (!valid[i] || oralTissue(image, lab, i))
            continue;
        for (const j of ring)
            if (d2(i, j) <= lim) {
                near[i] = 1;
                break;
            }
    }
    const neighbours = (i) => {
        const x = i % w, y = (i - x) / w, out = [];
        if (y > 0)
            out.push(i - w);
        if (y < h - 1)
            out.push(i + w);
        if (x > 0)
            out.push(i - 1);
        if (x < w - 1)
            out.push(i + 1);
        return out;
    };
    const queue = [];
    for (let i = 0; i < n; i++) {
        if (!near[i])
            continue;
        if (neighbours(i).some((j) => !valid[j])) {
            covered[i] = 1;
            queue.push(i);
        }
    }
    while (queue.length)
        for (const j of neighbours(queue.pop()))
            if (near[j] && !covered[j]) {
                covered[j] = 1;
                queue.push(j);
            }
    const reached = [];
    for (let i = 0; i < n; i++)
        if (covered[i])
            reached.push(i);
    if (reached.length)
        for (const j of ring)
            if (reached.some((i) => d2(i, j) <= lim))
                ringMatch[j] = 1;
    return { covered, ringMatch };
}
/** enamel.find_enamel: conservative enamel candidates inside the opening, as a 0/1 mask. */
export function findEnamel(image, lab, opening) {
    const { width: w, height: h } = image, n = w * h, blank = new Uint8Array(n);
    const valid = new Uint8Array(n);
    for (let i = 0; i < n; i++)
        if (opening[i] >= 0.5)
            valid[i] = 1;
    const rim = lipRing(valid, w, h);
    const { covered, ringMatch } = occluder(image, lab, valid, rim);
    const inside = [];
    for (let i = 0; i < n; i++) {
        if (covered[i])
            valid[i] = 0;
        if (valid[i])
            inside.push(i);
    }
    if (inside.length < 8)
        return blank;
    const lightness = inside.map(i => lab[i][0]);
    const [l20, l35, l85] = [20, 35, 85].map(q => percentile(lightness, q));
    const contrast = l85 - l20;
    if (contrast < 5.0)
        return blank;
    const ring = rim.filter((i) => !ringMatch[i]).map((i) => lab[i][0]);
    let floor = l35 + Math.max(4.0, 0.17 * contrast);
    if (ring.length)
        floor = Math.max(floor, median(ring) + 1.0);
    const firstRow = Math.floor(inside[0] / w), lastRow = Math.floor(inside[inside.length - 1] / w);
    const upperEnd = Math.trunc(firstRow + 0.82 * (lastRow - firstRow + 1));
    const bright = inside.filter(i => Math.floor(i / w) < upperEnd && lab[i][0] >= floor);
    if (!bright.length)
        return blank;
    const clip = (v) => Math.min(16, Math.max(-16, v));
    const ref = [clip(median(bright.map(i => lab[i][1]))), clip(median(bright.map(i => lab[i][2])))];
    const chroma = (i) => Math.hypot(lab[i][1], lab[i][2]);
    const limit = Math.max(13, Math.min(52, percentile(inside.map(chroma), 35) + 23, percentile(bright.map(chroma), 65) + 12));
    const out = new Uint8Array(n);
    let count = 0;
    for (const i of bright) {
        if (Math.hypot(lab[i][1] - ref[0], lab[i][2] - ref[1]) <= limit && !oralTissue(image, lab, i)) {
            out[i] = 1;
            count++;
        }
    }
    return count >= Math.max(8, Math.ceil(inside.length * 0.018)) ? out : blank;
}
export function whitenTeeth(image, points, strength = 30) {
    const { width: w, height: h, channels: ch } = image;
    if (!Number.isInteger(w) || !Number.isInteger(h) || Math.min(w, h) < 8 || (ch !== 3 && ch !== 4) || image.data.length !== w * h * ch) {
        throw new RangeError("teeth whitening needs an RGB or RGBA photo of at least 8 x 8");
    }
    if (!Number.isFinite(strength) || strength < 0 || strength > 100)
        throw new RangeError("strength must be 0..100");
    const refuse = (code) => ({ refused: true, module: MODULE, code, message: MESSAGES[code] ?? REASONS[code] });
    const problems = meshProblems(points, w, h);
    if (problems.length)
        return refuse(problems[0]);
    const pts = points.map(xy);
    const gap = mouthGapRatio(pts);
    if (gap < CLOSED_GAP_RATIO)
        return refuse("mouth_closed");
    const opening = regionMask("mouth_opening", pts, w, h, { normalized: false }).data;
    let open = 0;
    for (const v of opening)
        if (v >= 0.5)
            open++;
    if (open < MIN_OPENING_PIXELS)
        return refuse("opening_too_small");
    const n = w * h, lab = new Array(n);
    for (let i = 0; i < n; i++)
        lab[i] = srgbToLab([Number(image.data[i * ch]), Number(image.data[i * ch + 1]), Number(image.data[i * ch + 2])]);
    const selected = findEnamel(image, lab, opening);
    const teeth = [];
    for (let i = 0; i < n; i++)
        if (selected[i])
            teeth.push(i);
    if (!teeth.length)
        return refuse("no_teeth_visible");
    const metrics = { teeth_pixels: teeth.length, gap_ratio: Math.round(gap * 1e4) / 1e4,
        natural_l_cap: NATURAL_L_CAP, warm_b_floor: WARM_B };
    const out = Uint8Array.from(image.data), weight = new Float64Array(n);
    if (strength === 0)
        return { image: out, weight, label: LABEL, metrics: { ...metrics, unchanged: true } };
    const amount = strength / 100, bytes = (v) => labToSrgb(v).map(toByte);
    let restored = 0, lift = 0, maxL = -Infinity;
    for (const i of teeth) {
        const [l, a, b] = lab[i];
        const target = [l + amount * Math.min(MAX_LIFT, Math.max(0, NATURAL_L_CAP - l)), a, b - amount * Math.min(MAX_B_DROP, Math.max(0, b - WARM_B))];
        const ceiling = Math.max(l, NATURAL_L_CAP), floor = Math.min(b, WARM_B);
        let rgb = bytes(target), after = srgbToLab(rgb);
        for (let pass = 0; pass < ROUNDING_PASSES && (after[0] > ceiling || after[2] < floor); pass++) {
            if (after[0] > ceiling)
                target[0] -= ROUNDING_STEP;
            if (after[2] < floor)
                target[2] += ROUNDING_STEP;
            rgb = bytes(target);
            after = srgbToLab(rgb);
        }
        weight[i] = amount;
        if (after[0] > ceiling || after[2] < floor) {
            restored++;
            maxL = Math.max(maxL, l);
            continue;
        }
        for (let c = 0; c < 3; c++)
            out[i * ch + c] = rgb[c];
        lift += after[0] - l;
        maxL = Math.max(maxL, after[0]);
    }
    Object.assign(metrics, { restored_pixels: restored, mean_lift: Math.round(lift / teeth.length * 1e3) / 1e3,
        max_l_after: Math.round(maxL * 1e3) / 1e3 });
    return { image: out, weight, label: LABEL, metrics };
}
//# sourceMappingURL=natural.js.map