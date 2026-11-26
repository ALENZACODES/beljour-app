/** Full observed browser sweep uses only local generated pixel fixtures.
 * Author: John Khan.
 */
import { runObservedBrowserSweep } from './observed-sweep.js';
import { R3HBrowserSession } from './r3h-session.js';
import { ProRenderError } from './runtime.js';
function assert(value, reason) {
    if (!value)
        throw new Error(`Browser observed sweep: ${reason}`);
}
function frame() {
    const width = 26;
    const height = 28;
    const pixels = new Uint8Array(width * height * 3);
    for (let i = 0; i < pixels.length; i++)
        pixels[i] = (i * 11 + 43) % 255;
    return { width, height, channels: 3, pixels };
}
function pose(photo) {
    const personMask = new Uint8Array(photo.width * photo.height);
    for (let y = 12; y < 27; y++) {
        for (let x = 5; x < 21; x++)
            personMask[y * photo.width + x] = 255;
    }
    return { width: photo.width, height: photo.height, personMask,
        evidence: 'synthetic_test', handles: [
            { label: 'left', x: 0.30, y: 0.65, dx: -0.015, dy: 0 },
            { label: 'right', x: 0.70, y: 0.65, dx: 0.015, dy: 0 },
        ] };
}
function session(photo, withPose = true) {
    const session = new R3HBrowserSession({ modelEvidenceKey: 'synthetic',
        enforce: async (_original, edited) => ({ frame: edited,
            identityMatch: 100, status: 'kept', syntheticOnly: true }),
    });
    const skin = new Uint8Array(photo.width * photo.height);
    for (let y = 3; y < 12; y++) {
        for (let x = 7; x < 20; x++)
            skin[y * photo.width + x] = 255;
    }
    session.openPhoto(photo, 'synthetic', () => ({ width: photo.width,
        height: photo.height, evidence: 'synthetic_test', skin }), [], withPose ? pose(photo) : null);
    return session;
}
export async function testObservedSweepR9H() {
    let checks = 0;
    const original = frame();
    const engine = session(original);
    const measured = await runObservedBrowserSweep(engine, original, {
        commands: ['cleanup', 'studioquality', 'poseonly'], levels: [10, 20],
        checkedProtectedRegions: true,
    });
    assert(measured.attempted === 6 && measured.captured === 6, 'all selected levels come from guarded rendering');
    assert(!measured.cancelled && measured.problems.length === 0, 'no disguised runtime errors');
    assert(!measured.releaseQualified && !measured.report.releaseQualified, 'synthetic run never proves real-face acceptance');
    checks += 3;
    const absent = await runObservedBrowserSweep(session(original, false), original, {
        commands: ['poseonly'], levels: [20], checkedProtectedRegions: true,
    });
    assert(absent.problems[0]?.code === 'pose_evidence_missing' && absent.captured === 0, 'missing pose data stays missing');
    checks++;
    const unmasked = await runObservedBrowserSweep(engine, original, {
        commands: ['cleanup'], levels: [20],
    });
    assert(unmasked.report.status === 'blocked', 'missing protected evidence blocks');
    checks++;
    const controller = new AbortController();
    controller.abort();
    const cancelled = await runObservedBrowserSweep(engine, original, {
        commands: ['cleanup'], levels: [10, 20], signal: controller.signal,
    });
    assert(cancelled.cancelled && cancelled.attempted === 0, 'cancel before rendering');
    checks++;
    const cutoff = await runObservedBrowserSweep(engine, original, {
        commands: ['cleanup'], levels: [10, 20, 30], current: () => false,
    });
    assert(cutoff.cancelled && cutoff.captured === 0, 'stale revision never contributes evidence');
    checks++;
    try {
        await runObservedBrowserSweep(engine, original, { levels: [10, 10] });
        throw new Error('Invalid levels accepted');
    }
    catch (error) {
        assert(error instanceof ProRenderError && error.code === 'invalid_sweep', 'duplicate sweep levels rejected');
        checks++;
    }
    return checks;
}
//# sourceMappingURL=test-observed-sweep-r9h.js.map