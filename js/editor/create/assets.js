/** The pictures Create layers point at, kept in this tab's memory only: the Studio photo (edited
 * and original), photos opened for a collage or story, her cut-out stickers and the sticker pack
 * pictures of this build. The document stores only their ids (doc.ts); nothing here is saved,
 * uploaded or put in browser storage. Pack pictures load from this site's own assets folder,
 * and only files the build listed (sticker-assets.ts) are ever asked for.
 * Author: John Khan.
 */
import { toRGBA } from "../../engines/core/buffer.js";
import { packUrl } from "./stickers.js";
export const MAX_FILES = 9, MAX_CUTOUTS = 24;
/** A canvas holding these pixels (RGB or RGBA bytes). */
export function pictureOf(image, doc = document) {
    const canvas = doc.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext("2d");
    if (!ctx)
        throw new Error("This browser has no 2D canvas.");
    const rgba = new Uint8ClampedArray(image.channels === undefined ? image.data : toRGBA(image));
    ctx.putImageData(new ImageData(rgba, image.width, image.height), 0, 0);
    return { source: canvas, width: image.width, height: image.height };
}
export class CreateAssets {
    doc;
    provider = null;
    converted = new WeakMap();
    files = new Map();
    cutouts = new Map();
    packs = new Map();
    waiting = new Set();
    fileCount = 0;
    cutCount = 0;
    /** Called when a pack picture finishes loading, so the preview can redraw. */
    onload = null;
    constructor(doc = typeof document === "undefined" ? null : document) {
        this.doc = doc;
    }
    bind(provider) { this.provider = provider; return this; }
    convert(image) {
        let pic = this.converted.get(image);
        if (!pic) {
            pic = pictureOf(image, this.doc ?? document);
            this.converted.set(image, pic);
        }
        return pic;
    }
    photo(id) {
        if (id === "edited" && this.provider)
            return this.convert(this.provider.edited());
        if (id === "original" && this.provider)
            return this.convert(this.provider.original());
        return this.files.get(id) ?? null;
    }
    /** Keep a photo opened for a collage or story; returns its id. */
    addFile(pic) {
        if (this.files.size >= MAX_FILES)
            throw new RangeError(`Up to ${MAX_FILES} extra photos at once.`);
        const id = `file-${++this.fileCount}`;
        this.files.set(id, pic);
        return id;
    }
    get fileIds() { return [...this.files.keys()]; }
    addCutout(pic) {
        if (this.cutouts.size >= MAX_CUTOUTS)
            throw new RangeError(`Up to ${MAX_CUTOUTS} cut-outs at once.`);
        const id = `cutout-${++this.cutCount}`;
        this.cutouts.set(id, pic);
        return id;
    }
    sticker(source) {
        if (source.kind === "cutout")
            return this.cutouts.get(source.asset) ?? null;
        if (source.kind !== "pack")
            return null;
        const url = packUrl(source.pack, source.name), got = this.packs.get(url);
        if (got && got !== "loading" && got !== "failed")
            return got;
        if (!got)
            this.load(url);
        return null;
    }
    /** Load one listed pack picture from this site. */
    load(url) {
        if (!this.doc)
            return;
        this.packs.set(url, "loading");
        const img = this.doc.createElement("img");
        const done = new Promise((resolve) => {
            img.onload = () => { this.packs.set(url, { source: img, width: img.naturalWidth || 1, height: img.naturalHeight || 1 }); resolve(); this.onload?.(); };
            img.onerror = () => { this.packs.set(url, "failed"); resolve(); };
        });
        this.waiting.add(done);
        void done.then(() => this.waiting.delete(done));
        img.src = url;
    }
    /** Resolves when every picture asked for so far has loaded or failed (before saving a file). */
    async ready() { while (this.waiting.size)
        await Promise.all([...this.waiting]); }
}
/** The one registry the Create panel and the Studio's Save share in this tab. */
export const sharedAssets = new CreateAssets();
//# sourceMappingURL=assets.js.map