/** Browser timing harness checks on procedural pixels with injected clocks.
 * Author: John Khan.
 */
import { ProBrowserBenchmark, syntheticBenchmarkFrame } from './benchmark.js';
import { parseProCommands } from './plan.js';
import { ProRenderError } from './runtime.js';
function check(condition, description) {
    if (!condition)
        throw new Error(`Benchmark: ${description}`);
}
function expectError(code, action) {
    try {
        action();
    }
    catch (error) {
        check(error instanceof ProRenderError && error.code === code, `expected ${code}`);
        return;
    }
    throw new Error(`Expected ${code}`);
}
function fixtureCase(quality = 'preview') {
    return {
        plan: parseProCommands('/cleanup 2.4'),
        width: 32, height: 29, channels: 4, seed: 13,
        quality, repetitions: 5, warmups: 2,
    };
}
function fixedClock(ms = 1) {
    let tick = 0;
    return () => {
        tick++;
        return tick * ms;
    };
}
async function passThrough(plan, frame, quality, signal) {
    check(plan.identity.enabled, 'guarded plan');
    check(quality === 'preview' || quality === 'export', 'render quality');
    check(!signal.aborted, 'not cancelled');
    return frame;
}
export async function testProBenchmark() {
    let count = 0;
    const first = syntheticBenchmarkFrame(32, 16, 4, 99);
    const repeat = syntheticBenchmarkFrame(32, 16, 4, 99);
    const different = syntheticBenchmarkFrame(32, 16, 4, 100);
    check(first.pixels.every((pixel, i) => pixel === repeat.pixels[i]), 'deterministic fixture');
    check(first.pixels.some((pixel, i) => pixel !== different.pixels[i]), 'seed changes fixture');
    check(first.pixels.length === 32 * 16 * 4, 'channel count');
    count += 3;
    const benchmark = new ProBrowserBenchmark(passThrough, fixedClock());
    const report = await benchmark.run(fixtureCase());
    check(report.outcome === 'completed' && report.sampleCount === 5, 'measured samples');
    check(report.medianMs === 1 && report.p95Ms === 1, 'deterministic clock');
    check(report.outputWidth === 32 && report.outputHeight === 29, 'output geometry');
    check(report.syntheticOnly && !report.releaseQualified, 'synthetic never release');
    count += 4;
    const exportReport = await benchmark.run(fixtureCase('export'));
    check(exportReport.budgetMs === 2000 && exportReport.withinAssumedBudget === true, 'labelled export budget');
    count++;
    const slow = await new ProBrowserBenchmark(passThrough, fixedClock(150)).run(fixtureCase());
    check(slow.withinAssumedBudget === false && !slow.releaseQualified, 'budget miss reported, no quality claim');
    count++;
    const cancelled = new AbortController();
    cancelled.abort();
    const rejected = await benchmark.run(fixtureCase(), cancelled.signal);
    check(rejected.outcome === 'failed' && rejected.failureCode === 'benchmark_cancelled', 'cancelled job never succeeds');
    count++;
    const breaking = async (_plan, _source) => {
        throw new Error('secret-containing private diagnostic');
    };
    const broken = await new ProBrowserBenchmark(breaking, fixedClock()).run(fixtureCase());
    check(broken.outcome === 'failed' && broken.failureCode === 'renderer_unavailable', 'controlled external error');
    check(!JSON.stringify(broken).includes('secret-containing'), 'private error redacted');
    count += 2;
    const invalid = async (_plan, _source) => ({ width: 2, height: 2, channels: 3, pixels: new Uint8Array(1) });
    const invalidResult = await new ProBrowserBenchmark(invalid, fixedClock()).run(fixtureCase());
    check(invalidResult.outcome === 'failed' && invalidResult.failureCode === 'invalid_frame', 'invalid output rejected');
    count++;
    expectError('invalid_benchmark', () => syntheticBenchmarkFrame(0, 5));
    expectError('invalid_benchmark', () => syntheticBenchmarkFrame(8, 9, 4, -1));
    count += 2;
    const overLimit = { ...fixtureCase(), repetitions: 101 };
    try {
        await benchmark.run(overLimit);
        throw new Error('Expected invalid repetition count');
    }
    catch (error) {
        check(error instanceof ProRenderError && error.code === 'invalid_benchmark', 'repetition limit');
    }
    count++;
    check(!JSON.stringify(report).includes('pixels'), 'no image bytes in report');
    count++;
    return count;
}
//# sourceMappingURL=test-benchmark-r3h.js.map