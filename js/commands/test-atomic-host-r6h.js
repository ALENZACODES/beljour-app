/** Host transaction, cancellation and rejected-photo privacy tests.
 * The rendered fixtures are small synthetic arrays; no model or server.
 * Author: John Khan.
 */
import { mountHostProCommands } from './host-bridge.js';
import { levelFromTenths } from './levels.js';
import { createProPlan } from './plan.js';
import { R3HBrowserSession } from './r3h-session.js';
import { ProRenderError } from './runtime.js';
import { ProWorkbenchModel } from './workbench-model.js';
function check(condition, reason) {
    if (!condition)
        throw new Error(`atomic host: ${reason}`);
}
async function rejects(codes, action) {
    try {
        await action();
    }
    catch (error) {
        if (error instanceof ProRenderError && codes.includes(error.code))
            return;
        throw error;
    }
    throw new Error(`atomic host: expected ${codes.join(' or ')}`);
}
function rejectsSync(code, action) {
    try {
        action();
    }
    catch (error) {
        if (error instanceof ProRenderError && error.code === code)
            return;
        throw error;
    }
    throw new Error(`atomic host: expected ${code}`);
}
function portrait(value = 55) {
    const pixels = new Uint8Array(16 * 16 * 4);
    for (let index = 0; index < 256; index++) {
        const offset = index * 4;
        pixels[offset] = value;
        pixels[offset + 1] = 110;
        pixels[offset + 2] = 145;
        pixels[offset + 3] = 255;
    }
    return { width: 16, height: 16, channels: 4, pixels };
}
function fullPlan() {
    return createProPlan([
        { index: 0, name: 'cleanup', level: levelFromTenths(30), scale: 2 },
        { index: 1, name: 'studioquality', level: levelFromTenths(10), scale: 2 },
        { index: 2, name: 'identitylock', level: levelFromTenths(10), scale: 2 },
        { index: 3, name: 'poseonly', level: levelFromTenths(10), scale: 2 },
        { index: 4, name: 'upscale', level: levelFromTenths(10), scale: 2 },
    ]);
}
class BlockingIdentity {
    modelEvidenceKey = 'synthetic-contract-only';
    calls = 0;
    hold = false;
    started = null;
    release = null;
    async enforce(_original, edited) {
        this.calls++;
        if (this.hold) {
            this.started?.();
            await new Promise(resolve => { this.release = resolve; });
        }
        return { frame: edited, identityMatch: 100, status: 'kept', syntheticOnly: true };
    }
}
class MiniNode {
    ownerDocument;
    tagName;
    children = [];
    attributes = new Map();
    listeners = new Map();
    textContent = '';
    className = '';
    value = '';
    disabled = false;
    checked = false;
    width = 0;
    height = 0;
    type = '';
    accept = '';
    files = null;
    constructor(ownerDocument, tagName) {
        this.ownerDocument = ownerDocument;
        this.tagName = tagName;
    }
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(...nodes) {
        this.children.splice(0, this.children.length, ...nodes);
    }
    remove() { this.children.splice(0, this.children.length); }
    setAttribute(key, value) { this.attributes.set(key, value); }
    addEventListener(kind, fn) {
        const prior = this.listeners.get(kind) ?? [];
        prior.push(fn);
        this.listeners.set(kind, prior);
    }
    getContext() {
        return { putImageData: () => { this.ownerDocument.draws++; } };
    }
}
class MiniDocument {
    draws = 0;
    createElement(tag) { return new MiniNode(this, tag); }
}
class EventHub {
    callbacks = new Set();
    subscribe(listener) {
        this.callbacks.add(listener);
        return () => { this.callbacks.delete(listener); };
    }
    send(event) {
        for (const callback of this.callbacks)
            callback(event);
    }
}
export async function testAtomicHostR6H() {
    let count = 0;
    const identity = new BlockingIdentity();
    const session = new R3HBrowserSession(identity);
    const model = new ProWorkbenchModel(session, true);
    model.openPhoto({ pixels: portrait(), sourceKey: 'atomic-01' });
    const first = model.state;
    const recipe = fullPlan();
    model.replacePlan(recipe);
    check(model.state.plan?.steps.length === 5, 'complete chain replacement');
    check(model.state.canUndo, 'replacement stored in one undo entry');
    check(model.state.revision === first.revision + 1, 'single revision increment');
    count += 3;
    model.replacePlan(recipe);
    check(model.state.revision === first.revision + 1, 'same plan is no-op');
    count++;
    const forged = {
        ...recipe,
        steps: [...recipe.steps.slice(0, 2), { ...recipe.steps[2], index: 99 },
            ...recipe.steps.slice(3)],
    };
    rejectsSync('invalid_host_plan', () => model.replacePlan(forged));
    check(model.state.plan?.steps.length === 5, 'invalid plan leaves chain unchanged');
    check(model.state.revision === first.revision + 1, 'invalid plan leaves revision unchanged');
    count += 3;
    check(model.undoPlan(), 'one undo restores prior plan');
    check(model.state.plan?.steps.length === 1, 'full old plan restored by one undo');
    check(!model.undoPlan(), 'no spurious intermediate history');
    count += 3;
    const preAborted = new AbortController();
    preAborted.abort();
    const beforeAbort = model.state.revision;
    await rejects(['host_cancelled'], () => model.run('preview', preAborted.signal));
    check(model.state.revision === beforeAbort, 'pre-abort does not mutate status');
    count += 2;
    identity.hold = true;
    let started = () => { };
    const begun = new Promise(resolve => { started = resolve; });
    identity.started = started;
    model.replacePlan(recipe);
    const during = new AbortController();
    const task = model.run('preview', during.signal);
    await begun;
    during.abort();
    identity.release?.();
    await rejects(['host_cancelled', 'stale_preview'], async () => task);
    check(model.state.latest === null, 'abort never exposes a partial frame');
    check(model.state.lastReport === null, 'abort never exposes partial evidence');
    count += 3;
    identity.hold = false;
    model.closePhoto();
    check(!model.state.photoOpen, 'close revokes photo');
    count++;
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'ImageData');
    Object.defineProperty(globalThis, 'ImageData', {
        configurable: true,
        value: class ImageDataDouble {
            pixels;
            width;
            height;
            constructor(pixels, width, height) {
                this.pixels = pixels;
                this.width = width;
                this.height = height;
            }
        },
    });
    try {
        const doc = new MiniDocument();
        const root = doc.createElement('main');
        const bus = new EventHub();
        const errors = [];
        const bridge = mountHostProCommands({
            root: root,
            events: bus,
            identity,
            onError: code => { errors.push(code); },
        });
        bus.send({ type: 'photo', photo: {
                pixels: portrait(42), sourceKey: 'alice', consentToLocalProcessing: true,
            } });
        bridge.changePlan(recipe);
        check(bridge.state.plan?.steps.length === 5, 'host accepts full chain in one commit');
        check(bridge.state.identityEnabled, 'host retains protected default');
        count += 2;
        const exportedRecipe = await bridge.exportRecipe();
        const sharedFragment = await bridge.exportShareFragment();
        check(exportedRecipe.includes('"beljour-pro-recipe/1"'), 'host exports settings-only recipe');
        check(!exportedRecipe.includes('pixels') && !exportedRecipe.includes('embedding'), 'host export cannot leak image or embedding data');
        check(sharedFragment.startsWith('#pro='), 'host supports offline share fragment');
        count += 3;
        const alternate = createProPlan([
            { index: 0, name: 'cleanup', level: levelFromTenths(20), scale: 2 },
            { index: 1, name: 'identitylock', level: levelFromTenths(10), scale: 2 },
        ]);
        bridge.changePlan(alternate);
        check(bridge.state.plan?.steps.length === 2, 'prepares alternate chain');
        await bridge.importRecipe(exportedRecipe);
        check(bridge.state.plan?.steps.length === 5, 'host imports full chain atomically');
        await bridge.importShareFragment(sharedFragment);
        check(bridge.state.plan?.steps.length === 5, 'fragment import produces same plan');
        count += 3;
        const revision = bridge.state.revision;
        rejectsSync('invalid_host_plan', () => bridge.changePlan(forged));
        check(bridge.state.revision === revision, 'host invalid plan is atomic');
        check(bridge.model.undoPlan(), 'host undo works');
        check(bridge.state.plan?.steps.length === 2, 'one undo restores immediately previous chain');
        check(bridge.model.undoPlan(), 'second undo works');
        check(bridge.state.plan?.steps.length === 5, 'second undo restores prior five-command chain');
        check(bridge.model.undoPlan(), 'third undo works');
        check(bridge.state.plan?.steps.length === 1, 'third undo restores original chain');
        count += 7;
        bus.send({ type: 'photo', photo: {
                pixels: portrait(99), sourceKey: 'bob', consentToLocalProcessing: false,
            } });
        check(errors.includes('local_processing_consent_required'), 'invalid consent is surfaced');
        check(bridge.state.photoOpen === false, 'old portrait cleared on denied replacement');
        check(bridge.model.originalFrame === null, 'old pixels are unavailable');
        count += 3;
        bus.send({ type: 'photo', photo: {
                pixels: portrait(88), sourceKey: 'carol', consentToLocalProcessing: true,
            } });
        check(bridge.model.originalFrame?.pixels[0] === 88, 'new owner pixels loaded');
        const good = await bridge.preview();
        check(good.steps.length === 1, 'valid photo still editable after rejection');
        count += 2;
        const oldRecipe = await bridge.exportRecipe();
        const pendingImport = bridge.importRecipe(oldRecipe);
        bus.send({ type: 'clear' });
        await rejects(['host_stale_recipe'], () => pendingImport);
        check(!bridge.state.photoOpen, 'stale recipe cannot resurrect a cleared photo');
        count += 2;
        bus.send({ type: 'photo', photo: {
                pixels: portrait(33), sourceKey: 'dana', consentToLocalProcessing: true,
            } });
        const aborted = new AbortController();
        aborted.abort();
        await rejects(['host_cancelled'], () => bridge.exportImage(aborted.signal));
        count++;
        bridge.dispose();
        check(bus.callbacks.size === 0, 'host unsubscribe on teardown');
        count++;
    }
    finally {
        if (descriptor === undefined)
            delete globalThis.ImageData;
        else
            Object.defineProperty(globalThis, 'ImageData', descriptor);
    }
    return count;
}
//# sourceMappingURL=test-atomic-host-r6h.js.map