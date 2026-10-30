/** My photos: the photos she has picked, kept only in this browser on this device (IndexedDB), so
 * every photo screen can offer them again with one tap. A web page can't read the camera roll;
 * this holds only what she picked herself, as smaller copies (JPEG bytes of the photo and of a
 * thumbnail), newest first, at most MAX_PHOTOS (the oldest is dropped). Nothing here touches the
 * network. Listing reads the thumbnails only; a photo's full copy is read when she taps it.
 *
 * Keeping is on once she picks her first photo and can be turned off ("Don't keep my photos"),
 * which also deletes what is kept. When IndexedDB is missing or refuses (some private windows),
 * the library says it is unavailable and the screens hide the strip; picking still works.
 * Author: John Khan.
 */
/** ASSUMED: enough recent photos to feel like a library without filling the browser's quota
 * (about 60 x 0.5 MB at 1600 px). */
export const MAX_PHOTOS = 60;
export const KEEP_KEY = "beljour.myPhotos.keep";
const DB_NAME = "beljour-my-photos";
const META = "meta";
const FULL = "full";
const CHANNEL = "beljour-my-photos";
/** The keep setting in localStorage; in memory when storage is blocked. */
export function keepSetting(storage) {
    let memory = "unset";
    return {
        get() {
            try {
                const v = storage?.getItem(KEEP_KEY);
                if (v === "on" || v === "off")
                    return v;
            }
            catch { /* blocked: memory */ }
            return memory;
        },
        set(state) { memory = state; try {
            storage?.setItem(KEEP_KEY, state);
        }
        catch { /* blocked: memory only */ } },
    };
}
function request(req) {
    return new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
}
/** IndexedDB, or null when this browser has none. Opening can still fail later (private
 * windows); every call then rejects and the library turns itself off. */
export function idbBackend(factory = globalThis.indexedDB) {
    if (!factory)
        return null;
    let opened = null;
    const db = () => opened ??= new Promise((resolve, reject) => {
        const req = factory.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
            for (const name of [META, FULL])
                if (!req.result.objectStoreNames.contains(name))
                    req.result.createObjectStore(name);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error("This browser refused local photo storage."));
        req.onblocked = () => reject(new Error("Local photo storage is busy in another tab."));
    }).catch((error) => { opened = null; throw error; });
    const write = async (work) => {
        const tx = (await db()).transaction([META, FULL], "readwrite");
        work(tx.objectStore(META), tx.objectStore(FULL));
        await new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error ?? new Error("Local photo storage stopped the write (it may be full)."));
        });
    };
    return {
        async all() { return request((await db()).transaction(META).objectStore(META).getAll()); },
        async photo(id) { return (await request((await db()).transaction(FULL).objectStore(FULL).get(id))) ?? null; },
        put: (entry, photo) => write((meta, full) => { meta.put(entry, entry.id); if (photo)
            full.put(photo, entry.id); }),
        remove: (ids) => write((meta, full) => { for (const id of ids) {
            meta.delete(id);
            full.delete(id);
        } }),
        clear: () => write((meta, full) => { meta.clear(); full.clear(); }),
    };
}
const newest = (a, b) => b.added - a.added || (a.id < b.id ? 1 : -1);
export class PhotoLibrary {
    backend;
    keep;
    clock;
    broken = false;
    serial = 0;
    listeners = new Set();
    channel = null;
    constructor(backend, keep, clock = Date.now) {
        this.backend = backend;
        this.keep = keep;
        this.clock = clock;
    }
    /** False when there is no storage or it has refused once: the strip hides, picking still works. */
    get usable() { return !!this.backend && !this.broken; }
    /** Whether a new pick should be kept: storage works and she hasn't said no. */
    get keeping() { return this.usable && this.keep.get() !== "off"; }
    async guard(work, fallback) {
        if (!this.backend || this.broken)
            return fallback;
        try {
            return await work(this.backend);
        }
        catch {
            this.broken = true;
            this.changed();
            return fallback;
        }
    }
    /** Newest first. Empty when storage is unavailable. */
    list() { return this.guard(async (b) => (await b.all()).sort(newest), []); }
    /** A kept photo's full copy (JPEG bytes), or null. */
    photo(id) { return this.guard((b) => b.photo(id), null); }
    /** Keep a picked photo, newest first; the same file picked again replaces its old copy, and
     * anything past MAX_PHOTOS (the oldest) is dropped. Null when not kept. The first kept photo
     * turns keeping on. */
    async add(photo) {
        if (!this.keeping)
            return null;
        const { photo: bytes, ...rest } = photo;
        const stored = await this.guard(async (b) => {
            const at = this.clock();
            const entry = { ...rest, id: `p${at.toString(36)}-${(++this.serial).toString(36)}${Math.random().toString(36).slice(2, 6)}`, added: at };
            const before = await b.all();
            const same = before.filter((p) => p.source === rest.source).map((p) => p.id);
            await b.put(entry, bytes);
            const others = before.filter((p) => !same.includes(p.id)).sort(newest);
            const drop = [...same, ...others.slice(MAX_PHOTOS - 1).map((p) => p.id)];
            if (drop.length)
                await b.remove(drop);
            return entry;
        }, null);
        if (stored) {
            if (this.keep.get() === "unset")
                this.keep.set("on");
            this.changed();
        }
        return stored;
    }
    /** Move a reused photo to the front. */
    async touch(id) {
        const done = await this.guard(async (b) => {
            const found = (await b.all()).find((p) => p.id === id);
            if (!found)
                return false;
            await b.put({ ...found, added: this.clock() });
            return true;
        }, false);
        if (done)
            this.changed();
    }
    async remove(id) {
        const done = await this.guard(async (b) => { await b.remove([id]); return true; }, false);
        if (done)
            this.changed();
        return done;
    }
    /** Delete every kept photo. Returns how many there were (0 when storage is unavailable). */
    async clear() {
        const n = await this.guard(async (b) => { const count = (await b.all()).length; await b.clear(); return count; }, 0);
        this.changed();
        return n;
    }
    /** "Don't keep my photos" (off): stop keeping and delete what is kept. On: keep the next pick. */
    async setKeeping(on) {
        this.keep.set(on ? "on" : "off");
        const removed = on ? 0 : await this.clear();
        this.changed();
        return removed;
    }
    /** Called after any change here or in another tab of this browser. */
    subscribe(fn) {
        this.listeners.add(fn);
        if (!this.channel && typeof BroadcastChannel !== "undefined" && this.backend) {
            try {
                this.channel = new BroadcastChannel(CHANNEL);
                this.channel.onmessage = () => { for (const l of [...this.listeners])
                    l(); };
                this.channel.unref?.();
            }
            catch {
                this.channel = null;
            }
        }
        return () => { this.listeners.delete(fn); if (!this.listeners.size) {
            this.channel?.close();
            this.channel = null;
        } };
    }
    changed() {
        for (const l of [...this.listeners])
            l();
        try {
            this.channel?.postMessage("changed");
        }
        catch { /* the other tabs refresh on their next change */ }
    }
}
let shared = null;
/** The browser's library: IndexedDB plus the keep setting in localStorage. One per page. */
export function myPhotos() {
    if (shared)
        return shared;
    let storage = null;
    try {
        storage = typeof localStorage === "undefined" ? null : localStorage;
    }
    catch {
        storage = null;
    }
    let backend = null;
    try {
        backend = idbBackend();
    }
    catch {
        backend = null;
    }
    return shared = new PhotoLibrary(backend, keepSetting(storage));
}
//# sourceMappingURL=library.js.map