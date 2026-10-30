import { faceCentreFor, masksFor, recipeFor, settingsFor } from "./layer.js";
import { DEFAULT_TILE, TiledRender } from "./tiles.js";
export const yieldNow = () => new Promise((resolve) => setTimeout(resolve, 0));
export class FilterJobs {
    yielder;
    stepsPerYield;
    cancelled = new Set();
    running = new Set();
    constructor(yielder = yieldNow, stepsPerYield = 1) {
        this.yielder = yielder;
        this.stepsPerYield = stepsPerYield;
        if (!(Number.isInteger(stepsPerYield) && stepsPerYield >= 1))
            throw new RangeError("steps per yield must be a whole number from 1");
    }
    get active() { return this.running.size; }
    cancel(id) {
        if (!this.running.has(id))
            return false;
        this.cancelled.add(id);
        return true;
    }
    async run(id, source, request, onProgress = () => { }, now = () => Date.now()) {
        if (!Number.isSafeInteger(id) || id < 0) {
            return { ok: false, error: "Invalid filter job ID", cancelled: false };
        }
        // The worker owns IDs for their entire lifetime. A concurrent reuse must
        // never clear the original job's cancellation flag in a later finally.
        if (this.running.has(id)) {
            return { ok: false, error: "Filter job ID already running", cancelled: false };
        }
        this.running.add(id);
        const start = now();
        try {
            const layer = { parameters: request.parameters, strength: request.strength };
            const masks = masksFor(source);
            const job = new TiledRender(source.image, recipeFor(layer), settingsFor(layer), masks, faceCentreFor(masks), request.tile ?? DEFAULT_TILE);
            let steps = 0;
            while (!job.done) {
                if (this.cancelled.has(id))
                    return { ok: false, error: "Cancelled", cancelled: true };
                job.step();
                if (++steps % this.stepsPerYield === 0) {
                    onProgress({ id, done: job.completed, total: job.total });
                    await this.yielder();
                }
            }
            if (this.cancelled.has(id))
                return { ok: false, error: "Cancelled", cancelled: true };
            return { ok: true, result: job.result(), ms: now() - start, tiles: job.tiles.length };
        }
        catch (error) {
            return { ok: false, error: error instanceof Error ? error.message : String(error), cancelled: false };
        }
        finally {
            this.running.delete(id);
            this.cancelled.delete(id);
        }
    }
}
//# sourceMappingURL=jobs.js.map