/** Consent-bound replay and route review; never calls a provider. Author: John Khan. */
import { CASSETTE_CARDS, cassetteById, statusCopy } from "./cassette-contract.js";
import { DrawnCassetteCache } from "./cassette-cache.js";
import { OfflineSampleBag } from "./cassette-bag.js";
import { safeProviderRoute } from "./cassette-routes.js";
export class CassetteSession {
    cache;
    bag = new OfflineSampleBag();
    flags;
    observed = new Set();
    selectedId = null;
    lastResult = null;
    acknowledged = false;
    disposed = false;
    constructor(providerScreensEnabled, cache = new DrawnCassetteCache()) {
        this.cache = cache;
        this.flags = Object.freeze({
            providerScreensEnabled: providerScreensEnabled === true,
            acknowledgementRequired: true,
        });
    }
    get snapshot() {
        return Object.freeze({
            loaded: this.cache.snapshot.loaded,
            selectedId: this.selectedId,
            observed: Object.freeze([...this.observed]),
            lastResult: this.lastResult,
            acknowledged: this.acknowledged,
            providerScreensEnabled: this.flags.providerScreensEnabled,
            providerCalls: 0,
            unitsSpent: 0,
            imageUploaded: false,
            bag: this.bag.snapshot,
        });
    }
    warm(state, drawn) {
        if (this.disposed)
            return false;
        this.invalidate();
        return this.cache.warm(state, drawn);
    }
    /** A read is only an observation of preauthored data, never evidence of execution. */
    choose(id, state, drawn) {
        if (this.disposed || !cassetteById(id))
            return null;
        this.selectedId = id;
        const read = this.cache.read(id, state, drawn);
        this.lastResult = read;
        if (read?.status === "ready")
            this.observed.add(id);
        return read;
    }
    addToBag(state, drawn) {
        if (this.disposed || !this.lastResult)
            return false;
        if (this.cache.peek(this.lastResult.card.id, state, drawn) !== "ready")
            return false;
        return this.bag.add(this.lastResult);
    }
    removeFromBag(id) {
        if (this.disposed)
            return;
        this.bag.remove(id);
    }
    acknowledge(checked) {
        if (this.disposed)
            return;
        this.acknowledged = checked === true;
    }
    status(id, state, drawn) {
        return this.cache.peek(id, state, drawn);
    }
    canRead(id, state, drawn) {
        return !this.disposed && this.cache.peek(id, state, drawn) === "ready";
    }
    /** Link the visitor to an existing public entry point; no task can start in this tour. */
    route(state, drawn) {
        if (this.disposed || !this.selectedId)
            return null;
        const card = cassetteById(this.selectedId);
        if (!card)
            return null;
        if (!this.lastResult || this.lastResult.status !== "ready"
            || this.cache.peek(this.selectedId, state, drawn) !== "ready")
            return null;
        return safeProviderRoute(card, state, this.flags, this.acknowledged);
    }
    explanation(state, drawn) {
        if (this.disposed)
            return statusCopy("disposed");
        if (this.lastResult)
            return statusCopy(this.cache.peek(this.lastResult.card.id, state, drawn));
        if (!drawn || !state.sourceLoaded)
            return statusCopy("no-source");
        return "Choose one of three cached local illustrations. No network connection is used.";
    }
    get cards() {
        return CASSETTE_CARDS;
    }
    /** Always clear selections, route permission, and observational evidence on source change. */
    invalidate() {
        this.cache.reset();
        this.observed.clear();
        this.bag.clear();
        this.selectedId = null;
        this.lastResult = null;
        this.acknowledged = false;
    }
    dispose() {
        if (this.disposed)
            return;
        this.invalidate();
        this.cache.dispose();
        this.bag.dispose();
        this.disposed = true;
    }
}
