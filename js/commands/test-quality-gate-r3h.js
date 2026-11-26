/** Browser regression for measured image quality and honest release gates.
 * No real photographs or pretrained models are used.
 * Author: John Khan.
 */
import { decodeGate, evaluateLocalGate } from './quality-gate-r3h.js';
import { measuredPsnr, measuredSsim, qualityPoint, qualitySeries } from './quality-metrics-r3h.js';
import { ProRenderError } from './runtime.js';
function assert(condition, detail) {
    if (!condition)
        throw new Error(`R3H quality: ${detail}`);
}
function synthetic(value) {
    const width = 24;
    const height = 25;
    const pixels = new Uint8Array(width * height * 3);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 3;
            pixels[i] = x + value;
            pixels[i + 1] = y + value + 12;
            pixels[i + 2] = Math.floor((x + y) / 2) + value + 24;
        }
    }
    return { width, height, channels: 3, pixels };
}
function blend(source, truth, level) {
    const weight = (level - 10) / 40;
    const result = new Uint8Array(source.pixels.length);
    for (let i = 0; i < result.length; i++) {
        const before = source.pixels[i] ?? 0;
        const after = truth.pixels[i] ?? 0;
        result[i] = Math.round(before + (after - before) * weight);
    }
    return { ...source, pixels: result };
}
function expectError(code, action) {
    try {
        action();
    }
    catch (error) {
        assert(error instanceof ProRenderError && error.code === code, `expected ${code}`);
        return;
    }
    throw new Error(`Expected ${code}`);
}
function definition() {
    return {
        version: 'beljour-pro-quality-gate/1', command: 'studioquality',
        minimum_faces: 100000, assumptions: true,
        required_labels: ['source', 'identity_reference'],
        metrics: [
            { name: 'identity_cosine', comparison: 'at_least', threshold: 0.82, unit: 'cosine' },
            { name: 'preview_ms', comparison: 'at_most', threshold: 100, unit: 'milliseconds' },
        ],
    };
}
export function testR3HQuality() {
    let count = 0;
    const damaged = synthetic(34);
    const truth = synthetic(74);
    assert(measuredPsnr(truth, damaged) < measuredPsnr(truth, blend(damaged, truth, 30)), 'reference PSNR improves');
    count++;
    assert(measuredSsim(truth, damaged) < measuredSsim(truth, blend(damaged, truth, 30)), 'reference SSIM improves');
    count++;
    assert(measuredSsim(truth, truth) > 0.999999, 'identity SSIM');
    count++;
    assert(measuredPsnr(truth, truth) === Infinity, 'mathematical exact-match PSNR');
    count++;
    const missing = qualityPoint('enhance', 30, damaged, blend(damaged, truth, 30));
    assert(missing.psnrDb === null && missing.ssim === null, 'missing ground truth stays null');
    count++;
    const steps = Array.from({ length: 9 }, (_, i) => ({
        level: 10 + i * 5, output: blend(damaged, truth, 10 + i * 5),
    }));
    const series = qualitySeries('enhance', damaged, steps, truth);
    assert(series.neutralUnchanged, 'neutral no-op');
    assert(series.psnrMonotone === true && series.ssimMonotone === true, 'monotone reference quality');
    assert(series.modifiedMonotone, 'monotone modified coverage');
    assert(!series.realfacePass, 'synthetic series cannot pass release');
    count += 4;
    const unproved = qualitySeries('denoise', damaged, steps);
    assert(unproved.psnrMonotone === null && unproved.ssimMonotone === null, 'reference-dependent monotonicity not guessed');
    count++;
    expectError('invalid_quality_frame', () => qualityPoint('poseonly', 30, damaged, { ...damaged, width: damaged.width + 1,
        pixels: new Uint8Array((damaged.width + 1) * damaged.height * 3) }));
    count++;
    expectError('invalid_quality_sweep', () => qualitySeries('enhance', damaged, [{ level: 30, output: damaged }, { level: 40, output: damaged }]));
    count++;
    const gate = decodeGate(definition());
    assert(gate.minimumFaces === 100000 && gate.metrics.length === 2, 'versioned gate');
    count++;
    const invalid = { ...definition(), minimum_faces: 1000 };
    expectError('invalid_gate_definition', () => decodeGate(invalid));
    count++;
    const absent = evaluateLocalGate(gate, {}, [], 0, false);
    assert(absent.outcome === 'unproven' && !absent.realfacePass, 'missing never passed');
    assert(absent.missing.includes('identity_cosine'), 'missing identity recorded');
    count += 2;
    const failed = evaluateLocalGate(gate, { identity_cosine: 0.2, preview_ms: 4 }, gate.requiredLabels, 0);
    assert(failed.outcome === 'fail' && failed.failed.includes('identity_cosine'), 'failed quality cannot be hidden by missing evidence');
    count++;
    const checked = evaluateLocalGate(gate, { identity_cosine: 0.99, preview_ms: 10 }, gate.requiredLabels, 100000, true);
    assert(checked.outcome === 'unproven' && !checked.realfacePass, 'external release separate');
    assert(checked.missing.includes('external_release_verdict_not_supplied'), 'release verdict missing despite complete synthetic metrics');
    count += 2;
    for (const bad of [-1, 1.5, NaN]) {
        expectError('invalid_gate_input', () => evaluateLocalGate(gate, {}, [], bad));
        count++;
    }
    return count;
}
//# sourceMappingURL=test-quality-gate-r3h.js.map