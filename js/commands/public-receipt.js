import { ProRenderError } from './runtime.js';
const COMMANDS = new Set([
    'cleanup', 'upscale', 'studioquality', 'poseonly', 'identitylock',
]);
export function createPublicProReceipt(plan, result) {
    if (plan?.version !== 'beljour-pro-plan/1' || !Array.isArray(plan.steps) ||
        plan.steps.length < 1 || plan.steps.length > 12 ||
        (result?.quality !== 'preview' && result?.quality !== 'export') ||
        plan.steps.length !== result.steps.length ||
        !Number.isFinite(result.elapsedMs) || result.elapsedMs < 0) {
        throw new ProRenderError('invalid_public_receipt', 'A complete guarded run is required.');
    }
    const steps = result.steps.map((step, index) => {
        const expected = plan.steps[index];
        if (expected === undefined || step.index !== expected.index ||
            step.command !== expected.name || !COMMANDS.has(step.command) ||
            step.level !== (expected.level / 10).toFixed(1)) {
            throw new ProRenderError('invalid_public_receipt', 'Step proof does not match the recipe.');
        }
        const status = step.identity === null ? 'missing' :
            step.identity.status === 'warned' ? 'warned' : 'checked';
        return Object.freeze({
            command: step.command,
            level: step.level,
            identityStatus: status,
            syntheticEvidence: step.identity?.syntheticOnly ?? true,
            changed: step.changed,
        });
    });
    return Object.freeze({
        version: 'beljour-pro-receipt/1', quality: result.quality,
        stepCount: steps.length, steps,
        identityEnabled: plan.identity.enabled,
        withinAssumedBudget: result.withinBudget,
        originalUnchanged: result.originalUnchanged,
        elapsedMs: result.elapsedMs,
        releaseQualified: false,
    });
}
export function encodePublicProReceipt(receipt) {
    if (receipt?.version !== 'beljour-pro-receipt/1' ||
        (receipt.quality !== 'preview' && receipt.quality !== 'export') ||
        !Array.isArray(receipt.steps) || receipt.steps.length < 1 ||
        receipt.steps.length > 12 || receipt.stepCount !== receipt.steps.length ||
        !Number.isFinite(receipt.elapsedMs) || receipt.elapsedMs < 0 ||
        typeof receipt.originalUnchanged !== 'boolean' ||
        typeof receipt.withinAssumedBudget !== 'boolean' ||
        typeof receipt.identityEnabled !== 'boolean') {
        throw new ProRenderError('invalid_public_receipt', 'The public receipt has invalid fields.');
    }
    const safeSteps = receipt.steps.map(step => {
        if (!COMMANDS.has(step.command) || !/^[1-5]\.[0-9]$/.test(step.level) ||
            !['checked', 'warned', 'missing'].includes(step.identityStatus) ||
            typeof step.syntheticEvidence !== 'boolean' || typeof step.changed !== 'boolean') {
            throw new ProRenderError('invalid_public_receipt', 'Public step evidence is malformed.');
        }
        return {
            command: step.command, level: step.level, identityStatus: step.identityStatus,
            syntheticEvidence: step.syntheticEvidence, changed: step.changed,
        };
    });
    const safe = {
        version: 'beljour-pro-receipt/1', quality: receipt.quality,
        stepCount: safeSteps.length, steps: safeSteps,
        identityEnabled: receipt.identityEnabled,
        withinAssumedBudget: receipt.withinAssumedBudget,
        originalUnchanged: receipt.originalUnchanged,
        elapsedMs: receipt.elapsedMs, releaseQualified: false,
    };
    const value = JSON.stringify(safe);
    if (value.length > 4096) {
        throw new ProRenderError('receipt_size', 'Public receipt exceeds the metadata-only limit.');
    }
    return value;
}
//# sourceMappingURL=public-receipt.js.map