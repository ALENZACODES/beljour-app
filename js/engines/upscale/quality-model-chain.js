/** Reviewed local model chain for the HD 1080 / 4K Quality Generator (r38e).
 * Order: SwinIR pre-clean -> Real-ESRGAN upscale -> bounded texture graft from
 * the pre-cleaned photo -> default-on source-reference face lock and check.
 * It runs only on a `LocalVerifiedModelSession` from `loadReviewedLocalModels`,
 * so every weight file was rights-checked and hashed before a runtime saw it.
 * Without such a session (no reviewed weights staged, no local runtime, or a
 * disposed session) the chain refuses; it never quietly substitutes the
 * classical engine, and the classical r37e pipeline stays the active default.
 * A model stage that fails or returns a malformed image stops the job.
 * The face lock reference is an independent classical resize of the original,
 * never model output, so the lock does not trust the stages it protects; at 5.0
 * marked face pixels equal that reference exactly. This is a pixel guard, not
 * biometric identity verification. The audit names the verified weight digests
 * that actually ran; export refuses an audit that names anything else.
 * Paired diagnostics say they measured model processing. No fetch, no upload.
 * Author: John Khan.
 */
import { canvasEncoder } from "../../save/export.js";
import { ModelGateError } from "../../vision/model-registry.js";
import { legacyAmount } from "../../pro/strength.js";
import { exportColourSafe } from "./colour-export.js";
import { planCustomQuality } from "./quality-aspect.js";
import { checkTierAudit } from "./quality-export-tier.js";
import { cpuResizer, defaultResizer, resizeCoverage } from "./quality-generator.js";
import { lockToIdentity, verifyIdentityLock } from "./quality-identity.js";
import { PROXY_SIZES, downscaleHalf, drawnChart } from "./quality-paired.js";
import { psnrRgb, ssimLuma } from "./quality-metrics.js";
import { STAGES, TIER_LABEL, checkedLevels, checkedPhase, } from "./quality-pipeline.js";
import { checkedRaster, copyRaster, throwIfAborted, wipe } from "./quality-raster.js";
import { resamplePlane, resizeStage, sourceResidual, transportTexture } from "./quality-stages.js";
import { checkedSelection } from "./safe.js";
export const MODEL_GENERATOR = "local-model-chain";
export const CLASSICAL_GENERATOR = "classical-local";
export const MODEL_STAGES = ["model-preclean", "model-upscale", "texture", "identity"];
export const MODEL_TIER_LABEL = "BELJOUR Quality Generator HD/4K: reviewed local SwinIR pre-clean and " +
    "Real-ESRGAN upscale with bounded source texture. Marked face pixels match the independently resized " +
    "original at 5.0; a pixel guard, not identity verification.";
