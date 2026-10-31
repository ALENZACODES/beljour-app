/** Editor render lifecycle (free-library plan §6 P0 step 5: the Lifecycle/ViewModel role).
 *
 * Every render is tied to a revision: the photo it was made from and the recipe it applied.
 * - A new edit aborts the render in flight (AbortController per render).
 * - A result that arrives after a newer edit is never displayed; it is released at once.
 * - When a new result is displayed, the previous one is released, so repeated edits keep a
 *   flat number of live results (the soak test runs 100 edits).
 * - Changing the photo bumps the photo revision, so a slow render of the old photo can never
 *   appear over the new one.
 * - `dispose()` aborts everything and releases what is shown.
 * The renderer and release functions are injected; nothing here touches the network.
 * Author: John Khan.
 */
/** Stable, order-sensitive key for a recipe value (FNV-1a over canonical JSON). */
export function recipeKey(recipe) {
    const text = canonical(recipe);
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, "0");
}
function canonical(value) {
    if (value === null || typeof value !== "object")
        return JSON.stringify(value) ?? "null";
    if (Array.isArray(value))
        return "[" + value.map(canonical).join(",") + "]";
    const keys = Object.keys(value).sort();
    return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonical(value[k])).join(",") + "}";
}
function isAbort(error) {
    return typeof error === "object" && error !== null && error.name === "AbortError";
}
export class EditorSession {
    renderer;
    hooks;
    photo = null;
    photoKeyRef = "";
    photoRevision = 0;
    recipe = null;
    nextId = 0;
    latest = null;
    controller = null;
    shown = null;
    disposed = false;
    inflight = new Set();
    counters = { scheduled: 0, displayed: 0, staleDropped: 0, aborted: 0, failed: 0, released: 0, produced: 0 };
    constructor(renderer, hooks) {
        this.renderer = renderer;
        this.hooks = hooks;
    }
    /** Open a photo. Any render of the previous photo is cancelled and can no longer display. */
    setPhoto(photo, key) {
        this.ensure();
        if (typeof key !== "string" || !key)
            throw new RangeError("a photo needs a non-empty key");
        this.photo = photo;
        this.photoKeyRef = key;
        this.photoRevision++;
        this.cancel();
        this.dropShown();
    }
    /** Apply a recipe; returns the promise of this render's outcome ("shown", "stale", "aborted" or "failed"). */
    edit(recipe) {
        this.ensure();
        if (this.photo === null)
            throw new Error("open a photo before editing");
        this.recipe = recipe;
        return this.schedule();
    }
    get current() { return this.latest; }
    get displayed() { return this.shown?.revision ?? null; }
    isCurrent(revision) {
        return this.latest !== null && revision.id === this.latest.id && revision.photoRevision === this.photoRevision;
    }
    stats() {
        const c = this.counters;
        return { scheduled: c.scheduled, displayed: c.displayed, staleDropped: c.staleDropped, aborted: c.aborted,
            failed: c.failed, released: c.released, inFlight: this.inflight.size, liveResults: c.produced - c.released };
    }
    ensure() { if (this.disposed)
        throw new Error("this editor session was closed"); }
    release(result) {
        this.counters.released++;
        this.hooks.release?.(result);
    }
    dropShown() {
        if (this.shown) {
            const old = this.shown.result;
            this.shown = null;
            this.release(old);
        }
    }
    cancel() {
        if (this.controller) {
            this.controller.abort();
            this.controller = null;
        }
    }
    async schedule() {
        this.cancel();
        const controller = new AbortController();
        this.controller = controller;
        const revision = Object.freeze({ id: ++this.nextId, photoKey: this.photoKeyRef,
            photoRevision: this.photoRevision, recipeKey: recipeKey(this.recipe) });
        this.latest = revision;
        this.counters.scheduled++;
        this.inflight.add(revision.id);
        const photo = this.photo, recipe = this.recipe;
        try {
            const result = await this.renderer(photo, recipe, { signal: controller.signal, revision });
            this.counters.produced++;
            if (this.disposed || controller.signal.aborted || !this.isCurrent(revision)) {
                this.counters.staleDropped++;
                this.release(result);
                return "stale";
            }
            const previous = this.shown;
            this.shown = { result, revision };
            this.counters.displayed++;
            this.hooks.display(result, revision);
            if (previous)
                this.release(previous.result);
            return "shown";
        }
        catch (error) {
            if (isAbort(error) || controller.signal.aborted) {
                this.counters.aborted++;
                return "aborted";
            }
            this.counters.failed++;
            if (this.isCurrent(revision))
                this.hooks.error?.(error, revision);
            return "failed";
        }
        finally {
            this.inflight.delete(revision.id);
            if (this.controller === controller && !this.inflight.size)
                this.controller = null;
        }
    }
    /** Cancel work and release the shown result. The session cannot be used afterwards. */
    dispose() {
        if (this.disposed)
            return;
        this.cancel();
        this.disposed = true;
        this.dropShown();
        this.photo = null;
        this.recipe = null;
    }
}
