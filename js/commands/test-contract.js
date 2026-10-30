/** Executable typed contract tests, never imported by the production entry point.
 * Author: John Khan.
 */
import { LEVEL_TICKS, isCompliantSlider, levelDose, parseLevel } from './levels.js';
import { DEFAULT_IDENTITY_POLICY, canonicalProPlan, createProPlan, editProLevel, parseProCommands, userIdentityOverride, } from './plan.js';
import { measureFaceFixer } from './face-fixer.js';
import { ProPreviewCoordinator } from './preview.js';
import { ProBrowserRuntime, unchanged, } from './runtime.js';
function assert(test, reason) {
    if (!test)
        throw new Error(`Contract assertion: ${reason}`);
}
function failure(code, operation) {
    try {
        operation();
    }
    catch (error) {
        assert(error.code === code, `expected ${code}`);
        return;
    }
    throw new Error(`Expected error ${code}`);
}
async function rejects(code, operation) {
    try {
        await operation();
    }
    catch (error) {
        assert(error.code === code, `expected ${code}`);
        return;
    }
    throw new Error(`Expected async error ${code}`);
}
function source(value = 32) {
    const pixels = new Uint8Array(8 * 8 * 4);
    for (let index = 0; index < 64; index++) {
        const offset = index * 4;
        pixels.set([value + index % 7, value + index % 13, value, 255], offset);
    }
    return { width: 8, height: 8, channels: 4, pixels };
}
class GuardDouble {
    modelEvidenceKey = 'synthetic-evidence-only';
    calls = 0;
    async enforce(_original, edited) {
        this.calls++;
        return { frame: edited, identityMatch: 99, status: 'kept', syntheticOnly: true };
    }
}
export async function runContractTests() {
    let tests = 0;
    for (let tenths = 10; tenths <= 50; tenths++) {
        assert(parseLevel((tenths / 10).toFixed(1)) === tenths, 'decimal round-trip');
        tests++;
    }
    assert(LEVEL_TICKS.length === 41, 'all level ticks');
    assert(levelDose(parseLevel('1.0')) === 0.2, 'subtle level remains a real effect');
    assert(levelDose(parseLevel('5.0')) === 1, 'strongest level is full effect');
    assert(isCompliantSlider('1.0', '5.0', '0.1'), 'slider contract');
    assert(!isCompliantSlider(0, 100, 1), 'legacy slider rejected');
    tests += 5;
    for (const invalid of [0.9, 5.1, 2.25, NaN, Infinity]) {
        failure('invalid_level', () => parseLevel(invalid));
        tests++;
    }
    const plan = parseProCommands('/cleanup 2.6 /studioquality 3.1 /poseonly 4.8');
    assert(plan.identity.enabled && !plan.identity.explicit_user_override, 'identity enabled by default');
    assert(plan.steps.map((step) => step.level).join(',') === '26,31,48', 'per-command level');
    assert(plan.steps.at(2)?.name === 'poseonly', 'pose chained');
    assert(plan.steps.at(1)?.index === 1, 'command ordering');
    tests += 4;
    const canonical = canonicalProPlan(plan);
    assert(canonical.includes('"enabled":true'), 'identity serialized');
    assert(canonical.includes('"level":"4.8"'), 'decimal serialized');
    assert(editProLevel(plan, 1, parseLevel('3.9')).steps.at(1)?.level === 39, 'level edit immutable');
    assert(plan.steps.at(1)?.level === 31, 'original recipe unchanged');
    tests += 4;
    failure('identity_override_required', () => createProPlan(plan.steps, {
        ...DEFAULT_IDENTITY_POLICY, enabled: false,
    }));
    failure('identity_override_required', () => createProPlan(plan.steps, {
        ...DEFAULT_IDENTITY_POLICY, mode: 'warn',
    }));
    assert(!userIdentityOverride(false).enabled, 'explicit opt-out');
    tests += 3;
    const noop = async (frame) => frame;
    const missing = new ProBrowserRuntime({ cleanup: noop }, null);
    await rejects('identity_model_unavailable', () => missing.run(parseProCommands('/cleanup'), source(), 'preview', 'source-a', new AbortController().signal, () => true));
    tests++;
    const guard = new GuardDouble();
    let renderCalls = 0;
    const shift = async (frame) => {
        renderCalls++;
        const pixels = new Uint8Array(frame.pixels);
        pixels[0] = (pixels[0] ?? 0) + 1;
        return { ...frame, pixels };
    };
    const runtime = new ProBrowserRuntime({ cleanup: shift, studioquality: shift, poseonly: shift }, guard);
    const photo = source();
    const before = new Uint8Array(photo.pixels);
    const signal = new AbortController().signal;
    const first = await runtime.run(plan, photo, 'preview', 'source-1', signal, () => true);
    assert(guard.calls === 3, 'identity checks every step including pose');
    assert(renderCalls === 3, 'every effect rendered');
    assert(unchanged(photo, { ...photo, pixels: before }), 'source bytes preserved');
    assert(first.steps.every((step) => step.identity !== null), 'each step has evidence');
    tests += 4;
    const second = await runtime.run(plan, photo, 'preview', 'source-1', signal, () => true);
    assert(second.steps.every((step) => step.cacheHit), 'bounded cache reused');
    assert(guard.calls === 6, 'cache hit still checks identity');
    assert(renderCalls === 3, 'cache avoids repeat effects');
    tests += 3;
    await rejects('stale_preview', () => runtime.run(plan, photo, 'preview', 'source-1', signal, () => false));
    tests++;
    runtime.clearPhoto();
    assert(runtime.cachedBytes === 0, 'photo close clears cache');
    tests++;
    const overridden = createProPlan(plan.steps, userIdentityOverride(false));
    const withoutGuard = new ProBrowserRuntime({ cleanup: shift, studioquality: shift, poseonly: shift }, null);
    const explicit = await withoutGuard.run(overridden, photo, 'export', 'source-2', signal, () => true);
    assert(explicit.steps.every((step) => step.identity === null), 'deliberate override exposed');
    tests++;
    const fixer = measureFaceFixer(photo, photo, null, null);
    assert(fixer.status === 'unproven', 'missing evidence not a PASS');
    assert(fixer.realfaceQualified === false, 'synthetic report cannot certify release');
    tests += 2;
    const alpha = source();
    alpha.pixels[3] = 0;
    const broken = measureFaceFixer(photo, alpha, null, null);
    assert(broken.status === 'fail', 'alpha mutation rejected');
    tests++;
    let now = 100;
    const previews = new ProPreviewCoordinator(runtime, () => now, 60);
    previews.openPhoto(source(), 'photo-3');
    const old = previews.request(parseProCommands('/poseonly 2.5'));
    assert(!previews.isReady(old), 'debounce pending');
    now = 200;
    assert(previews.isReady(old), 'debounce complete');
    const replacement = previews.request(parseProCommands('/poseonly 3.5'));
    assert(!previews.isCurrent(old), 'old preview stale');
    await rejects('stale_preview', () => previews.renderReady(old, (frame) => frame));
    now = 280;
    const current = await previews.renderReady(replacement, (frame) => frame);
    assert(current.steps.at(0)?.command === 'poseonly', 'pose preview available');
    previews.closePhoto();
    assert(runtime.cachedBytes === 0, 'preview closure clears photo cache');
    tests += 6;
    assert(Object.isFrozen(plan), 'plans immutable');
    assert(Object.isFrozen(plan.steps), 'plan steps immutable');
    tests += 2;
    return tests;
}
void runContractTests().then((count) => {
    // This module runs only when explicitly executed by the offline test command.
    console.log(`Workstream H browser contracts: ${count} passed`);
});
//# sourceMappingURL=test-contract.js.map