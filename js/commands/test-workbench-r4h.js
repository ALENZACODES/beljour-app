/** Browser Pro panel model regression. Uses only drawn pixels and a stub guard.
 * Author: John Khan.
 */
import { ProWorkbenchModel } from './workbench-model.js';
import { R3HBrowserSession } from './r3h-session.js';
import { ProRenderError } from './runtime.js';
function check(value, name) {
    if (!value)
        throw new Error(`workbench ${name}`);
}
class CheckedGuard {
    modelEvidenceKey = 'synthetic-test-model';
    calls = 0;
    pending = null;
    async enforce(_before, edited) {
        this.calls++;
        if (this.pending !== null)
            await this.pending;
        return { frame: edited, identityMatch: 98, status: 'kept', syntheticOnly: true };
    }
}
function photo() {
    const pixels = new Uint8Array(32 * 32 * 4);
    for (let pixel = 0; pixel < 32 * 32; pixel++) {
        const offset = pixel * 4;
        pixels[offset] = (pixel * 17) % 230;
        pixels[offset + 1] = (pixel * 7) % 220;
        pixels[offset + 2] = (pixel * 5) % 195;
        pixels[offset + 3] = 255;
    }
    return { width: 32, height: 32, channels: 4, pixels };
}
function checkedPose() {
    const mask = new Uint8Array(32 * 32);
    for (let y = 7; y < 25; y++) {
        for (let x = 7; x < 25; x++)
            mask[y * 32 + x] = 255;
    }
    return {
        width: 32, height: 32, personMask: mask, evidence: 'synthetic_test',
        handles: [
            { label: 'left', x: 0.3, y: 0.4, dx: -0.02, dy: 0 },
            { label: 'right', x: 0.7, y: 0.4, dx: 0.02, dy: 0 },
        ],
    };
}
function expectCode(code, operation) {
    try {
        operation();
    }
    catch (error) {
        check(error instanceof ProRenderError && error.code === code, `expected ${code}`);
        return;
    }
    throw new Error(`expected ${code}`);
}
async function expectAsyncCode(code, operation) {
    try {
        await operation();
    }
    catch (error) {
        check(error instanceof ProRenderError && error.code === code, `expected ${code}`);
        return;
    }
    throw new Error(`expected ${code}`);
}
export async function testR4HWorkbench() {
    let count = 0;
    const source = photo();
    const input = new Uint8Array(source.pixels);
    const noIdentity = new ProWorkbenchModel(new R3HBrowserSession(null), false);
    expectCode('photo_missing', () => noIdentity.add('poseonly'));
    count++;
    noIdentity.openPhoto({ pixels: source, sourceKey: 'local-1' });
    check(noIdentity.state.plan?.identity.enabled, 'on by default');
    check(noIdentity.preflight?.status === 'blocked', 'missing identity refuses readiness');
    await expectAsyncCode('identity_model_unavailable', () => noIdentity.run());
    count += 3;
    const guard = new CheckedGuard();
    const model = new ProWorkbenchModel(new R3HBrowserSession(guard), true);
    const drawn = checkedPose();
    const original = photo();
    let maskReads = 0;
    model.openPhoto({
        pixels: original, sourceKey: 'chosen-photo', pose: drawn,
        regions: () => {
            maskReads++;
            return { width: 32, height: 32, evidence: 'synthetic_test' };
        },
    });
    check(model.preflight?.status === 'ready', 'complete capability readiness');
    check(model.state.status === 'ready', 'opened local photo');
    check(model.state.identityEnabled, 'identity on');
    count += 3;
    for (const name of ['studioquality', 'poseonly', 'upscale', 'identitylock']) {
        model.add(name);
    }
    check(model.state.activeCommandCount === 5, 'five distinct commands');
    model.setLevel(0, 24);
    model.setLevel(1, 31);
    model.setLevel(2, 22);
    model.setLevel(3, 10);
    check(model.state.plan?.steps[0]?.level === 24, 'decimal level in tenths');
    model.setUpscale(3, 2);
    const preview = await model.run('preview');
    check(preview.steps.length === 5, 'complete preview');
    check(guard.calls === 5, 'guard called on every step including pose');
    check(preview.image.width === 64 && preview.image.height === 64, '2x result');
    check(model.state.lastReport?.steps.length === 5, 'visible status');
    check(maskReads === 1, 'mask acquired once per photo');
    count += 7;
    const exportResult = await model.run('export');
    check(exportResult.steps.length === 5, 'same chain in full render');
    check(exportResult.image.width === 64, 'full render dimensions');
    check(guard.calls >= 10, 'no guard skipped after cache hits');
    check(original.pixels.every((value, offset) => value === input[offset]), 'original bytes retained');
    const outputCopy = model.state.latest;
    check(outputCopy !== null, 'display copy exists');
    if (outputCopy !== null)
        outputCopy.pixels.fill(0);
    const again = model.state.latest;
    check(again !== null && again.pixels.some(value => value !== 0), 'defensive snapshot');
    count += 6;
    model.move(2, -1);
    check(model.state.plan?.steps[1]?.name === 'poseonly', 'chain reorder');
    check(model.undoPlan(), 'undo edit settings');
    check(model.state.plan?.steps[1]?.name === 'studioquality', 'undo restores order');
    model.remove(4);
    check(model.state.activeCommandCount === 4, 'remove step');
    model.replace(0, 'cleanup');
    check(model.state.plan?.steps[0]?.name === 'cleanup', 'replace step');
    count += 5;
    expectCode('invalid_index', () => model.setLevel(99, 20));
    expectCode('invalid_index', () => model.replace(99, 'upscale'));
    expectCode('invalid_index', () => model.remove(-1));
    expectCode('invalid_index', () => model.setUpscale(99, 4));
    expectCode('invalid_index', () => model.move(0, -1));
    count += 5;
    model.setIdentity(false, 'soften', 'normal');
    check(!model.state.identityEnabled, 'explicit user choice disables guard');
    check(model.state.plan?.identity.explicit_user_override, 'opt-out recorded');
    model.setIdentity(true, 'soften', 'strict');
    check(model.state.identityEnabled, 'lock restored');
    check(model.state.plan?.identity.strength === 'strict', 'strict selected');
    count += 4;
    let listeners = 0;
    const unsubscribe = model.subscribe(() => { listeners++; });
    model.setLevel(0, 33);
    check(listeners >= 2, 'observable updates');
    unsubscribe();
    const previous = listeners;
    model.setLevel(0, 40);
    check(listeners === previous, 'listener removed');
    count += 2;
    model.closePhoto();
    check(model.state.status === 'empty' && !model.state.photoOpen, 'photo erased');
    check(model.state.latest === null && model.state.plan === null, 'local data cleared');
    check(model.originalFrame === null, 'original cleared');
    check(!model.state.canUndo, 'plan history cleared');
    count += 4;
    return count;
}
//# sourceMappingURL=test-workbench-r4h.js.map