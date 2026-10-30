import { colourPass, mixerIsNeutral, mixerUniforms, whiteBalance } from "./colour.js";
import { clarity, localBase, lumaPlane, reduceNoise, sampleBase, sharpen } from "./detail.js";
import { finish, finishIsNeutral } from "./finish.js";
import { adjustIsNeutral, readAdjust, readMixer, scaled } from "./params.js";
import { curveTable, curvesAreStraight, readCurves } from "./curves.js";
import { applySelective, readArea, readSelective, selectiveIsNeutral } from "./selective.js";
import { applyGeometry, isIdentity, readGeometry } from "../crop/geometry.js";
export const DEVELOP_KINDS = ["adjust", "mixer", "curves", "selective"];
export const EDITOR_KINDS = [...DEVELOP_KINDS, "crop"];
/** One layer each; a second is refused. */
export const SINGLE_KINDS = ["adjust", "mixer", "curves", "crop"];
export const PIPELINE_ORDER = Object.freeze([
    { stage: "1. Develop", tools: "Noise reduction, then Adjust light and colour, Colour mixer and Curves in one colour pass, then clarity and sharpen, then Selective adjust" },
    { stage: "2. Looks and face tools", tools: "Every other layer in your order: enhance, skin, portrait looks, the 61 filters, age, hair and the rest" },
    { stage: "3. Geometry", tools: "Crop: turns, flips, keystone, straighten and the crop" },
    { stage: "4. Finish", tools: "Vignette, grain and fade, on the cropped picture" },
]);
export const LABELS = Object.freeze({
    adjust: "Adjust: light, colour and detail", mixer: "Colour mixer", curves: "Curves", selective: "Selective adjust",
    crop: "Crop and geometry",
});
export function isEditorKind(kind) { return EDITOR_KINDS.includes(kind); }
export class StackOrderError extends RangeError {
    kind;
    code = "repeated_tool";
    constructor(kind) {
        super(`Use one ${LABELS[kind] ?? kind} layer; change its settings instead of adding another.`);
        this.kind = kind;
        this.name = "StackOrderError";
    }
}
/** Split the visible layers into the four stages (input: the effective layers, bottom first). */
export function stagePlan(layers) {
    for (const kind of SINGLE_KINDS)
        if (layers.filter((l) => l.kind === kind).length > 1)
            throw new StackOrderError(kind);
    const pick = (kind) => layers.filter((l) => l.kind === kind);
    const adjust = pick("adjust")[0] ?? null;
    return {
        develop: [...pick("adjust"), ...pick("mixer"), ...pick("curves"), ...pick("selective")],
        looks: layers.filter((l) => !isEditorKind(l.kind)),
        geometry: pick("crop")[0] ?? null,
        finish: adjust,
    };
}
let defaultRunner = null;
/** gpu.ts registers the browser runner here; null forces the CPU path (tests, comparisons). */
export function useColourRunner(factory) { defaultRunner = factory; }
const toFloat = (img) => {
    const n = img.width * img.height, out = new Float32Array(n * 3);
    for (let i = 0; i < n; i++)
        for (let c = 0; c < 3; c++)
            out[i * 3 + c] = img.data[i * img.channels + c] / 255;
    return out;
};
// Plain loops: TypedArray.from with a map function is very slow on large photos.
const toBytes = (rgb) => {
    const out = new Uint8Array(rgb.length);
    for (let i = 0; i < rgb.length; i++) {
        const v = rgb[i];
        out[i] = Math.round((v < 0 ? 0 : v > 1 ? 1 : v) * 255);
    }
    return out;
};
const unit = (bytes) => {
    const out = new Float32Array(bytes.length);
    for (let i = 0; i < bytes.length; i++)
        out[i] = bytes[i] / 255;
    return out;
};
/** The colour pass's uniforms for these develop layers, or null parts when they are neutral. */
export function colourUniforms(plan) {
    const a = plan.develop.find((l) => l.kind === "adjust"), m = plan.develop.find((l) => l.kind === "mixer");
    const c = plan.develop.find((l) => l.kind === "curves");
    const u = { adjust: null, mixer: null, curves: null };
    if (a) {
        const v = scaled(readAdjust(a.parameters), a.strength);
        const tone = { ...v, clarity: 0, sharpen: 0, noise: 0, vignette: 0, grain: 0, fade: 0 };
        if (!adjustIsNeutral(tone)) {
            u.adjust = { opacity: a.opacity, exposure: v.exposure, brilliance: v.brilliance / 100, highlights: v.highlights / 100,
                shadows: v.shadows / 100, contrast: v.contrast / 100, black: v.black_point / 100, white: v.white_point / 100,
                wb: whiteBalance(v.temperature / 100, v.tint / 100), saturation: v.saturation / 100, vibrance: v.vibrance / 100 };
        }
    }
    if (m) {
        const { values, skinProtect } = readMixer(m.parameters), v = scaled(values, m.strength);
        if (!mixerIsNeutral(v))
            u.mixer = mixerUniforms(v, m.opacity, skinProtect);
    }
    if (c) {
        const curves = readCurves(c.parameters);
        if (!curvesAreStraight(curves) && c.strength > 0)
            u.curves = { opacity: c.opacity, table: curveTable(curves, c.strength) };
    }
    return u;
}
/** Stage 1. Returns the developed photo (same size), labels and what ran. */
export function developStage(img, layers, runner = defaultRunner?.() ?? null) {
    const plan = stagePlan(layers);
    if (!plan.develop.length)
        return { image: img, labels: [], metrics: [] };
    const { width, height } = img, n = width * height;
    const a = plan.develop.find((l) => l.kind === "adjust");
    const av = a ? scaled(readAdjust(a.parameters), a.strength) : null;
    let rgb = toFloat(img);
    const metrics = { stage: "develop" };
    if (a && av && av.noise > 0) {
        reduceNoise(rgb, width, height, av.noise / 100 * a.opacity);
        metrics.noise = av.noise;
    }
    const u = colourUniforms(plan);
    if (u.adjust || u.mixer || u.curves) {
        const needBase = u.adjust !== null && (u.adjust.shadows !== 0 || u.adjust.highlights !== 0 || u.adjust.brilliance !== 0);
        // Both paths start from the same 8-bit pixels, so they can be compared level for level.
        const bytes = toBytes(rgb);
        const base = needBase ? localBase(lumaPlane(unit(bytes), n), width, height) : null;
        let out = null;
        try {
            out = runner ? runner.run(bytes, width, height, u, base) : null;
        }
        catch {
            out = null;
        }
        if (out) {
            rgb = unit(out);
            metrics.backend = runner.kind;
        }
        else {
            rgb = unit(bytes);
            colourPass(rgb, width, height, u, base ? (x, y) => sampleBase(base, x, y) : null);
            rgb = unit(toBytes(rgb));
            metrics.backend = "cpu";
        }
        metrics.colour = [u.adjust && "adjust", u.mixer && "mixer", u.curves && "curves"].filter(Boolean).join("+");
    }
    if (a && av && av.clarity !== 0) {
        clarity(rgb, width, height, av.clarity / 100 * a.opacity);
        metrics.clarity = av.clarity;
    }
    if (a && av && av.sharpen > 0) {
        sharpen(rgb, width, height, av.sharpen / 100 * a.opacity);
        metrics.sharpen = av.sharpen;
    }
    let areas = 0;
    for (const s of plan.develop.filter((l) => l.kind === "selective")) {
        const values = readSelective(s.parameters), k = s.strength / 100;
        const v = { exposure: values.exposure * k, contrast: values.contrast * k, saturation: values.saturation * k, warmth: values.warmth * k };
        if (selectiveIsNeutral(v))
            continue;
        applySelective(rgb, width, height, readArea(s.parameters), v, s.opacity);
        areas++;
    }
    if (areas)
        metrics.selective_areas = areas;
    return { image: { width, height, channels: 3, data: toBytes(rgb) }, labels: plan.develop.map((l) => LABELS[l.kind]), metrics: [metrics] };
}
/** Stage 3. The crop layer's geometry, at this image's resolution. */
export function geometryStage(img, layer) {
    if (!layer)
        return { image: img, labels: [], metrics: [] };
    const g = readGeometry(layer.parameters);
    if (isIdentity(g))
        return { image: img, labels: [LABELS.crop], metrics: [{ stage: "geometry", identity: true }] };
    const out = applyGeometry(img, g);
    return { image: out, labels: [LABELS.crop], metrics: [{ stage: "geometry", width: out.width, height: out.height, angle: g.angle, quarter: g.quarter }] };
}
export function finishValues(layer) {
    const v = scaled(readAdjust(layer.parameters), layer.strength);
    return { vignette: v.vignette / 100, vignette_mid: v.vignette_mid / 100, vignette_round: v.vignette_round / 100,
        grain: v.grain / 100, grain_size: v.grain_size / 100, grain_rough: v.grain_rough / 100, fade: v.fade / 100 };
}
/** Stage 4. Vignette, grain and fade from the Adjust layer, on the cropped picture. */
export function finishStage(img, layer) {
    if (!layer)
        return { image: img, labels: [], metrics: [] };
    const v = finishValues(layer);
    if (finishIsNeutral(v))
        return { image: img, labels: [], metrics: [] };
    const rgb = toFloat(img);
    finish(rgb, img.width, img.height, v, layer.opacity);
    return { image: { width: img.width, height: img.height, channels: 3, data: toBytes(rgb) }, labels: ["Adjust: finish"],
        metrics: [{ stage: "finish", vignette: v.vignette, grain: v.grain, fade: v.fade }] };
}
//# sourceMappingURL=stack.js.map