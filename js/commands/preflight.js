/** Photo-free Pro chain capacity and readiness check.
 * This is advisory: the identity-gated runtime still validates every output.
 * Author: John Khan.
 */
import { canonicalProPlan, createProPlan } from './plan.js';
import { checkedFrame, ProRenderError } from './runtime.js';
export const DEFAULT_PREFLIGHT_CAPACITY = Object.freeze({
    maxWorkingBytes: 512 * 1024 * 1024,
    maxOutputPixels: 24_000_000,
});
const BYTES_PER_PIXEL = Object.freeze({
    identitylock: 4,
    cleanup: 36,
    upscale: 32,
    studioquality: 32,
    poseonly: 44,
});
const EFFECTS = new Set([
    'cleanup', 'upscale', 'studioquality', 'poseonly',
]);
export function checkedPreflightCapacity(capacity = DEFAULT_PREFLIGHT_CAPACITY) {
    if (!Number.isSafeInteger(capacity.maxWorkingBytes) || capacity.maxWorkingBytes < 1 ||
        !Number.isSafeInteger(capacity.maxOutputPixels) ||
        capacity.maxOutputPixels < 1 || capacity.maxOutputPixels > 24_000_000) {
        throw new ProRenderError('invalid_preflight_capacity', 'Preflight capacity is invalid.');
    }
    return capacity;
}
function checkedCapabilities(capabilities) {
    if (typeof capabilities.identityGuardAvailable !== 'boolean' ||
        typeof capabilities.checkedPoseAvailable !== 'boolean' ||
        typeof capabilities.checkedMasksAvailable !== 'boolean' ||
        !(capabilities.enabledEffects instanceof Set)) {
        throw new ProRenderError('invalid_preflight_capability', 'Preflight requires checked capabilities.');
    }
    for (const effect of capabilities.enabledEffects) {
        if (!EFFECTS.has(effect)) {
            throw new ProRenderError('invalid_preflight_capability', 'Unrecognized or protected effect.');
        }
    }
}
export function preflightProPlan(plan, frame, capabilities, quality = 'preview', capacity = DEFAULT_PREFLIGHT_CAPACITY) {
    checkedFrame(frame);
    checkedCapabilities(capabilities);
    checkedPreflightCapacity(capacity);
    if (quality !== 'preview' && quality !== 'export') {
        throw new ProRenderError('invalid_quality', 'Quality must be preview or export.');
    }
    if (plan.version !== 'beljour-pro-plan/1' || !Array.isArray(plan.steps) ||
        plan.steps.length < 1 || plan.steps.length > 12) {
        throw new ProRenderError('invalid_preflight', 'A validated Pro plan is required.');
    }
    const validatedPlan = createProPlan(plan.steps, plan.identity);
    if (!validatedPlan.identity.enabled && !validatedPlan.identity.explicit_user_override) {
        throw new ProRenderError('identity_override_required', 'Identity changes require a user choice.');
    }
    const steps = [];
    const warnings = [];
    const issues = [];
    let width = frame.width;
    let height = frame.height;
    let peak = frame.pixels.byteLength;
    for (const [index, step] of validatedPlan.steps.entries()) {
        if (step.index !== index || !(step.name in BYTES_PER_PIXEL) ||
            !Number.isInteger(step.level) || step.level < 10 || step.level > 50 ||
            (step.scale !== 2 && step.scale !== 4)) {
            throw new ProRenderError('invalid_preflight', 'Plan contains invalid command parameters.');
        }
        if (step.name === 'upscale') {
            width *= step.scale;
            height *= step.scale;
        }
        const pixelCount = width * height;
        const bytes = pixelCount * (BYTES_PER_PIXEL[step.name] + frame.channels) +
            (step.name === 'upscale' ? frame.pixels.byteLength : 0);
        peak = Math.max(peak, bytes);
        const stepIssues = [];
        const stepWarnings = [];
        if (validatedPlan.identity.enabled && !capabilities.identityGuardAvailable) {
            stepIssues.push('identity_model_unavailable');
        }
        if (step.name !== 'identitylock' && !capabilities.enabledEffects.has(step.name)) {
            stepIssues.push('engine_unavailable');
        }
        if (step.name === 'poseonly' && step.level > 10 && !capabilities.checkedPoseAvailable) {
            stepIssues.push('pose_evidence_missing');
        }
        if (pixelCount > capacity.maxOutputPixels)
            stepIssues.push('pixel_budget_exceeded');
        if (bytes > capacity.maxWorkingBytes)
            stepIssues.push('working_memory_exceeded');
        if (!validatedPlan.identity.enabled)
            stepWarnings.push('identity_explicitly_disabled');
        if (!capabilities.checkedMasksAvailable &&
            ['cleanup', 'upscale', 'studioquality'].includes(step.name)) {
            stepWarnings.push('face_masks_unavailable');
        }
        for (const item of stepIssues)
            if (!issues.includes(item))
                issues.push(item);
        for (const item of stepWarnings)
            if (!warnings.includes(item))
                warnings.push(item);
        steps.push(Object.freeze({
            index, command: step.name, width, height, pixelCount,
            projectedWorkingBytes: bytes, errors: stepIssues, warnings: stepWarnings,
            ready: stepIssues.length === 0,
        }));
    }
    return Object.freeze({
        version: 'beljour-pro-preflight/1',
        status: issues.length > 0 ? 'blocked' : 'ready',
        quality, identityOn: validatedPlan.identity.enabled,
        sourcePixels: frame.width * frame.height, resultPixels: width * height,
        estimatedPeakBytes: peak, steps, issues, warnings,
        planCanonical: canonicalProPlan(validatedPlan), releaseQualified: false,
    });
}
//# sourceMappingURL=preflight.js.map