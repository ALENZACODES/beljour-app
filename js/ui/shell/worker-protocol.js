/** Shell worker protocol: pre-checks, thumbnail strips and compare frames off the main thread.
 *
 * Plain data in both directions, so it runs over a real Worker, a MessageChannel port (the
 * Node tests use one, with real structured cloning and buffer transfer) or the inline port
 * when a browser has no module workers. Pixel buffers are moved, not copied, using the R3
 * packing helpers (engines/core/jobs.ts), which never pass a view's .buffer directly.
 *
 *   {kind:"precheck",   id, image, options}        -> {kind:"precheck",   id, ok, report}
 *   {kind:"thumbnails", id, source, studio, side, page, pageSize} -> {kind:"thumbnails", id, ok, tiles, page, pages, total, more}
 *   {kind:"frames",     id, source, mode, layers, selected} -> {kind:"frames", id, ok, frames}
 *   {kind:"filter",     id, source, parameters, strength, tile} -> {kind:"filter-progress", id, done, total}...
 *                                                    then {kind:"filter", id, ok, image, notes, tiles}
 *   {kind:"filter-cancel", id}                       -> the filter job stops within one tile; no answer
 * A failed job answers {ok:false, error}; a job never throws across the port. Filter jobs (R11,
 * web/src/filters/runtime/jobs.ts) render the full photo in tiles and yield between tiles, so
 * they run asynchronously beside the synchronous jobs above.
 *
 * Author: John Khan.
 */
