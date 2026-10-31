/** Five-command local workbench state with guarded, revision-safe rendering.
 * One immutable source per photo; every plan is run through R3HBrowserSession.
 * This module never acquires a model, sends a request, or persists photo data.
 * Author: John Khan.
 */
import { levelFromTenths, levelLabel } from './levels.js';
import { DEFAULT_IDENTITY_POLICY, canonicalProPlan, createProPlan, userIdentityOverride, } from './plan.js';
import { preflightProPlan } from './preflight.js';
import { ProRenderError, checkedFrame } from './runtime.js';
const COMMAND_NAMES = new Set([
    'cleanup', 'upscale', 'studioquality', 'poseonly', 'identitylock',
]);
const ENGINE_NAMES = new Set([
    'cleanup', 'upscale', 'studioquality', 'poseonly',
]);
const MAX_HISTORY = 32;
function duplicateFrame(frame) {
    checkedFrame(frame);
    return {
        width: frame.width,
        height: frame.height,
        channels: frame.channels,
        pixels: new Uint8Array(frame.pixels),
    };
}
function stepWithIndex(step, index) {
    return Object.freeze({ name: step.name, scale: step.scale, level: step.level, index });
}
export class ProWorkbenchModel {
    session;
    listeners = new Set();
    history = [];
    currentPlan = null;
    source = null;
    output = null;
    lastReport = null;
    selectedStatus = 'empty';
    lastError = null;
    revision = 0;
    rendering = null;
    identityAvailable;
    checkedMaskAvailable = false;
    poseAvailable = false;
    constructor(session, identityAvailable) {
        if (typeof identityAvailable !== 'boolean') {
            throw new ProRenderError('invalid_capability', 'Identity capability must be explicit.');
        }
        this.session = session;
        this.identityAvailable = identityAvailable;
    }
    subscribe(listener) {
        this.listeners.add(listener);
        listener(this.state);
        return () => { this.listeners.delete(listener); };
    }
    notify() {
        const snapshot = this.state;
        for (const listener of this.listeners)
            listener(snapshot);
    }
    supersede() {
        this.revision++;
        this.rendering?.abort();
        this.rendering = null;
        this.output = null;
        this.lastReport = null;
        this.lastError = null;
        this.selectedStatus = this.source === null ? 'empty' : 'ready';
    }
    setPlan(plan) {
        if (this.source === null) {
            throw new ProRenderError('photo_missing', 'Open a photo before editing commands.');
        }
        if (this.currentPlan !== null) {
            this.history.push(this.currentPlan);
            if (this.history.length > MAX_HISTORY)
                this.history.shift();
        }
        this.supersede();
        this.currentPlan = plan;
        this.notify();
    }
    openPhoto(details) {
        checkedFrame(details.pixels);
        if (typeof details.sourceKey !== 'string' || details.sourceKey.length === 0 ||
            details.sourceKey.length > 128) {
            throw new ProRenderError('invalid_photo_key', 'A bounded local source key is required.');
        }
        this.closePhoto();
        const image = duplicateFrame(details.pixels);
        this.session.openPhoto(image, details.sourceKey, details.regions ?? null, details.spots ?? [], details.pose ?? null);
        this.source = image;
        this.poseAvailable = details.pose !== undefined && details.pose !== null;
        this.checkedMaskAvailable = details.regions !== undefined && details.regions !== null;
        this.currentPlan = createProPlan([{
                index: 0, name: 'cleanup', level: levelFromTenths(30), scale: 2,
            }], DEFAULT_IDENTITY_POLICY);
        this.selectedStatus = 'ready';
        this.notify();
    }
    closePhoto() {
        this.supersede();
        this.session.closePhoto();
        this.source = null;
        this.currentPlan = null;
        this.history.length = 0;
        this.poseAvailable = false;
        this.checkedMaskAvailable = false;
        this.selectedStatus = 'empty';
        this.notify();
    }
    setIdentityAvailable(value) {
        if (typeof value !== 'boolean') {
            throw new ProRenderError('invalid_capability', 'Capability must be boolean.');
        }
        if (this.identityAvailable === value)
            return;
        this.identityAvailable = value;
        this.supersede();
        this.notify();
    }
    add(name, level = levelFromTenths(30), scale = 2) {
        if (!COMMAND_NAMES.has(name)) {
            throw new ProRenderError('unknown_command', 'Unknown Pro command.');
        }
        if (this.currentPlan === null)
            throw new ProRenderError('photo_missing', 'Open a photo first.');
        this.setPlan(createProPlan([
            ...this.currentPlan.steps,
            { name, level, scale, index: this.currentPlan.steps.length },
        ], this.currentPlan.identity));
    }
    replace(index, name) {
        if (this.currentPlan === null)
            throw new ProRenderError('photo_missing', 'Open a photo first.');
        this.checkedIndex(index);
        if (!COMMAND_NAMES.has(name))
            throw new ProRenderError('unknown_command', 'Unknown command.');
        const steps = this.currentPlan.steps.map((step, position) => {
            return position === index ? { ...step, name, scale: 2 } : step;
        });
        this.setPlan(createProPlan(steps, this.currentPlan.identity));
    }
    setLevel(index, tenths) {
        if (this.currentPlan === null)
            throw new ProRenderError('photo_missing', 'Open a photo first.');
        this.checkedIndex(index);
        const level = levelFromTenths(tenths);
        this.setPlan(createProPlan(this.currentPlan.steps.map((step, position) => {
            return position === index ? { ...step, level } : step;
        }), this.currentPlan.identity));
    }
    setUpscale(index, scale) {
        if (this.currentPlan === null)
            throw new ProRenderError('photo_missing', 'Open a photo first.');
        this.checkedIndex(index);
        const steps = this.currentPlan.steps.map((step, position) => {
            return position === index ? { ...step, scale } : step;
        });
        this.setPlan(createProPlan(steps, this.currentPlan.identity));
    }
    remove(index) {
        if (this.currentPlan === null)
            throw new ProRenderError('photo_missing', 'Open a photo first.');
        this.checkedIndex(index);
        if (this.currentPlan.steps.length === 1) {
            throw new ProRenderError('last_command', 'At least one command must remain.');
        }
        this.setPlan(createProPlan(this.currentPlan.steps
            .filter((_, position) => position !== index)
            .map(stepWithIndex), this.currentPlan.identity));
    }
    checkedIndex(index) {
        if (this.currentPlan === null || !Number.isInteger(index) ||
            index < 0 || index >= this.currentPlan.steps.length) {
            throw new ProRenderError('invalid_index', 'Command index is not in the chain.');
        }
    }
    move(index, direction) {
        if (this.currentPlan === null)
            throw new ProRenderError('photo_missing', 'Open a photo first.');
        const steps = [...this.currentPlan.steps];
        const other = index + direction;
        if (!Number.isInteger(index) || index < 0 || other < 0 || other >= steps.length) {
            throw new ProRenderError('invalid_index', 'Command cannot be moved outside the chain.');
        }
        const prior = steps[index];
        steps[index] = steps[other];
        steps[other] = prior;
        this.setPlan(createProPlan(steps.map(stepWithIndex), this.currentPlan.identity));
    }
    setIdentity(enabled, mode, strength) {
        if (this.currentPlan === null)
            throw new ProRenderError('photo_missing', 'Open a photo first.');
        this.setPlan(createProPlan(this.currentPlan.steps, userIdentityOverride(enabled, mode, strength)));
    }
    /** Commit a complete imported or host-supplied recipe in one undo step.
     * Every step and identity option is validated before mutating history.
     * Partial host updates must never leave a mixed old/new plan behind.
     */
    replacePlan(plan) {
        if (this.currentPlan === null || this.source === null) {
            throw new ProRenderError('photo_missing', 'Open a photo before replacing a plan.');
        }
        let validated;
        try {
            if (plan === null || typeof plan !== 'object' ||
                plan.version !== 'beljour-pro-plan/1' || !Array.isArray(plan.steps)) {
                throw new Error('invalid plan');
            }
            validated = createProPlan(plan.steps, plan.identity);
        }
        catch {
            throw new ProRenderError('invalid_host_plan', 'The replacement recipe is invalid.');
        }
        if (canonicalProPlan(validated) === canonicalProPlan(this.currentPlan))
            return;
        this.setPlan(validated);
    }
    undoPlan() {
        const previous = this.history.pop();
        if (previous === undefined)
            return false;
        this.supersede();
        this.currentPlan = previous;
        this.notify();
        return true;
    }
    get preflight() {
        if (this.source === null || this.currentPlan === null)
            return null;
        const enabledEffects = new Set(ENGINE_NAMES);
        const capabilities = {
            identityGuardAvailable: this.identityAvailable,
            enabledEffects,
            checkedPoseAvailable: this.poseAvailable,
            checkedMasksAvailable: this.checkedMaskAvailable,
        };
        return preflightProPlan(this.currentPlan, this.source, capabilities, 'export');
    }
    async run(quality = 'preview', externalSignal) {
        if (externalSignal?.aborted) {
            throw new ProRenderError('host_cancelled', 'The host cancelled this render.');
        }
        if (this.currentPlan === null || this.source === null) {
            throw new ProRenderError('photo_missing', 'Open a photo before rendering.');
        }
        const preflight = this.preflight;
        if (preflight === null || preflight.status !== 'ready') {
            const code = preflight?.issues[0] ?? 'preflight_blocked';
            this.selectedStatus = 'blocked';
            this.lastError = code;
            this.notify();
            throw new ProRenderError(code, 'The edit is unavailable until its prerequisites are met.');
        }
        this.supersede();
        const ticket = this.revision;
        const controller = new AbortController();
        const abortFromHost = () => { controller.abort(); };
        externalSignal?.addEventListener('abort', abortFromHost, { once: true });
        if (externalSignal?.aborted)
            controller.abort();
        this.rendering = controller;
        this.selectedStatus = 'rendering';
        const plan = this.currentPlan;
        this.notify();
        try {
            const result = await this.session.run(plan, quality, controller.signal, () => ticket === this.revision);
            if (externalSignal?.aborted) {
                throw new ProRenderError('host_cancelled', 'The host cancelled this render.');
            }
            if (controller.signal.aborted || ticket !== this.revision) {
                throw new ProRenderError('stale_preview', 'A newer edit replaced this render.');
            }
            this.output = duplicateFrame(result.image);
            this.lastReport = result;
            this.selectedStatus = quality;
            this.notify();
            return { ...result, image: duplicateFrame(result.image) };
        }
        catch (error) {
            if (ticket === this.revision) {
                this.selectedStatus = 'blocked';
                this.lastError = error instanceof ProRenderError ? error.code : 'render_failed';
                this.notify();
            }
            throw error;
        }
        finally {
            externalSignal?.removeEventListener('abort', abortFromHost);
            if (this.rendering === controller)
                this.rendering = null;
        }
    }
    get state() {
        return {
            status: this.selectedStatus,
            revision: this.revision,
            photoOpen: this.source !== null,
            plan: this.currentPlan,
            latest: this.output === null ? null : duplicateFrame(this.output),
            lastReport: this.lastReport,
            errorCode: this.lastError,
            canUndo: this.history.length > 0,
            identityEnabled: this.currentPlan?.identity.enabled ?? true,
            maskReadCount: this.session.state.regionReads,
            activeCommandCount: this.currentPlan?.steps.length ?? 0,
        };
    }
    get originalFrame() {
        return this.source === null ? null : duplicateFrame(this.source);
    }
    get commandsLabel() {
        return this.currentPlan?.steps.map((step) => {
            const suffix = step.name === 'upscale' ? ` ${step.scale}x` : '';
            return `/${step.name} ${levelLabel(step.level)}${suffix}`;
        }).join(' ') ?? '';
    }
}
