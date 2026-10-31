/** Typed client for the BELJOUR API. The YouCam key never reaches the browser. */
import { browserStore, SESSION_HEADER, sessionId } from "./session.js";
import { withEndpoint } from "./ui/provenance.js";
export const store = browserStore();
/** Headers every request carries: the per-tab session id, never anything secret. */
export function sessionHeaders() {
    return { [SESSION_HEADER]: sessionId(store) };
}
export class ApiError extends Error {
    status;
    code;
    retryAfterSeconds;
    constructor(status, code, message, retryAfterSeconds = null) {
        super(message);
        this.status = status;
        this.code = code;
        this.retryAfterSeconds = retryAfterSeconds;
    }
}
/** The configured API origin, or null when none is set (config.js leaves it empty on a
 * static-only deploy). With null the app runs in local-only mode: on-device tools work,
 * and nothing is sent anywhere. Only http(s) origins are accepted. */
export function apiBase() {
    const scope = globalThis;
    const raw = scope.BELJOUR_API ?? scope.PLUMB_API;
    if (typeof raw !== "string")
        return null;
    const value = raw.trim().replace(/\/+$/, "");
    if (!value || value === "none" || !/^https?:\/\/[^\s/?#]+$/i.test(value))
        return null;
    return value;
}
export const NO_API_MESSAGE = "This copy of BELJOUR runs on your device only, so there is no server to ask. On-device tools still work.";
function requireBase() {
    const base = apiBase();
    if (base === null)
        throw new ApiError(0, "no_api", NO_API_MESSAGE);
    return base;
}
async function call(path, init = {}) {
    const base = requireBase();
    let resp;
    try {
        resp = await fetch(base + path, { ...init, headers: { ...sessionHeaders(), ...init.headers } });
    }
    catch {
        throw new ApiError(0, "offline", "Can't reach the BELJOUR server. If it was asleep, it can take up to a minute to wake. Try again shortly.");
    }
    const body = await resp.json().catch(() => ({}));
    if (!resp.ok) {
        // The API answers every refusal as {"error": {code, message}}, invalid requests included
        // (code "invalid_request", status 422). An older server sent FastAPI's {"detail": [...]}.
        const legacy = Array.isArray(body.detail)
            ? { code: "invalid_request", message: "Part of this request wasn't accepted. Reload the page and try again." } : {};
        const err = body.error ?? legacy;
        const retryHeader = resp.headers.get("Retry-After") ?? "";
        const retry = /^\d+$/.test(retryHeader) ? Number(retryHeader) : NaN;
        const wait = resp.status === 429 && Number.isSafeInteger(retry) && retry > 0 ? Math.min(86400, retry) : null;
        throw new ApiError(resp.status, err.code ?? "error", err.message ?? `The server replied ${resp.status}.`, wait);
    }
    return withEndpoint(path, body);
}
function post(path, json) {
    return call(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(json) });
}
export const api = {
    health: () => call("/api/health"),
    samplePhoto: () => call("/api/photos/sample"),
    uploadPhoto: (blob) => {
        const form = new FormData();
        form.append("file", blob, "photo.jpg");
        return call("/api/photos", { method: "POST", body: form });
    },
    // An <img> cannot send the session header, so the per-tab session id rides as ?s=.
    photoUrl: (id) => `${requireBase()}/api/photos/${encodeURIComponent(id)}.jpg?s=${encodeURIComponent(sessionId(store))}`,
    skinMatch: (body) => post("/api/skin/match", body),
    skinMoment: (body) => post("/api/skin/moment", body),
    /** A path our API returned (a try-on image), as a URL an <img> can load with this tab's session. */
    resultUrl: (path) => {
        if (!path.startsWith("/api/"))
            throw new ApiError(0, "invalid_path", "Unexpected result address.");
        return `${requireBase()}${path}${path.includes("?") ? "&" : "?"}s=${encodeURIComponent(sessionId(store))}`;
    },
    deletePhoto: (id) => call(`/api/photos/${id}`, { method: "DELETE" }),
    quote: (body) => post("/api/quote", body),
    skin: (photo_id, landmarks) => post("/api/skin/analyze", { photo_id, landmarks }),
    shade: (photo_id, landmarks) => post("/api/shade/analyze", { photo_id, landmarks }),
    proportions: (photo_id, landmarks) => post("/api/face/proportions", { photo_id, landmarks }),
    procedures: () => call("/api/surgery/procedures"),
    surgery: (body) => post("/api/surgery/preview", body),
    simulate: (photo_id, strengths, landmarks) => post("/api/skin/simulate", { photo_id, strengths, landmarks }),
    aging: (photo_id, landmarks) => post("/api/transform/aging", { photo_id, landmarks }),
    // round 1: session, judge code, styling scope, background tasks
    session: () => call("/api/session"),
    judge: (code) => post("/api/session/judge", { code }),
    stylingScope: () => call("/api/styling/scope"),
    startTask: (body) => post("/api/tasks/start", body),
    task: (requestKey) => call(`/api/tasks/${encodeURIComponent(requestKey)}`),
    resumeTasks: (tickets) => post("/api/tasks/resume", { tickets }),
    /** Older from YouCam Aging (2 units, "age" consent): the reply names a delta pack, never an image. */
    olderYoucam: (body) => post("/api/older/youcam", body),
    olderPack: async (path) => {
        if (!/^\/api\/older\/pack\/[\w-]+\.bin$/.test(path))
            throw new ApiError(0, "invalid_path", "Unexpected result address.");
        let resp;
        try {
            resp = await fetch(requireBase() + path, { headers: sessionHeaders() });
        }
        catch {
            throw new ApiError(0, "offline", "Can't reach the BELJOUR server. Try again shortly.");
        }
        if (!resp.ok)
            throw new ApiError(resp.status, "older_pack", "The Older result has expired. Run it again (a saved result costs nothing).");
        return resp.arrayBuffer();
    },
};
export async function commerceTransport({ endpoint, method, payload, timeoutMs = 95_000 }) {
    // Disallow arbitrary paths, query strings, protocol-relative URLs and surprises.
    const exact = new Set([
        "/api/photos", "/api/commerce/match", "/api/commerce/try-on", "/api/commerce/look/try-on",
        "/api/commerce/bag", "/api/commerce/bag/add", "/api/commerce/bag/remove",
        "/api/commerce/wishlist", "/api/commerce/bag/clear",
    ]);
    if (!exact.has(endpoint) && !/^\/api\/photos\/[0-9a-f]{64}$/.test(endpoint)) {
        throw new ApiError(0, "invalid_path", "Unrecognized commerce endpoint.");
    }
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120_000) {
        throw new ApiError(0, "invalid_timeout", "Invalid commerce request timeout.");
    }
    const base = requireBase();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const headers = sessionHeaders();
        if (payload && !(payload instanceof FormData))
            headers["Content-Type"] = "application/json";
        const response = await fetch(base + endpoint, {
            method: method ?? (payload === undefined ? "GET" : "POST"),
            headers,
            body: payload === undefined ? undefined : payload instanceof FormData ? payload : JSON.stringify(payload),
            signal: controller.signal,
            cache: "no-store",
            credentials: "omit",
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
            const outer = result !== null && typeof result === "object" ? result : {};
            const err = outer.error;
            throw new ApiError(response.status, typeof err?.code === "string" ? err.code : "server", typeof err?.message === "string" ? err.message : `Commerce service replied ${response.status}.`);
        }
        return result;
    }
    catch (reason) {
        if (reason instanceof ApiError)
            throw reason;
        throw new ApiError(0, "connection", "Unable to reach the service. The original photo and local recipe remain on this device.");
    }
    finally {
        clearTimeout(timer);
    }
}
/** The partner spot's region (docs/PARTNER-SPOT.md): GET /api/region, which reads only a country
 * header the hosting CDN sets, and only when the operator configured it. Sends no session id,
 * cookie or photo; any failure reads as no answer. Author: John Khan. */
export async function partnerRegion() {
    const base = apiBase();
    if (base === null)
        return null;
    try {
        const resp = await fetch(`${base}/api/region`, { cache: "no-store", credentials: "omit" });
        return resp.ok ? (await resp.json()).region ?? null : null;
    }
    catch {
        return null;
    }
}
