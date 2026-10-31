/** Complete five-command smoke on synthetic frames only. Author: John Khan. */
import { runFiveCommandSyntheticSmoke } from './release-smoke.js';
import { ProRenderError } from './runtime.js';
function check(value, message) {
    if (!value)
        throw new Error(`release-smoke ${message}`);
}
class MeteringGuard {
    modelEvidenceKey = 'synthetic-only';
    calls = 0;
    async enforce(_source, candidate) {
        this.calls++;
        return {
            frame: candidate,
            identityMatch: 100,
            status: 'kept',
            syntheticOnly: true,
        };
    }
}
async function rejects(code, action) {
    try {
        await action();
    }
    catch (error) {
        if (error instanceof ProRenderError && error.code === code)
            return;
        throw error;
    }
    throw new Error(`Expected ${code}`);
}
export async function testReleaseSmokeR5H() {
    let count = 0;
    const metering = new MeteringGuard();
    const report = await runFiveCommandSyntheticSmoke(metering, 22, 24);
    check(report.status === 'unproven' && !report.releaseQualified, 'a local render cannot approve a real-face release');
    check(report.syntheticOnly && report.missingEvidence.includes('synthetic_only'), 'unqualified fixture is labelled synthetic');
    check(report.executedCommands.length === 5, 'all five commands are executed');
    check(report.executedCommands.includes('poseonly') &&
        report.executedCommands.includes('identitylock'), 'pose and identity are included');
    check(report.identityOnAtEveryStep && metering.calls === 10, 'each command in preview and export was identity-checked');
    check(report.originalUnchanged, 'the original photo was not mutated');
    check(typeof report.previewElapsedMs === 'number' &&
        typeof report.exportElapsedMs === 'number', 'timings measured rather than assumed');
    count += 7;
    const noModel = await runFiveCommandSyntheticSmoke(null, 22, 24);
    check(noModel.status === 'failed' &&
        noModel.errorCode === 'identity_model_unavailable', 'missing embedder fails closed');
    check(noModel.releaseQualified === false, 'failure cannot become approval');
    count += 2;
    const aborted = new AbortController();
    aborted.abort();
    const cancelled = await runFiveCommandSyntheticSmoke(metering, 22, 24, aborted.signal);
    check(cancelled.status === 'failed' && cancelled.errorCode === 'cancelled_before_smoke', 'cancelled smoke never renders');
    count++;
    await rejects('invalid_smoke_case', () => runFiveCommandSyntheticSmoke(metering, 7, 500));
    await rejects('invalid_smoke_case', () => runFiveCommandSyntheticSmoke(metering, -1, 16));
    count += 2;
    const withLargeSource = {
        width: 257, height: 257, channels: 4,
        pixels: new Uint8Array(257 * 257 * 4),
    };
    await rejects('invalid_smoke_case', () => runFiveCommandSyntheticSmoke(metering, 1, 32, undefined, withLargeSource));
    count++;
    check(metering.calls === 10, 'invalid requests consumed no guard calls');
    count++;
    return count;
}
