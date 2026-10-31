import { EMPTY_STATS, spreadStats } from "../masks/guard.js";
import { clampHue, faceMask } from "../masks/hue-lock.js";
import { LUTS, finish, greyPhoto, halo, look, prepare, recipeOf, rgbOf, wholeFrame } from "./engine.js";
export const DEFAULT_TILE = 256;
export function tileGrid(width, height, size = DEFAULT_TILE) {
    if (!(Number.isInteger(size) && size >= 16 && size <= 4096))
        throw new RangeError("tile size must be 16-4096 px");
    const out = [];
    for (let y = 0; y < height; y += size)
        for (let x = 0; x < width; x += size) {
            out.push({ x, y, w: Math.min(size, width - x), h: Math.min(size, height - y) });
        }
    return out;
}
export function cropBytes(data, width, r) {
    const out = new Uint8Array(r.w * r.h * 3);
    for (let row = 0; row < r.h; row++)
        out.set(data.subarray(((r.y + row) * width + r.x) * 3, ((r.y + row) * width + r.x + r.w) * 3), row * r.w * 3);
    return out;
}
export function pasteBytes(target, width, r, tile) {
    for (let row = 0; row < r.h; row++)
        target.set(tile.subarray(row * r.w * 3, (row + 1) * r.w * 3), ((r.y + row) * width + r.x) * 3);
}
export function cropPlane(data, width, r) {
    const out = new Float32Array(r.w * r.h);
    for (let row = 0; row < r.h; row++)
        for (let col = 0; col < r.w; col++)
            out[row * r.w + col] = data[(r.y + row) * width + r.x + col];
    return out;
}
function cropMasks(masks, width, r) {
    const crop = (m) => m ? { width: r.w, height: r.h, channels: 1, data: cropPlane(m.data, width, r) } : null;
    return { ...masks, skin: crop(masks.skin), person: crop(masks.person) };
}
/** Each asynchronous render uses the masks that existed when it started.
 *
 * An editor may repaint a mask between two worker yields. A raw reference
 * would mix two geometry revisions in a single export, especially when the
 * first-stage look was completed before the second-stage guard. Validate and
 * copy each mask once, rather than retaining mutable caller-owned buffers.
 */
