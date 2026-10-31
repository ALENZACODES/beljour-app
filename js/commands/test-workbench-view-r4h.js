/** Small native-DOM acceptance double for the real five-command panel.
 * This does not replace a mobile-browser accessibility qualification.
 * Author: John Khan.
 */
import { mountProWorkbench } from './workbench-view.js';
import { ProWorkbenchModel } from './workbench-model.js';
import { R3HBrowserSession } from './r3h-session.js';
function check(condition, label) {
    if (!condition)
        throw new Error(`workbench DOM ${label}`);
}
class FakeNode {
    ownerDocument;
    tagName;
    events = new Map();
    children = [];
    attributes = new Map();
    className = '';
    textContent = '';
    value = '';
    type = '';
    accept = '';
    href = '';
    download = '';
    disabled = false;
    checked = false;
    width = 0;
    height = 0;
    removed = false;
    files = null;
    constructor(ownerDocument, tagName) {
        this.ownerDocument = ownerDocument;
        this.tagName = tagName;
    }
    append(...items) {
        for (const item of items)
            this.children.push(item);
    }
    remove() {
        this.removed = true;
    }
    replaceChildren(...items) {
        this.children.splice(0, this.children.length, ...items);
    }
    addEventListener(name, listener) {
        const existing = this.events.get(name) ?? [];
        existing.push(listener);
        this.events.set(name, existing);
    }
    setAttribute(name, value) {
        this.attributes.set(name, value);
    }
    getAttribute(name) {
        return this.attributes.get(name) ?? null;
    }
    trigger(name) {
        if (this.disabled)
            return;
        for (const listener of this.events.get(name) ?? [])
            listener();
    }
    click() {
        this.trigger('click');
    }
    getContext() {
        return { putImageData: () => { this.ownerDocument.drawCount++; } };
    }
    findTag(name) {
        return [...(this.tagName === name ? [this] : []),
            ...this.children.flatMap(item => item.findTag(name))];
    }
}
class FakeDocument {
    drawCount = 0;
    createElement(name) {
        return new FakeNode(this, name.toUpperCase());
    }
}
class SyntheticGuard {
    modelEvidenceKey = 'test-only';
    async enforce(_original, edited) {
        return { frame: edited, identityMatch: 98, status: 'kept', syntheticOnly: true };
    }
}
function photo() {
    const pixels = new Uint8Array(32 * 32 * 4);
    for (let pixel = 0; pixel < 32 * 32; pixel++) {
        const offset = pixel * 4;
        pixels.set([pixel % 255, pixel % 127, 78, 255], offset);
    }
    return { width: 32, height: 32, channels: 4, pixels };
}
function button(root, caption) {
    const result = root.findTag('BUTTON').find(item => item.textContent === caption);
    if (result === undefined)
        throw new Error(`Missing button ${caption}`);
    return result;
}
export async function testWorkbenchViewR4H() {
    let count = 0;
    const originalImageData = Object.getOwnPropertyDescriptor(globalThis, 'ImageData');
    Object.defineProperty(globalThis, 'ImageData', {
        configurable: true,
        value: class SyntheticImageData {
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
    const doc = new FakeDocument();
    const root = doc.createElement('div');
    const model = new ProWorkbenchModel(new R3HBrowserSession(new SyntheticGuard()), true);
    const mounted = mountProWorkbench(root, model);
    check(root.findTag('SECTION').length === 1, 'panel mounted');
    check(root.findTag('STYLE').length === 1, 'scoped styling exists');
    check(root.findTag('INPUT').some(input => input.type === 'file'), 'local photo input');
    check(root.findTag('P').some(node => node.getAttribute('role') === 'status'), 'live status');
    check(root.findTag('P').some(node => node.getAttribute('role') === 'alert'), 'alert accessible');
    count += 5;
    check(root.findTag('BUTTON').length === 0, 'no dead photo controls');
    count++;
    model.openPhoto({ pixels: photo(), sourceKey: 'drawn-original' });
    check(button(root, 'Preview').disabled === false, 'preview ready');
    check(button(root, 'Undo settings').disabled, 'undo starts disabled');
    check(root.findTag('INPUT').some(input => input.type === 'checkbox' && input.checked), 'identity defaults on');
    check(root.findTag('INPUT').some(input => input.type === 'range' &&
        input.getAttribute('aria-label') === 'Level for Cleanup'), 'labelled decimal strength');
    count += 4;
    button(root, 'Add command').click();
    check(model.state.activeCommandCount === 2, 'add works');
    check(!button(root, 'Undo settings').disabled, 'undo enabled');
    count += 2;
    const ranges = root.findTag('INPUT').filter(input => input.type === 'range');
    check(ranges.length === 2 && ranges[0].value === '3.0', 'decimal input initial state');
    count++;
    const firstSelect = root.findTag('SELECT').find(select => select.getAttribute('aria-label') === 'Command for step 1');
    check(firstSelect !== undefined, 'command selector exists');
    if (firstSelect !== undefined) {
        firstSelect.value = 'upscale';
        firstSelect.trigger('change');
    }
    check(model.state.plan?.steps[0]?.name === 'upscale', 'selector wired to plan');
    count += 2;
    button(root, 'Undo settings').click();
    check(model.state.plan?.steps[0]?.name === 'cleanup', 'undo is functional');
    count++;
    const checkbox = root.findTag('INPUT').find(input => input.type === 'checkbox');
    check(checkbox !== undefined, 'identity toggle present');
    if (checkbox !== undefined) {
        checkbox.checked = false;
        checkbox.trigger('change');
    }
    check(model.state.plan?.identity.explicit_user_override === true &&
        !model.state.identityEnabled, 'deliberate opt-out recorded');
    count++;
    button(root, 'Clear photo').click();
    check(!model.state.photoOpen, 'clear local source');
    check(root.findTag('BUTTON').length === 0, 'controls removed on clear');
    check(doc.drawCount > 0, 'photo painted locally in a bounded preview');
    count += 3;
    mounted.destroy();
    check(root.findTag('SECTION')[0]?.removed, 'explicit teardown');
    count++;
    if (originalImageData === undefined)
        delete globalThis.ImageData;
    else
        Object.defineProperty(globalThis, 'ImageData', originalImageData);
    return count;
}
