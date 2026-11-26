/** Public receipt never serializes source pixels or biometric features.
 * All inputs are synthetic metadata. Author: John Khan.
 */
import { createPublicProReceipt, encodePublicProReceipt } from './public-receipt.js';
import { createProPlan, DEFAULT_IDENTITY_POLICY } from './plan.js';
import { levelFromTenths } from './levels.js';
import { ProRenderError } from './runtime.js';
function check(value, message) {
    if (!value)
        throw new Error(`receipt ${message}`);
}
function failure(code, fn) {
    try {
        fn();
    }
    catch (error) {
        if (error instanceof ProRenderError && error.code === code)
            return;
        throw error;
    }
    throw new Error(`receipt ${code} expected`);
}
function objects() {
    const plan = createProPlan([
        { name: 'cleanup', level: levelFromTenths(24), scale: 2, index: 0 },
        { name: 'poseonly', level: levelFromTenths(10), scale: 2, index: 1 },
    ]);
    const frame = { width: 1, height: 1, channels: 4,
        pixels: new Uint8Array([14, 55, 71, 255]) };
    const result = {
        image: frame, quality: 'export', elapsedMs: 12, targetMs: 2000,
        withinBudget: true, originalUnchanged: true,
        steps: [
            { index: 0, command: 'cleanup', level: '2.4', changed: true,
                cacheHit: false, identity: { identityMatch: 99, status: 'kept', syntheticOnly: true } },
            { index: 1, command: 'poseonly', level: '1.0', changed: false,
                cacheHit: false, identity: { identityMatch: 100, status: 'kept', syntheticOnly: true } },
        ],
    };
    return { plan, result };
}
export function testPublicReceiptR5H() {
    let count = 0;
    const { plan, result } = objects();
    const receipt = createPublicProReceipt(plan, result);
    check(receipt.stepCount === 2 && receipt.steps[1].command === 'poseonly', 'both steps represented');
    check(receipt.identityEnabled && receipt.steps.every(step => step.identityStatus === 'checked'), 'identity provenance present');
    check(receipt.steps.every(step => step.syntheticEvidence), 'synthetic proof distinguished');
    check(!receipt.releaseQualified, 'receipt is never release approval');
    check(receipt.quality === 'export' && receipt.elapsedMs === 12, 'timing and quality reported');
    count += 5;
    const encoded = encodePublicProReceipt(receipt);
    check(encoded.length < 4096, 'bounded metadata');
    check(!encoded.includes('pixels') && !encoded.includes('identityMatch'), 'no pixels or biometric value serialized');
    check(!encoded.includes('sourceKey') && !encoded.includes('embedding'), 'no source id or embedding serialized');
    count += 3;
    const withPrivate = { ...result, photoFilename: 'secret-private.png',
        landmarks: [[0.1, 0.2]], identityModelSecret: 'never-share' };
    const safe = encodePublicProReceipt(createPublicProReceipt(plan, withPrivate));
    check(!safe.includes('secret-private') && !safe.includes('never-share'), 'unknown private fields cannot appear');
    count++;
    const forged = { ...receipt, rawPhoto: 'do-not-export', releaseQualified: true };
    const forgedEncoded = encodePublicProReceipt(forged);
    check(!forgedEncoded.includes('do-not-export') &&
        JSON.parse(forgedEncoded).releaseQualified === false, 'forged extra fields stripped');
    count++;
    const noIdentity = { ...result, steps: result.steps.map(step => ({ ...step, identity: null })) };
    const unproven = createPublicProReceipt(plan, noIdentity);
    check(unproven.steps.every(step => step.identityStatus === 'missing'), 'missing identity never becomes checked');
    count++;
    const warned = { ...result, steps: [
            { ...result.steps[0], identity: { identityMatch: 55, status: 'warned', syntheticOnly: true } },
            result.steps[1],
        ] };
    check(createPublicProReceipt(plan, warned).steps[0].identityStatus === 'warned', 'warning persists');
    count++;
    failure('invalid_public_receipt', () => createPublicProReceipt(plan, { ...result, steps: result.steps.slice(1) }));
    failure('invalid_public_receipt', () => createPublicProReceipt(plan, { ...result, steps: [{ ...result.steps[0], level: '5.0' }, result.steps[1]] }));
    failure('invalid_public_receipt', () => createPublicProReceipt(plan, { ...result, elapsedMs: Number.NaN }));
    count += 3;
    check(plan.identity === DEFAULT_IDENTITY_POLICY || plan.identity.enabled, 'default identity remains enabled');
    count++;
    return count;
}
//# sourceMappingURL=test-public-receipt-r5h.js.map