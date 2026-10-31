/** Packet regression comparisons refuse lost or downgraded lock evidence.
 * All rows are numerical fixtures only. Author: John Khan.
 */
import { PRO_COMMAND_NAMES } from './lock-matrix.js';
import { buildTuesdayLockPacket, serializeTuesdayPacket } from './tuesday-lock.js';
import { compareTuesdayLockPackets } from './tuesday-compare.js';
import { ProRenderError } from './runtime.js';
function ensure(value, reason) {
    if (!value)
        throw new Error(`Tuesday comparison: ${reason}`);
}
function fullRows() {
    return PRO_COMMAND_NAMES.flatMap((command) => Array.from({ length: 41 }, (_, index) => ({
        command, levelTenths: 10 + index,
        previewMs: 15, exportMs: 100, identityApplied: true,
        protectedUnchanged: true, alphaUnchanged: true,
        neutralCorrect: true, measuredDevice: false,
        skinLiftL: command === 'studioquality' ? 1.1 : null,
        poseMinimumJacobian: command === 'poseonly' ? 0.9 : null,
        poseRetention: command === 'poseonly' ? 0.8 : null,
    })));
}
async function packet(rows, build, runId = 'same-locked-fixture') {
    const evidence = await buildTuesdayLockPacket(rows, { runId, rendererBuild: build });
    return serializeTuesdayPacket(evidence);
}
export async function testTuesdayCompareR10H() {
    let count = 0;
    const base = fullRows();
    const oldJson = await packet(base, 'old');
    const noChange = await compareTuesdayLockPackets(oldJson, await packet(base, 'new'));
    ensure(noChange.regressions.length === 0 && noChange.status === 'no_new_regressions', 'unchanged matrix has no regressions');
    ensure(!noChange.releaseQualified && noChange.independentRealfaceResult === 'NOT_RUN', 'unchanged result cannot authorize release');
    count += 2;
    const changes = [
        [{ identityApplied: false }, 'new_failure:failed_safety'],
        [{ alphaUnchanged: false }, 'new_failure:failed_safety'],
        [{ neutralCorrect: false }, 'new_failure:failed_safety'],
        [{ previewMs: 110 }, 'new_failure:over_budget'],
        [{ exportMs: 2100 }, 'new_failure:over_budget'],
    ];
    for (const [change, expected] of changes) {
        const after = [{ ...base[0], ...change }, ...base.slice(1)];
        const compared = await compareTuesdayLockPackets(oldJson, await packet(after, 'new'));
        ensure(compared.status === 'regressed' && compared.regressions[0]?.issue === expected, 'single-level technical regression detected');
        ensure(compared.regressions[0]?.levelTenths === 10 && compared.checked === 205, 'no missing command slots in comparison');
        count += 2;
    }
    const oneMissing = await packet(base.slice(1), 'old');
    const improvement = await compareTuesdayLockPackets(oneMissing, oldJson);
    ensure(improvement.improvements === 1 && improvement.regressions.length === 0, 'newly measured safe level counts as improvement');
    count++;
    const lost = await compareTuesdayLockPackets(oldJson, oneMissing);
    ensure(lost.status === 'regressed' && lost.regressions[0]?.issue === 'new_failure:missing', 'lost evidence never inherits old PASS');
    count++;
    const badMeasured = [{ ...base[0], identityApplied: false }, ...base.slice(1)];
    const newlyFailed = await compareTuesdayLockPackets(oneMissing, await packet(badMeasured, 'new'));
    ensure(newlyFailed.regressions[0]?.issue === 'newly_observed_failure:failed_safety', 'newly measured unsafe value is explicit');
    count++;
    const reversed = await compareTuesdayLockPackets(oldJson, await packet([...base].reverse(), 'new'));
    ensure(reversed.regressions.length === 0, 'order-independent evidence comparison');
    count++;
    try {
        await compareTuesdayLockPackets(oldJson, await packet(base, 'new', 'other-fixture'));
        throw new Error('Mixed run IDs were accepted');
    }
    catch (error) {
        ensure(error instanceof ProRenderError && error.code === 'incompatible_lock_run', 'cannot compare different external run identities');
        count++;
    }
    return count;
}
