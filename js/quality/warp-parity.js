/**
 * R5 parity kernels (format beljour-parity/1) for E06 warp, E07 fill and Q12: the
 * TypeScript twin of api/plumb_api/quality/warp_parity.py, checked against
 * parity/warp-fill-r5.json. Numbers agree within 1/255; integer outputs exactly.
 *
 * Author: John Khan.
 */
import { floatImage } from "../engines/core/buffer.js";
import { runEngine } from "../engines/core/engine.js";
import { biharmonic } from "../engines/fill/biharmonic.js";
import { fill } from "../engines/fill/fill.js";
import { fastMarching } from "../engines/fill/fmm.js";
import { XorShift32, onionPeel, patchMatch } from "../engines/fill/patchmatch.js";
import { measure } from "../engines/proportions/ratios.js";
import { analyse, targets } from "../engines/proportions/symmetry.js";
import { WarpEngine } from "../engines/warp/engine.js";
import { bandWeights, curve, radialWeights } from "../engines/warp/falloff.js";
import { compose, makeField } from "../engines/warp/field.js";
import { foldReport, safeStrength, scaledBuilder, triangleFlips } from "../engines/warp/fold.js";
import { deform, mlsField } from "../engines/warp/mls.js";
import { anchorRing, meshWarp } from "../engines/warp/mesh.js";
import { piecewiseAffine } from "../engines/warp/piecewise.js";
import { ThinPlateSpline, tpsField } from "../engines/warp/tps.js";
import { delaunay } from "../engines/warp/triangulate.js";
import { maxAbsDifference, q12StraightLines } from "./metrics.js";
import { FORMAT, TOLERANCE, fromImage, toBytes, toFloat } from "./parity.js";
import { gridScene } from "./warpfill.js";
const pts = (v) => v.map((p) => [p[0], p[1]]);
const list = (v) => v.map((p) => [p[0], p[1]]);
const maps = (f) => ({ map_x: fromImage(f.mapX, true), map_y: fromImage(f.mapY, true) });
const field = (a) => makeField(toFloat(a.map_x), toFloat(a.map_y));
const ints = (shape, data) => ({ shape, data: Array.from(data) });
function planarOf(img, from) {
    return fromImage(img, from.shape.length === 2);
}
export const KERNELS_R5 = {
    "warp.tps_map": (a) => {
        const spline = ThinPlateSpline.fit(pts(a.src), pts(a.dst), a.smooth);
        const probe = pts(a.points);
        return { points: probe.map(([x, y]) => [...spline.map(x, y)]),
            jacobian: probe.map(([x, y]) => spline.jacobian(x, y).flat()), energy: spline.bendingEnergy() };
    },
    "warp.tps_field": (a) => maps(tpsField(a.w, a.h, pts(a.from), pts(a.to), { pins: pts(a.pins ?? []), step: a.step })),
    "warp.mls_points": (a) => list(deform(pts(a.points), pts(a.p), pts(a.q), a.mode, a.alpha)),
    "warp.mls_field": (a) => maps(mlsField(a.w, a.h, pts(a.from), pts(a.to), { mode: a.mode, alpha: a.alpha, step: a.step, pinBorder: a.pin_border })),
    "warp.delaunay": (a) => delaunay(pts(a.points)).map((t) => [...t]),
    "warp.piecewise": (a) => {
        const res = piecewiseAffine(a.w, a.h, pts(a.src), pts(a.dst), a.triangles);
        return { ...maps(res.field), owner: ints([a.h, a.w], res.owner) };
    },
    "warp.fold_report": (a) => {
        const r = foldReport(field(a), a.minimum);
        return { min_det: r.minDet, max_det: r.maxDet, folded_share: r.foldedShare, below_share: r.belowShare,
            worst_x: r.worstX, worst_y: r.worstY, passed: r.passed };
    },
    "warp.triangle_flips": (a) => {
        const r = triangleFlips(pts(a.src), pts(a.dst), a.triangles, a.min_ratio);
        return { flipped: r.flipped, squashed: r.squashed, min_area_ratio: r.minAreaRatio };
    },
    "warp.curve": (a) => a.values.map((v) => curve(v, a.kind)),
    "warp.band_weights": (a) => fromImage(bandWeights(toFloat(a.band), a.ramp, a.kind), true),
    "warp.radial_weights": (a) => fromImage(radialWeights(a.w, a.h, a.cx, a.cy, a.radius, a.kind), true),
    "warp.compose": (a) => maps(compose(field(a.outer), field(a.inner))),
    "warp.safe_strength": (a) => {
        const r = safeStrength(scaledBuilder(field(a)), { minimum: a.minimum });
        return { strength: r.strength, min_det: r.report.minDet, reduced: r.reduced };
    },
    "warp.anchor_ring": (a) => list(anchorRing(pts(a.mesh), a.scale, a.count)),
    "warp.mesh_warp": (a) => {
        const res = meshWarp(a.w, a.h, pts(a.before), pts(a.after), { strength: a.strength, guard: a.guard });
        return { ...maps(res.result.field), owner: ints([a.h, a.w], res.result.owner), strength_used: res.strengthUsed,
            reduced: res.reduced, flipped: res.flips.flipped };
    },
    "warp.engine": (a) => {
        const masks = a.band ? { band: Float32ImageOf(toFloat(a.band)) } : {};
        const res = runEngine(new WarpEngine(), toBytes(a.image), null, masks, a.params);
        const metrics = {};
        for (const k of Object.keys(res.metrics).sort())
            metrics[k] = res.metrics[k];
        return { image: fromImage(res.image, false), metrics };
    },
    "fill.fast_marching": (a) => {
        const res = fastMarching(toFloat(a.values), toFloat(a.mask), { radius: a.radius, gradient: a.gradient });
        return { image: planarOf(res.image, a.values), arrival: fromImage(res.arrival, true), order: res.order };
    },
    "fill.onion_peel": (a) => {
        const img = toBytes(a.image), hole = toFloat(a.hole);
        const work = onionPeel(img, Uint8Array.from(hole.data, (v) => (v >= 0.5 ? 1 : 0)));
        return ints([img.height, img.width, 3], work);
    },
    "fill.patchmatch": (a) => {
        const res = patchMatch(toBytes(a.image), toFloat(a.mask), { patchRadius: a.patch_radius, iterations: a.iterations, seed: a.seed });
        return { image: fromImage(res.image, false), mean_distance: res.meanDistance, matches: res.matches };
    },
    "fill.biharmonic": (a) => {
        const res = biharmonic(toFloat(a.values), toFloat(a.mask));
        return { image: planarOf(res.image, a.values), box: res.box, converged: res.converged };
    },
    "fill.fill": (a) => {
        const out = fill(toBytes(a.image), toFloat(a.mask), a.method, { grow: a.grow, seed: a.seed });
        return { image: fromImage(out.image, false), hole_pixels: out.holePixels };
    },
    "fill.xorshift": (a) => {
        const rng = new XorShift32(a.seed);
        return Array.from({ length: a.count }, () => rng.next());
    },
    "quality.q12": (a) => {
        const c = q12StraightLines(toBytes(a.image), a.band ? toFloat(a.band) : null, { spacing: a.spacing, offset: a.offset, thickness: a.thickness });
        const m = c.measured;
        return { passed: c.passed, max_deviation: m.max_deviation, lines_checked: m.lines_checked, lines_skipped: m.lines_skipped, samples: m.samples };
    },
    "quality.grid_scene": (a) => fromImage(gridScene(a.h, a.w, a.spacing, a.offset, a.thickness), false),
    "proportions.symmetry": (a) => {
        const r = analyse(pts(a.points), a.regions ?? undefined);
        return { tilt_degrees: r.tiltDegrees, iod: r.iod, midline_spread: r.midlineSpread, mean: r.mean, yaw_share: r.yawShare,
            facing_camera: r.facingCamera, regions: r.regions.map((g) => [g.mean, g.max, g.across, g.along]),
            pairs: r.pairs.map((p) => [p.right, p.left, p.across, p.along]) };
    },
    "proportions.targets": (a) => list(targets(pts(a.points), a.strength, { side: a.side, regions: (a.regions ?? undefined), midline: a.midline })),
    "proportions.ratios": (a) => measure(pts(a.points), a.set, a.custom)
        .ratios.map((r) => [r.key, r.value, r.reference, r.differencePercent, r.plain]),
};
/** Masks the Python side builds as float32; keep the same precision here. */
function Float32ImageOf(img) {
    const out = floatImage(img.width, img.height, 1);
    out.data.set(img.data);
    return out;
}
export function evaluateR5(vector) {
    const fn = KERNELS_R5[vector.kernel];
    if (!fn)
        throw new RangeError(`unknown parity kernel ${vector.kernel}`);
    return fn(vector.args);
}
export function validateR5(doc) {
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
        if (!(k in KERNELS_R5))
            out.push(`no TypeScript kernel for ${k}`);
    if ([...used].sort().join("|") !== [...(d.kernels ?? [])].sort().join("|"))
        out.push("kernels must list exactly the kernels the vectors use");
    return out;
}
export function checkVectorsR5(doc) {
    return doc.vectors.map((v) => {
        try {
            return { id: v.id, kernel: v.kernel, diff: maxAbsDifference(v.expected, evaluateR5(v)) };
        }
        catch (err) {
            return { id: v.id, kernel: v.kernel, diff: Infinity, error: String(err) };
        }
    });
}
//# sourceMappingURL=warp-parity.js.map