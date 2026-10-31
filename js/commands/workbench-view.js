/** Accessible, local-only five-command panel for an existing web page.
 * Every visible control performs a real guarded-session action, or is disabled.
 * Mounting is explicit; no private photo is uploaded, recorded or persisted.
 * Author: John Khan.
 */
import { MAX_IMPORT_BYTES, BrowserPhotoCodec, downloadLocalPng, uiPreviewPixels, } from './frame-io.js';
import { levelLabel } from './levels.js';
import { ProPlanError } from './plan.js';
import { ProRenderError } from './runtime.js';
import { prepareRecipeDownload, readLocalRecipe, saveLocalRecipe } from './recipe-local-io.js';
const COMMANDS = Object.freeze([
    'identitylock', 'cleanup', 'upscale', 'studioquality', 'poseonly',
]);
const TITLES = Object.freeze({
    identitylock: 'Identity Lock',
    cleanup: 'Cleanup',
    upscale: 'Upscale',
    studioquality: 'Studio Quality',
    poseonly: 'Pose Only',
});
const CSS = `
.lg-pro { max-width: 920px; margin: auto; padding: 1.5rem; color: var(--ink, #2B1A22);
  background: var(--surface, #FFFDFA); font: 16px/1.5 system-ui, sans-serif; }
.lg-pro h2 { font-family: Georgia, serif; font-size: 1.6rem; color: var(--plum, #6B3044); }
.lg-pro fieldset { border: 1px solid var(--muted, #6A5560); border-radius: .4rem; margin: 1rem 0; }
.lg-pro legend { font-weight: 700; }
.lg-pro .controls { display: flex; align-items: center; flex-wrap: wrap; gap: .6rem; }
.lg-pro button, .lg-pro select, .lg-pro input[type=file] { min-height: 44px; }
.lg-pro button { background: var(--plum, #6B3044); color: var(--cream, #FBF6EF); border: 0; border-radius: .3rem;
  padding: .6rem 1rem; cursor: pointer; }
.lg-pro button:disabled { opacity: .6; cursor: not-allowed; }
.lg-pro button:focus-visible, .lg-pro input:focus-visible, .lg-pro select:focus-visible {
  outline: 3px solid var(--plum, #6B3044); outline-offset: 3px; }
.lg-pro .secondary { background: var(--blush, #F2D9D6); color: var(--ink, #2B1A22); }
.lg-pro .row { margin: .5rem 0; padding: .65rem; border: 1px solid var(--rule, #E6D6D0); }
.lg-pro label { display: inline-flex; gap: .3rem; align-items: center; }
.lg-pro input[type=range] { min-width: 125px; }
.lg-pro canvas { display: block; max-width: 100%; height: auto; border: 1px solid var(--rule, #E6D6D0); }
.lg-pro .error { color: var(--error, #8E1B2B); }
.lg-pro .note { color: var(--muted, #6A5560); }
`;
function element(doc, name, text = '', className = '') {
    const node = doc.createElement(name);
    node.textContent = text;
    if (className !== '')
        node.className = className;
    return node;
}
function controlButton(doc, text, action, disabled = false, secondary = false) {
    const button = element(doc, 'button', text, secondary ? 'secondary' : '');
    button.type = 'button';
    button.disabled = disabled;
    button.addEventListener('click', () => {
        void action();
    });
    return button;
}
function option(doc, value, title) {
    const item = element(doc, 'option', title);
    item.value = value;
    return item;
}
function setCanvas(canvas, frame) {
    const tile = uiPreviewPixels(frame);
    canvas.width = tile.width;
    canvas.height = tile.height;
    const context = canvas.getContext('2d');
    if (context === null)
        throw new ProRenderError('canvas_unavailable', 'Preview canvas is unavailable.');
    context.putImageData(new ImageData(tile.rgba, tile.width, tile.height), 0, 0);
}
export function mountProWorkbench(root, model, codec = new BrowserPhotoCodec()) {
    const doc = root.ownerDocument;
    const wrapper = element(doc, 'section', '', 'lg-pro');
    wrapper.setAttribute('aria-label', 'Photo Pro Commands');
    const style = element(doc, 'style', CSS);
    const title = element(doc, 'h2', 'Pro photo editor');
    const note = element(doc, 'p', 'Edits stay on this device. Identity Lock is on by default.', 'note');
    const fileLabel = element(doc, 'label', 'Choose a photo: ');
    const fileInput = element(doc, 'input');
    fileInput.type = 'file';
    fileInput.accept = 'image/jpeg,image/png,image/webp';
    fileInput.setAttribute('aria-label', 'Choose a local photo');
    fileLabel.append(fileInput);
    const recipeLabel = element(doc, 'label', 'Load command recipe: ');
    const recipeInput = element(doc, 'input');
    recipeInput.type = 'file';
    recipeInput.accept = '.json,application/json';
    recipeInput.setAttribute('aria-label', 'Load a local settings-only Pro recipe');
    recipeLabel.append(recipeInput);
    const status = element(doc, 'p', '', 'note');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    const failure = element(doc, 'p', '', 'error');
    failure.setAttribute('role', 'alert');
    const settings = element(doc, 'div');
    const commands = element(doc, 'div');
    const actions = element(doc, 'div', '', 'controls');
    const stage = element(doc, 'canvas');
    stage.setAttribute('aria-label', 'Current Pro preview or full-resolution edit');
    stage.setAttribute('role', 'img');
    wrapper.append(style, title, note, fileLabel, recipeLabel, status, failure, settings, commands, actions, stage);
    root.append(wrapper);
    let destroyed = false;
    let photoCounter = 0;
    let pendingFile = 0;
    let pendingRecipe = 0;
    async function withStatus(action) {
        try {
            await action();
            if (!destroyed)
                failure.textContent = '';
        }
        catch (error) {
            if (destroyed)
                return;
            if (error instanceof ProRenderError || error instanceof ProPlanError) {
                failure.textContent = error.message;
            }
            else
                failure.textContent = 'The operation could not be completed.';
        }
    }
    fileInput.addEventListener('change', () => {
        const selected = fileInput.files?.[0];
        if (selected === undefined)
            return;
        const request = ++pendingFile;
        void withStatus(async () => {
            if (selected.size > MAX_IMPORT_BYTES) {
                throw new ProRenderError('photo_size', 'Photo must be 16 MB or less.');
            }
            const frame = await codec.decode(selected);
            if (destroyed || request !== pendingFile)
                return;
            model.openPhoto({ pixels: frame, sourceKey: `local-photo-${++photoCounter}` });
            setCanvas(stage, frame);
        });
    });
    recipeInput.addEventListener('change', () => {
        const selected = recipeInput.files?.[0];
        if (selected === undefined)
            return;
        const ticket = ++pendingRecipe;
        const photoRevision = model.state.revision;
        void withStatus(async () => {
            if (!model.state.photoOpen) {
                throw new ProRenderError('photo_missing', 'Open a photo before loading a recipe.');
            }
            // Imported settings cannot weaken identity protection silently.
            const record = await readLocalRecipe(selected);
            if (destroyed || ticket !== pendingRecipe ||
                photoRevision !== model.state.revision)
                return;
            model.replacePlan(record.plan);
            recipeInput.value = '';
        });
    });
    function commandRow(state, index) {
        const step = state.plan?.steps[index];
        if (step === undefined)
            throw new ProRenderError('invalid_index', 'Command is unavailable.');
        const row = element(doc, 'div', '', 'row');
        const controls = element(doc, 'div', '', 'controls');
        const kindLabel = element(doc, 'label', `Step ${index + 1}`);
        const kind = element(doc, 'select');
        kind.setAttribute('aria-label', `Command for step ${index + 1}`);
        for (const name of COMMANDS)
            kind.append(option(doc, name, TITLES[name]));
        kind.value = step.name;
        kind.addEventListener('change', () => model.replace(index, kind.value));
        kindLabel.append(kind);
        const strengthLabel = element(doc, 'label', 'Level');
        const strength = element(doc, 'input');
        strength.type = 'range';
        strength.min = '1.0';
        strength.max = '5.0';
        strength.step = '0.1';
        strength.value = levelLabel(step.level);
        strength.setAttribute('aria-label', `Level for ${TITLES[step.name]}`);
        const levelValue = element(doc, 'output', levelLabel(step.level));
        strength.addEventListener('input', () => {
            levelValue.textContent = strength.value;
        });
        strength.addEventListener('change', () => {
            model.setLevel(index, Math.round(Number(strength.value) * 10));
        });
        strengthLabel.append(strength, levelValue);
        controls.append(kindLabel, strengthLabel);
        if (step.name === 'upscale') {
            const scaleLabel = element(doc, 'label', 'Scale');
            const scale = element(doc, 'select');
            scale.setAttribute('aria-label', `Scale for step ${index + 1}`);
            scale.append(option(doc, '2', '2×'), option(doc, '4', '4×'));
            scale.value = String(step.scale);
            scale.addEventListener('change', () => {
                model.setUpscale(index, scale.value === '4' ? 4 : 2);
            });
            scaleLabel.append(scale);
            controls.append(scaleLabel);
        }
        controls.append(controlButton(doc, 'Move up', () => model.move(index, -1), index === 0, true), controlButton(doc, 'Move down', () => model.move(index, 1), index >= (state.plan?.steps.length ?? 0) - 1, true), controlButton(doc, 'Remove', () => model.remove(index), (state.plan?.steps.length ?? 0) <= 1, true));
        row.append(controls);
        return row;
    }
    function identityControls(state) {
        const fieldset = element(doc, 'fieldset');
        fieldset.append(element(doc, 'legend', 'Identity preservation'));
        const controls = element(doc, 'div', '', 'controls');
        const enabledLabel = element(doc, 'label', 'Identity Lock');
        const enabled = element(doc, 'input');
        enabled.type = 'checkbox';
        enabled.checked = state.identityEnabled;
        enabled.setAttribute('aria-label', 'Use Identity Lock for every command');
        const modeLabel = element(doc, 'label', 'Mode');
        const mode = element(doc, 'select');
        mode.setAttribute('aria-label', 'Identity Lock mode');
        mode.append(option(doc, 'soften', 'Soften'), option(doc, 'block', 'Block'), option(doc, 'warn', 'Warn'));
        mode.value = state.plan?.identity.mode ?? 'soften';
        const strengthLabel = element(doc, 'label', 'Protection');
        const protection = element(doc, 'select');
        protection.setAttribute('aria-label', 'Identity Lock protection level');
        protection.append(option(doc, 'normal', 'Normal'), option(doc, 'strict', 'Strict'));
        protection.value = state.plan?.identity.strength ?? 'normal';
        const commit = () => {
            model.setIdentity(enabled.checked, mode.value, protection.value);
        };
        enabled.addEventListener('change', commit);
        mode.addEventListener('change', commit);
        protection.addEventListener('change', commit);
        enabledLabel.append(enabled);
        modeLabel.append(mode);
        strengthLabel.append(protection);
        controls.append(enabledLabel, modeLabel, strengthLabel);
        fieldset.append(controls);
        const caveat = element(doc, 'p', 'Disabling the lock or selecting Warn is an explicit choice. ' +
            'The result is not identity-verified.', 'note');
        fieldset.append(caveat);
        return fieldset;
    }
    function render(state) {
        if (destroyed)
            return;
        if (state.photoOpen && state.latest === null) {
            const original = model.originalFrame;
            if (original !== null)
                setCanvas(stage, original);
        }
        const busy = state.status === 'rendering';
        const planned = state.plan !== null;
        const ready = model.preflight?.status === 'ready';
        const blockers = model.preflight?.issues.join(', ') ?? '';
        status.textContent = state.photoOpen ?
            `${state.status}. Identity ${state.identityEnabled ? 'on' : 'off'}. ` +
                `${state.activeCommandCount} command(s). ${ready ? 'Ready' : blockers}.` :
            'Choose a photo to begin. No file is transmitted.';
        settings.replaceChildren();
        commands.replaceChildren();
        actions.replaceChildren();
        if (!planned)
            return;
        settings.append(identityControls(state));
        const heading = element(doc, 'h3', 'Command chain');
        commands.append(heading);
        for (let index = 0; index < (state.plan?.steps.length ?? 0); index++) {
            commands.append(commandRow(state, index));
        }
        actions.append(controlButton(doc, 'Add command', () => model.add('cleanup'), busy || (state.plan?.steps.length ?? 0) >= 12));
        actions.append(controlButton(doc, 'Undo settings', () => {
            model.undoPlan();
        }, busy || !state.canUndo, true));
        actions.append(controlButton(doc, 'Save command recipe', async () => {
            await withStatus(async () => {
                const currentPlan = model.state.plan;
                if (currentPlan === null) {
                    throw new ProRenderError('photo_missing', 'Open a photo before saving a recipe.');
                }
                const expectedRevision = model.state.revision;
                const blob = await prepareRecipeDownload(currentPlan);
                if (destroyed || expectedRevision !== model.state.revision)
                    return;
                saveLocalRecipe(blob);
            });
        }, busy || !planned, true));
        actions.append(controlButton(doc, 'Preview', async () => {
            await withStatus(async () => {
                const result = await model.run('preview');
                if (!destroyed)
                    setCanvas(stage, result.image);
            });
        }, busy || !ready));
        actions.append(controlButton(doc, 'Render and save PNG', async () => {
            await withStatus(async () => {
                const report = await model.run('export');
                const png = await codec.encodePng(report.image);
                if (!destroyed)
                    downloadLocalPng(png);
            });
        }, busy || !ready));
        actions.append(controlButton(doc, 'Clear photo', () => {
            pendingFile++;
            pendingRecipe++;
            model.closePhoto();
            stage.width = 0;
            stage.height = 0;
            fileInput.value = '';
            recipeInput.value = '';
        }, busy, true));
        if (state.lastReport !== null) {
            const last = state.lastReport.steps[state.lastReport.steps.length - 1];
            const meter = last?.identity?.identityMatch;
            const label = meter === undefined ? 'Identity evidence unavailable.' :
                `Last edit similarity indicator: ${meter}/100. ` +
                    `${last.identity?.syntheticOnly ? 'Synthetic check only.' : 'Unverified quality.'}`;
            actions.append(element(doc, 'p', label, 'note'));
        }
    }
    const unsubscribe = model.subscribe(render);
    return {
        root: wrapper,
        destroy() {
            if (destroyed)
                return;
            destroyed = true;
            pendingFile++;
            pendingRecipe++;
            unsubscribe();
            model.closePhoto();
            wrapper.remove();
        },
    };
}
