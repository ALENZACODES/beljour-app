/** Synthetic preview/export parity probes. Author: John Khan. */
import { measurePreviewParity } from './preview-parity.js';
import { ProRenderError } from './runtime.js';
function check(condition, detail) {
    if (!condition)
        throw new Error(`preview parity ${detail}`);
}
function image(level = 20) {
    return { width: 6, height: 4, channels: 4,
        pixels: new Uint8Array(Array.from({ length: 6 * 4 * 4 }, (_, index) => index % 4 === 3 ? 255 : level)),
    };
}
function summary(quality, frame) {
    return {
        image: frame, quality, elapsedMs: 3, targetMs: quality === 'preview' ? 100 : 2000,
        withinBudget: true, originalUnchanged: true,
        steps: [{ index: 0, command: 'cleanup', level: '2.4', changed: false,
                cacheHit: false, identity: { identityMatch: 98, status: 'kept', syntheticOnly: true } }],
    };
}
function expectCode(code, fn) {
    try {
        fn();
    }
    catch (error) {
        check(error instanceof ProRenderError && error.code === code, `expected ${code}`);
        return;
    }
    throw new Error(`expected ${code}`);
}
export function testPreviewParityR4H() {
    let count = 0;
    const unchanged = measurePreviewParity(summary('preview', image()), summary('export', image()));
    check(unchanged.meanError === 0 && unchanged.maximumError === 0, 'equal pixels');
    check(unchanged.status === 'needs_review' && unchanged.realfacePass === false, 'synthetic cannot claim approval');
    count += 2;
    const drift = measurePreviewParity(summary('preview', image(20)), summary('export', image(35)), 2, 5);
    check(drift.meanError === 15 && drift.maximumError === 15, 'exact differences');
    check(drift.reasonCodes.includes('mean_preview_drift'), 'mean drift');
    check(drift.reasonCodes.includes('peak_preview_drift'), 'peak drift');
    count += 3;
    const tolerated = measurePreviewParity(summary('preview', image(20)), summary('export', image(35)), 20, 20);
    check(tolerated.reasonCodes.includes('synthetic_only') && tolerated.realfacePass === false, 'tolerances do not confer real-face qualification');
    count++;
    const alpha = image(10);
    alpha.pixels[3] = 60;
    const mismatch = measurePreviewParity(summary('preview', alpha), summary('export', image(10)));
    check(mismatch.alphaMismatchPixels === 1 && mismatch.reasonCodes.includes('alpha_preview_drift'), 'alpha mismatch');
    count++;
    const stepped = summary('export', image());
    expectCode('invalid_parity', () => measurePreviewParity(stepped, stepped));
    count++;
    expectCode('invalid_parity', () => measurePreviewParity(summary('preview', { width: 2, height: 2, channels: 4, pixels: new Uint8Array(16) }), summary('export', image())));
    count++;
    expectCode('invalid_parity', () => measurePreviewParity(summary('preview', image()), summary('export', image()), -1, 10));
    count++;
    const noIdentity = summary('preview', image());
    const unsafe = { ...noIdentity, steps: noIdentity.steps.map(step => ({ ...step, identity: null })) };
    const noProof = measurePreviewParity(unsafe, summary('export', image()));
    check(noProof.reasonCodes.includes('identity_evidence_missing'), 'missing guard declared');
    count++;
    return count;
}
//# sourceMappingURL=test-preview-parity-r4h.js.map