/** Local physical-device timing and five-command preview/export parity probe.
 * A measured sample is not an independent face-quality or release PASS.
 * No source key, filenames, pixels, embeddings or model metadata are retained.
 * Author: John Khan.
 */
import { assembleBrowserAcceptance } from './acceptance-bundle.js';
import { canonicalProPlan } from './plan.js';
import { ProRenderError } from './runtime.js';
const PREVIEW_BUDGET_MS = 100;
const EXPORT_BUDGET_MS = 2000;
function sampleStatistics(values, budget) {
    if (values.length === 0) {
        return { count: 0, medianMs: null, p95Ms: null, maximumMs: null,
            budgetMs: budget, withinAssumedBudget: null };
    }
    const sorted = [...values].sort((a, b) => a - b);
    const center = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 1 ? sorted[center] :
        (sorted[center - 1] + sorted[center]) / 2;
    const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1];
    return {
        count: sorted.length, medianMs: median, p95Ms: p95,
        maximumMs: sorted[sorted.length - 1], budgetMs: budget,
        withinAssumedBudget: median <= budget,
    };
}
function checkedOptions(options) {
    if (options === null || typeof options !== 'object' ||
        !Number.isInteger(options.repetitions) || options.repetitions < 1 ||
        options.repetitions > 30 || !Number.isInteger(options.warmups) ||
        options.warmups < 0 || options.warmups > 5 ||
        typeof options.operatorSelectedDevice !== 'boolean' ||
        (options.clock !== undefined && typeof options.clock !== 'function') ||
        (options.memoryBytes !== undefined && typeof options.memoryBytes !== 'function')) {
        throw new ProRenderError('invalid_device_probe', 'Probe settings are outside safe bounds.');
    }
}
function guardedSteps(result, plan) {
    if (!plan.identity.enabled || result.steps.length !== plan.steps.length)
        return false;
    return result.steps.every((row, index) => row.command === plan.steps[index]?.name &&
        row.level === (plan.steps[index].level / 10).toFixed(1) &&
        row.identity !== null && row.identity.status !== 'warned' &&
        Number.isInteger(row.identity.identityMatch) &&
        row.identity.identityMatch >= 0 && row.identity.identityMatch <= 100);
}
function failureReport(code, options, preview, fullRender, memory, identityGood) {
    return {
        version: 'beljour-pro-device-probe/1', status: 'failed',
        preview: sampleStatistics(preview, PREVIEW_BUDGET_MS),
        fullRender: sampleStatistics(fullRender, EXPORT_BUDGET_MS),
        maximumObservedMemoryBytes: memory,
        identityCheckedEveryStep: identityGood,
        meanPreviewDrift: null, alphaMismatchPixels: null,
        issues: [code], errorCode: code,
        operatorSelectedDevice: options.operatorSelectedDevice,
        independentlyReviewed: false, releaseQualified: false,
    };
}
export class ProDeviceReadinessProbe {
    host;
    constructor(host) {
        this.host = host;
    }
    async run(options, signal = new AbortController().signal) {
        checkedOptions(options);
        if (!this.host.active || !this.host.state.photoOpen ||
            this.host.state.plan === null) {
            throw new ProRenderError('device_photo_missing', 'A local photo and command chain are required.');
        }
        const plan = this.host.state.plan;
        const fingerprint = canonicalProPlan(plan);
        const clock = options.clock ?? (() => performance.now());
        const preview = [];
        const fullRender = [];
        let largestMemory = null;
        let protectedEach = true;
        let mostRecentPreview = null;
        let mostRecentExport = null;
        let acceptance = null;
        const readMemory = () => {
            if (options.memoryBytes === undefined)
                return;
            const measured = options.memoryBytes();
            if (measured === null)
                return;
            if (!Number.isSafeInteger(measured) || measured < 0) {
                throw new ProRenderError('invalid_device_memory', 'Device memory measurement is invalid.');
            }
            largestMemory = Math.max(largestMemory ?? 0, measured);
        };
        const ensureCurrent = () => {
            if (signal.aborted) {
                throw new ProRenderError('device_probe_cancelled', 'The device probe was cancelled.');
            }
            if (!this.host.active || !this.host.state.photoOpen ||
                this.host.state.plan === null ||
                canonicalProPlan(this.host.state.plan) !== fingerprint) {
                throw new ProRenderError('device_probe_superseded', 'The photo or recipe changed during probing.');
            }
        };
        const measureElapsed = (start) => {
            const elapsed = clock() - start;
            if (!Number.isFinite(elapsed) || elapsed < 0) {
                throw new ProRenderError('invalid_device_clock', 'Device timing clock is invalid.');
            }
            return elapsed;
        };
        const sample = async (quality) => {
            ensureCurrent();
            const before = clock();
            if (!Number.isFinite(before)) {
                throw new ProRenderError('invalid_device_clock', 'Device timing clock is invalid.');
            }
            const result = quality === 'preview' ?
                await this.host.preview(signal) : await this.host.exportImage(signal);
            ensureCurrent();
            const elapsed = clock() - before;
            if (!Number.isFinite(elapsed) || elapsed < 0 || result.quality !== quality) {
                throw new ProRenderError('invalid_device_clock', 'Device timing or render label is invalid.');
            }
            if (!result.originalUnchanged || !guardedSteps(result, plan)) {
                protectedEach = false;
                throw new ProRenderError('device_identity_unverified', 'A Pro command lacked a required identity check.');
            }
            readMemory();
            return result;
        };
        try {
            for (let index = 0; index < options.warmups; index++) {
                await sample('preview');
                await sample('export');
            }
            for (let index = 0; index < options.repetitions; index++) {
                const first = clock();
                mostRecentPreview = await sample('preview');
                preview.push(measureElapsed(first));
                const second = clock();
                mostRecentExport = await sample('export');
                fullRender.push(measureElapsed(second));
            }
            if (mostRecentPreview === null || mostRecentExport === null) {
                throw new ProRenderError('device_probe_incomplete', 'No complete preview/export pair.');
            }
            acceptance = assembleBrowserAcceptance(plan, mostRecentPreview, mostRecentExport);
        }
        catch (error) {
            const code = error instanceof ProRenderError ? error.code : 'device_probe_failed';
            return failureReport(code, options, preview, fullRender, largestMemory, protectedEach);
        }
        const previewStats = sampleStatistics(preview, PREVIEW_BUDGET_MS);
        const renderStats = sampleStatistics(fullRender, EXPORT_BUDGET_MS);
        const issues = [...new Set([
                ...acceptance.blockingReasons,
                ...acceptance.outstandingEvidence,
                ...(previewStats.withinAssumedBudget ? [] : ['preview_budget_missed']),
                ...(renderStats.withinAssumedBudget ? [] : ['render_budget_missed']),
                ...(options.operatorSelectedDevice ? [] : ['physical_device_unverified']),
            ])];
        return {
            version: 'beljour-pro-device-probe/1', status: 'unproven',
            preview: previewStats, fullRender: renderStats,
            maximumObservedMemoryBytes: largestMemory,
            identityCheckedEveryStep: protectedEach,
            meanPreviewDrift: acceptance.parity.meanError,
            alphaMismatchPixels: acceptance.parity.alphaMismatchPixels,
            issues, errorCode: null,
            operatorSelectedDevice: options.operatorSelectedDevice,
            independentlyReviewed: false, releaseQualified: false,
        };
    }
}
