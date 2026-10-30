/** The one "Add photos" control every photo screen uses (Skin Moment, the Studio and its Create
 * collage and story, Face lenses, the photo lab's shape tools), and the "My photos" strip under it.
 *
 * "Add photos" is a file input with accept="image/*" and multiple, so a phone opens its own photo
 * library picker with multi-select; on touch devices "Take a photo" opens the camera (capture
 * attribute). A web page can't read the camera roll: it only ever sees the photos picked here.
 * Each picked photo goes to the screen at once, and a smaller copy is kept in My photos on this
 * device (photos/library.ts) so one tap reuses it on any screen. Nothing here uploads anything;
 * the screens' own consent rules decide what is ever sent.
 * Author: John Khan.
 */
import { h } from "../dom.js";
import { ensureConsent } from "../ui/one-consent.js";
import { sniff } from "../image/decode.js";
import { MAX_PHOTOS, myPhotos } from "./library.js";
import { head, looksLikeHeic, PhotoOpenError, preparePhoto, OPEN_MESSAGE } from "./prepare.js";
export const KEEP_NOTE = "Kept on this device so you don't have to pick again. Delete any time.";
export const NOT_KEPT_NOTE = "Your photos are no longer kept on this device, and the kept ones are deleted. You can turn keeping back on in the Trust Centre.";
function isTouch() {
    try {
        return typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
    }
    catch {
        return false;
    }
}
const sourceKey = (f) => `${f.name ?? ""}|${f.size}|${f.lastModified ?? 0}`;
const baseName = (name) => (name ?? "photo").replace(/\.[^.]+$/, "") || "photo";
function when(p) {
    const d = new Date(p.added);
    try {
        return d.toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
    }
    catch {
        return d.toISOString().slice(0, 16).replace("T", " ");
    }
}
/** A file the screens' own photo code reads. JPEG, PNG and WebP pass through untouched (with
 * the type set from their bytes); anything else, HEIC above all, is converted to the upright JPEG
 * copy when this browser can decode it, and otherwise refused with a plain message. */