/** Roles whose output reaches the image; the matte model is diagnostic only. */
export const CHAIN_ROLES = ["swinir_preclean", "realesrgan_upscale"];
/** Digests of the chain stages in pipeline order. */
export function modelDigests(models) {
    return Object.freeze(CHAIN_ROLES.flatMap(role => models.filter(model => model.role === role)
        .map(model => Object.freeze({ role, modelId: model.modelId, weightsSha256: model.weightsSha256 }))));
}
/** The session the chain may use, or a refusal that keeps the classical engine in charge. */
export function activeModelChain(models) {
    if (!models) {
        throw new ModelGateError("No reviewed local model weights are installed; the classical engine stays active");
    }
    if (models.disposed)
        throw new ModelGateError("Model session has been disposed");
    if (typeof models.preclean !== "function" || typeof models.upscale !== "function" ||
        modelDigests(models.verifiedModels ?? []).length !== CHAIN_ROLES.length) {
        throw new ModelGateError("The model session lacks verified pre-clean and upscale weights");
    }
    return models;
}
/** Which engine a Quality Generator session will run, for accurate labelling. */
export function describeEngine(models) {
    if (!models)
        return { engine: CLASSICAL_GENERATOR, label: TIER_LABEL, models: [] };
    return { engine: MODEL_GENERATOR, label: MODEL_TIER_LABEL, models: modelDigests(activeModelChain(models).verifiedModels) };
}
/** Run one model stage; anything but a cancellation becomes a refusal with no classical substitute. */
async function modelStage(stage, run) {
    try {
        return await run();
    }
    catch (error) {
        if (error?.name === "AbortError" || error instanceof ModelGateError)
            throw error;
        throw new ModelGateError(`${stage} model failed; no classical substitute was used`);
    }
}
/** Move the photo toward the model pre-clean by the denoise level; alpha stays the photo's own. */
function blendPreclean(working, cleaned, level) {
    const amount = legacyAmount(level);
    const data = new Uint8ClampedArray(working.data);
    for (let i = 0; i < data.length; i++) {
        if (i % 4 !== 3)
            data[i] = Math.round(working.data[i] + (cleaned[i] - working.data[i]) * amount);
    }
    return { width: working.width, height: working.height, data };
}
export async function runModelQualityPipeline(source, selection, plan, levels, models, options = {}) {
    const chain = activeModelChain(models);
    const digests = modelDigests(chain.verifiedModels);
    checkedRaster(source);
    const phase = options.phase ?? "release";
    checkedPhase(plan, phase);
    if (source.width !== plan.sourceWidth || source.height !== plan.sourceHeight) {
        throw new RangeError("The plan was made for another photo size");
    }
    const mask = checkedSelection(selection, source.width, source.height);
    const checked = checkedLevels(levels);
    const resizer = options.resizer ?? defaultResizer();
    const { signal } = options;
    const { width, height } = plan;
    const owned = [];
    const planes = [];
    try {
        throwIfAborted(signal);
        const working = copyRaster(source);
        owned.push(working);
        const raw = await modelStage("pre-clean", () => chain.preclean(working, signal));
        owned.push({ width: working.width, height: working.height, data: raw });
        const cleaned = blendPreclean(working, raw, checked.denoiseLevel);
        owned.push(cleaned);
        throwIfAborted(signal);
        const upscaled = await modelStage("upscale", () => chain.upscale(cleaned, width, height, signal));
        owned.push({ width, height, data: upscaled });
        throwIfAborted(signal);
        const residual = sourceResidual(cleaned);
        const graft = resamplePlane(residual, cleaned.width, cleaned.height, width, height);
        planes.push(residual, graft);
        const textured = transportTexture(upscaled, width, height, graft, checked.detailLevel);
        owned.push({ width, height, data: textured.pixels });
        throwIfAborted(signal);
        const original = copyRaster(source);
        owned.push(original);
        const reference = await resizeStage(original, width, height, resizer);
        owned.push({ width, height, data: reference });
        throwIfAborted(signal);
        const coverage = resizeCoverage(mask, source.width, source.height, width, height);
        const image = lockToIdentity(textured.pixels, reference, coverage, checked.lockLevel);
        // Alpha follows the classical reference everywhere, not only inside the face.
        for (let i = 3; i < image.length; i += 4)
            image[i] = reference[i];
        const lock = verifyIdentityLock(image, reference, coverage, checked.lockLevel);
        if (lock.mismatches !== 0) {
            image.fill(0);
            throw new RangeError("Face pixels differ from the resized original; the result was discarded");
        }
        const audit = Object.freeze({
            schema: "beljour-quality-tier-audit/1", tier: plan.tier, phase, experimental: plan.experimental,
            sourceWidth: source.width, sourceHeight: source.height, width, height, ...checked,
            noPerson: selection.noFace === true, stages: [...MODEL_STAGES],
            protectedPixels: lock.protectedPixels, fullyLockedPixels: lock.fullyLockedPixels,
            identityMismatches: 0, maxTextureDelta: textured.maxDelta, chromaShift: textured.chromaShift,
            generator: MODEL_GENERATOR, label: MODEL_TIER_LABEL, models: digests,
        });
        return { image: { width, height, data: image }, audit };
    }
    finally {
        wipe(...owned);
        for (const plane of planes)
            plane.fill(0);
    }
}
/** Model-specific checks first, then the shared r37e size, count and level bounds. */
export function checkModelTierAudit(result, verified) {
    const audit = result?.audit;
    if (!audit || typeof audit !== "object")
        throw new RangeError("Export needs a complete tier audit");
    const { models: claimed, generator, label, stages, ...shared } = audit;
    if (generator !== MODEL_GENERATOR || label !== MODEL_TIER_LABEL) {
        throw new RangeError("Export needs the reviewed model chain label");
    }
    if (!Array.isArray(stages) || stages.join(",") !== MODEL_STAGES.join(",")) {
        throw new RangeError("The audit does not list the required stages");
    }
    const expected = modelDigests(verified);
    if (expected.length !== CHAIN_ROLES.length || !Array.isArray(claimed) ||
        JSON.stringify(claimed) !== JSON.stringify(expected)) {
        throw new RangeError("The audit does not name the verified models that ran");
    }
    // The remaining fields are the r37e tier audit; reuse its independent re-plan and bounds.
    checkTierAudit({
        image: result.image,
        audit: { ...shared, generator: CLASSICAL_GENERATOR, label: TIER_LABEL, stages: [...STAGES] },
    });
}
export async function exportModelTierRelease(result, verified, settings = {}, encoder = canvasEncoder()) {
    checkModelTierAudit(result, verified);
    const { tier, experimental } = result.audit;
    const file = await exportColourSafe(result.image, tier === "uhd4k" ? "BELJOUR_4K_experimental" : "BELJOUR_HD1080", settings, encoder);
    return { ...file, tier, experimental };
}
function rounded(value, places) {
    return Number(value.toFixed(places));
}
/** The r37e drawn-chart comparison, recovered by the model chain instead of the classical stages. */
export async function pairedModelDiagnostic(family, models, resizer = cpuResizer, levels = { detailLevel: 3, denoiseLevel: 2, lockLevel: 5 }) {
    const size = PROXY_SIZES[family];
    if (!size)
        throw new RangeError("Unknown diagnostic family");
    const chart = drawnChart(size.width, size.height);
    const low = downscaleHalf(chart);
    const owned = [chart, low];
    try {
        const plan = planCustomQuality(low.width, low.height, size.width, size.height);
        const noPerson = { mask: new Uint8Array(low.width * low.height), confirmed: true, noFace: true };
        const recovered = await runModelQualityPipeline(low, noPerson, plan, levels, models, { resizer, phase: "diagnostic" });
        owned.push(recovered.image);
        const basic = { width: size.width, height: size.height, data: await resizer(low, size.width, size.height) };
        owned.push(basic);
        const pipelinePsnr = rounded(psnrRgb(chart, recovered.image), 4);
        const baselinePsnr = rounded(psnrRgb(chart, basic), 4);
        const pipelineSsim = rounded(ssimLuma(chart, recovered.image), 5);
        const baselineSsim = rounded(ssimLuma(chart, basic), 5);
        return {
            schema: "beljour-quality-paired/1", family, width: size.width, height: size.height,
            pipelinePsnr, baselinePsnr, pipelineSsim, baselineSsim,
            psnrDelta: rounded(pipelinePsnr - baselinePsnr, 4), ssimDelta: rounded(pipelineSsim - baselineSsim, 5),
            evidence: "SYNTHETIC_DRAWN_CHART", humanQuality: "NOT_RUN", releaseGate: "NOT_RUN",
            processing: MODEL_GENERATOR, models: recovered.audit.models,
        };
    }
    finally {
        wipe(...owned);
    }
}
/** Tag an r37e classical report with what it measured. */
export function classicalPaired(report) {
    return { ...report, processing: CLASSICAL_GENERATOR, models: [] };
}