function captureMask(mask, width, height) {
    if (mask === null)
        return null;
    if (mask.width !== width || mask.height !== height || mask.channels !== 1 ||
        mask.data.length !== width * height) {
        throw new RangeError("filter mask dimensions must match the source photo");
    }
    const copy = mask.data instanceof Float64Array
        ? Float64Array.from(mask.data) : Float32Array.from(mask.data);
    for (const value of copy) {
        if (!(value >= 0 && value <= 1)) {
            throw new RangeError("filter mask alpha must be finite between 0 and 1");
        }
    }
    return { width, height, channels: 1, data: copy };
}
export function captureMasks(masks, width, height) {
    return { source: masks.source, note: masks.note,
        skin: captureMask(masks.skin, width, height),
        person: captureMask(masks.person, width, height) };
}
export class TiledRender {
    cache;
    image;
    plan;
    notes;
    tiles;
    styled;
    greyLook;
    out;
    masks;
    frame;
    pad;
    stats = EMPTY_STATS;
    // Guard statistics need whole-frame locked colours. The output array first
    // holds those bytes and is then replaced one completed tile at a time.
    // Every unprocessed tile remains locked until its final pixels are written,
    // saving one full RGB frame without changing numerical reductions.
    locked = false;
    phase = "look";
    index = 0;
    constructor(image, recipe, settings = {}, masks, faceCentre = null, tile = DEFAULT_TILE, cache = LUTS) {
        this.cache = cache;
        this.image = rgbOf(image);
        this.masks = captureMasks(masks, this.image.width, this.image.height);
        const prepared = prepare(this.image, recipeOf(recipe), settings, this.masks);
        this.plan = prepared.plan;
        this.notes = prepared.notes;
        this.frame = wholeFrame(this.image.width, this.image.height, faceCentre);
        this.pad = this.plan.identity ? 0 : halo(this.plan, this.frame);
        this.tiles = tileGrid(this.image.width, this.image.height, tile);
        const n = this.image.data.length;
        this.styled = this.plan.identity ? Uint8Array.from(this.image.data) : new Uint8Array(n);
        this.greyLook = this.plan.guard && this.masks.skin && !this.plan.identity ? new Uint8Array(n) : null;
        this.out = this.plan.identity ? Uint8Array.from(this.image.data) : new Uint8Array(n);
        if (this.plan.identity)
            this.phase = "done";
    }
    get done() { return this.phase === "done"; }
    get current() { return this.phase; }
    /** Units of work in all: look tiles, one statistics pass, finish tiles. */
    get total() { return this.plan.identity ? 0 : this.tiles.length * 2 + 1; }
    get completed() {
        if (this.phase === "done")
            return this.total;
        if (this.phase === "look")
            return this.index;
        if (this.phase === "stats")
            return this.tiles.length;
        return this.tiles.length + 1 + this.index;
    }
    /** Do one unit of work. Returns true when the render is complete. */
    step() {
        const { width, height } = this.image;
        if (this.phase === "look") {
            const r = this.tiles[this.index];
            const x0 = Math.max(0, r.x - this.pad), y0 = Math.max(0, r.y - this.pad);
            const x1 = Math.min(width, r.x + r.w + this.pad), y1 = Math.min(height, r.y + r.h + this.pad);
            const outer = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
            const tileFrame = { ...this.frame, x0, y0 };
            const inner = { x: r.x - x0, y: r.y - y0, w: r.w, h: r.h };
            const styled = look(cropBytes(this.image.data, width, outer), outer.w, outer.h, this.plan, tileFrame, this.cache);
            pasteBytes(this.styled, width, r, cropBytes(styled, outer.w, inner));
            if (this.greyLook) {
                const grey = look(greyPhoto(outer.w * outer.h), outer.w, outer.h, this.plan, tileFrame, this.cache);
                pasteBytes(this.greyLook, width, r, cropBytes(grey, outer.w, inner));
            }
            if (++this.index >= this.tiles.length) {
                this.phase = "stats";
                this.index = 0;
            }
            return false;
        }
        if (this.phase === "stats") {
            // One pass over the whole photo, in the same order as a whole render, so the sums match exactly.
            if (this.greyLook && this.masks.skin) {
                if (this.plan.stages.some((s) => s.family === "colour")) {
                    clampHue(this.image.data, this.styled, faceMask(this.masks), this.out);
                    this.locked = true;
                }
                this.stats = spreadStats(this.image.data, this.locked ? this.out : this.styled, this.masks.skin.data);
            }
            this.phase = "finish";
            return false;
        }
        if (this.phase === "finish") {
            const r = this.tiles[this.index];
            const before = cropBytes(this.image.data, width, r), styled = cropBytes(this.styled, width, r);
            const m = cropMasks(this.masks, width, r);
            const checked = this.locked ? cropBytes(this.out, width, r) : null;
            const out = finish(before, styled, this.greyLook ? cropBytes(this.greyLook, width, r) : null, this.plan, m, r.w * r.h, this.stats, checked);
            pasteBytes(this.out, width, r, out);
            if (++this.index >= this.tiles.length) {
                this.locked = false;
                this.phase = "done";
            }
            return this.phase === "done";
        }
        return true;
    }
    /** Run every remaining step now (no yielding). */
    runAll() {
        while (!this.step()) { /* one unit per step */ }
        return this.result();
    }
    result() {
        if (!this.done)
            throw new Error("the tiled render has not finished");
        return { image: { ...this.image, data: this.out }, look: { ...this.image, data: this.styled }, plan: this.plan, notes: this.notes };
    }
}
