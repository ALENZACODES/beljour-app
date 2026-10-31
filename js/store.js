const DB = "plumb";
const STORE = "skin";
const BODY = "body";
function open() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB, 2);
        req.onupgradeneeded = () => {
            for (const name of [STORE, BODY]) {
                if (!req.result.objectStoreNames.contains(name))
                    req.result.createObjectStore(name, { autoIncrement: true });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}
export function toEntry(result, sample, at = new Date()) {
    const scores = {};
    for (const s of result.scores)
        scores[s.concern] = s.raw_score;
    return { at: at.toISOString(), overall: result.overall, scores, sample };
}
export async function addSkin(entry) {
    const db = await open();
    await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).add(entry);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}
export async function listSkin() {
    const db = await open();
    return new Promise((resolve, reject) => {
        const req = db.transaction(STORE).objectStore(STORE).getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}
export async function clearAll() {
    const db = await open();
    await new Promise((resolve) => {
        const tx = db.transaction([STORE, BODY], "readwrite");
        tx.objectStore(STORE).clear();
        tx.objectStore(BODY).clear();
        tx.oncomplete = () => resolve();
    });
}
export async function addBody(entry) {
    const db = await open();
    await new Promise((resolve, reject) => {
        const tx = db.transaction(BODY, "readwrite");
        tx.objectStore(BODY).add(entry);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}
export async function listBody() {
    const db = await open();
    return new Promise((resolve, reject) => {
        const req = db.transaction(BODY).objectStore(BODY).getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}
/** Change in a concern's measured score between the first and last real (non sample) entries. */
export function trend(entries, concern) {
    const real = entries.filter((e) => !e.sample && concern in e.scores);
    if (real.length < 2)
        return null;
    const first = real[0].scores[concern], last = real[real.length - 1].scores[concern];
    return { first, last, change: Math.round((last - first) * 10) / 10 };
}
