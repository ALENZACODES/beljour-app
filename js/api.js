/** Typed client for the optional BELJOUR API (our own server-side engines). The app runs on the
 * device without it: config.js leaves the API origin unset, and every screen has an on-device path. */
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
    /** A path our API returned (an image), as a URL an <img> can load with this tab's session. */
    resultUrl: (path) => {
        if (!path.startsWith("/api/"))
            throw new ApiError(0, "invalid_path", "Unexpected result address.");
        return `${requireBase()}${path}${path.includes("?") ? "&" : "?"}s=${encodeURIComponent(sessionId(store))}`;
    },
    deletePhoto: (id) => call(`/api/photos/${id}`, { method: "DELETE" }),
    skin: (photo_id, landmarks) => post("/api/skin/analyze", { photo_id, landmarks }),
    shade: (photo_id, landmarks) => post("/api/shade/analyze", { photo_id, landmarks }),
    proportions: (photo_id, landmarks) => post("/api/face/proportions", { photo_id, landmarks }),
    procedures: () => call("/api/surgery/procedures"),
    surgery: (body) => post("/api/surgery/preview", body),
    simulate: (photo_id, strengths, landmarks) => post("/api/skin/simulate", { photo_id, strengths, landmarks }),
    aging: (photo_id, landmarks) => post("/api/transform/aging", { photo_id, landmarks }),
};
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
//# sourceMappingURL=api.js.map