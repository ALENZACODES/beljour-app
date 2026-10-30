/** Strong negative-controls for all five command levels and release honesty.
 * Author: John Khan.
 */
import { evaluateCommandLocks, PRO_COMMAND_NAMES } from './lock-matrix.js';
import { ProRenderError } from './runtime.js';
function assert(condition, reason) {
    if (!condition)
        throw new Error(`Lock matrix: ${reason}`);
}
function row(command, levelTenths) {
    return { command, levelTenths, previewMs: 12.5, exportMs: 83,
        identityApplied: true, alphaUnchanged: true, protectedUnchanged: true,
        neutralCorrect: true, skinLiftL: command === 'studioquality' ? 1.8 : null,
        poseMinimumJacobian: command === 'poseonly' ? 0.8 : null,
        poseRetention: command === 'poseonly' ? 1 : null, measuredDevice: false };
}
function complete() {
    const result = [];
    for (const command of PRO_COMMAND_NAMES) {
        for (let level = 10; level <= 50; level++)
            result.push(row(command, level));
    }
    return result;
}
function replace(observations, changed) {
    return observations.map((item) => item.command === changed.command &&
        item.levelTenths === changed.levelTenths ? changed : item);
}
function rejects(action, code) {
    try {
        action();
    }
    catch (error) {
        assert(error instanceof ProRenderError && error.code === code, `expected ${code}`);
        return;
    }
    throw new Error(`Missing ${code}`);
}
export function testLockMatrixR8H() {
    let checks = 0;
    const observed = complete();
    const full = evaluateCommandLocks(observed);
    assert(full.status === 'synthetic_ready' && full.totalChecked === 205, 'complete synthetic matrix');
    assert(full.completeFiveCommandCoverage && full.findings.length === 5, 'all five commands');
    assert(!full.releaseQualified && !full.independentlyReviewed, 'synthetic evidence is never release approval');
    checks += 3;
    const missing = observed.filter((item) => !(item.command === 'poseonly' && item.levelTenths === 23));
    const absent = evaluateCommandLocks(missing);
    assert(absent.status === 'incomplete' && absent.findings[4]?.missingLevels[0] === 23, 'missing decimal level detected');
    checks++;
    const duplicate = evaluateCommandLocks([...observed, observed[0]]);
    assert(duplicate.status === 'blocked' && duplicate.duplicateRows === 1, 'duplicate evidence cannot inflate coverage');
    checks++;
    for (const field of ['identityApplied', 'alphaUnchanged', 'protectedUnchanged',
        'neutralCorrect']) {
        const original = row('cleanup', 10);
        const result = evaluateCommandLocks(replace(observed, { ...original, [field]: false }));
        assert(result.status === 'blocked', `refuses ${field}`);
        checks++;
    }
    for (const bad of [2.50001, 3, 9, null]) {
        const original = row('studioquality', 43);
        const report = evaluateCommandLocks(replace(observed, { ...original, skinLiftL: bad }));
        assert(report.status === 'blocked', 'skin lift is bounded');
        checks++;
    }
    for (const fields of [
        { poseMinimumJacobian: 0.249 }, { poseMinimumJacobian: null },
        { poseRetention: 0.249 }, { poseRetention: null },
    ]) {
        const modified = { ...row('poseonly', 50), ...fields };
        const report = evaluateCommandLocks(replace(observed, modified));
        assert(report.status === 'blocked', 'pose fold/retention enforced');
        checks++;
    }
    const slow = evaluateCommandLocks(replace(observed, { ...row('upscale', 49), previewMs: 100.001 }));
    assert(slow.status === 'blocked' &&
        slow.findings[2]?.timingLimitedLevels[0] === 49, 'timing misses are not passes');
    checks++;
    const device = evaluateCommandLocks(observed.map((item) => ({ ...item, measuredDevice: true })));
    assert(device.status === 'device_measured' && !device.releaseQualified, 'device timing does not become real-face acceptance');
    checks++;
    const partial = evaluateCommandLocks(observed.map((item, index) => index === 0 ? { ...item, measuredDevice: true } : item));
    assert(partial.status === 'synthetic_ready', 'partial device results are not complete');
    checks++;
    for (const invalid of [-2, 0, NaN, Infinity]) {
        rejects(() => evaluateCommandLocks(observed, invalid), 'invalid_lock_matrix');
        checks++;
    }
    for (const invalid of [-1, NaN, Infinity]) {
        rejects(() => evaluateCommandLocks([{ ...row('cleanup', 30), previewMs: invalid }]), 'invalid_lock_matrix');
        checks++;
    }
    rejects(() => evaluateCommandLocks(observed.concat(observed, observed)), 'invalid_lock_matrix');
    checks++;
    const serialized = JSON.stringify(full);
    for (const field of ['bodyMask', 'pixels', 'landmarks', 'imagePath', 'embedding']) {
        assert(!serialized.includes(field), `public result must not expose ${field}`);
        checks++;
    }
    return checks;
}
//# sourceMappingURL=test-lock-matrix-r8h.js.map