async function forScreen(file, prepared, prepare) {
    const first = await head(file);
    const format = sniff(first);
    if (format) {
        const type = `image/${format}`;
        return file.type === type ? file : new File([file], file.name || `photo.${format === "jpeg" ? "jpg" : format}`, { type, lastModified: file.lastModified });
    }
    if (!looksLikeHeic(file, first))
        return file; // the screen's own message names what it reads
    const ready = await prepare(file);
    prepared.set(file, ready);
    return new File([ready.photo], `${baseName(file.name)}.jpg`, { type: "image/jpeg", lastModified: file.lastModified });
}
export function photoPicker(options) {
    // The single device consent is asked before a file is prepared, decoded or kept (Batch 1).
    if (!options.gate)
        options = { ...options, gate: () => ensureConsent() };
    const library = options.library ?? myPhotos();
    const prepare = options.prepare ?? ((f) => preparePhoto(f));
    const takes = options.takes ?? "many";
    const id = options.id;
    const status = h("p", { class: "ph-status", role: "status", "aria-live": "polite" });
    status.hidden = true;
    const say = (text) => {
        if (options.say)
            options.say(text);
        else {
            status.textContent = text;
            status.hidden = !text;
            sync();
        }
    };
    /** The whole control hides when it has nothing to show (the Studio's own button opens it). */
    const sync = () => { element.hidden = (actions.hidden || actions.parentNode !== element) && status.hidden && strip.hidden; };
    const label = options.label ?? "Add photos";
    const classes = options.classes ?? { button: "lg-file-button", quiet: "lg-file-button lg-file-button-quiet" };
    // Both hidden-input classes: layout.css styles the first, the photo lab's styles.css the second.
    const hidden = "lg-file-input visually-hidden";
    const input = options.input ?? h("input", { type: "file", id, class: hidden, "aria-label": label });
    input.accept = "image/*";
    input.multiple = true;
    const camera = h("input", { type: "file", id: `${id}-camera`, class: hidden, accept: "image/*", capture: "user", "aria-label": "Take a photo" });
    const gated = async () => !options.gate || await options.gate();
    /** A label opens its input directly; with a gate it is a button that asks first. */
    const trigger = (target, text, cls) => options.gate
        ? h("button", { type: "button", class: cls, onclick: async () => { if (await gated())
                target.click(); } }, text)
        : h("label", { for: target.id, class: cls }, text);
    const showCamera = (options.camera ?? true) && (options.touch ?? isTouch());
    const actions = h("div", { class: "ph-actions" }, options.input ? null : input, options.input ? null : trigger(input, label, `${classes.button} ph-add`), showCamera ? camera : null, showCamera ? trigger(camera, "Take a photo", `${classes.quiet} ph-camera`) : null);
    if (!actions.children.length)
        actions.hidden = true;
    // ---- My photos strip -------------------------------------------------------------------
    const count = h("span", { class: "ph-count" });
    const list = h("ul", { class: "ph-list", "aria-label": "My photos, newest first" });
    const confirmRow = h("div", { class: "ph-confirm", role: "group", "aria-label": "Delete all my photos" });
    confirmRow.hidden = true;
    const deleteAll = h("button", { type: "button", class: "ph-link ph-delete-all" }, "Delete all my photos");
    const dontKeep = h("input", { type: "checkbox", id: `${id}-dont-keep` });
    const strip = h("section", { class: "ph-strip", "aria-labelledby": `${id}-strip-h` }, h("div", { class: "ph-strip-head" }, h("h3", { id: `${id}-strip-h`, class: "ph-strip-title" }, "My photos"), count), h("p", { class: "ph-note" }, KEEP_NOTE), list, h("div", { class: "ph-strip-foot" }, deleteAll, h("label", { class: "ph-dont-keep", for: dontKeep.id }, dontKeep, " Don't keep my photos")), confirmRow);
    strip.hidden = true;
    let urls = [];
    let ticket = 0, disposed = false, rendered = false;
    const release = () => { for (const u of urls)
        URL.revokeObjectURL(u); urls = []; };
    async function refresh() {
        if (disposed)
            return;
        const mine = ++ticket;
        const photos = library.usable && library.keep.get() !== "off" ? await library.list() : [];
        if (mine !== ticket || disposed)
            return;
        rendered = true;
        release();
        if (!library.usable || !photos.length) {
            strip.hidden = true;
            list.replaceChildren();
            confirmRow.hidden = true;
            sync();
            return;
        }
        strip.hidden = false;
        sync();
        count.textContent = `${photos.length} of ${MAX_PHOTOS}`;
        dontKeep.checked = false;
        list.replaceChildren(...photos.map((p) => {
            const url = URL.createObjectURL(new Blob([p.thumb], { type: "image/jpeg" }));
            urls.push(url);
            const name = `photo from ${when(p)}`;
            return h("li", { class: "ph-item" }, h("button", { type: "button", class: "ph-use", "aria-label": `Use ${name}`, "data-photo": p.id, onclick: () => { void reuse(p.id); } }, h("img", { src: url, alt: "", width: 64, height: 64, decoding: "async" })), h("button", { type: "button", class: "ph-remove", "aria-label": `Remove ${name} from My photos`, onclick: async () => {
                    if (await library.remove(p.id))
                        say("Removed from My photos on this device.");
                } }, "×"));
        }));
    }
    async function reuse(photoId) {
        if (!(await gated()))
            return;
        const p = (await library.list()).find((x) => x.id === photoId);
        const bytes = p ? await library.photo(photoId) : null;
        if (!p || !bytes) {
            say("That photo is no longer in My photos.");
            await refresh();
            return;
        }
        const file = new File([bytes], `${baseName(p.name)}.jpg`, { type: "image/jpeg", lastModified: p.added });
        await options.onPhotos([file], "my-photos");
        await library.touch(photoId);
    }
    /** Keep smaller copies of what was picked, oldest pick first so the newest ends up in front. */
    async function keep(files, prepared) {
        let kept = 0;
        for (const file of files) {
            if (!library.keeping)
                break;
            let ready = prepared.get(file);
            if (!ready) {
                try {
                    ready = await prepare(file);
                }
                catch {
                    continue;
                }
            }
            const stored = await library.add({ source: sourceKey(file), name: file.name || "photo", width: ready.width, height: ready.height,
                photo: await ready.photo.arrayBuffer(), thumb: await ready.thumb.arrayBuffer() });
            if (stored)
                kept++;
        }
        return kept;
    }
    async function pick(files, from) {
        const chosen = files.filter(Boolean);
        if (!chosen.length)
            return;
        const prepared = new Map();
        const ready = [];
        for (const file of chosen) {
            try {
                ready.push(await forScreen(file, prepared, prepare));
            }
            catch (error) {
                say(error instanceof PhotoOpenError ? error.message : OPEN_MESSAGE);
            }
        }
        const use = takes === "one" ? ready.slice(0, 1) : ready;
        if (use.length)
            await options.onPhotos(use, from);
        const kept = await keep(chosen, prepared);
        if (kept > 1 && takes === "one")
            say(`${kept} photos kept in My photos. The first one is open here.`);
    }
    const onChange = (target, from) => async () => {
        const files = Array.from(target.files ?? []);
        target.value = "";
        await pick(files, from);
    };
    input.addEventListener("change", onChange(input, "device"));
    camera.addEventListener("change", onChange(camera, "camera"));
    deleteAll.addEventListener("click", async () => {
        const n = (await library.list()).length;
        confirmRow.replaceChildren(h("p", {}, `Delete all ${n} photo${n === 1 ? "" : "s"} from My photos on this device?`), h("button", { type: "button", class: "ph-danger ph-confirm-delete", onclick: async () => {
                const removed = await library.clear();
                confirmRow.hidden = true;
                say(`${removed} photo${removed === 1 ? "" : "s"} deleted from this device.`);
            } }, "Delete all"), h("button", { type: "button", class: "ph-link", onclick: () => { confirmRow.hidden = true; deleteAll.focus(); } }, "Keep them"));
        confirmRow.hidden = false;
    });
    dontKeep.addEventListener("change", async () => {
        if (!dontKeep.checked)
            return;
        await library.setKeeping(false);
        say(NOT_KEPT_NOTE);
    });
    const unsubscribe = library.subscribe(() => {
        // A screen that re-renders drops this control; stop listening once it is gone.
        if (rendered && !element.isConnected) {
            dispose();
            return;
        }
        void refresh();
    });
    const element = h("div", { class: "ph-picker" }, actions, status, strip);
    sync();
    function dispose() { if (disposed)
        return; disposed = true; unsubscribe(); release(); }
    void refresh();
    return { element, actions, input, strip, pick, refresh, dispose };
}
//# sourceMappingURL=picker.js.map