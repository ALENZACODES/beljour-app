const SAFE_ID = /^[a-zA-Z0-9_-]{1,64}$/;
const MAX_PACKS = 75;
const MAX_TEXT = 160;
export function packProblem(pack) {
    if (!pack || typeof pack !== "object")
        return "Invalid seasonal pack";
    if (typeof pack.id !== "string" || !SAFE_ID.test(pack.id))
        return "Invalid pack identifier";
    if (typeof pack.title !== "string" || !pack.title.trim() || pack.title.length > 80) {
        return "Invalid pack title";
    }
    if (typeof pack.season !== "string" || !pack.season.trim() || pack.season.length > 64) {
        return "Invalid season";
    }
    if (typeof pack.available !== "boolean")
        return "Availability must be explicit";
    if (pack.summary !== undefined
        && (typeof pack.summary !== "string" || pack.summary.length > MAX_TEXT)) {
        return "Invalid pack summary";
    }
    return null;
}
/** Halloween is ordered first only when the owner catalogue actually contains it. */
export function checkedSeasonalCards(packs) {
    if (!Array.isArray(packs) || packs.length > MAX_PACKS)
        throw new RangeError("Too many packs");
    const ids = new Set();
    const cards = [];
    for (const pack of packs) {
        const problem = packProblem(pack);
        if (problem)
            throw new RangeError(problem);
        if (ids.has(pack.id))
            throw new Error("Duplicate seasonal pack identifier");
        ids.add(pack.id);
        const halloween = pack.season.trim().toLowerCase() === "halloween";
        cards.push({
            id: pack.id,
            title: pack.title.trim(),
            season: pack.season.trim(),
            summary: pack.summary?.trim() ?? "Public seasonal pack; effects require an approved engine.",
            available: pack.available,
            halloween,
        });
    }
    return Object.freeze(cards.sort((a, b) => Number(b.halloween) - Number(a.halloween)
        || a.title.localeCompare(b.title) || a.id.localeCompare(b.id)));
}
/** Cached metadata only. Never stores photos, models, keys or provider responses. */
export class SeasonalCatalogueController {
    port;
    revision = 0;
    cached = {
        status: "unavailable",
        cards: [],
        explanation: "The public seasonal catalogue is not connected. No pack data is invented.",
    };
    disposed = false;
    constructor(port) {
        this.port = port;
    }
    get snapshot() {
        return this.cached;
    }
    async load() {
        if (this.disposed)
            throw new Error("Seasonal catalogue was closed");
        const revision = ++this.revision;
        if (!this.port)
            return this.cached;
        if (this.port.kind !== "seasonal-catalogue")
            throw new Error("Wrong seasonal public port");
        try {
            const packs = await this.port.listPacks();
            if (this.disposed || revision !== this.revision) {
                return { status: "stale", cards: [], explanation: "Old seasonal response ignored" };
            }
            const cards = checkedSeasonalCards(packs);
            this.cached = {
                status: "ready", cards,
                explanation: cards.length
                    ? "Pack names are supplied by the public seasonal catalogue."
                    : "The public seasonal catalogue currently lists no packs.",
            };
            return this.cached;
        }
        catch {
            if (this.disposed || revision !== this.revision) {
                return { status: "stale", cards: [], explanation: "Old seasonal response ignored" };
            }
            this.cached = {
                status: "invalid", cards: [],
                explanation: "Seasonal pack metadata could not be verified. No pack can be selected.",
            };
            return this.cached;
        }
    }
    invalidate() {
        this.revision += 1;
    }
    dispose() {
        this.revision += 1;
        this.disposed = true;
        this.cached = { status: "unavailable", cards: [], explanation: "Seasonal catalogue closed." };
    }
}
