/** Operator-initiated, local five-command demo contract for the app shell.
 * This does not silently rewrite the editor's recipe or upload photographs.
 * Every test-only or unverified identity result stays out of release claims.
 * Author: John Khan.
 */
import { ProDeviceReadinessProbe, } from './device-readiness.js';
import { ProRenderError } from './runtime.js';
const DEMO_COMMANDS = [
    'identitylock', 'cleanup', 'studioquality', 'poseonly', 'upscale',
];
function emptyResult(code, commands = []) {
    return {
        version: 'beljour-pro-live-demo/1', status: 'blocked',
        commands: [...commands], identityProtected: false,
        previewSampleCount: 0, exportSampleCount: 0,
        previewMedianMs: null, exportMedianMs: null,
        previewExportMeanDrift: null, previewExportAlphaMismatch: null,
        reasons: [code], errorCode: code,
        externallyFaceTested: false, releaseQualified: false,
    };
}
export function inspectFiveCommandDemoPlan(plan) {
    const reasons = [];
    if (plan === null || plan.version !== 'beljour-pro-plan/1') {
        return ['demo_plan_missing'];
    }
    if (!plan.identity.enabled || plan.identity.mode === 'warn') {
        reasons.push('demo_identity_not_protective');
    }
    if (plan.steps.length !== DEMO_COMMANDS.length) {
        reasons.push('demo_requires_five_commands');
    }
    if (plan.steps.length === DEMO_COMMANDS.length && plan.steps.some((step, index) => step.name !== DEMO_COMMANDS[index])) {
        reasons.push('demo_command_order_invalid');
    }
    if (plan.steps.some(step => step.level < 10 || step.level > 50 ||
        !Number.isInteger(step.level))) {
        reasons.push('demo_level_invalid');
    }
    if (plan.steps.some(step => step.name === 'upscale' &&
        step.scale !== 2 && step.scale !== 4)) {
        reasons.push('demo_scale_invalid');
    }
    return reasons;
}
export async function runFiveCommandHostDemo(host, options, signal = new AbortController().signal) {
    if (!host.active || !host.state.photoOpen) {
        return emptyResult('demo_photo_missing');
    }
    const plan = host.state.plan;
    const reasons = inspectFiveCommandDemoPlan(plan);
    const names = plan?.steps.map(step => step.name) ?? [];
    if (reasons.length > 0) {
        return { ...emptyResult(reasons[0], names), reasons };
    }
    let reading;
    try {
        reading = await new ProDeviceReadinessProbe(host).run(options, signal);
    }
    catch (error) {
        const code = error instanceof ProRenderError ? error.code : 'demo_measurement_failed';
        return { ...emptyResult(code, names), status: 'failed' };
    }
    if (reading.status === 'failed') {
        return {
            ...emptyResult(reading.errorCode ?? 'demo_measurement_failed', names),
            status: 'failed', reasons: reading.issues,
            previewSampleCount: reading.preview.count,
            exportSampleCount: reading.fullRender.count,
        };
    }
    const outstanding = [...new Set([
            ...reading.issues,
            'external_realface_gate_and_human_review',
        ])];
    return {
        version: 'beljour-pro-live-demo/1',
        status: 'measured', commands: [...names],
        identityProtected: reading.identityCheckedEveryStep,
        previewSampleCount: reading.preview.count,
        exportSampleCount: reading.fullRender.count,
        previewMedianMs: reading.preview.medianMs,
        exportMedianMs: reading.fullRender.medianMs,
        previewExportMeanDrift: reading.meanPreviewDrift,
        previewExportAlphaMismatch: reading.alphaMismatchPixels,
        reasons: outstanding, errorCode: null,
        externallyFaceTested: false, releaseQualified: false,
    };
}
