/** Where saved looks live (free-library plan §4A DataStore role): IndexedDB in the browser,
 * memory in tests and when storage is blocked. Every record is validated on the way out, so a
 * damaged or tampered record is skipped instead of breaking the editor. Photos are never
 * stored here; only recipes. Author: John Khan.
 */
import { cloneLook } from "./recipe.js";
import { validateRecipe } from "./validate.js";
export class MemoryLookStorage {
    kind = "memory";
    records = new Map();
    faces = new Map();
    async get(id) {
        const raw = this.records.get(id);
        if (raw === undefined)
            return null;
        try {
            return validateRecipe(JSON.parse(raw));
        }
        catch {
            return null;
        }
    }
    async put(look) {
        const clean = validateRecipe(cloneLook(look));
        this.records.set(clean.id, JSON.stringify(clean));
    }
    async list() {
        const out = [];
        for (const id of this.records.keys()) {
            const look = await this.get(id);
            if (look)
                out.push(look);
        }
        return out.sort((a, b) => a.created.localeCompare(b.created) || a.id.localeCompare(b.id));
    }
    async delete(id) { this.faces.delete(id); return this.records.delete(id); }
    async getFace(id) {
        const raw = this.faces.get(id);
        return raw === undefined ? null : JSON.parse(raw);
    }
    async putFace(id, face) {
        if (!this.records.has(id))
            throw new RangeError("recipe missing");
        // Serialize before mutation so cyclic or unsupported payloads cannot leave
        // the map half-updated. JSON parsing on read provides defensive cloning.
        const serialized = JSON.stringify(face);
        if (typeof serialized !== "string")
            throw new TypeError("face state is not serializable");
        this.faces.set(id, serialized);
    }
    async clear() { const n = this.records.size; this.records.clear(); this.faces.clear(); return n; }
    /** Test hook: put raw text in, as a damaged disk would. */
    putRaw(id, text) { this.records.set(id, text); }
}
const DB_NAME = "beljour-save";
const STORE = "looks";
const FACE_STORE = "saved-faces";
function wrap(req) {
    return new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(new Error("browser storage refused the request"));
    });
}
export class IndexedDBLookStorage {
    idb;
    kind = "indexeddb";
    db = null;
    constructor(idb) {
        this.idb = idb;
    }
    open() {
        this.db ??= new Promise((resolve, reject) => {
            const req = this.idb.open(DB_NAME, 2);
            req.onupgradeneeded = () => {
                if (!req.result.objectStoreNames.contains(STORE))
                    req.result.createObjectStore(STORE, { keyPath: "id" });
                if (!req.result.objectStoreNames.contains(FACE_STORE))
                    req.result.createObjectStore(FACE_STORE, { keyPath: "id" });
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(new Error("browser storage is not available"));
        });
        return this.db;
    }
    async store(mode, name = STORE) {
        return (await this.open()).transaction(name, mode).objectStore(name);
    }
    async getFace(id) {
        const raw = await wrap((await this.store("readonly", FACE_STORE)).get(id));
        if (!raw || typeof raw !== "object")
            return null;
        const face = raw.face;
        if (!face || typeof face !== "object")
            return null;
        // Detach the returned value from any fake-IDB object identity and ensure
        // callers cannot mutate a record without an explicit checkpoint.
        try {
            return JSON.parse(JSON.stringify(face));
        }
        catch {
            return null;
        }
    }
    async putFace(id, face) {
        const db = await this.open();
        await new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE, FACE_STORE], "readwrite");
            const looks = transaction.objectStore(STORE);
            const faces = transaction.objectStore(FACE_STORE);
            let missing = false;
            const check = looks.get(id);
            check.onsuccess = () => {
                if (check.result === undefined) {
                    missing = true;
                    return;
                }
                try {
                    const detached = JSON.parse(JSON.stringify(face));
                    faces.put({ id, face: detached });
                }
                catch {
                    reject(new TypeError("face state is not serializable"));
                }
            };
            check.onerror = () => reject(new Error("recipe lookup failed"));
            transaction.oncomplete = () => {
                if (missing)
                    reject(new RangeError("recipe missing"));
                else
                    resolve();
            };
            transaction.onerror = () => reject(new Error("face save transaction failed"));
        });
    }
    async get(id) {
        const raw = await wrap((await this.store("readonly")).get(id));
        if (raw === undefined)
            return null;
        try {
            return validateRecipe(raw);
        }
        catch {
            return null;
        }
    }
    async put(look) { await wrap((await this.store("readwrite")).put(validateRecipe(cloneLook(look)))); }
    async list() {
        const rows = await wrap((await this.store("readonly")).getAll());
        return rows.flatMap((r) => { try {
            return [validateRecipe(r)];
        }
        catch {
            return [];
        } })
            .sort((a, b) => a.created.localeCompare(b.created) || a.id.localeCompare(b.id));
    }
    async delete(id) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE, FACE_STORE], "readwrite");
            const looks = transaction.objectStore(STORE);
            const faces = transaction.objectStore(FACE_STORE);
            let had = false;
            const check = looks.get(id);
            check.onsuccess = () => {
                had = check.result !== undefined;
                looks.delete(id);
                faces.delete(id);
            };
            check.onerror = () => reject(new Error("local deletion was refused"));
            transaction.oncomplete = () => resolve(had);
            transaction.onerror = () => reject(new Error("local deletion transaction failed"));
        });
    }
    async clear() {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE, FACE_STORE], "readwrite");
            const looks = transaction.objectStore(STORE);
            const faces = transaction.objectStore(FACE_STORE);
            let count = 0;
            const check = looks.count();
            check.onsuccess = () => {
                count = check.result;
                looks.clear();
                faces.clear();
            };
            check.onerror = () => reject(new Error("local clearing was refused"));
            transaction.oncomplete = () => resolve(count);
            transaction.onerror = () => reject(new Error("local clearing transaction failed"));
        });
    }
}
/** IndexedDB when the browser offers it, otherwise memory for this page only. */
export function browserLookStorage() {
    try {
        const idb = globalThis.indexedDB;
        if (idb)
            return new IndexedDBLookStorage(idb);
    }
    catch { /* storage blocked */ }
    return new MemoryLookStorage();
}
//# sourceMappingURL=storage.js.map