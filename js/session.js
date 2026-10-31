export const SESSION_KEY = "beljour.session";
export const PENDING_KEY = "beljour.pending";
export const SESSION_HEADER = "X-Beljour-Session";
export const MAX_PENDING = 20;
const ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
/** In memory stand in, also used by the tests. */
export class MemoryStore {
    data = new Map();
    getItem(key) { return this.data.has(key) ? this.data.get(key) : null; }
    setItem(key, value) { this.data.set(key, value); }
    removeItem(key) { this.data.delete(key); }
}
/** A store whose every call may throw; failures fall back to memory, once and for good. */
export class SafeStore {
    inner;
    fallback = new MemoryStore();
    broken = false;
    constructor(inner) {
        this.inner = inner;
    }
    use(fn) {
        if (!this.broken) {
            try {
                const s = this.inner();
                if (s)
                    return fn(s);
            }
            catch { /* storage blocked */ }
            this.broken = true;
        }
        return fn(this.fallback);
    }
    getItem(key) { return this.use((s) => s.getItem(key)); }
    setItem(key, value) { this.use((s) => s.setItem(key, value)); }
    removeItem(key) { this.use((s) => s.removeItem(key)); }
}
export function browserStore() {
    return new SafeStore(() => (typeof sessionStorage === "undefined" ? null : sessionStorage));
}
/** 24 url safe characters from the platform's random source. */
export function newSessionId(fill) {
    const bytes = new Uint8Array(18);
    if (fill)
        fill(bytes);
    else
        crypto.getRandomValues(bytes);
    let bin = "";
    for (const b of bytes)
        bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function validSessionId(id) {
    return typeof id === "string" && ID_PATTERN.test(id);
}
export function sessionId(store, make = () => newSessionId()) {
    const current = store.getItem(SESSION_KEY);
    if (validSessionId(current))
        return current;
    const id = make();
    store.setItem(SESSION_KEY, id);
    return id;
}
function isTicket(value) {
    const t = value;
    return !!t && typeof t.request_key === "string" && typeof t.task_id === "string" && typeof t.feature === "string"
        && typeof t.version === "string" && typeof t.owner === "string" && typeof t.units === "number"
        && typeof t.sig === "string";
}
export function pendingTickets(store) {
    const raw = store.getItem(PENDING_KEY);
    if (!raw)
        return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter(isTicket).slice(-MAX_PENDING) : [];
    }
    catch {
        return [];
    }
}
function savePending(store, tickets) {
    if (tickets.length === 0)
        store.removeItem(PENDING_KEY);
    else
        store.setItem(PENDING_KEY, JSON.stringify(tickets.slice(-MAX_PENDING)));
}
export function addPending(store, ticket) {
    const kept = pendingTickets(store).filter((t) => t.request_key !== ticket.request_key);
    const next = [...kept, ticket];
    savePending(store, next);
    return next.slice(-MAX_PENDING);
}
export function removePending(store, requestKey) {
    const next = pendingTickets(store).filter((t) => t.request_key !== requestKey);
    savePending(store, next);
    return next;
}
/** Statuses after which a ticket is no use: the result is in, or it never will be. */
const FINISHED = new Set(["done", "rejected", "failed", "ambiguous", "expired"]);
/**
 * Hand pending tickets back to the server and forget the ones that are finished. `running`
 * and `offline` (server in demo mode right now) are kept for the next try.
 */
export async function resumePending(store, send) {
    const tickets = pendingTickets(store);
    if (tickets.length === 0)
        return [];
    const { tasks } = await send(tickets);
    for (const t of tasks)
        if (FINISHED.has(t.status))
            removePending(store, t.request_key);
    return tasks;
}
/** Wait for a background task, asking every `everyMs`, at most `tries` times. */
export async function waitForTask(get, { tries = 60, everyMs = 2000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
    let last = await get();
    for (let i = 1; i < tries && last.status === "running"; i++) {
        await sleep(everyMs);
        last = await get();
    }
    return last;
}
