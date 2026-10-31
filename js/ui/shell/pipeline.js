/** The R8 shell's preview compositor. Calls the R7 engines; does not copy or
 * fork their contour tables, colour formulas, posture points or fibre logic.
 * No file/network/provider access. Deterministic on one source, layers and seed.
 * Author: John Khan.
 */
import { rootStrength } from "./strength-curve.js";
import { requireColour, encodeChannel, roundHalfEven, SRGB_TO_LINEAR } from "../../engines/core/buffer.js";
import { enhance, MODES } from "../../engines/local/enhance.js";
import { readCrown, shadeCard, hairColour } from "../../engines/local/fibre.js";
import { PRODUCTS } from "../../engines/local/strands.js";
import { renderFibresFlow } from "../../engines/local/fibres-flow.js";
import { renderBeard, STYLES } from "../../engines/local/beard.js";
import { plan, renderPosture, backgroundDetail, PLAIN_BACKGROUND_DETAIL, FIXES } from "../../engines/local/posture.js";
import { postureSettings } from "./settings.js";
import { effective } from "./layers.js";
import { appearanceOrder } from "./appearance-stack.js";
import { readiness } from "./catalogue.js";
import { applyHeroLayer } from "./hero-layer.js";
import { applyBeautyLayer, photoMeanLab } from "./beauty-layer.js";
import { ciede2000 } from "../../engines/core/colour.js";
import { applySkinLayer } from "./skin-layer.js";
import { applyUnderEyeLayer } from "./under-eye-layer.js";
import { applyHairBeardTeethLayer } from "./hair-beard-teeth-layer.js";
import { applyStudioLayer } from "./studio-layer.js";
import { applyMakeupLayer } from "./makeup-layer.js";
import { autoFix } from "../../engines/beauty/auto-fix.js";
import { applyRetouchLayer } from "../../editor/brush/layer.js";
import { applyFilterLayer } from "../../filters/runtime/layer.js";
import { guardFilterLook } from "./never-lighter.js";
import { finishEnhance } from "./enhance-finish.js";
import { applyPortraitLayer } from "../../filters/portrait/layer.js";
import { regionMask } from "../../data/regions/index.js";
import { developStage, finishStage, geometryStage, isEditorKind, stagePlan } from "../../editor/adjust/stack.js";
import { mapToOutput, readGeometry, isIdentity } from "../../editor/crop/geometry.js";
/** `face` is where the face points are after the whole stack (the photo's own points when no
 * layer moved them, undefined when the photo has none). */
/** The Enhance mode that runs the one-tap auto fix; the other modes are the guarded rescue modes. */
export const AUTO_FIX = "auto";
/** Least Lab distance between the crown's hair and gap tones for Hair fibres to have anything to fill. ASSUMED. */
/** Posture strength curve: share of the guarded maximum move = (strength/100)^POSTURE_CURVE. */
export const POSTURE_CURVE = 0.7;
export const FIBRE_MIN_CONTRAST = 12, FIBRE_POWER = 0.5;
/** The points after a layer that moved them and was mixed in at `weight` (0-1). A partly mixed
 * warp has no single true geometry; moving the points by the same share is ASSUMED. */
