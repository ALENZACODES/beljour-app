/** Synthetic host integration contract; no uploaded photographs or external services.
 * Author: John Khan.
 */
import { mountHostProCommands } from './host-bridge.js';
import { ProRenderError } from './runtime.js';
function check(value, why) {
    if (!value)
        throw new Error(`host bridge ${why}`);
}
function failure(code, callback) {
    try {
        callback();
    }
    catch (error) {
        if (error instanceof ProRenderError && error.code === code)
            return;
        throw error;
    }
    throw new Error(`host bridge expected ${code}`);
}
async function rejection(code, callback) {
    try {
        await callback();
    }
    catch (error) {
        if (error instanceof ProRenderError && error.code === code)
            return;
        throw error;
    }
    throw new Error(`host bridge expected ${code}`);
}
class MockNode {
    ownerDocument;
    tagName;
    nodes = [];
    attributes = new Map();
    handlers = new Map();
    textContent = '';
    className = '';
    value = '';
    checked = false;
    disabled = false;
    type = '';
    accept = '';
    width = 0;
    height = 0;
    removed = false;
    files = null;
    constructor(ownerDocument, tagName) {
        this.ownerDocument = ownerDocument;
        this.tagName = tagName;
    }
    append(...nodes) { this.nodes.push(...nodes); }
    replaceChildren(...nodes) { this.nodes.splice(0, this.nodes.length, ...nodes); }
    remove() { this.removed = true; }
    setAttribute(name, value) { this.attributes.set(name, value); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    addEventListener(name, fn) {
        const handlers = this.handlers.get(name) ?? [];
        handlers.push(fn);
        this.handlers.set(name, handlers);
    }
    click() { for (const handler of this.handlers.get('click') ?? [])
        handler(); }
    getContext() {
        return { putImageData: () => { this.ownerDocument.drawCount++; } };
    }
}
class MockDocument {
    drawCount = 0;
    createElement(tag) { return new MockNode(this, tag); }
}
class PhotoEventBus {
    listeners = new Set();
    unsubscribed = 0;
    subscribe(listener) {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
            this.unsubscribed++;
        };
    }
    emit(event) { for (const listener of this.listeners)
        listener(event); }
}
class SyntheticIdentity {
    modelEvidenceKey = 'synthetic-only';
    checks = 0;
    async enforce(_original, edited) {
        this.checks++;
        return { frame: edited, identityMatch: 100, status: 'kept', syntheticOnly: true };
    }
}
function portrait(rgb = 75) {
    const pixels = new Uint8Array(20 * 20 * 4);
    for (let index = 0; index < 400; index++) {
        pixels.set([rgb, 100, 140, 255], index * 4);
    }
    return { width: 20, height: 20, channels: 4, pixels };
}
export async function testHostBridgeR5H() {
    let count = 0;
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'ImageData');
    Object.defineProperty(globalThis, 'ImageData', {
        configurable: true,
        value: class MockImageData {
            rgba;
            width;
            height;
            constructor(rgba, width, height) {
                this.rgba = rgba;
                this.width = width;
                this.height = height;
            }
        },
    });
    try {
        const doc = new MockDocument();
        const root = doc.createElement('div');
        const bus = new PhotoEventBus();
        const guard = new SyntheticIdentity();
        const errors = [];
        const bridge = mountHostProCommands({
            root: root, identity: guard, events: bus,
            onError: (code) => { errors.push(code); },
        });
        check(bridge.active, 'active after mount');
        check(bus.listeners.size === 1, 'registered one event listener');
        check(bridge.state.status === 'empty', 'starts empty');
        count += 3;
        failure('host_already_mounted', () => mountHostProCommands({
            root: root, identity: guard, events: bus,
        }));
        count++;
        const frame = portrait();
        bus.emit({ type: 'photo', photo: {
                pixels: frame, sourceKey: 'sample-01', consentToLocalProcessing: true,
            } });
        check(bridge.state.photoOpen, 'host event opens photo');
        check(bridge.state.identityEnabled, 'identity default on');
        check(bridge.model.originalFrame?.pixels[0] === 75, 'photo pixels received');
        frame.pixels.fill(0);
        check(bridge.model.originalFrame?.pixels[0] === 75, 'defensive source copy');
        count += 4;
        const preview = await bridge.preview();
        check(preview.steps.length === 1, 'preview performed');
        check(guard.checks === 1, 'preview identity check applied');
        const exportResult = await bridge.exportImage();
        check(exportResult.steps.length === 1, 'full render performed');
        check(guard.checks === 2, 'export independently guarded');
        count += 4;
        bus.emit({ type: 'clear' });
        check(!bridge.state.photoOpen, 'host clear event');
        count++;
        bus.emit({ type: 'photo', photo: {
                pixels: portrait(), sourceKey: 'sample-02', consentToLocalProcessing: false,
            } });
        check(errors.includes('local_processing_consent_required'), 'missing consent failed');
        check(!bridge.state.photoOpen, 'failed selection did not open');
        count += 2;
        bus.emit({ type: 'photo', photo: {
                pixels: portrait(), sourceKey: '../folder', consentToLocalProcessing: true,
            } });
        check(errors.includes('invalid_photo_key'), 'unsafe source key rejected');
        count++;
        bus.emit({ type: 'photo', photo: {
                pixels: portrait(), sourceKey: 'sample-03', consentToLocalProcessing: true,
            } });
        bus.emit({ type: 'reset' });
        check(!bridge.state.photoOpen, 'session reset clears photo');
        count++;
        bridge.dispose();
        check(!bridge.active, 'disposed');
        check(bus.unsubscribed === 1 && bus.listeners.size === 0, 'listener released');
        check(!bridge.state.photoOpen, 'photo erased on dispose');
        bridge.dispose();
        check(bus.unsubscribed === 1, 'dispose idempotent');
        count += 4;
        failure('host_unmounted', () => bridge.acceptPhoto({
            pixels: portrait(), sourceKey: 'post-dispose', consentToLocalProcessing: true,
        }));
        await rejection('host_unmounted', () => bridge.preview());
        count += 2;
        const absent = mountHostProCommands({
            root: root, identity: null, events: bus,
        });
        absent.acceptPhoto({
            pixels: portrait(), sourceKey: 'without-identity', consentToLocalProcessing: true,
        });
        check(absent.state.identityEnabled, 'identity toggle defaults on even when unavailable');
        check(absent.model.preflight?.status === 'blocked', 'no cleared model blocks the edit');
        await rejection('identity_model_unavailable', () => absent.preview());
        absent.dispose();
        count += 3;
        check(doc.drawCount > 0, 'photo painted in local DOM');
        count++;
    }
    finally {
        if (previous === undefined)
            delete globalThis.ImageData;
        else
            Object.defineProperty(globalThis, 'ImageData', previous);
    }
    return count;
}
//# sourceMappingURL=test-host-bridge-r5h.js.map