/** Written-gate browser parity and honest missing-data tests.
 * Author: John Khan.
 */
import { assessLocalQuality, parseCommandQualityDefinition } from './quality-r2h.js';
import { ProRenderError } from './runtime.js';
function check(condition, reason) {
    if (!condition)
        throw new Error(`Quality contract regression: ${reason}`);
}
function mustFail(code, action) {
    try {
        action();
    }
    catch (error) {
        check(error instanceof ProRenderError && error.code === code, `error ${code}`);
        return;
    }
    throw new Error(`Expected ${code}`);
}
export function testQualityR2H() {
    let passed = 0;
    const definition = parseCommandQualityDefinition({
        version: 'beljour-pro-realface/1', command: 'upscale', minimum_faces: 100000,
        metrics: [
            { name: 'edge_ringing_fraction', comparison: 'at_most', threshold: 0.015, unit: 'ratio' },
            { name: 'identity_cosine', comparison: 'at_least', threshold: 0.85, unit: 'cosine' },
        ], required_labels: ['adult_consent', 'source_licence'], assumptions: true,
    });
    check(definition.command === 'upscale' && definition.metrics.length === 2, 'typed definition');
    passed++;
    const empty = assessLocalQuality(definition, {});
    check(empty.outcome === 'unproven', 'missing metrics unproven');
    check(empty.incomplete.includes('identity_cosine'), 'missing identity visible');
    check(!empty.realfacePass, 'no synthetic quality PASS');
    passed += 3;
    const clean = assessLocalQuality(definition, { edge_ringing_fraction: 0.001,
        identity_cosine: 0.99 }, true, 100000);
    check(clean.outcome === 'unproven', 'frozen qualification still needs runner');
    check(clean.checked === 2 && clean.failed.length === 0, 'observations accounted');
    passed += 2;
    const failed = assessLocalQuality(definition, { edge_ringing_fraction: 0.12,
        identity_cosine: 0.6 });
    check(failed.outcome === 'fail' && failed.failed.length === 2, 'both failures retained');
    passed++;
    mustFail('invalid_gate_input', () => assessLocalQuality(definition, {}, true, -1));
    passed++;
    mustFail('invalid_gate_definition', () => parseCommandQualityDefinition({
        version: 'beljour-pro-realface/1', command: 'upscale', minimum_faces: 5,
        metrics: [], required_labels: [], assumptions: true,
    }));
    passed++;
    mustFail('invalid_gate_definition', () => parseCommandQualityDefinition({
        version: 'beljour-pro-realface/1', command: 'cleanup', minimum_faces: 100000,
        metrics: [
            { name: 'noise', comparison: 'at_least', threshold: 0.2, unit: 'ratio' },
            { name: 'noise', comparison: 'at_least', threshold: 0.3, unit: 'ratio' },
        ], required_labels: ['adult_consent'], assumptions: true,
    }));
    passed++;
    return passed;
}
//# sourceMappingURL=test-quality-r2h.js.map