import { packBytes, packMask, transferList, unpackBytes, unpackMask } from "../../engines/core/jobs.js";
import { makeControls } from "../../engines/local/posture.js";
import { isCompareMode } from "./compare.js";
import { compareFrames } from "./compare-frames.js";
import { validateStack } from "./layers.js";
import { renderLayers } from "./pipeline.js";
import { precheck } from "./precheck.js";
import { STRIP_PAGE, THUMB_SIDE, renderStripPage } from "./thumbnails.js";
import { STUDIO_IDS } from "./types.js";
import { FilterJobs } from "../../filters/runtime/jobs.js";
export function packSource(source) {
    const packed = { id: source.id, label: source.label, kind: source.kind, disposable: source.disposable, geometryRevision: source.geometryRevision, image: packBytes(source.image) };
    if (source.hair)
        packed.hair = packMask(source.hair);
    if (source.hairPaint)
        packed.hairPaint = packMask(source.hairPaint);
    if (source.crown)
        packed.crown = packMask(source.crown);
    if (source.person)
        packed.person = packMask(source.person);
    if (source.face)
        packed.face = source.face.flatMap((p) => [p[0], p[1]]);
    if (source.body)
        packed.body = JSON.parse(JSON.stringify(source.body));
    return packed;
}
export function sourceBuffers(p) {
    return [p.image, ...(p.hair ? [p.hair] : []), ...(p.hairPaint ? [p.hairPaint] : []), ...(p.crown ? [p.crown] : []), ...(p.person ? [p.person] : [])];
}
export function unpackSource(p) {
    if (!p || typeof p !== "object" || typeof p.id !== "string" || p.id.length > 120)
        throw new RangeError("Not a packed photo source");
    if (p.kind !== "sample" && p.kind !== "uploaded")
        throw new RangeError("Unknown source kind");
    if (p.geometryRevision !== undefined && (!Number.isSafeInteger(p.geometryRevision) || p.geometryRevision < 0))
        throw new RangeError("Invalid geometry revision");
    const image = unpackBytes(p.image);
    const source = { id: p.id, label: String(p.label).slice(0, 80), kind: p.kind, disposable: Boolean(p.disposable), geometryRevision: p.geometryRevision, image };
    if (p.hair)
        source.hair = unpackMask(p.hair);
    if (p.hairPaint)
        source.hairPaint = unpackMask(p.hairPaint);
    if (p.crown)
        source.crown = unpackMask(p.crown);
    if (p.person)
        source.person = unpackMask(p.person);
    for (const m of [source.crown, source.person, source.hair, source.hairPaint]) {
        if (m && (m.width !== image.width || m.height !== image.height))
            throw new RangeError("A mask doesn't match the photo size");
    }
    if (p.face) {
        if (!Array.isArray(p.face) || p.face.length % 2 || p.face.length > 2 * 1000 || !p.face.every(Number.isFinite))
            throw new RangeError("Face points are malformed");
        const pts = [];
        for (let i = 0; i < p.face.length; i += 2)
            pts.push([p.face[i], p.face[i + 1]]);
        source.face = pts;
    }
    if (p.body) {
        const b = p.body;
        if (b.width !== image.width || b.height !== image.height)
            throw new RangeError("Body points don't match the photo size");
        source.body = makeControls(b.view, b.points, b.width, b.height, b.facing, b.estimated, b.manual);
    }
    return source;
}
function facePoints(flat) {
    if (flat === undefined)
        return undefined;
    if (!Array.isArray(flat) || flat.length % 2 || !flat.every(Number.isFinite))
        throw new RangeError("Face points are malformed");
    const out = [];
    for (let i = 0; i < flat.length; i += 2)
        out.push([flat[i], flat[i + 1]]);
    return out;
}
/** Run one job. Never throws; failures come back as ok:false. */
export function handleShellJob(job, now = () => Date.now()) {
    const start = now();
    const id = job && Number.isSafeInteger(job.id) ? job.id : -1;
    try {
        if (!job || typeof job !== "object" || !Number.isSafeInteger(job.id))
            throw new RangeError("Not a shell job");
        if (job.kind === "render") {
            if (!Array.isArray(job.layers))
                throw new RangeError("Layers must be a list");
            validateStack(job.layers);
            const source = unpackSource(job.source);
            if (source.image.width * source.image.height > 24_000_000)
                throw new RangeError("The photo exceeds the 24 megapixel decode limit");
            const rendered = renderLayers(source, job.layers);
            const image = packBytes(rendered.image, false);
            return { result: { kind: "render", id, ok: true, image, labels: rendered.labels, ms: now() - start }, transfer: transferList(image) };
        }
        if (job.kind === "precheck") {
            const image = unpackBytes(job.image);
            const report = precheck(image, { purpose: job.options?.purpose, face: facePoints(job.options?.face), file: job.options?.file });
            return { result: { kind: "precheck", id, ok: true, report, ms: now() - start }, transfer: [] };
        }
        if (job.kind === "thumbnails") {
            if (!STUDIO_IDS.includes(job.studio))
                throw new RangeError("Unknown studio");
            const side = job.side ?? THUMB_SIDE;
            if (!(Number.isInteger(side) && side >= 32 && side <= 256))
                throw new RangeError("Thumbnail size must be 32–256 px");
            const strip = renderStripPage(job.studio, unpackSource(job.source), { side, clock: now, page: job.page ?? 0, pageSize: job.pageSize ?? STRIP_PAGE });
            // Copied, not moved: a tile image can be one the strip renderer keeps (an unchanged tile, a cached
            // preview), and moving it would leave that buffer detached for the next page (found by the stress test).
            const packed = strip.tiles.map((t) => ({ ...t, image: t.image ? packBytes(t.image) : undefined }));
            return { result: { kind: "thumbnails", id, ok: true, tiles: packed, page: strip.page, pages: strip.pages, total: strip.total, more: strip.more, ms: now() - start },
                transfer: transferList(...packed.flatMap((t) => t.image ? [t.image] : [])) };
        }
        if (job.kind === "frames") {
            if (!isCompareMode(job.mode))
                throw new RangeError("Unknown compare mode");
            if (!Array.isArray(job.layers))
                throw new RangeError("Layers must be a list");
            validateStack(job.layers);
            if (job.selected !== null && typeof job.selected !== "string")
                throw new RangeError("Selected layer must be an ID or null");
            const frames = compareFrames(unpackSource(job.source), job.layers, job.selected, job.mode);
            const packed = frames.map((f) => ({ ...f, image: packBytes(f.image) }));
            return { result: { kind: "frames", id, ok: true, frames: packed, ms: now() - start }, transfer: transferList(...packed.map((f) => f.image)) };
        }
        if (job.kind === "filter" || job.kind === "filter-cancel")
            throw new RangeError("Filter jobs run asynchronously through serveShell");
        throw new RangeError("Unknown shell job");
    }
    catch (error) {
        const kind = job && ["render", "precheck", "thumbnails", "frames", "filter"].includes(job.kind) ? job.kind : "unknown";
        return { result: { kind, id, ok: false, error: error instanceof Error ? error.message : String(error) }, transfer: [] };
    }
}
export const FILTER_JOBS = new FilterJobs();
/** Run one filter job, posting progress and then the result (nothing if it was cancelled). */
export async function runFilterJob(job, post, jobs = FILTER_JOBS, now = () => Date.now()) {
    const id = Number.isSafeInteger(job?.id) ? job.id : -1;
    let source;
    try {
        if (!(Number.isFinite(job.strength) && job.strength >= 0 && job.strength <= 100))
            throw new RangeError("Strength must be 0-100");
        source = unpackSource(job.source);
    }
    catch (error) {
        post({ kind: "filter", id, ok: false, error: error instanceof Error ? error.message : String(error) }, []);
        return;
    }
    const outcome = await jobs.run(id, source, { parameters: job.parameters, strength: job.strength, tile: job.tile }, (p) => post({ kind: "filter-progress", id, ok: true, done: p.done, total: p.total }, []), now);
    if (!outcome.ok) {
        if (!outcome.cancelled)
            post({ kind: "filter", id, ok: false, error: outcome.error }, []);
        return;
    }
    const r = outcome.result;
    const image = packBytes({ width: r.image.width, height: r.image.height, channels: 3, data: r.image.data }, false);
    post({ kind: "filter", id, ok: true, image, notes: r.notes, tiles: outcome.tiles, strength: r.plan.strength,
        fallback: r.plan.fallback, ms: outcome.ms }, transferList(image));
}
/** Message handler for a worker scope or a test port. */
export function serveShell(port, jobs = FILTER_JOBS) {
    return (event) => {
        const job = event.data;
        if (job && typeof job === "object" && job.kind === "filter-cancel") {
            jobs.cancel(job.id);
            return;
        }
        if (job && typeof job === "object" && job.kind === "filter") {
            void runFilterJob(job, (message, transfer) => port.postMessage(message, transfer), jobs);
            return;
        }
        const { result, transfer } = handleShellJob(job);
        port.postMessage(result, transfer);
    };
}
/** Runs jobs on this thread when a module Worker isn't available; answers asynchronously. */
export class InlinePort {
    receiver = null;
    serve = serveShell({ postMessage: (m) => this.receiver?.(m) });
    postMessage(message) {
        queueMicrotask(() => this.serve({ data: message }));
    }
}
/** Main-thread side. Feed every worker message to receive(). Late answers to superseded jobs are dropped. */
export class ShellClient {
    port;
    timeoutMs;
    next = 1;
    pending = new Map();
    constructor(port, timeoutMs = 60_000) {
        this.port = port;
        this.timeoutMs = timeoutMs;
        if (!(Number.isFinite(timeoutMs) && timeoutMs >= 10))
            throw new RangeError("Timeout must be at least 10 ms");
    }
    get waiting() { return this.pending.size; }
    progress = new Map();
    receive(message) {
        const m = message;
        if (!m || typeof m !== "object" || !Number.isSafeInteger(m.id))
            return;
        if (m.kind === "filter-progress") {
            if (m.ok)
                this.progress.get(m.id)?.(m.done, m.total);
            return;
        }
        this.progress.delete(m.id);
        const job = this.pending.get(m.id);
        if (!job)
            return;
        this.pending.delete(m.id);
        clearTimeout(job.timer);
        if (!m.ok)
            job.reject(new Error(m.error));
        else
            job.resolve(m);
    }
    send(job, transfer) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                if (this.pending.delete(job.id))
                    reject(new Error(`The on-device ${job.kind} job did not finish within ${Math.round(this.timeoutMs / 1000)} s`));
            }, this.timeoutMs);
            this.pending.set(job.id, { resolve, reject, timer });
            try {
                this.port.postMessage(job, transfer);
            }
            catch (error) {
                this.pending.delete(job.id);
                clearTimeout(timer);
                reject(error instanceof Error ? error : new Error(String(error)));
            }
        });
    }
    async render(source, layers) {
        const packed = packSource(source);
        const result = await this.send({ kind: "render", id: this.next++, source: packed,
            layers: layers.map(layer => ({ ...layer, parameters: { ...layer.parameters } })) }, transferList(...sourceBuffers(packed)));
        if (result.kind !== "render" || !result.ok)
            throw new Error("Unexpected render reply");
        return { image: unpackBytes(result.image), labels: result.labels };
    }
    async precheck(image, options = {}) {
        const packed = packBytes(image);
        const job = { kind: "precheck", id: this.next++, image: packed,
            options: { purpose: options.purpose, face: options.face?.flatMap((p) => [p[0], p[1]]), file: options.file } };
        const result = await this.send(job, transferList(packed));
        if (result.kind !== "precheck" || !result.ok)
            throw new Error("Unexpected pre-check reply");
        return result.report;
    }
    async thumbnails(source, studio, { side = THUMB_SIDE, page = 0, pageSize = STRIP_PAGE } = {}) {
        const packed = packSource(source);
        const result = await this.send({ kind: "thumbnails", id: this.next++, source: packed, studio, side, page, pageSize }, transferList(...sourceBuffers(packed)));
        if (result.kind !== "thumbnails" || !result.ok)
            throw new Error("Unexpected thumbnail reply");
        return { tiles: result.tiles.map((t) => ({ ...t, image: t.image ? unpackBytes(t.image) : undefined })),
            page: result.page, pages: result.pages, total: result.total, more: result.more };
    }
    async frames(source, layers, selected, mode) {
        const packed = packSource(source);
        const job = { kind: "frames", id: this.next++, source: packed, mode, selected,
            layers: layers.map((l) => ({ ...l, parameters: { ...l.parameters } })) };
        const result = await this.send(job, transferList(...sourceBuffers(packed)));
        if (result.kind !== "frames" || !result.ok)
            throw new Error("Unexpected compare reply");
        return result.frames.map((f) => ({ ...f, image: unpackBytes(f.image) }));
    }
    /** Render a filter layer on the full photo in the worker, in tiles. `cancel()` stops it; the
     * promise then rejects with "Cancelled". */
    filter(source, layer, { tile, onProgress } = {}) {
        const packed = packSource(source);
        const id = this.next++;
        if (onProgress)
            this.progress.set(id, onProgress);
        const job = { kind: "filter", id, source: packed, parameters: { ...layer.parameters }, strength: layer.strength, tile };
        const done = this.send(job, transferList(...sourceBuffers(packed))).then((result) => {
            if (result.kind !== "filter" || !result.ok)
                throw new Error("Unexpected filter reply");
            return { image: unpackBytes(result.image), notes: result.notes, tiles: result.tiles, strength: result.strength, fallback: result.fallback };
        });
        const cancel = () => {
            const waiting = this.pending.get(id);
            try {
                this.port.postMessage({ kind: "filter-cancel", id }, []);
            }
            catch { /* the port is gone */ }
            if (waiting) {
                this.pending.delete(id);
                clearTimeout(waiting.timer);
                this.progress.delete(id);
                waiting.reject(new Error("Cancelled"));
            }
        };
        return { id, done, cancel };
    }
    /** Reject everything still waiting (page change, worker restart). */
    cancelAll(reason = "Cancelled") {
        for (const [id, job] of this.pending) {
            clearTimeout(job.timer);
            job.reject(new Error(reason));
            this.pending.delete(id);
        }
    }
}
/** A client on a module Worker when the browser has one, otherwise on the inline port. */
export function createShellClient(workerUrl) {
    const WorkerCtor = globalThis.Worker;
    if (WorkerCtor && workerUrl) {
        try {
            const worker = new WorkerCtor(workerUrl, { type: "module" });
            const client = new ShellClient(worker);
            worker.addEventListener("message", (event) => client.receive(event.data));
            worker.addEventListener("error", () => client.cancelAll("The on-device worker stopped"));
            return { client, threaded: true, terminate: () => { client.cancelAll("Worker closed"); worker.terminate(); } };
        }
        catch { /* fall back to the inline port below */ }
    }
    const port = new InlinePort();
    const client = new ShellClient(port);
    port.receiver = (message) => client.receive(message);
    return { client, threaded: false, terminate: () => client.cancelAll("Closed") };
}
