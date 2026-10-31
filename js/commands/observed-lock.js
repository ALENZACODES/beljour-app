import { checkedFrame, ProRenderError, unchanged } from './runtime.js';
function refuse(message) {
    throw new ProRenderError('invalid_lock_capture', message);
}
function sameLayout(a, b) {
    return a.width === b.width && a.height === b.height && a.channels === b.channels;
}
function sameAlpha(a, b) {
    if (!sameLayout(a, b))
        return false;
    if (a.channels === 3)
        return true;
    for (let i = 3; i < a.pixels.byteLength; i += 4) {
        if (a.pixels[i] !== b.pixels[i])
            return false;
    }
    return true;
}
function guarded(result, enabled) {
    const decision = result.steps[0]?.identity;
    return enabled && decision !== undefined && decision !== null &&
        ['kept', 'softened', 'restored'].includes(decision.status) &&
        Number.isInteger(decision.identityMatch) && decision.identityMatch >= 0 &&
        decision.identityMatch <= 100 && typeof decision.syntheticOnly === 'boolean';
}
export function collectObservedLock(plan, original, preview, exported, options = {}) {
    checkedFrame(original);
    checkedFrame(preview.image);
    checkedFrame(exported.image);
    if (!Array.isArray(plan.steps) || plan.steps.length !== 1 ||
        preview.quality !== 'preview' || exported.quality !== 'export' ||
        preview.steps.length !== 1 || exported.steps.length !== 1 ||
        !sameLayout(preview.image, exported.image) ||
        !preview.originalUnchanged || !exported.originalUnchanged) {
        return refuse('A single matching guarded preview/export plan is required.');
    }
    const step = plan.steps[0];
    const p = preview.steps[0];
    const e = exported.steps[0];
    if (step === undefined || p === undefined || e === undefined ||
        p.index !== 0 || e.index !== 0 || p.command !== step.name ||
        e.command !== step.name ||
        p.level !== (step.level / 10).toFixed(1) ||
        e.level !== (step.level / 10).toFixed(1)) {
        return refuse('Preview and export must identify the same decimal command.');
    }
    if (step.name === 'upscale') {
        if (preview.image.width !== original.width * step.scale ||
            preview.image.height !== original.height * step.scale) {
            return refuse('Upscale dimensions differ from the plan.');
        }
    }
    else if (!sameLayout(original, preview.image)) {
        return refuse('Unexpected image resizing in Pro lock capture.');
    }
    const reference = step.name === 'upscale' ? options.upscaleReference ?? null : original;
    if (reference !== null) {
        checkedFrame(reference);
        if (!sameLayout(reference, preview.image)) {
            return refuse('Checked upscale reference geometry differs.');
        }
    }
    const identityApplied = guarded(preview, plan.identity.enabled) &&
        guarded(exported, plan.identity.enabled);
    let alphaUnchanged = reference !== null && sameAlpha(reference, preview.image) &&
        sameAlpha(reference, exported.image);
    if (reference === null && original.channels === 3)
        alphaUnchanged = true;
    let neutralCorrect = true;
    if (step.level === 10) {
        neutralCorrect = reference !== null &&
            unchanged(reference, preview.image) && unchanged(reference, exported.image) &&
            (step.name === 'upscale' || (!p.changed && !e.changed));
    }
    let protectedUnchanged = options.checkedProtectedRegions === true;
    let skinLiftL = null;
    let poseMinimumJacobian = null;
    let poseRetention = null;
    if (step.name === 'studioquality') {
        const studio = options.studio;
        if (studio !== null && studio !== undefined) {
            if (studio.preview || studio.level !== (step.level / 10).toFixed(1)) {
                return refuse('Studio evidence belongs to a different render.');
            }
            protectedUnchanged = options.checkedProtectedRegions === true &&
                studio.protectedUnchanged && studio.alphaUnchanged;
            skinLiftL = studio.maximumSkinLiftL ?? (neutralCorrect ? 0 : null);
        }
        else {
            protectedUnchanged = false;
        }
    }
    if (step.name === 'poseonly') {
        const pose = options.pose;
        if (pose !== null && pose !== undefined) {
            if (pose.preview || pose.level !== (step.level / 10).toFixed(1)) {
                return refuse('Pose evidence belongs to a different render.');
            }
            protectedUnchanged = options.checkedProtectedRegions === true &&
                pose.protectedUnchanged && pose.alphaUnchanged;
            poseMinimumJacobian = pose.foldMinimum ?? (neutralCorrect ? 1 : null);
            poseRetention = pose.foldRetention ?? (neutralCorrect ? 1 : null);
        }
        else {
            protectedUnchanged = false;
        }
    }
    if (step.name === 'identitylock') {
        protectedUnchanged = unchanged(original, exported.image);
    }
    return Object.freeze({ command: step.name, levelTenths: step.level,
        previewMs: preview.elapsedMs, exportMs: exported.elapsedMs,
        identityApplied, alphaUnchanged, protectedUnchanged, neutralCorrect,
        skinLiftL, poseMinimumJacobian, poseRetention,
        measuredDevice: false });
}
