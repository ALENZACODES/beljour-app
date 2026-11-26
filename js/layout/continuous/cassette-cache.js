/** No-network, session-only replay cache for the authored drawing. Author: John Khan. */
import { CASSETTE_CARDS, cassetteAuthority, cassetteById, cassettePermission, } from "./cassette-contract.js";
function equalAuthority(left, right) {
    return left !== null && right !== null && left.scene === right.scene
        && left.subjectId === right.subjectId && left.sourceRevision === right.sourceRevision;
}
function result(card, status, mode, isCached) {
    return Object.freeze({
        kind: "beljour-cassette-result/1",
        card,
        status,
        providerMode: mode,
        isCached,
        providerCalls: 0,
        unitsSpent: 0,
        imageSent: false,
        liveVerified: false,
    });
}
/**
 * This cache has no network client or writable external port.
 * A missing entry is a refusal, never a vendor fallback.
 */
export class DrawnCassetteCache {
    authority = null;
    entries = new Map();
    reads = 0;
    hits = 0;
    misses = 0;
    disposed = false;
    get snapshot() {
        return Object.freeze({
            loaded: !this.disposed && this.authority !== null,
            keys: Object.freeze([...this.entries.keys()]),
            reads: this.reads,
            hits: this.hits,
            misses: this.misses,
            networkRequests: 0,
            imageUploads: 0,
            providerUnits: 0,
        });
    }
    /** Cache only an authored sample that is already present in the local editor. */
    warm(state, drawnSource) {
        if (this.disposed)
            return false;
        this.reset();
        const authority = cassetteAuthority(state);
        if (!authority || !drawnSource)
            return false;
        this.authority = authority;
        for (const card of CASSETTE_CARDS) {
            this.entries.set(card.id, Object.freeze({
                card,
                revision: authority.sourceRevision,
                subjectId: authority.subjectId,
            }));
        }
        return true;
    }
    peek(id, state, drawnSource) {
        if (this.disposed)
            return "disposed";
        const card = cassetteById(id);
        if (!card)
            return "cache-miss";
        const authority = cassetteAuthority(state);
        if (!authority || !drawnSource)
            return "no-source";
        if (!equalAuthority(authority, this.authority))
            return "invalid-source";
        const permission = cassettePermission(state, card);
        if (permission !== "ready")
            return permission;
        const entry = this.entries.get(id);
        if (!entry || entry.subjectId !== authority.subjectId
            || entry.revision !== authority.sourceRevision)
            return "cache-miss";
        return "ready";
    }
    read(id, state, drawnSource) {
        if (this.disposed)
            return null;
        const card = cassetteById(id);
        if (!card)
            return null;
        const status = this.peek(id, state, drawnSource);
        this.reads += 1;
        if (status === "ready")
            this.hits += 1;
        else
            this.misses += 1;
        return result(card, status, state.mockMode, status === "ready");
    }
    /** Any source, subject or consent change clears the attached cassette. */
    reset() {
        this.authority = null;
        this.entries.clear();
        this.reads = 0;
        this.hits = 0;
        this.misses = 0;
    }
    dispose() {
        if (this.disposed)
            return;
        this.reset();
        this.disposed = true;
    }
}
//# sourceMappingURL=cassette-cache.js.map