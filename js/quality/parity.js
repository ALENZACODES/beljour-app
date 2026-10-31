/**
 * Parity vectors `beljour-parity/1` (CONTRACTS.md §16), TypeScript side.
 *
 * Each kernel below takes a vector's JSON arguments, runs the TypeScript core and returns
 * JSON in the same shape the Python kernel wrote (api/plumb_api/quality/parity.py).
 * `checkVectors` compares them; every number must agree within 1/255 (check Q5).
 * Arrays travel as {shape, data}; 2-D shapes are one-channel planes, 3-D are H x W x C.
 *
 * Author: John Khan.
 */
import { decode, encode, remap, resizeArea, resizeBilinear } from "../engines/core/buffer.js";
import { alphaBlend, applyMode, modeFloat, multibandFloat } from "../engines/core/blend.js";
import { ciede2000, labToLch, labToRgb, lchToLab, mixOklab, oklabToRgb, rgbToLab, rgbToOklab, rotateHue, srgbDecode, srgbEncode } from "../engines/core/colour.js";
import { ExposureEngine, TintEngine, runEngine } from "../engines/core/engine.js";
import { jacobianDeterminant } from "../engines/core/filters.js";
import * as M from "../engines/core/mask.js";
import { collapse, down, laplacian, up } from "../engines/core/pyramid.js";
import { syntheticPhoto } from "./harness.js";
import { effectStrength, maxAbsDifference, q1OutsideMask, q3FoldFree, q4Seam, q6ColourAccuracy, textureEnergy } from "./metrics.js";
export const FORMAT = "beljour-parity/1";
export const TOLERANCE = 1 / 255;
function dims(arr) {
    const [h, w, c = 1] = arr.shape;
    if (arr.shape.length < 2 || arr.shape.length > 3 || h * w * c !== arr.data.length)
        throw new RangeError("array data does not match its shape");
    return [h, w, c];
}
export function toFloat(arr) {
    const [h, w, c] = dims(arr);
    return { width: w, height: h, channels: c, data: Float64Array.from(arr.data, (v) => (v === null ? NaN : v)) };
}
export function toBytes(arr) {
    const [h, w, c] = dims(arr);
    return { width: w, height: h, channels: c, data: Uint8Array.from(arr.data) };
}
/** Write an image back in the caller's rank: a 2-D input shape stays 2-D. */
export function fromImage(img, planar) {
    const data = Array.from(img.data, (v) => (Number.isFinite(v) ? v : null));
    return { shape: planar && img.channels === 1 ? [img.height, img.width] : [img.height, img.width, img.channels], data };
}
const planar = (arr) => arr.shape.length === 2;
const guide = (arr) => (arr.shape.length === 3 ? toBytes(arr) : toFloat(arr));
const nums = (values) => values.map((v) => (Number.isFinite(v) ? v : null));
function combine(a) {
    const x = toFloat(a.a);
    switch (a.op) {
        case "invert": return M.invert(x);
        case "threshold": return M.threshold(x, a.t);
        case "union": return M.union(x, toFloat(a.b));
        case "intersection": return M.intersection(x, toFloat(a.b));
        case "subtract": return M.subtract(x, toFloat(a.b));
        default: throw new RangeError(`unknown mask operation ${a.op}`);
    }
}
function edt(arr) {
    const [h, w] = dims(arr);
    const d2 = M.squaredEdt(arr.data.map((v) => (v ?? 0) >= 0.5), w, h);
    return { shape: [h, w], data: Array.from(d2) };
}
function engine(e, a) {
    const masks = {};
    for (const [name, arr] of Object.entries(a.masks))
        masks[name] = toFloat(arr);
    const result = runEngine(e, toBytes(a.image), null, masks, a.params, 0);
    const metrics = Object.fromEntries(Object.keys(result.metrics).sort().map((k) => [k, result.metrics[k]]));
    return { image: fromImage(result.image, false), edit_mask: fromImage(result.editMask, true), metrics };
}
function synthetic(a) {
    const photo = syntheticPhoto(a.seed, a.h, a.w);
    return { image: fromImage(photo.image, false), selection: fromImage(photo.masks.selection, true), skin: fromImage(photo.masks.skin, true) };
}
function pick(measured, keys) {
    return Object.fromEntries(keys.map((k) => [k, measured[k]]));
}
export const KERNELS = {
    "colour.srgb_decode": (a) => nums(a.values.map(srgbDecode)),
    "colour.srgb_encode": (a) => nums(a.values.map(srgbEncode)),
    "colour.rgb_to_lab": (a) => nums(rgbToLab(a.rgb)),
    "colour.lab_to_rgb": (a) => nums(labToRgb(a.lab)),
    "colour.ciede2000": (a) => ciede2000(a.lab1, a.lab2),
    "colour.rgb_to_oklab": (a) => nums(rgbToOklab(a.rgb)),
    "colour.oklab_to_rgb": (a) => nums(oklabToRgb(a.lab)),
    "colour.mix_oklab": (a) => nums(mixOklab(a.rgb1, a.rgb2, a.t)),
    "buffer.decode": (a) => fromImage(decode(toBytes(a.image)), false),
    "buffer.encode": (a) => fromImage(encode(toFloat(a.image)), false),
    "buffer.remap": (a) => fromImage(remap(toBytes(a.image), toFloat(a.map_x), toFloat(a.map_y), { border: a.border, linearLight: a.linear_light }), false),
    "buffer.jacobian": (a) => fromImage(jacobianDeterminant(toFloat(a.map_x), toFloat(a.map_y)), true),
    "mask.rectangle": (a) => fromImage(M.rectangle(a.w, a.h, a.left, a.top, a.right, a.bottom), true),
    "mask.ellipse": (a) => fromImage(M.ellipse(a.w, a.h, a.cx, a.cy, a.rx, a.ry, a.feather), true),
    "mask.polygon": (a) => fromImage(M.polygon(a.w, a.h, a.points, a.supersample), true),
    "mask.box_blur": (a) => fromImage(M.blur(toFloat(a.mask), a.radius), true),
    "mask.combine": (a) => fromImage(combine(a), true),
    "mask.squared_edt": (a) => edt(a.mask),
    "mask.dilate": (a) => fromImage(M.dilate(toFloat(a.mask), a.radius), true),
    "mask.erode": (a) => fromImage(M.erode(toFloat(a.mask), a.radius), true),
    "mask.feather": (a) => fromImage(M.feather(toFloat(a.mask), a.radius, a.mode), true),
    "mask.guided": (a) => fromImage(M.guidedFilter(guide(a.guide), toFloat(a.source), a.radius, a.eps), true),
    "mask.edge_feather": (a) => fromImage(M.edgeAwareFeather(toFloat(a.mask), guide(a.guide), a.radius, a.eps, a.band), true),
    "pyramid.down": (a) => fromImage(down(toFloat(a.image)), planar(a.image)),
    "pyramid.up": (a) => fromImage(up(toFloat(a.image), a.w, a.h), planar(a.image)),
    "pyramid.laplacian": (a) => laplacian(toFloat(a.image), a.levels).map((b) => fromImage(b, planar(a.image))),
    "pyramid.collapse": (a) => fromImage(collapse(a.bands.map(toFloat)), planar(a.bands[0])),
    "blend.mode": (a) => {
        const cb = toFloat(a.cb), cs = toFloat(a.cs);
        const asImage = (x) => ({ width: 1, height: x.height, channels: 3, data: x.data });
        const out = modeFloat(asImage(cb), asImage(cs), a.mode);
        return { shape: a.cb.shape, data: nums(Array.from(out.data)) };
    },
    "blend.apply": (a) => fromImage(applyMode(toBytes(a.base), toBytes(a.top), a.mode, { opacity: a.opacity, mask: a.mask === null ? null : toFloat(a.mask), space: a.space }), false),
    "blend.alpha": (a) => fromImage(alphaBlend(toBytes(a.base), toBytes(a.overlay), toFloat(a.mask), a.linear_light), false),
    "blend.multiband": (a) => fromImage(multibandFloat(toFloat(a.a), toFloat(a.b), toFloat(a.mask), a.levels), false),
    "quality.q1": (a) => pick(q1OutsideMask(toBytes(a.before), toBytes(a.after), toFloat(a.mask)).measured, ["mean", "max", "outside_pixels"]),
    "quality.q3": (a) => pick(q3FoldFree(toFloat(a.map_x), toFloat(a.map_y)).measured, ["min_det", "folded_share", "below_share"]),
    "quality.q4": (a) => pick(q4Seam(toBytes(a.before), toBytes(a.after), toFloat(a.mask)).measured, ["seam", "reference", "ratio", "band_pixels"]),
    "quality.q6": (a) => pick(q6ColourAccuracy(toBytes(a.image), toFloat(a.mask), a.target).measured, ["delta_e"]),
    "quality.effect": (a) => effectStrength(toBytes(a.before), toBytes(a.after), toFloat(a.mask)),
    "quality.texture": (a) => textureEnergy(toBytes(a.image), toFloat(a.mask)),
    "colour.lab_to_lch": (a) => nums(labToLch(a.lab)),
    "colour.lch_to_lab": (a) => nums(lchToLab(a.lch)),
    "colour.rotate_hue": (a) => nums(rotateHue(a.rgb, a.degrees)),
    "buffer.resize_area": (a) => fromImage(resizeArea(toBytes(a.image), a.w, a.h), false),
    "buffer.resize_bilinear": (a) => fromImage(resizeBilinear(toBytes(a.image), a.w, a.h), false),
    "engine.exposure": (a) => engine(new ExposureEngine(), a),
    "engine.tint": (a) => engine(new TintEngine(), a),
    "harness.synthetic_photo": synthetic,
};
export function evaluate(vector) {
    const kernel = KERNELS[vector.kernel];
    if (!kernel)
        throw new RangeError(`unknown parity kernel ${vector.kernel}`);
    return kernel(vector.args);
}
export function validate(doc) {
    const d = doc;
    if (!d || typeof d !== "object" || d.format !== FORMAT)
        return [`format must be ${FORMAT}`];
    const out = [];
    if (d.tolerance !== TOLERANCE)
        out.push("tolerance must be 1/255");
    if (!Array.isArray(d.vectors))
        return [...out, "vectors must be a list"];
    const used = new Set(d.vectors.map((v) => v.kernel));
    for (const k of used)
        if (!(k in KERNELS))
            out.push(`no TypeScript kernel for ${k}`);
    if ([...used].sort().join("|") !== [...(d.kernels ?? [])].sort().join("|"))
        out.push("kernels must list exactly the kernels the vectors use");
    return out;
}
/** Evaluate every vector; diff is the largest absolute difference (Infinity on error or shape mismatch). */
export function checkVectors(doc) {
    return doc.vectors.map((v) => {
        try {
            return { id: v.id, kernel: v.kernel, diff: maxAbsDifference(v.expected, evaluate(v)) };
        }
        catch (err) {
            return { id: v.id, kernel: v.kernel, diff: Infinity, error: String(err) };
        }
    });
}
