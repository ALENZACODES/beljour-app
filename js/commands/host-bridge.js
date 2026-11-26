import { R3HBrowserSession } from './r3h-session.js';
import { ProRenderError, checkedFrame } from './runtime.js';
import { ProWorkbenchModel } from './workbench-model.js';
import { exportPortableProRecipe, importPortableProRecipe } from './portable-recipe.js';
import { exportProShareFragment, importProShareFragment } from './share-fragment.js';
import { mountProWorkbench } from './workbench-view.js';
const INSTALLED = new WeakSet();
function validateHostPhoto(photo) {
    if (photo === null || typeof photo !== 'object') {
        throw new ProRenderError('invalid_host_photo', 'A local photo is required.');
    }
    if (photo.consentToLocalProcessing !== true) {
        throw new ProRenderError('local_processing_consent_required', 'The host must confirm local processing consent.');
    }
    checkedFrame(photo.pixels);
    if (typeof photo.sourceKey !== 'string' ||
        photo.sourceKey.length < 1 || photo.sourceKey.length > 128 ||
        !/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(photo.sourceKey)) {
        throw new ProRenderError('invalid_photo_key', 'A safe session-scoped photo key is required.');
    }
    if (photo.regions !== undefined && photo.regions !== null &&
        typeof photo.regions !== 'function') {
        throw new ProRenderError('invalid_host_regions', 'Region supplier must be callable.');
    }
    if (photo.spots !== undefined && (!Array.isArray(photo.spots) || photo.spots.length > 512)) {
        throw new ProRenderError('invalid_host_spots', 'Checked photo hints are not bounded.');
    }
}
function cloneHostPhoto(photo) {
    validateHostPhoto(photo);
    const snapshot = checkedFrame(photo.pixels);
    const copied = {
        width: snapshot.width, height: snapshot.height, channels: snapshot.channels,
        pixels: new Uint8Array(snapshot.pixels),
    };
    const supplier = photo.regions;
    const wrapped = supplier === null || supplier === undefined ? null :
        (image) => supplier(image);
    return {
        pixels: copied, sourceKey: photo.sourceKey, regions: wrapped,
        spots: photo.spots === undefined ? [] : [...photo.spots],
        pose: photo.pose,
    };
}
/** Deliberately installed by the owning host, not by scanning the whole DOM. */
export function mountHostProCommands(options) {
    if (options === null || typeof options !== 'object' ||
        typeof options.root?.append !== 'function' ||
        typeof options.events?.subscribe !== 'function' ||
        (options.onError !== undefined && typeof options.onError !== 'function')) {
        throw new ProRenderError('invalid_host_bridge', 'A local host and event source are required.');
    }
    if (INSTALLED.has(options.root)) {
        throw new ProRenderError('host_already_mounted', 'The Pro panel is already mounted here.');
    }
    const session = new R3HBrowserSession(options.identity);
    const model = new ProWorkbenchModel(session, options.identity !== null);
    let panel = null;
    let unsubscribe = null;
    let active = true;
    let generation = 0;
    try {
        panel = mountProWorkbench(options.root, model, options.codec);
        INSTALLED.add(options.root);
        const notify = (code) => {
            try {
                options.onError?.(code);
            }
            catch { /* Host error reporting cannot break local photo processing. */ }
        };
        const acceptPhoto = (photo) => {
            if (!active)
                throw new ProRenderError('host_unmounted', 'Pro panel is not mounted.');
            generation++;
            // A rejected replacement must never leave another person's photo active.
            model.closePhoto();
            const prepared = cloneHostPhoto(photo);
            model.openPhoto(prepared);
        };
        const clearPhoto = () => {
            if (!active)
                return;
            generation++;
            model.closePhoto();
        };
        unsubscribe = options.events.subscribe((event) => {
            if (!active)
                return;
            try {
                if (event.type === 'photo')
                    acceptPhoto(event.photo);
                else if (event.type === 'clear' || event.type === 'reset')
                    clearPhoto();
                else
                    notify('unknown_host_event');
            }
            catch (error) {
                notify(error instanceof ProRenderError ? error.code : 'host_photo_failed');
            }
        });
        const run = async (quality, signal) => {
            if (!active)
                throw new ProRenderError('host_unmounted', 'Pro panel is not mounted.');
            if (signal?.aborted)
                throw new ProRenderError('host_cancelled', 'Host request was cancelled.');
            const ticket = generation;
            const result = await model.run(quality, signal);
            if (!active || ticket !== generation || signal?.aborted) {
                throw new ProRenderError('host_stale_result', 'A newer photo replaced this edit.');
            }
            return result;
        };
        const changePlan = (plan) => {
            if (!active || model.state.plan === null) {
                throw new ProRenderError('host_photo_missing', 'Open a photo before changing commands.');
            }
            // Validation and a single history commit are owned by the workbench.
            // Never replace steps sequentially: a late invalid step must not leave
            // a partial recipe or repeated undo entries on the user's photograph.
            model.replacePlan(plan);
        };
        const currentRecipeContext = () => {
            if (!active || model.state.plan === null) {
                throw new ProRenderError('host_photo_missing', 'Open a photo before editing a recipe.');
            }
            return { revision: model.state.revision, plan: model.state.plan };
        };
        const acceptIfCurrent = (expectedRevision, ticket) => {
            if (!active || ticket !== generation || model.state.revision !== expectedRevision) {
                throw new ProRenderError('host_stale_recipe', 'The recipe request was superseded.');
            }
        };
        const exportRecipe = async () => {
            const before = currentRecipeContext();
            const ticket = generation;
            const recipe = await exportPortableProRecipe(before.plan);
            acceptIfCurrent(before.revision, ticket);
            return recipe;
        };
        const exportShareFragment = async () => {
            const before = currentRecipeContext();
            const ticket = generation;
            const link = await exportProShareFragment(before.plan);
            acceptIfCurrent(before.revision, ticket);
            return link;
        };
        const importRecipe = async (recipe, confirmWeakenedIdentity = false) => {
            const before = currentRecipeContext();
            const ticket = generation;
            const record = await importPortableProRecipe(recipe, { confirmWeakenedIdentity });
            acceptIfCurrent(before.revision, ticket);
            model.replacePlan(record.plan);
        };
        const importShareFragment = async (fragment, confirmWeakenedIdentity = false) => {
            const before = currentRecipeContext();
            const ticket = generation;
            const record = await importProShareFragment(fragment, { confirmWeakenedIdentity });
            acceptIfCurrent(before.revision, ticket);
            model.replacePlan(record.plan);
        };
        const mountedPanel = panel;
        return {
            model, mounted: mountedPanel,
            get active() { return active; },
            get state() { return model.state; },
            acceptPhoto, clearPhoto,
            preview: async (signal) => run('preview', signal),
            exportImage: async (signal) => run('export', signal),
            changePlan, exportRecipe, importRecipe, exportShareFragment, importShareFragment,
            dispose() {
                if (!active)
                    return;
                active = false;
                generation++;
                unsubscribe?.();
                mountedPanel.destroy();
                INSTALLED.delete(options.root);
            },
        };
    }
    catch (error) {
        active = false;
        unsubscribe?.();
        panel?.destroy();
        INSTALLED.delete(options.root);
        throw error;
    }
}
//# sourceMappingURL=host-bridge.js.map