/** Identity-gated browser Pro execution; no provider, persistence or telemetry.
 * Author: John Khan.
 */
import { canonicalProPlan } from './plan.js';
export class ProRenderError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'ProRenderError';
    }
}
export function checkedFrame(frame) {
    if (!Number.isInteger(frame.width) || !Number.isInteger(frame.height) ||
        frame.width <= 0 || frame.height <= 0 || frame.width * frame.height > 24_000_000 ||
        (frame.channels !== 3 && frame.channels !== 4) ||
        !(frame.pixels instanceof Uint8Array) ||
        frame.pixels.byteLength !== frame.width * frame.height * frame.channels) {
        throw new ProRenderError('invalid_frame', 'Image frame is invalid.');
    }
    return frame;
}
export function unchanged(left, right) {
    if (left.width !== right.width || left.height !== right.height ||
        left.channels !== right.channels || left.pixels.byteLength !== right.pixels.byteLength) {
        return false;
    }
    for (let i = 0; i < left.pixels.byteLength; i++) {
        if (left.pixels[i] !== right.pixels[i])
            return false;
    }
    return true;
}
class LocalFrameCache {
    capacityBytes;
    capacity;
    entries = new Map();
    bytes = 0;
    constructor(capacityBytes = 48 * 1024 * 1024, capacity = 24) {
        this.capacityBytes = capacityBytes;
        this.capacity = capacity;
        if (!Number.isSafeInteger(capacityBytes) || capacityBytes <= 0 ||
            !Number.isSafeInteger(capacity) || capacity < 1) {
            throw new ProRenderError('invalid_cache_budget', 'Cache budget is invalid.');
        }
    }
    get(key) {
        const hit = this.entries.get(key);
        if (hit === undefined)
            return null;
        this.entries.delete(key);
        this.entries.set(key, hit);
        return { ...hit, pixels: new Uint8Array(hit.pixels) };
    }
    put(key, value) {
        const older = this.entries.get(key);
        if (older !== undefined) {
            this.entries.delete(key);
            this.bytes -= older.pixels.byteLength;
        }
        if (value.pixels.byteLength > this.capacityBytes)
            return;
        while (this.entries.size > 0 && (this.entries.size >= this.capacity ||
            this.bytes + value.pixels.byteLength > this.capacityBytes)) {
            const oldest = this.entries.keys().next().value;
            if (oldest === undefined)
                break;
            const removed = this.entries.get(oldest);
            if (removed !== undefined)
                this.bytes -= removed.pixels.byteLength;
            this.entries.delete(oldest);
        }
        this.entries.set(key, { ...value, pixels: new Uint8Array(value.pixels) });
        this.bytes += value.pixels.byteLength;
    }
    clear() {
        this.entries.clear();
        this.bytes = 0;
    }
    get retainedBytes() { return this.bytes; }
}
export const DEFAULT_RENDER_BUDGET = Object.freeze({
    previewMs: 100,
    exportMs: 2000,
});
export class ProBrowserRuntime {
    ports;
    identity;
    budget;
    cache;
    clock;
    constructor(ports, identity, budget = DEFAULT_RENDER_BUDGET, clock = () => performance.now(), cacheCapacity = 48 * 1024 * 1024) {
        this.ports = ports;
        this.identity = identity;
        this.budget = budget;
        if (!Number.isFinite(budget.previewMs) || !Number.isFinite(budget.exportMs) ||
            budget.previewMs <= 0 || budget.exportMs <= 0) {
            throw new ProRenderError('invalid_budget', 'Render time budgets must be positive.');
        }
        this.cache = new LocalFrameCache(cacheCapacity);
        this.clock = clock;
    }
    clearPhoto() { this.cache.clear(); }
    get cachedBytes() { return this.cache.retainedBytes; }
    async run(plan, original, quality, sourceKey, signal, current) {
        checkedFrame(original);
        if (quality !== 'preview' && quality !== 'export') {
            throw new ProRenderError('invalid_quality', 'Render quality must be preview or export.');
        }
        if (plan.identity.enabled && this.identity === null) {
            throw new ProRenderError('identity_model_unavailable', 'Approved identity comparison is required.');
        }
        if (!plan.identity.enabled && !plan.identity.explicit_user_override) {
            throw new ProRenderError('identity_override_required', 'A deliberate user override is required.');
        }
        const originalSnapshot = { ...original, pixels: new Uint8Array(original.pixels) };
        const started = this.clock();
        const reports = [];
        const pendingCache = [];
        let result = originalSnapshot;
        const recipeKey = canonicalProPlan(plan);
        const model = this.identity?.modelEvidenceKey ?? 'explicit-user-opt-out';
        for (const step of plan.steps) {
            if (signal.aborted || !current()) {
                throw new ProRenderError('stale_preview', 'A newer edit replaced this preview.');
            }
            const before = result;
            let candidate = before;
            let cacheHit = false;
            if (step.name !== 'identitylock') {
                const engine = this.ports[step.name];
                if (engine === undefined) {
                    throw new ProRenderError('command_engine_unavailable', `/${step.name} is unavailable.`);
                }
                const key = [sourceKey, recipeKey, step.index, quality, model].join(':');
                const previous = this.cache.get(key);
                if (previous !== null) {
                    candidate = previous;
                    cacheHit = true;
                }
                else {
                    try {
                        const safeInput = { ...before, pixels: new Uint8Array(before.pixels) };
                        candidate = await engine(safeInput, step, quality, signal);
                    }
                    catch (error) {
                        if (error instanceof ProRenderError)
                            throw error;
                        throw new ProRenderError('command_engine_failed', `/${step.name} failed.`);
                    }
                    checkedFrame(candidate);
                }
                if (candidate.channels !== before.channels) {
                    throw new ProRenderError('channels_changed', 'Effect changed the number of channels.');
                }
                if (step.name === 'upscale') {
                    if (candidate.width !== before.width * step.scale ||
                        candidate.height !== before.height * step.scale) {
                        throw new ProRenderError('invalid_scale_output', 'Upscale dimensions are incorrect.');
                    }
                }
                else if (candidate.width !== before.width || candidate.height !== before.height) {
                    throw new ProRenderError('unexpected_resize', 'Only upscale may change dimensions.');
                }
                if (candidate.channels === 4 && step.name !== 'upscale') {
                    for (let offset = 3; offset < candidate.pixels.length; offset += 4) {
                        if (candidate.pixels[offset] !== before.pixels[offset]) {
                            throw new ProRenderError('alpha_changed', 'Effect changed protected transparency.');
                        }
                    }
                }
                if (!cacheHit) {
                    pendingCache.push([key, candidate]);
                }
            }
            let decision = null;
            if (plan.identity.enabled) {
                const guard = this.identity;
                if (guard === null) {
                    throw new ProRenderError('identity_model_unavailable', 'Identity comparison is unavailable.');
                }
                const protectedOriginal = { ...originalSnapshot, pixels: new Uint8Array(originalSnapshot.pixels) };
                const renderedBeforeGuard = candidate;
                decision = await guard.enforce(protectedOriginal, candidate, plan.identity);
                if (!decision || !Number.isInteger(decision.identityMatch) ||
                    decision.identityMatch < 0 || decision.identityMatch > 100 ||
                    typeof decision.syntheticOnly !== 'boolean' ||
                    !['kept', 'softened', 'restored', 'warned'].includes(decision.status)) {
                    throw new ProRenderError('invalid_guard_evidence', 'Identity protection returned an invalid decision.');
                }
                candidate = checkedFrame(decision.frame);
                if (candidate.width !== renderedBeforeGuard.width ||
                    candidate.height !== renderedBeforeGuard.height ||
                    candidate.channels !== renderedBeforeGuard.channels) {
                    throw new ProRenderError('invalid_guard_output', 'Identity protection changed dimensions or channel format.');
                }
                if (candidate.channels === 4) {
                    for (let offset = 3; offset < candidate.pixels.length; offset += 4) {
                        if (candidate.pixels[offset] !== renderedBeforeGuard.pixels[offset]) {
                            throw new ProRenderError('invalid_guard_alpha', 'Identity protection changed transparency.');
                        }
                    }
                }
            }
            if (signal.aborted || !current()) {
                throw new ProRenderError('stale_preview', 'A newer edit replaced this preview.');
            }
            result = candidate;
            reports.push({
                index: step.index,
                command: step.name,
                level: (step.level / 10).toFixed(1),
                changed: !unchanged(before, candidate),
                cacheHit,
                identity: decision === null ? null : {
                    identityMatch: decision.identityMatch,
                    status: decision.status,
                    syntheticOnly: decision.syntheticOnly,
                },
            });
        }
        if (!unchanged(original, originalSnapshot)) {
            throw new ProRenderError('original_mutated', 'An effect changed the original image.');
        }
        const elapsedMs = this.clock() - started;
        if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
            throw new ProRenderError('invalid_clock', 'Render timing is invalid.');
        }
        for (const [key, frame] of pendingCache) {
            this.cache.put(key, frame);
        }
        const targetMs = quality === 'preview' ? this.budget.previewMs : this.budget.exportMs;
        return {
            image: result,
            steps: reports,
            quality,
            elapsedMs,
            targetMs,
            withinBudget: elapsedMs <= targetMs,
            originalUnchanged: unchanged(original, originalSnapshot),
        };
    }
}
//# sourceMappingURL=runtime.js.map