export function nextFace(before, after, weight) {
    if (!before || !after || after.length !== before.length)
        return before;
    if (weight >= 1)
        return after;
    return before.map((p, i) => [p[0] + weight * (after[i][0] - p[0]), p[1] + weight * (after[i][1] - p[1])]);
}
export function copyRGB(img) {
    requireColour(img);
    if (img.channels === 3)
        return { ...img, data: new Uint8Array(img.data) };
    const out = new Uint8Array(img.width * img.height * 3);
    for (let i = 0; i < img.width * img.height; i++)
        out.set(img.data.subarray(i * 4, i * 4 + 3), i * 3);
    return { width: img.width, height: img.height, channels: 3, data: out };
}
/** Linear-light opacity blend with half-even rounding for a reproducible image. */
export function mixOpacity(base, changed, opacity) {
    requireColour(base);
    requireColour(changed);
    if (base.width !== changed.width || base.height !== changed.height)
        throw new RangeError("Layer preview size must match source");
    if (!(Number.isFinite(opacity) && opacity >= 0 && opacity <= 1))
        throw new RangeError("Opacity must be 0–1");
    const out = copyRGB(base);
    if (opacity === 0)
        return out;
    // Speed: SRGB_TO_LINEAR[v] is decodeChannel(v / 255) computed once per byte, so the table
    // lookup gives exactly the same values as decoding each pixel (R7 measurements).
    // At one opacity the result depends only on the two bytes, so each (base, changed) pair is
    // worked out once with the same expression and kept in a 256 x 256 table (-1 = not yet
    // worked out): at most 65536 encodes instead of one per channel of every pixel, and the
    // same bytes (speed round; the test speed-identical checks every pair).
    const keep = 1 - opacity, bc = base.channels, cc = changed.channels;
    const mixed = new Int16Array(65536).fill(-1);
    for (let i = 0; i < base.width * base.height; i++)
        for (let c = 0; c < 3; c++) {
            const key = (base.data[i * bc + c] << 8) | changed.data[i * cc + c];
            let v = mixed[key];
            if (v < 0) {
                const a = SRGB_TO_LINEAR[key >> 8], b = SRGB_TO_LINEAR[key & 255];
                v = mixed[key] = roundHalfEven(Math.min(255, Math.max(0, encodeChannel(a * keep + b * opacity) * 255)));
            }
            out.data[i * 3 + c] = v;
        }
    return out;
}
function stringParam(layer, name, fallback) {
    const value = layer.parameters[name];
    return typeof value === "string" ? value : fallback;
}
function numberParam(layer, name, fallback) {
    const value = layer.parameters[name];
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
export function applyLocalLayer(img, source, layer, lightingRenderer) {
    requireColour(img);
    if (!(layer.enabled && layer.strength > 0 && layer.opacity > 0)) {
        return { image: copyRGB(img), label: "Disabled layer", metrics: { skipped: true } };
    }
    if (layer.kind === "styling")
        throw new Error("This is not an offline local engine. Use the approved styling screen.");
    if (isEditorKind(layer.kind)) {
        // One photo-adjustment layer on its own: its develop, geometry and finish parts in stage order.
        const developed = developStage(img, layer.kind === "crop" ? [] : [layer]);
        const shaped = geometryStage(developed.image, layer.kind === "crop" ? layer : null);
        const finished = finishStage(shaped.image, layer.kind === "adjust" ? layer : null);
        const labels = [...developed.labels, ...shaped.labels, ...finished.labels];
        return { image: copyRGB(finished.image), label: labels.join(" + ") || "No change", metrics: Object.assign({}, ...developed.metrics, ...shaped.metrics, ...finished.metrics) };
    }
    const ready = readiness(layer.kind, source);
    if (!ready.ready)
        throw new Error(ready.reason);
    const hero = applyHeroLayer(img, source, layer);
    if (hero)
        return hero;
    const beauty = applyBeautyLayer(img, source, layer, lightingRenderer);
    if (beauty)
        return beauty;
    const makeup = applyMakeupLayer(img, source, layer);
    if (makeup)
        return makeup;
    const skin = applySkinLayer(img, source, layer);
    if (skin)
        return skin;
    const underEye = applyUnderEyeLayer(img, source, layer);
    if (underEye)
        return underEye;
    const hairBeardTeeth = applyHairBeardTeethLayer(img, source, layer);
    if (hairBeardTeeth)
        return hairBeardTeeth;
    const studio = applyStudioLayer(img, source, layer);
    if (studio)
        return studio;
    const retouch = applyRetouchLayer(img, source, layer);
    if (retouch)
        return retouch;
    if (layer.kind === "filters") {
        // Skin guard on: the look never leaves skin lighter than the photo (never-lighter.ts).
        const look = applyFilterLayer(img, source, layer), capped = guardFilterLook(img, look.image, source, layer.parameters);
        return { ...look, image: capped.image, metrics: { ...look.metrics, never_lighter: capped.area, never_lighter_pixels: capped.clamped } };
    }
    if (layer.kind === "portrait")
        return applyPortraitLayer(img, source, layer);
    if (layer.kind === "enhance") {
        const requested = stringParam(layer, "mode", "natural");
        if (requested === AUTO_FIX) {
            // One-tap auto fix (engines/beauty/auto-fix.ts): white balance, levels, local contrast, noise, colour.
            const fixed = autoFix(img, source.face?.length === 478 ? source.face : undefined, layer.strength, {
                denoise: layer.parameters.denoise !== false, deblur: layer.parameters.deblur !== false,
                white_balance: layer.parameters.white_balance !== false, colour: layer.parameters.colour !== false,
                exposure: layer.parameters.exposure !== false, sharpen: layer.parameters.sharpen !== false
            });
            return { image: { width: img.width, height: img.height, channels: img.channels, data: fixed.image }, label: fixed.label,
                metrics: { mode: AUTO_FIX, condition: "auto", effective_mode: AUTO_FIX, exposure_applied: true, normal_preserved: false,
                    unchanged: fixed.metrics.unchanged === true, ...fixed.metrics } };
        }
        if (!(requested in MODES))
            throw new RangeError("Unknown enhancement mode");
        const mode = requested;
        let faceMask;
        if (source.face?.length === 478) {
            try {
                const known = regionMask("skin", source.face, img.width, img.height, { normalized: false, supersample: 2 });
                if (known.data.some(value => value > 0))
                    faceMask = known;
            }
            catch (error) {
                // A missing/invalid geometry mask supplies no skin evidence. Photo-wide
                // enhancement stays available and records that the cap is unmeasured.
                if (!(error instanceof RangeError))
                    throw error;
            }
        }
        const result = enhance(img, mode, { strength: layer.strength / 100,
            faceMask,
            steps: {
                denoise: layer.parameters.denoise !== false, deblur: layer.parameters.deblur !== false,
                white_balance: layer.parameters.white_balance !== false, colour: layer.parameters.colour !== false,
                exposure: layer.parameters.exposure !== false, sharpen: layer.parameters.sharpen !== false,
            },
        });
        // Portrait and Vivid: their own finish after the rescue (enhance-finish.ts), unless colour is off.
        const finish = layer.parameters.colour !== false ? finishEnhance(img, result.image, mode, layer.strength / 100, faceMask) : null;
        const image = finish?.applied ? finish.image : result.image;
        const unchanged = finish?.applied ? image.data.every((v, i) => v === img.data[i]) : result.steps.unchanged === true;
        return { image, label: result.label, metrics: { mode, noise_before: result.before.noise_sigma,
                noise_after: result.after.noise_sigma, condition: result.condition.primary,
                effective_mode: result.safety.plan.effective_mode, exposure_applied: result.steps.exposure_applied === true,
                normal_preserved: result.steps.normal_preserved === true && !finish?.applied, unchanged,
                ...(finish?.applied ? { mode_finish: mode } : {}),
                face_metering: faceMask ? "supplied_face_mask" : "unmeasured",
                ...(result.safety.face_tone ? { skin_lstar_max_rise: result.safety.face_tone.max_rise } : {}) } };
    }
    if (layer.kind === "beard") {
        const requested = stringParam(layer, "style", "stubble");
        if (!(requested in STYLES))
            throw new RangeError("Unknown beard style");
        const style = requested;
        const length = Math.max(1, Math.min(5, Math.round(numberParam(layer, "length", 3))));
        // Eased like the face tools: Natural (50) is density 3 of 4, so the beard reads at the default.
        const eased = Math.max(0, Math.min(1, layer.strength / 100)) * (2 - Math.max(0, Math.min(1, layer.strength / 100)));
        // A moustache is a small area: it starts one density step fuller and one length longer, so it
        // fills the upper lip rather than drawing a pencil line (review, Oct 30).
        const moustache = style === "moustache";
        const density = Math.max(1, Math.min(4, Math.round(1 + 3 * eased) + (moustache ? 1 : 0)));
        const longer = moustache && typeof layer.parameters.length !== "number" ? Math.min(5, length + 1) : length;
        const result = renderBeard(img, source.face, { style, length: longer, density,
            colour: stringParam(layer, "colour", defaultBeardColour(img, source.face)), seed: 11 });
        return { image: result.image, label: result.label,
            metrics: { style, length, density, strands: Number(result.metrics.strands) } };
    }
    if (layer.kind === "hair-fibre") {
        const requested = stringParam(layer, "product", "fibres");
        if (!PRODUCTS.includes(requested))
            throw new RangeError("Unknown fibre product");
        const product = requested;
        const area = source.crown;
        const reading = readCrown(img, area);
        // Fibres fill where the scalp or light roots show between darker hair. When the crown's two
        // tones are nearly the same, there is nothing to fill: say so instead of leaving it unchanged.
        const [hairLab, gapLab] = reading.split.centres;
        const contrast = Math.hypot(gapLab[0] - hairLab[0], gapLab[1] - hairLab[1], gapLab[2] - hairLab[2]);
        if (contrast < FIBRE_MIN_CONTRAST) {
            const message = "No scalp or light roots show in the crown area, so Hair fibres have nothing to fill. They work where the scalp shows through.";
            return { image: { ...img, data: Uint8ClampedArray.from(img.data) }, label: message,
                metrics: { product, status: "refused", reason_code: "no_scalp_showing", message, crown_contrast: Math.round(contrast * 10) / 10 } };
        }
        const shade = shadeCard(hairColour(img, reading.split.hair));
        // A root curve (FIBRE_POWER 0.5): the default 50 gives amount 71 (about 74% of the scalp covered), 100 gives
        // 90%. The old 0.15 gave 90 at the default, so default and maximum looked the same.
        const result = renderFibresFlow(img, area, reading.split.scalp, shade.top[0].lab, { product, hair: reading.split.hair, amount: Math.min(100, 100 * rootStrength(layer.strength, FIBRE_POWER)), seed: 17 });
        return { image: result.image, label: result.label,
            metrics: { product, scalp_share: reading.overall_scalp_share, fibres: result.metrics.fibres,
                status: result.metrics.status, refused_grey_root_px: result.metrics.refused_grey_root_px,
                covered_scalp: result.metrics.covered_scalp, flow_coherence_in_gap: result.metrics.flow_coherence_in_gap,
                render_ms: result.metrics.render_ms, texture_source: "own_photo",
                crown_contrast: Math.round(contrast * 10) / 10 } };
    }
    if (layer.kind === "posture") {
        const requested = stringParam(layer, "fix", "lean");
        if (!(requested in FIXES))
            throw new RangeError("Unknown posture edit");
        const fix = requested;
        if (FIXES[fix].view !== source.body.view)
            throw new RangeError("Posture fix needs a matching front or side view");
        const config = postureSettings({ bandShare: numberParam(layer, "band_share", postureSettings().bandShare),
            capShare: numberParam(layer, "cap_share", postureSettings().capShare) });
        // A photo without both shoulders (a headshot) or with body points off the photo is refused cleanly:
        // the photo stays as it is and later tools and the photo checks keep working.
        const refuse = (message) => ({ image: { ...img, data: new Uint8ClampedArray(img.data) },
            label: `${message} Posture simulation.`, metrics: { fix, status: "refused", reason_code: "shoulders_not_visible", message } });
        const W = img.width, H = img.height, inside = (q) => !!q && q[0] >= 0 && q[1] >= 0 && q[0] < W && q[1] < H;
        const shoulders = source.body ? Object.entries(source.body.points).filter(([name]) => name.includes("shoulder")).map(([, q]) => q) : [];
        if (!source.body || !source.person || !shoulders.length || !shoulders.every(inside))
            return refuse("Posture needs both shoulders inside the photo; this looks like a headshot.");
        let p, result;
        const detail = backgroundDetail(img, source.person, config.bandShare);
        try {
            // The plan asks for the full fix (capped); the slider takes a share of the largest move the fold guard
            // allows, on a gentle curve (the default 50 gives about 0.62 of it). Before, the guard capped 50 and 100 alike.
            p = plan(source.body, fix, 1, { capShare: config.capShare });
            result = renderPosture(img, source.person, p, { bandShare: config.bandShare, layers: true,
                amount: Math.pow(Math.min(100, Math.max(0, layer.strength)) / 100, POSTURE_CURVE),
                fillMethod: detail < PLAIN_BACKGROUND_DETAIL ? "biharmonic" : "patchmatch" });
        }
        catch (e) {
            if (e instanceof RangeError)
                return refuse(`This posture edit could not be made: ${e.message}.`);
            throw e;
        }
        return { image: result.image, label: result.label,
            metrics: { fix, cap_share: config.capShare, band_share: config.bandShare,
                strength_used: result.strengthUsed, cap_scale: p.capScale, background_detail: Math.round(detail * 100) / 100, fill: String(result.metrics.fill) } };
    }
    throw new Error("This layer has no approved local renderer");
}
/** Render bottom to top; originals and input layers are never mutated.
 * Stages (web/src/editor/adjust/stack.ts documents them): develop (Adjust, Colour mixer, Curves,
 * Selective adjust), then every other layer in her order, then the crop geometry, then the
 * Adjust finish (vignette, grain, fade). With none of those tools the result is as before. */
export function renderLayers(source, layers, lightingRenderer) {
    const visible = effective(layers), plan = stagePlan(visible);
    // Age texture before the gender warp, so creases follow the face (appearance-stack.ts).
    const used = appearanceOrder(plan.looks).layers;
    let current = copyRGB(source.image);
    // A layer that moves the face (age reshape, gender) hands its points on, so a later face tool
    // edits the skin, eyes and lips where they now are, not where they were on the original.
    let face = source.face;
    const labels = [], metrics = [];
    if (plan.develop.length) {
        const developed = developStage(current, plan.develop);
        current = developed.image;
        labels.push(...developed.labels);
        metrics.push(...developed.metrics);
    }
    for (const item of used) {
        const result = applyLocalLayer(current, face === source.face ? source : { ...source, face }, item, lightingRenderer);
        // Lighting mixes by strength on an ease-out, so the gentle default (30) already shows the light.
        const weight = item.opacity * (item.kind === "lighting" ? 1 - (1 - item.strength / 100) ** 1.7 : 1);
        const before = current;
        current = mixOpacity(current, result.image, weight);
        face = nextFace(face, result.face, weight);
        labels.push(result.label);
        // Lighting: the colour shift is measured on this render (sampled mean, before vs after the
        // light at its strength), not taken from a model; Daylight is the identity and reads 0.
        const measured = item.kind === "lighting"
            ? { shift_delta_e: Math.round(ciede2000(photoMeanLab(before), photoMeanLab(current)) * 100) / 100,
                model_shift_delta_e: result.metrics.shift_delta_e ?? "n/a", delta_e_source: "render" } : {};
        metrics.push({ ...result.metrics, ...measured, opacity: item.opacity, strength: item.strength,
            simulation: item.simulation, source: item.provenance });
    }
    if (!plan.geometry && !plan.finish)
        return { image: current, labels, metrics, effective: visible.length, face };
    const beforeGeometry = current;
    const shaped = geometryStage(current, plan.geometry), finished = finishStage(shaped.image, plan.finish);
    labels.push(...shaped.labels, ...finished.labels);
    metrics.push(...shaped.metrics, ...finished.metrics);
    const geometry = plan.geometry ? readGeometry(plan.geometry.parameters) : null;
    const moved = geometry && !isIdentity(geometry);
    return { image: finished.image, labels, metrics, effective: visible.length, beforeGeometry,
        // Face points follow the crop (pixel-centre convention), so tools on the result find the face.
        face: moved && face ? face.map((p) => {
            const q = mapToOutput(source.image.width, source.image.height, geometry, [p[0] + 0.5, p[1] + 0.5]);
            return [q[0] - 0.5, q[1] - 0.5];
        }) : face,
        before: moved ? geometryStage(copyRGB(source.image), plan.geometry).image : undefined };
}
/** Independent low-level comparison metric, useful in the offline smoke test. */
export function pixelsChanged(a, b) {
    requireColour(a);
    requireColour(b);
    if (a.width !== b.width || a.height !== b.height)
        throw new RangeError("Different photo sizes");
    let pixels = 0, sum = 0;
    const n = a.width * a.height;
    for (let i = 0; i < n; i++) {
        let delta = 0;
        for (let c = 0; c < 3; c++)
            delta += Math.abs(a.data[i * a.channels + c] - b.data[i * b.channels + c]);
        if (delta > 0)
            pixels++;
        sum += delta / 3;
    }
    return { pixels, percent: 100 * pixels / n, mean: sum / n };
}
/** Default beard colour: dark brown, or near-black on deep skin (upper-lip luma under 90), where
 * dark brown strands barely separate from the skin. Her own colour choice always wins. */
export function defaultBeardColour(img, face) {
    const iod = Math.hypot(face[263][0] - face[33][0], face[263][1] - face[33][1]);
    const cx = (face[2][0] + face[0][0]) / 2, cy = (face[2][1] + face[0][1]) / 2, r = Math.max(2, Math.round(0.12 * iod));
    let sum = 0, count = 0;
    for (let y = Math.max(0, Math.round(cy - r / 2)); y <= Math.min(img.height - 1, Math.round(cy + r / 2)); y++)
        for (let x = Math.max(0, Math.round(cx - r)); x <= Math.min(img.width - 1, Math.round(cx + r)); x++) {
            const o = (y * img.width + x) * img.channels;
            sum += 0.299 * img.data[o] + 0.587 * img.data[o + 1] + 0.114 * img.data[o + 2];
            count++;
        }
    return count && sum / count < 90 ? "#0E0A09" : "#241915";
}
