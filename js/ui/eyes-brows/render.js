/** Shared worker and test dispatcher for the new local studio. Author: John Khan. */
import { renderEyes } from "../../engines/eyes/index.js";
import { isMakeupRefusal, renderEyeMakeup } from "../../engines/eyes/makeup.js";
import { renderBrows } from "../../engines/brows/index.js";
import { renderArtistic } from "../../filters/artistic/index.js";
import { featureById } from "./catalogue.js";
import { checkedControl } from "./controls.js";
import { validateAnatomy, validateImage, validateLandmarks, validateTrace } from "./input.js";
export function validateJob(job) {
    if (!job || !Number.isSafeInteger(job.id) || job.id < 1)
        throw new RangeError("Invalid local preview job.");
    validateImage(job.image);
    const feature = featureById(job.feature);
    if (feature.requiresMesh)
        validateLandmarks(job.landmarks);
    if (!Number.isFinite(job.amount) || job.amount < 0 || job.amount > 1)
        throw new RangeError("Invalid preview amount.");
    if (!Number.isFinite(job.angle) || Math.abs(job.angle) > 80)
        throw new RangeError("Invalid light angle.");
    if (typeof job.adultConfirmed !== "boolean")
        throw new RangeError("Invalid adult confirmation.");
    if (feature.requiresAdult && !job.adultConfirmed)
        throw new RangeError("Adult confirmation is required.");
    validateAnatomy(job.anatomy);
    if (!Array.isArray(job.lashes) || job.lashes.length > 256)
        throw new RangeError("Invalid lash evidence.");
    job.lashes.forEach(validateTrace);
    if (feature.requiresTraces && job.lashes.length === 0)
        throw new RangeError("Observed lashes are required.");
    if (feature.choices.length && !feature.choices.some(choice => choice.value === job.style))
        throw new RangeError("Invalid feature style.");
    if (job.hairMask !== null) {
        if (!(job.hairMask instanceof Float64Array) || job.hairMask.length !== job.image.width * job.image.height)
            throw new RangeError("Invalid hair evidence.");
        for (const alpha of job.hairMask)
            if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1)
                throw new RangeError("Invalid hair coverage.");
    }
    else if (feature.requiresHair)
        throw new RangeError("Observed hair evidence is required.");
    if (!job.controls || typeof job.controls !== "object" || Array.isArray(job.controls))
        throw new RangeError("Invalid feature controls.");
    for (const [key, value] of Object.entries(job.controls)) {
        if (typeof value !== "number")
            throw new RangeError("Unknown control payload.");
        checkedControl(job.feature, key, value);
    }
}
export function renderJob(job, clock = () => performance.now()) {
    validateJob(job);
    const started = clock(), family = featureById(job.feature).family;
    if (job.feature === "eye-makeup") {
        const control = (key) => typeof job.controls[key] === "number" ? job.controls[key] : 1;
        const result = renderEyeMakeup(job.image, job.landmarks, { strength: job.amount * 100, look: job.style,
            shadow: control("shadow"), liner: control("liner"), mascara: control("mascara"), anatomy: job.anatomy, lashes: job.lashes });
        if (isMakeupRefusal(result))
            throw new RangeError(result.message);
        return { pixels: result.image, label: result.label, warnings: [...(result.report.warnings ?? [])],
            metrics: result.report, elapsedMs: Math.max(0, clock() - started) };
    }
    if (family === "eyes") {
        const request = { feature: job.feature, amount: job.amount, style: job.style,
            anatomy: job.anatomy, observed_lashes: job.lashes, angle: job.angle, ...job.controls };
        const result = renderEyes(job.image, job.landmarks, request, job.hairMask ?? undefined);
        if (result.report.status === "unavailable")
            throw new RangeError(String(result.report.reason ?? "Required eye observations are missing."));
        return { pixels: result.image, label: result.report.label, warnings: [...result.report.warnings],
            metrics: result.report, elapsedMs: Math.max(0, clock() - started) };
    }
    if (family === "brows") {
        const options = { amount: job.amount, ...job.controls };
        if (job.feature === "W69" || job.feature === "W71")
            options.state = job.style;
        if (job.feature === "W72")
            options.method = job.style;
        if (job.feature === "W71" || job.feature === "W72")
            options.adultConfirmed = job.adultConfirmed;
        if (job.feature === "W74")
            options.site = job.style;
        const result = renderBrows(job.image, job.landmarks, job.feature, options);
        if (result.status === "unavailable")
            throw new RangeError(result.warnings.join(" ") || "More observed brow detail is required.");
        return { pixels: result.image, label: result.label, warnings: [...result.warnings],
            metrics: { ...result.metrics, details: result.details }, elapsedMs: Math.max(0, clock() - started) };
    }
    const result = renderArtistic(job.feature, job.image, {
        landmarks: job.landmarks ?? undefined, hairMask: job.hairMask ?? undefined,
        params: { amount: job.amount, ...job.controls, ...(job.feature === "rain-expression" ? { adult_confirmed: job.adultConfirmed } : {}) },
    });
    return { pixels: result.image, label: result.label, warnings: [...result.warnings],
        metrics: { ...result.metrics, geometry: result.geometry }, elapsedMs: Math.max(0, clock() - started) };
}
//# sourceMappingURL=render.js.map