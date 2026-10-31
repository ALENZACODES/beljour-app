/** Bounded, local batch review of up to 100 photos (feature 91). Only one original is
 * decoded/rendered at a time; completed items retain small thumbnails plus their encoded,
 * metadata-free JPEG. Past 50 photos the thumbnails halve, and when the encoded results would
 * pass the 100 MB in-memory limit the finished photos are handed over as a numbered album part
 * (Beljour part 1.zip, part 2 ...) and released, so a long batch never stops for memory.
 * Face-model unavailable and no-face are distinct states. No geometry, landmarks
 * or hair masks are copied from one person onto another. Author: John Khan.
 */
import { resize, toRGBA } from "../engines/core/buffer.js";
import { decodePhoto, browserDecoder } from "../image/decode.js";
import { defaultVisionClient } from "../vision/client.js";
import { renderLayers } from "../ui/shell/pipeline.js";
import { validateStack } from "../ui/shell/layers.js";
import { canvasEncoder, exportPhoto, album } from "./export.js";
const SUPPORTED = new Set(["enhance", "filters", "lighting"]);
export const MAX_FILES = 100, LARGE_BATCH = 50, MAX_ENCODED = 100 * 1024 * 1024;
/** Thumbnail long edge: 320 px, or 160 px once a batch passes LARGE_BATCH photos (ASSUMED). */
export const THUMB_EDGE = 320, LARGE_THUMB_EDGE = 160;
const yieldUi = () => new Promise(resolve => setTimeout(resolve, 0));
export function batchCompatibility(layers) {
    validateStack(layers);
    const active = layers.filter(layer => layer.enabled && layer.opacity > 0 && layer.strength > 0);
    return { ready: active.filter(layer => SUPPORTED.has(layer.kind) && layer.provenance === "local")
            .map(layer => ({ ...layer, parameters: { ...layer.parameters } })),
        unavailable: active.filter(layer => !SUPPORTED.has(layer.kind) || layer.provenance !== "local")
            .map(layer => `${layer.name}: needs its own photo-specific points, mask or approved provider action. Open that photo in the editor.`) };
}
function source(image) {
    return { id: "batch-local", label: "Batch photo", kind: "uploaded", disposable: true, image };
}
export function reviewThumbnail(image, edge = THUMB_EDGE) {
    const scale = Math.min(1, edge / Math.max(image.width, image.height));
    return resize(image, Math.max(1, Math.round(image.width * scale)), Math.max(1, Math.round(image.height * scale)));
}
async function decode(bytes) {
    const photo = await decodePhoto(bytes, browserDecoder(), { flattenOn: [255, 255, 255] });
    return { width: photo.width, height: photo.height, channels: 4, data: photo.data };
}
async function findFaces(image) {
    const client = defaultVisionClient();
    if (!client.ready("face-landmarks"))
        return { kind: "unknown", reason: "Automatic face reading is unavailable while the model licence is pending. Review this photo yourself." };
    const result = await client.detect("face-landmarks", { width: image.width, height: image.height, rgba: Uint8ClampedArray.from(toRGBA(image)).buffer });
    if (!result.ok)
        return { kind: "unknown", reason: result.error ?? "Face reading failed. Review this photo yourself." };
    return result.faces?.length ? { kind: "found", count: result.faces.length } : { kind: "none" };
}
export class BatchReview {
    name;
    deps;
    records = [];
    files = new Map();
    next = 1;
    parts = 0;
    /** The largest size this batch has been asked to hold; sets the thumbnail size up front. */
    planned = 0;
    busy = false;
    stop = false;
    ended = false;
    compatibility;
    constructor(name, layers, deps = {}) {
        this.name = name;
        this.deps = deps;
        if (!name.trim() || name.length > 80)
            throw new RangeError("A batch needs a short look name.");
        this.compatibility = batchCompatibility(layers);
    }
    get running() { return this.busy; }
    get disposed() { return this.ended; }
    grid() { return this.records.map(item => ({ ...item })); }
    get(id) {
        const item = this.records.find(row => row.id === id);
        if (!item)
            throw new RangeError("This batch photo is no longer available.");
        return item;
    }
    idle() {
        if (this.ended)
            throw new Error("This batch was cleared. Open another batch to continue.");
        if (this.busy)
            throw new Error("Wait for the current photo or pause this batch first.");
    }
    notify(callback) { if (!this.ended)
        callback?.(); }
    async add(inputs, changed) {
        this.idle();
        if (!inputs.length || this.records.length + inputs.length > MAX_FILES)
            throw new RangeError(`Choose 1 to ${MAX_FILES} photos in one batch.`);
        this.busy = true;
        this.stop = false;
        this.planned = Math.max(this.planned, this.records.length + inputs.length);
        if (this.planned > LARGE_BATCH)
            this.shrinkThumbnails();
        try {
            for (const file of inputs) {
                if (this.stop || this.ended)
                    break;
                const item = { id: this.next++, name: file.name.slice(0, 120), width: 0, height: 0,
                    status: "reading", before: null, after: null, dose: 1, faces: { kind: "unknown", reason: "Not read yet" }, note: "", output: null };
                this.records.push(item);
                this.files.set(item.id, file);
                this.notify(changed);
                try {
                    if (!Number.isSafeInteger(file.size) || file.size < 1 || file.size > 25 * 1024 * 1024)
                        throw new RangeError("Each photo must be at most 25 MB.");
                    const image = await (this.deps.decode ?? decode)(await file.read());
                    if (this.ended)
                        break;
                    item.width = image.width;
                    item.height = image.height;
                    item.before = reviewThumbnail(image, this.thumbEdge);
                    item.faces = await (this.deps.findFaces ?? findFaces)(item.before);
                    if (item.faces.kind === "found" && (!Number.isInteger(item.faces.count) || item.faces.count < 1 || item.faces.count > 6))
                        throw new Error("The face reading returned an invalid count.");
                    item.status = item.faces.kind === "none" ? "skipped-no-face" : item.faces.kind === "unknown" ? "awaiting-face" : "ready";
                    item.note = item.faces.kind === "unknown" ? item.faces.reason : item.faces.kind === "none" ? "No face found; skipped." : "Ready for the same photo-wide look.";
                }
                catch (error) {
                    item.status = "failed";
                    item.note = error instanceof Error ? error.message : String(error);
                }
                this.notify(changed);
                await (this.deps.yield ?? yieldUi)();
            }
        }
        finally {
            this.busy = false;
            this.notify(changed);
        }
    }
    /** A deliberate human declaration, not an inferred face or a substitute mesh. */
    confirmFaces(id, containsFaces) {
        this.idle();
        const item = this.get(id);
        if (!item.before)
            throw new Error("Read this photo successfully before reviewing its faces.");
        item.faces = containsFaces ? { kind: "manual" } : { kind: "none" };
        item.status = containsFaces ? "ready" : "skipped-no-face";
        item.note = containsFaces ? "Faces confirmed by you. Effects apply to the entire photo; no face measurements were inferred." : "You marked no face; skipped.";
        item.output = null;
        item.after = null;
    }
    setDose(id, dose) {
        this.idle();
        if (!Number.isFinite(dose) || dose < 0 || dose > 1)
            throw new RangeError("Per-photo strength must be 0 to 100% of the look.");
        const item = this.get(id);
        item.dose = dose;
        if (item.status === "done" || item.status === "failed" && item.before && ["found", "manual"].includes(item.faces.kind))
            item.status = "ready";
        item.output = null;
        item.after = null;
    }
    cancel() { this.stop = true; }
    async run(changed, onlyId) {
        this.idle();
        if (!this.compatibility.ready.length)
            throw new Error("This look has no photo-wide local edits. Use Enhance, Filters or Lighting for this batch.");
        if (onlyId !== undefined)
            this.get(onlyId);
        this.busy = true;
        this.stop = false;
        try {
            for (const item of this.records) {
                if (this.stop || this.ended)
                    break;
                if (onlyId !== undefined && onlyId !== item.id || item.status !== "ready")
                    continue;
                item.status = "working";
                this.notify(changed);
                try {
                    const image = await (this.deps.decode ?? decode)(await this.files.get(item.id).read());
                    if (this.ended)
                        break;
                    const layers = this.compatibility.ready.map(layer => ({ ...layer, strength: layer.strength * item.dose }));
                    const rendered = await (this.deps.render ?? (async (s, l) => renderLayers(s, l)))(source(image), layers);
                    if (this.ended)
                        break;
                    if (rendered.image.width !== image.width || rendered.image.height !== image.height)
                        throw new Error("The batch renderer changed the photo dimensions.");
                    const output = await exportPhoto({ width: image.width, height: image.height, data: toRGBA(rendered.image) }, this.deps.encoder ?? canvasEncoder(), { lookName: this.name, index: item.id, simulationLabel: true, isSimulation: layers.some(layer => layer.simulation) });
                    if (this.ended)
                        break;
                    const retained = this.records.reduce((sum, row) => sum + (row.output?.bytes.length ?? 0), 0);
                    if (retained + output.bytes.length > MAX_ENCODED) {
                        if (!this.deps.savePart || retained === 0)
                            throw new Error("This batch reached its 100 MB output limit. Save completed photos, clear them, then continue in a new batch.");
                        this.savePart();
                    }
                    item.after = reviewThumbnail(rendered.image, this.thumbEdge);
                    item.output = output;
                    item.status = "done";
                    item.note = `Original size kept: ${item.width} × ${item.height}. ${this.compatibility.unavailable.length ? `${this.compatibility.unavailable.length} unsupported edit(s) left out; listed above.` : ""}`;
                }
                catch (error) {
                    item.status = "failed";
                    item.note = error instanceof Error ? error.message : String(error);
                }
                this.notify(changed);
                await (this.deps.yield ?? yieldUi)();
            }
        }
        finally {
            this.busy = false;
            this.notify(changed);
        }
    }
    retry(id) {
        this.idle();
        const item = this.get(id);
        if (!item.before || !["found", "manual"].includes(item.faces.kind))
            throw new Error("Review the faces before retrying this photo.");
        item.status = "ready";
        item.output = null;
        item.after = null;
    }
    exportAll() {
        this.idle();
        return album(this.records.flatMap(item => item.status === "done" && item.output ? [item.output] : []), this.parts ? this.parts + 1 : undefined);
    }
    /** Album parts already handed over during this batch. */
    get partsSaved() { return this.parts; }
    get thumbEdge() { return this.planned > LARGE_BATCH ? LARGE_THUMB_EDGE : THUMB_EDGE; }
    shrinkThumbnails() {
        for (const item of this.records) {
            if (item.before)
                item.before = reviewThumbnail(item.before, LARGE_THUMB_EDGE);
            if (item.after)
                item.after = reviewThumbnail(item.after, LARGE_THUMB_EDGE);
        }
    }
    /** Hand the finished photos over as the next album part and release their bytes. */
    savePart() {
        const done = this.records.filter(item => item.status === "done" && item.output);
        const part = album(done.map(item => item.output), ++this.parts);
        this.deps.savePart(part);
        for (const item of done) {
            item.output = null;
            item.status = "saved";
            item.note = `Saved in ${part.name}.`;
        }
    }
    summary() {
        const n = (status) => this.records.filter(item => item.status === status).length;
        const saved = n("saved") ? `; ${n("saved")} already saved in ${this.parts} album part${this.parts === 1 ? "" : "s"}` : "";
        return `${n("done")} of ${this.records.length} ready to save${saved}; ${n("skipped-no-face")} skipped; ${n("failed")} failed; ${n("awaiting-face")} need your face review.`;
    }
    dispose() { this.stop = true; this.ended = true; this.records.length = 0; this.files.clear(); }
}
