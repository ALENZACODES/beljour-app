import { boxMean } from "../engines/core/filters.js";
import { pixelLab } from "../engines/core/colour.js";
import { dilate } from "../engines/core/mask.js";
export const CONTRAST_MIN = 3.0;
export const RELATIVE_MIN = 0.07;
export const KEPT_SHARE = 0.5;
export const MARKS_KEPT_MIN = 0.7;
export const LIGHTEN_DL = 2.5;
export const MAX_MARKS = 400;
function plane(width, height) {
    return { width, height, channels: 1, data: new Float64Array(width * height) };
}
export function luma(img) {
    const out = plane(img.width, img.height);
    const ch = img.channels;
    for (let i = 0, p = 0; i < out.data.length; i++, p += ch) {
        out.data[i] = img.data[p] * 0.2126 + img.data[p + 1] * 0.7152 + img.data[p + 2] * 0.0722;
    }
    return out;
}
/** Python's round(): halves go to the even neighbour. */
export function roundHalfEven(v) {
    const f = Math.floor(v), d = v - f;
    if (d > 0.5)
        return f + 1;
    if (d < 0.5)
        return f;
    return f % 2 === 0 ? f : f + 1;
}
export function localContrast(img, iod, relative = false) {
    const y = luma(img);
    const radius = Math.max(2, roundHalfEven(iod / 12));
    const surround = boxMean(y, radius), smooth = boxMean(y, 1);
    const out = plane(img.width, img.height);
    for (let i = 0; i < out.data.length; i++) {
        const con = surround.data[i] - smooth.data[i];
        out.data[i] = relative ? con / Math.max(surround.data[i], 8) : con;
    }
    return out;
}
/** 4-connected components of `on`, scanned in row order (as marks.py does). */
export function components(on, width, height) {
    const left = on.slice();
    const out = [];
    for (let start = 0; start < left.length; start++) {
        if (!left[start])
            continue;
        left[start] = 0;
        const stack = [start], members = [];
        while (stack.length) {
            const p = stack.pop();
            members.push(p);
            const r = Math.floor(p / width), c = p - r * width;
            const near = [[p - width, r > 0], [p + width, r < height - 1], [p - 1, c > 0], [p + 1, c < width - 1]];
            for (const [q, ok] of near)
                if (ok && left[q]) {
                    left[q] = 0;
                    stack.push(q);
                }
        }
        out.push(members);
    }
    return out;
}
export function findMarks(img, skin, iod) {
    if (!(iod > 0))
        throw new RangeError("inter-ocular distance must be positive");
    const { width: w, height: h } = img;
    const con = localContrast(img, iod), rel = localContrast(img, iod, true);
    const on = new Uint8Array(w * h);
    for (let i = 0; i < on.length; i++)
        on[i] = con.data[i] >= CONTRAST_MIN && rel.data[i] >= RELATIVE_MIN && skin.data[i] >= 0.5 ? 1 : 0;
    const lo = (iod / 40) ** 2, hi = (iod / 5) ** 2;
    const marks = [];
    for (const members of components(on, w, h)) {
        const area = members.length;
        if (area < lo || area > hi)
            continue;
        let rmin = Infinity, rmax = -Infinity, cmin = Infinity, cmax = -Infinity, sr = 0, sc = 0, sv = 0;
        for (const p of members) {
            const r = Math.floor(p / w), c = p - r * w;
            rmin = Math.min(rmin, r);
            rmax = Math.max(rmax, r);
            cmin = Math.min(cmin, c);
            cmax = Math.max(cmax, c);
            sr += r;
            sc += c;
            sv += rel.data[p];
        }
        const span = Math.max(rmax - rmin + 1, cmax - cmin + 1);
        if (span * span > 4 * area)
            continue;
        marks.push({ x: sc / area, y: sr / area, radius: Math.sqrt(area / Math.PI), contrast: sv / area, area });
    }
    // stable sort, strongest first, like Python's list.sort(key=-contrast)
    return marks.map((m, i) => [m, i]).sort((a, b) => b[0].contrast - a[0].contrast || a[1] - b[1])
        .map(([m]) => m).slice(0, MAX_MARKS);
}
export function retention(marks, edited, iod) {
    if (!marks.length)
        return { found: 0, kept: 0 };
    const con = localContrast(edited, iod, true);
    const { width: w, height: h } = edited;
    let kept = 0;
    for (const m of marks) {
        const r = Math.max(1, roundHalfEven(m.radius));
        const x0 = Math.max(0, Math.trunc(m.x) - r), x1 = Math.min(w, Math.trunc(m.x) + r + 1);
        const y0 = Math.max(0, Math.trunc(m.y) - r), y1 = Math.min(h, Math.trunc(m.y) + r + 1);
        if (x0 >= x1 || y0 >= y1)
            continue;
        let best = -Infinity;
        for (let y = y0; y < y1; y++)
            for (let x = x0; x < x1; x++)
                best = Math.max(best, con.data[y * w + x]);
        if (best >= KEPT_SHARE * m.contrast)
            kept++;
    }
    return { found: marks.length, kept };
}
/** Median L* over a mask (Python: np.median of srgb_to_lab_array in the mask). */
export function medianL(img, mask) {
    const values = [];
    const lab = [0, 0, 0];
    const ch = img.channels;
    for (let i = 0; i < mask.data.length; i++) {
        if (mask.data[i] >= 0.5) {
            pixelLab(img.data[i * ch], img.data[i * ch + 1], img.data[i * ch + 2], lab);
            values.push(lab[0]);
        }
    }
    if (values.length < 16)
        return null;
    values.sort((a, b) => a - b);
    const mid = values.length >> 1;
    return values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
}
export function skinShift(before, after, skin) {
    const grown = dilate(skin, 6);
    const background = { width: skin.width, height: skin.height, channels: 1, data: new Float64Array(skin.data.length) };
    for (let i = 0; i < background.data.length; i++)
        background.data[i] = grown.data[i] > 0 ? 0 : 1;
    const lb = medianL(before, skin), la = medianL(after, skin);
    const bb = medianL(before, background), ba = medianL(after, background);
    const skinDL = lb === null || la === null ? null : la - lb;
    const backgroundDL = bb === null || ba === null ? null : ba - bb;
    const lightened = skinDL !== null && skinDL - Math.max(0, backgroundDL ?? 0) > LIGHTEN_DL;
    return { skinDL, backgroundDL, lightened };
}
/** The centred face ellipse used when no face points are recorded (arena identity.central_zones). */
export function centralSkin(width, height) {
    const m = { width, height, channels: 1, data: new Float64Array(width * height) };
    const cx = width / 2, cy = height * 0.52, rx = 0.30 * width, ry = 0.38 * height;
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
            m.data[y * width + x] = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1 ? 1 : 0;
        }
    return m;
}
/** IOD from 478-point face points (pupils 468 and 473), or the arena's fallback of a third of the width. */
export function iodOf(width, face) {
    const p = (i) => {
        const v = face?.[i];
        if (!v)
            return null;
        return Array.isArray(v) ? [Number(v[0]), Number(v[1])] : [v.x, v.y];
    };
    const r = p(468), l = p(473);
    if (r && l) {
        const d = Math.hypot(l[0] - r[0], l[1] - r[1]);
        if (d > 1)
            return d;
    }
    return 0.33 * width;
}
export function stillYou(before, after, opts) {
    if (!opts.edited) {
        return { state: "not checked", marksFound: 0, marksKept: 0, skinDL: null, lightened: false, usedFacePoints: false,
            text: "Photo checks: no edits yet" };
    }
    if (before.width !== after.width || before.height !== after.height)
        throw new RangeError("before and after must be the same size");
    const skin = opts.skin ?? centralSkin(before.width, before.height);
    const iod = iodOf(before.width, opts.face);
    const marks = findMarks(before, skin, iod);
    const kept = retention(marks, after, iod);
    const shift = skinShift(before, after, skin);
    const erased = kept.found >= 3 && kept.kept / kept.found < MARKS_KEPT_MIN;
    const state = erased || shift.lightened ? "changed" : "kept";
    const parts = [kept.found ? `${kept.kept} of ${kept.found} marks kept` : "no freckles or moles found",
        shift.lightened ? "skin lightened" : "skin tone kept"];
    return { state, marksFound: kept.found, marksKept: kept.kept, skinDL: shift.skinDL, lightened: shift.lightened,
        usedFacePoints: Boolean(opts.face), text: `Photo checks: ${parts.join(", ")}${opts.face ? "" : " (rough face area)"}` };
}
