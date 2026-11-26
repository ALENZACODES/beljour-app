/** Offline preflight regression with synthetic frame dimensions only.
 * Author: John Khan.
 */
import { createProPlan, parseProCommands, userIdentityOverride } from './plan.js';
import { checkedPreflightCapacity, preflightProPlan, } from './preflight.js';
import { ProRenderError } from './runtime.js';
function check(condition, description) {
    if (!condition)
        throw new Error(`Preflight: ${description}`);
}
function expectError(code, action) {
    try {
        action();
    }
    catch (error) {
        check(error instanceof ProRenderError && error.code === code, `expected ${code}`);
        return;
    }
    throw new Error(`Missing ${code}`);
}
function frame(width = 64, height = 48) {
    return { width, height, channels: 4, pixels: new Uint8Array(width * height * 4) };
}
function ready() {
    return { identityGuardAvailable: true,
        enabledEffects: new Set(['cleanup', 'upscale', 'studioquality', 'poseonly']),
        checkedPoseAvailable: true, checkedMasksAvailable: true };
}
export function testProPreflight() {
    let count = 0;
    const source = frame();
    const original = new Uint8Array(source.pixels);
    const plan = parseProCommands('/cleanup 2.4 /upscale 2x /studioquality 3.1 /poseonly 1.8 /identitylock');
    const report = preflightProPlan(plan, source, ready());
    check(report.status === 'ready' && report.steps.length === 5, 'complete chain ready');
    check(report.steps[0]?.width === 64 && report.steps[1]?.width === 128, 'upscale modifies later step dimensions');
    check(report.steps[4]?.height === 96 && report.resultPixels === 128 * 96, 'final dimensions derived from chain');
    check(report.identityOn && report.releaseQualified === false, 'guarded and not release-qualified');
    check(source.pixels.every((value, index) => value === original[index]), 'original unchanged');
    count += 5;
    const noModel = preflightProPlan(plan, source, { ...ready(), identityGuardAvailable: false });
    check(noModel.status === 'blocked' && noModel.issues.includes('identity_model_unavailable'), 'fail closed without model');
    count++;
    const neutral = preflightProPlan(parseProCommands('/poseonly 1.0'), source, { ...ready(), checkedPoseAvailable: false });
    check(neutral.status === 'ready', 'neutral pose needs no geometry');
    count++;
    const poseMissing = preflightProPlan(parseProCommands('/poseonly 2.0'), source, { ...ready(), checkedPoseAvailable: false });
    check(poseMissing.status === 'blocked' && poseMissing.issues.includes('pose_evidence_missing'), 'non-neutral pose needs checked controls');
    count++;
    const maskMissing = preflightProPlan(plan, source, { ...ready(), checkedMasksAvailable: false });
    check(maskMissing.status === 'ready' && maskMissing.warnings.includes('face_masks_unavailable'), 'missing masks reported without pretending to detect faces');
    count++;
    const unavailable = preflightProPlan(plan, source, { ...ready(), enabledEffects: new Set(['cleanup']) });
    check(unavailable.status === 'blocked' && unavailable.issues.includes('engine_unavailable'), 'missing effects are blocked');
    count++;
    const withoutIdentity = createProPlan(plan.steps, userIdentityOverride(false));
    const opted = preflightProPlan(withoutIdentity, source, { ...ready(), identityGuardAvailable: false });
    check(opted.status === 'ready' && opted.warnings.includes('identity_explicitly_disabled'), 'only explicit user override permits disabled identity');
    count++;
    const big = preflightProPlan(parseProCommands('/upscale 4x'), frame(2048, 1024), ready());
    check(big.status === 'blocked' && big.issues.includes('pixel_budget_exceeded'), 'upscale growth fails before processing');
    count++;
    const smallBudget = preflightProPlan(plan, source, ready(), 'preview', { maxWorkingBytes: 100_000, maxOutputPixels: 24_000_000 });
    check(smallBudget.issues.includes('working_memory_exceeded'), 'memory cap enforced');
    count++;
    expectError('invalid_preflight_capacity', () => checkedPreflightCapacity({
        maxWorkingBytes: 0, maxOutputPixels: 2,
    }));
    count++;
    expectError('invalid_preflight_capability', () => preflightProPlan(plan, source, {
        ...ready(), enabledEffects: new Set(['identitylock']),
    }));
    count++;
    expectError('invalid_quality', () => preflightProPlan(plan, source, ready(), 'fast'));
    count++;
    const again = preflightProPlan(plan, source, ready());
    check(JSON.stringify(report) === JSON.stringify(again), 'deterministic repeated report');
    count++;
    return count;
}
//# sourceMappingURL=test-preflight-r3h.js.map