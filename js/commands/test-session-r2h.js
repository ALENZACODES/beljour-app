/** Browser chaining, default-on identity, cancellation, cache and undo tests.
 * Author: John Khan.
 */
import { parseProCommands, userIdentityOverride } from './plan.js';
import { R2HBrowserSession } from './r2h-session.js';
import { ProRenderError } from './runtime.js';
function check(condition, reason) {
    if (!condition)
        throw new Error(`R2H chain test: ${reason}`);
}
async function expectError(code, action) {
    try {
        await action();
    }
    catch (error) {
        check(error instanceof ProRenderError && error.code === code, `expected ${code}`);
        return;
    }
    throw new Error(`Expected ${code}`);
}
function synthetic() {
    const width = 18;
    const height = 20;
    const pixels = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const index = (y * width + x) * 4;
            pixels.set([30 + x * 7, 90 + y * 4, 120 + x, 255], index);
        }
    }
    return { width, height, channels: 4, pixels };
}
class SyntheticGuard {
    modelEvidenceKey = 'synthetic-test-only';
    comparisons = 0;
    async enforce(_source, edited) {
        this.comparisons++;
        return { frame: edited, status: 'kept', identityMatch: 97, syntheticOnly: true };
    }
}
export async function testR2HSession() {
    let count = 0;
    const photo = synthetic();
    const missing = new R2HBrowserSession(null);
    missing.openPhoto(photo, 'photo-a');
    await expectError('identity_model_unavailable', () => missing.run(parseProCommands('/cleanup 2.4')));
    count++;
    const guard = new SyntheticGuard();
    const session = new R2HBrowserSession(guard);
    const mask = new Uint8Array(photo.width * photo.height);
    mask.fill(255, 4 * photo.width + 5, 8 * photo.width + 10);
    const checked = { width: photo.width, height: photo.height,
        evidence: 'user_checked', eyes: mask };
    let reads = 0;
    session.openPhoto(photo, 'source-1', () => {
        reads++;
        return checked;
    });
    const original = new Uint8Array(photo.pixels);
    const plan = parseProCommands('/cleanup 2.4 /upscale 2x /identitylock');
    const report = await session.run(plan, 'preview');
    check(report.image.width === 36 && report.image.height === 40, 'chain output shape');
    check(report.steps.map((step) => step.command).join(',') ===
        'cleanup,upscale,identitylock', 'chain order');
    check(report.steps.every((step) => step.identity?.identityMatch === 97), 'guard every step');
    check(guard.comparisons === 3, 'identity comparisons include explicit identitylock');
    check(photo.pixels.every((value, position) => value === original[position]), 'source unchanged');
    count += 5;
    const second = await session.run(plan, 'preview');
    check(second.steps.slice(0, 2).every((step) => step.cacheHit), 'cached raw effects reused');
    check(guard.comparisons === 6, 'cache never bypasses identity');
    count += 2;
    for (const amount of ['2.1', '2.4', '2.8', '3.9']) {
        await session.run(parseProCommands(`/cleanup ${amount}`), 'preview');
    }
    check(reads === 1, 'slider changes do not reload mask supplier');
    check(session.state.regionReads === 1, 'one photo mask generation');
    check(session.state.regionHits > 0, 'mask reuse recorded');
    count += 3;
    const previous = session.undo();
    check(previous !== null && previous.width === photo.width, 'undo restores original photo');
    count++;
    const replaced = synthetic();
    replaced.pixels[0] = 1;
    session.openPhoto(replaced, 'source-2', () => {
        reads++;
        return checked;
    });
    check(reads === 2, 'photo replacement invalidates mask observations');
    check(session.state.lastPlan === null, 'recipe cleared on replacement');
    count += 2;
    session.closePhoto();
    check(session.state.cachedBytes === 0 && !session.state.photoOpen, 'photo closure releases cache');
    check(session.undo() === null, 'closed photo has no undo');
    count += 2;
    await expectError('photo_missing', () => session.run(plan));
    count++;
    const opted = new R2HBrowserSession(null);
    opted.openPhoto(photo, 'opted');
    const choice = parseProCommands('/cleanup 1.9', userIdentityOverride(false));
    const unchecked = await opted.run(choice);
    check(unchecked.steps[0]?.identity === null, 'explicit opt-out is visible');
    count++;
    const cancelled = new R2HBrowserSession(guard);
    cancelled.openPhoto(photo, 'cancelled');
    const controller = new AbortController();
    controller.abort();
    await expectError('stale_preview', () => cancelled.run(plan, 'preview', controller.signal));
    count++;
    const stale = new R2HBrowserSession(guard);
    stale.openPhoto(photo, 'stale');
    await expectError('stale_preview', () => stale.run(plan, 'preview', new AbortController().signal, () => false));
    count++;
    const deferred = new R2HBrowserSession(guard);
    deferred.openPhoto(photo, 'scheduled');
    const currentTicket = deferred.request(parseProCommands('/cleanup 3.0'));
    check(currentTicket.plan.steps.length === 1, 'typed preview ticket');
    count++;
    return count;
}
//# sourceMappingURL=test-session-r2h.js.map