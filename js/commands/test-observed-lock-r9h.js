/** Capture lock evidence from executed ProBrowserRuntime runs.
 * Author: John Khan.
 */
import { collectObservedLock } from './observed-lock.js';
import { evaluateCommandLocks } from './lock-matrix.js';
import { parseProCommands, userIdentityOverride } from './plan.js';
import { ProBrowserRuntime, ProRenderError } from './runtime.js';
function assert(condition, message) {
    if (!condition)
        throw new Error(`Observed browser lock: ${message}`);
}
function frame() {
    const pixels = new Uint8Array(16 * 16 * 4);
    for (let i = 0; i < pixels.length; i += 4) {
        pixels[i] = (i * 7 + 30) % 255;
        pixels[i + 1] = (i * 5 + 51) % 255;
        pixels[i + 2] = (i * 3 + 83) % 255;
        pixels[i + 3] = (i * 2 + 149) % 255;
    }
    return { width: 16, height: 16, channels: 4, pixels };
}
async function create(name, level = '3.0') {
    const photo = frame();
    const plan = parseProCommands(`/${name} ${level}`);
    const runtime = new ProBrowserRuntime({
        cleanup: async (f) => ({ ...f, pixels: new Uint8Array(f.pixels) }),
        studioquality: async (f) => ({ ...f, pixels: new Uint8Array(f.pixels) }),
        poseonly: async (f) => ({ ...f, pixels: new Uint8Array(f.pixels) }),
    }, { modelEvidenceKey: 'synthetic-only',
        enforce: async (_original, candidate) => ({ frame: candidate, identityMatch: 97,
            status: 'kept', syntheticOnly: true }),
    });
    const signal = new AbortController().signal;
    const preview = await runtime.run(plan, photo, 'preview', 'synthetic', signal, () => true);
    const exported = await runtime.run(plan, photo, 'export', 'synthetic', signal, () => true);
    return { photo, plan, preview, exported };
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
export async function testObservedLockR9H() {
    let checks = 0;
    for (const name of ['cleanup', 'studioquality', 'poseonly', 'identitylock']) {
        const actual = await create(name);
        const options = { checkedProtectedRegions: true,
            studio: name === 'studioquality' ? { level: '3.0', elapsedMs: 0,
                tileCount: 0, peakWorkingBytes: 0, modifiedPixels: 0,
                protectedUnchanged: true, alphaUnchanged: true, preview: false,
                maximumSkinLiftL: 1.2 } : undefined,
            pose: name === 'poseonly' ? { level: '3.0', elapsedMs: 0,
                tileCount: 0, peakWorkingBytes: 0, changedPixels: 0,
                largestDisplacementPx: 0, protectedUnchanged: true, alphaUnchanged: true,
                preview: false, foldMinimum: 0.8, foldRetention: 1 } : undefined,
        };
        const report = collectObservedLock(actual.plan, actual.photo, actual.preview, actual.exported, options);
        assert(report.command === name && report.identityApplied && report.alphaUnchanged, 'actual guarded edit recorded');
        assert(!report.measuredDevice, 'synthetic output is not certified device evidence');
        const matrix = evaluateCommandLocks([report]);
        assert(matrix.status === 'incomplete' && !matrix.releaseQualified, 'a single observed level is not a release pass');
        checks += 3;
        if (name === 'studioquality' || name === 'poseonly') {
            const withoutReport = collectObservedLock(actual.plan, actual.photo, actual.preview, actual.exported);
            assert(!withoutReport.protectedUnchanged, 'missing diagnostics remain unproven');
            checks++;
        }
    }
    const valid = await create('cleanup');
    rejects(() => collectObservedLock(valid.plan, valid.photo, valid.preview, valid.preview), 'invalid_lock_capture');
    checks++;
    const different = parseProCommands('/cleanup 4.0');
    rejects(() => collectObservedLock(different, valid.photo, valid.preview, valid.exported), 'invalid_lock_capture');
    checks++;
    const replaced = { ...valid.exported, steps: [{ ...valid.exported.steps[0], identity: null }] };
    const noGuard = collectObservedLock(valid.plan, valid.photo, valid.preview, replaced);
    assert(!noGuard.identityApplied, 'missing identity decision cannot pass');
    checks++;
    const offPlan = parseProCommands('/cleanup 3.0', userIdentityOverride(false));
    const off = collectObservedLock(offPlan, valid.photo, valid.preview, valid.exported);
    assert(!off.identityApplied, 'explicit opt out not recorded as guarded');
    checks++;
    const changedAlpha = { ...valid.exported, image: { ...valid.exported.image,
            pixels: new Uint8Array(valid.exported.image.pixels) } };
    changedAlpha.image.pixels[3] = (changedAlpha.image.pixels[3] ?? 0) ^ 255;
    const alpha = collectObservedLock(valid.plan, valid.photo, valid.preview, changedAlpha);
    assert(!alpha.alphaUnchanged, 'modified alpha is reported');
    checks++;
    const neutral = await create('cleanup', '1.0');
    const noop = collectObservedLock(neutral.plan, neutral.photo, neutral.preview, neutral.exported, { checkedProtectedRegions: true });
    assert(noop.neutralCorrect, 'observed neutral pixel contract');
    checks++;
    return checks;
}
//# sourceMappingURL=test-observed-lock-r9h.js.map