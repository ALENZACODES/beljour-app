/** Full five-command browser entry point; identity always guards each step.
 * Author: John Khan.
 */
import { parseProCommands, userIdentityOverride } from './plan.js';
import { R3HBrowserSession } from './r3h-session.js';
import { ProRenderError } from './runtime.js';
function check(condition, detail) {
    if (!condition)
        throw new Error(`R3H chain: ${detail}`);
}
class SyntheticIdentity {
    modelEvidenceKey = 'synthetic-only';
    count = 0;
    async enforce(_original, changed) {
        this.count++;
        return { frame: changed, identityMatch: 98, status: 'kept', syntheticOnly: true };
    }
}
function image() {
    const width = 32;
    const height = 32;
    const pixels = new Uint8Array(width * height * 3);
    for (let index = 0; index < pixels.length; index++)
        pixels[index] = (index * 7 + 53) % 173;
    return { width, height, channels: 3, pixels };
}
function pose(frame) {
    const personMask = new Uint8Array(frame.width * frame.height);
    for (let y = 8; y < 29; y++) {
        for (let x = 6; x < 28; x++)
            personMask[y * frame.width + x] = 255;
    }
    return {
        width: frame.width, height: frame.height, personMask, evidence: 'synthetic_test',
        handles: [
            { label: 'left', x: 0.3, y: 0.5, dx: -0.03, dy: 0 },
            { label: 'right', x: 0.7, y: 0.5, dx: 0.03, dy: 0 },
        ],
    };
}
async function expectFailure(code, operation) {
    try {
        await operation();
    }
    catch (error) {
        check(error instanceof ProRenderError && error.code === code, `expected ${code}`);
        return;
    }
    throw new Error(`Expected ${code}`);
}
export async function testR3HChain() {
    let count = 0;
    const photo = image();
    const noGuard = new R3HBrowserSession(null);
    noGuard.openPhoto(photo, 'photo-test');
    await expectFailure('identity_model_unavailable', () => noGuard.run(parseProCommands('/studioquality 2.0 /poseonly 3.0')));
    count++;
    const identity = new SyntheticIdentity();
    const session = new R3HBrowserSession(identity);
    let suppliers = 0;
    session.openPhoto(photo, 'test-session', () => {
        suppliers++;
        return { width: photo.width, height: photo.height, evidence: 'synthetic_test' };
    }, [], pose(photo));
    const input = new Uint8Array(photo.pixels);
    const plan = parseProCommands('/cleanup 2.0 /studioquality 3.0 /poseonly 4.0 /upscale 2x /identitylock');
    const report = await session.run(plan, 'preview');
    check(report.steps.map((step) => step.command).join(',') ===
        'cleanup,studioquality,poseonly,upscale,identitylock', 'correct chain order');
    check(identity.count === 5, 'all five commands guarded including pose');
    check(report.steps.every((step) => step.identity !== null), 'identity evidence on every step');
    check(report.image.width === 64 && report.image.height === 64, 'upscale valid');
    check(photo.pixels.every((value, offset) => value === input[offset]), 'source unchanged');
    count += 5;
    const preview = await session.run(parseProCommands('/studioquality 4.3 /poseonly 2.8'));
    check(preview.steps.length === 2 && preview.steps.every((step) => step.identity !== null), 'guarded pose with different slider level');
    count++;
    for (const value of ['1.0', '2.5', '3.9', '5.0']) {
        await session.run(parseProCommands(`/studioquality ${value} /poseonly ${value}`), 'preview');
    }
    check(suppliers === 1, 'photo observations computed once');
    count++;
    check(session.state.poseAvailable && session.state.regionReads === 1, 'photo-scoped supplier confirmed');
    count++;
    check(session.undo() !== null, 'prior state available for undo');
    count++;
    session.closePhoto();
    check(!session.state.photoOpen && !session.state.poseAvailable, 'close clears photo');
    count++;
    await expectFailure('photo_missing', () => session.run(plan));
    count++;
    const opted = new R3HBrowserSession(null);
    opted.openPhoto(photo, 'explicit-optout', null, [], pose(photo));
    const disabled = parseProCommands('/studioquality 3.0 /poseonly 3.0', userIdentityOverride(false));
    const out = await opted.run(disabled);
    check(out.steps.every((step) => step.identity === null), 'explicit opt-out visible');
    count++;
    const cancelled = new R3HBrowserSession(identity);
    cancelled.openPhoto(photo, 'cancelled', null, [], pose(photo));
    const controller = new AbortController();
    controller.abort();
    await expectFailure('stale_preview', () => cancelled.run(plan, 'preview', controller.signal));
    count++;
    return count;
}
