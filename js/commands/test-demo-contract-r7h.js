/** Five-command operator demo regressions on original synthetic pixel buffers.
 * Author: John Khan.
 */
import { inspectFiveCommandDemoPlan, runFiveCommandHostDemo } from './demo-contract.js';
import { levelFromTenths } from './levels.js';
import { createProPlan, userIdentityOverride } from './plan.js';
import { ProRenderError } from './runtime.js';
const NAMES = [
    'identitylock', 'cleanup', 'studioquality', 'poseonly', 'upscale',
];
function check(value, label) {
    if (!value)
        throw new Error(`five-command demo ${label}`);
}
function frame() {
    const pixels = new Uint8Array(14 * 14 * 4);
    for (let i = 0; i < 14 * 14; i++)
        pixels.set([90, 120, 75, 255], i * 4);
    return { width: 14, height: 14, channels: 4, pixels };
}
function plan(names = NAMES, enabled = true, mode = 'soften') {
    return createProPlan(names.map((name, index) => ({
        name, index, scale: 2, level: levelFromTenths(10),
    })), userIdentityOverride(enabled, mode));
}
function run(quality, synthetic = false) {
    const steps = NAMES.map((command, index) => ({
        index, command, level: '1.0', changed: index > 0, cacheHit: false,
        identity: { status: 'kept', identityMatch: 100, syntheticOnly: synthetic },
    }));
    return { image: frame(), quality, steps, elapsedMs: 5,
        targetMs: quality === 'preview' ? 100 : 2000,
        withinBudget: true, originalUnchanged: true };
}
class SimpleDemoHost {
    active = true;
    photoOpen = true;
    currentPlan = plan();
    calls = 0;
    synthetic = false;
    blocked = false;
    get state() {
        return { plan: this.currentPlan, photoOpen: this.photoOpen };
    }
    async preview(signal) {
        this.calls++;
        if (signal?.aborted || this.blocked) {
            throw new ProRenderError('demo_cancelled', 'Local edit cancelled.');
        }
        return run('preview', this.synthetic);
    }
    async exportImage(signal) {
        this.calls++;
        if (signal?.aborted || this.blocked) {
            throw new ProRenderError('demo_cancelled', 'Local edit cancelled.');
        }
        return run('export', this.synthetic);
    }
}
function bridge(value) {
    return value;
}
export async function testDemoContractR7H() {
    let count = 0;
    check(inspectFiveCommandDemoPlan(plan()).length === 0, 'valid five-command chain');
    check(inspectFiveCommandDemoPlan(null).includes('demo_plan_missing'), 'missing plan refused');
    check(inspectFiveCommandDemoPlan(plan(NAMES.slice(1))).includes('demo_requires_five_commands'), 'short plan refused');
    check(inspectFiveCommandDemoPlan(plan([...NAMES].reverse())).includes('demo_command_order_invalid'), 'wrong command order refused');
    check(inspectFiveCommandDemoPlan(plan(NAMES, false)).includes('demo_identity_not_protective'), 'explicit lock opt-out not qualified');
    check(inspectFiveCommandDemoPlan(plan(NAMES, true, 'warn')).includes('demo_identity_not_protective'), 'warn-only identity not qualified');
    count += 6;
    const host = new SimpleDemoHost();
    let clock = 0;
    const report = await runFiveCommandHostDemo(bridge(host), {
        repetitions: 3, warmups: 1, operatorSelectedDevice: false,
        clock() { clock += 3; return clock; },
    });
    check(report.status === 'measured', 'completed local rendering');
    check(report.releaseQualified === false && report.externallyFaceTested === false, 'no synthetic grant of release');
    check(report.commands.join(',') === NAMES.join(','), 'five commands reported in order');
    check(report.identityProtected, 'all stages protected by default lock');
    check(report.previewSampleCount === 3 && report.exportSampleCount === 3, 'sample counts only include measured executions');
    check(report.previewMedianMs !== null && report.exportMedianMs !== null, 'timing measured');
    check(report.previewExportMeanDrift === 0 && report.previewExportAlphaMismatch === 0, 'pixels consistent across preview and export');
    check(report.reasons.includes('external_realface_gate_and_human_review'), 'still needs independent approval');
    check(!JSON.stringify(report).includes('pixels') &&
        !JSON.stringify(report).includes('modelEvidenceKey'), 'metadata only');
    check(host.calls === 8, 'both warmups and measured renders executed');
    count += 10;
    const testModel = new SimpleDemoHost();
    testModel.synthetic = true;
    const synthetic = await runFiveCommandHostDemo(bridge(testModel), {
        repetitions: 1, warmups: 0, operatorSelectedDevice: true,
    });
    check(synthetic.reasons.includes('approved_identity_model_and_realface_test'), 'test-only model is called out');
    check(synthetic.releaseQualified === false, 'operator acknowledgement does not pass gate');
    count += 2;
    const missingPhoto = new SimpleDemoHost();
    missingPhoto.photoOpen = false;
    const blocked = await runFiveCommandHostDemo(bridge(missingPhoto), {
        repetitions: 1, warmups: 0, operatorSelectedDevice: false,
    });
    check(blocked.status === 'blocked' && blocked.errorCode === 'demo_photo_missing', 'photo absent blocks the flow');
    count++;
    const badPlan = new SimpleDemoHost();
    badPlan.currentPlan = plan(NAMES.slice(1));
    const invalid = await runFiveCommandHostDemo(bridge(badPlan), {
        repetitions: 1, warmups: 0, operatorSelectedDevice: false,
    });
    check(invalid.status === 'blocked' && invalid.errorCode === 'demo_requires_five_commands', 'incomplete chain cannot be claimed as a demo');
    check(badPlan.calls === 0, 'invalid demo consumes no render work');
    count += 2;
    const aborted = new SimpleDemoHost();
    const signal = new AbortController();
    signal.abort();
    const stopped = await runFiveCommandHostDemo(bridge(aborted), {
        repetitions: 2, warmups: 0, operatorSelectedDevice: false,
    }, signal.signal);
    check(stopped.status === 'failed' && stopped.errorCode === 'device_probe_cancelled', 'cancelled local demo fails cleanly');
    count++;
    const badDevice = new SimpleDemoHost();
    const deviceError = await runFiveCommandHostDemo(bridge(badDevice), {
        repetitions: 0, warmups: 0, operatorSelectedDevice: false,
    });
    check(deviceError.status === 'failed' && deviceError.errorCode === 'invalid_device_probe', 'device validation is not silently skipped');
    count++;
    const errorHost = new SimpleDemoHost();
    errorHost.blocked = true;
    const errorResult = await runFiveCommandHostDemo(bridge(errorHost), {
        repetitions: 1, warmups: 0, operatorSelectedDevice: false,
    });
    check(errorResult.status === 'failed' && errorResult.errorCode === 'demo_cancelled', 'underlying command failure propagated as safe code');
    count++;
    return count;
}
