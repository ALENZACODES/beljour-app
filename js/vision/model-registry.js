/** E03 model registry: browser-side licence, exact hash and byte gate.
 * Models are fetched only after explicit commercial clearance, from this origin
 * and with a pinned digest. Pending models do not reach fetch(), even if a developer
 * directly calls this module. No model weights are committed to the repo.
 * Author: John Khan.
 */
import { siteRoot } from "./site-root.js";
import { MODEL_CATALOG } from "./generated/model-catalog.js";
import { MODEL_LICENCES, ALLOWED_LICENCES } from "./generated/model-licences.js";
export class ModelGateError extends Error {
    constructor(message) { super(message); this.name = "ModelGateError"; }
}
const ID = /^[a-z][a-z0-9-]{2,63}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*\.(task|tflite|onnx)$/;
const MAX_MODEL_BYTES = 120 * 1024 * 1024;
const TASKS = ["face-detection", "face-landmarks", "pose", "hair-segmentation", "person-segmentation", "inpainting"];
const HOSTS = new Set(["storage.googleapis.com", "huggingface.co"]);
const HF_PATH = /^\/[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*\/resolve\/([A-Za-z0-9._-]+)\/[A-Za-z0-9._/-]+$/;
const COMMIT = /^[a-f0-9]{40}$/;
/** True unless the URL is a Hugging Face file on a branch rather than a pinned commit. */
export function pinnedRevision(url) {
    const parsed = new URL(url);
    if (parsed.hostname !== "huggingface.co")
        return true;
    const match = HF_PATH.exec(parsed.pathname);
    return !!match && COMMIT.test(match[1]);
}
const allowed = new Set(ALLOWED_LICENCES);
export function verifyRecord(item, licences) {
    if (!ID.test(item.id) || !TASKS.includes(item.task) || !["allowed", "blocked", "pending"].includes(item.status)) {
        throw new ModelGateError("unknown model ID, task or status");
    }
    if (item.runsOn !== "browser")
        throw new ModelGateError("E05 models must run in the browser");
    const url = new URL(item.url);
    if (url.protocol !== "https:" || !HOSTS.has(url.hostname) ||
        !!url.username || !!url.password || !!url.search || !!url.hash ||
        ![".task", ".tflite", ".onnx"].some((ext) => url.pathname.endsWith(ext)) ||
        !FILE_NAME.test(item.filename) || item.filename !== url.pathname.split("/").at(-1)) {
        throw new ModelGateError(`model ${item.id}: unapproved download URL or file name`);
    }
    if (url.hostname === "huggingface.co" && !HF_PATH.test(url.pathname)) {
        throw new ModelGateError(`model ${item.id}: Hugging Face URLs must be /<owner>/<repo>/resolve/<revision>/<file>`);
    }
    if (item.sha256 !== null && !SHA256.test(item.sha256))
        throw new ModelGateError(`model ${item.id}: sha256 must be lower-case hex`);
    if (item.bytes !== null && (!Number.isSafeInteger(item.bytes) || item.bytes < 1 || item.bytes > MAX_MODEL_BYTES)) {
        throw new ModelGateError(`model ${item.id}: invalid byte size`);
    }
    if (item.status === "allowed" && (!item.sha256 || !item.bytes)) {
        throw new ModelGateError(`model ${item.id}: allowed weight requires known sha256 and size`);
    }
    if (item.status === "allowed" && !pinnedRevision(item.url)) {
        throw new ModelGateError(`model ${item.id}: allowed Hugging Face weight must pin a commit, not a branch`);
    }
    const entry = licences[item.licenceName];
    if (!entry || entry.licence !== item.licence || entry.status !== item.status ||
        !entry.urls.some((prefix) => item.url.startsWith(prefix))) {
        throw new ModelGateError(`model ${item.id}: no matching licence ledger entry`);
    }
    if (item.status === "allowed" && !allowed.has(item.licence)) {
        throw new ModelGateError(`model ${item.id}: commercial licence not approved`);
    }
}
export class BrowserModelRegistry {
    items;
    licences;
    constructor(catalogue = MODEL_CATALOG, licences = MODEL_LICENCES) {
        if (catalogue.format !== "beljour-models/1" || catalogue.version !== 1 ||
            !Array.isArray(catalogue.models) || catalogue.models.length > 64) {
            throw new ModelGateError("invalid model registry format");
        }
        this.licences = licences;
        const map = new Map(), urls = new Set();
        for (const item of catalogue.models) {
            verifyRecord(item, licences);
            if (map.has(item.id) || urls.has(item.url))
                throw new ModelGateError("duplicate model ID or URL");
            map.set(item.id, Object.freeze({ ...item }));
            urls.add(item.url);
        }
        this.items = map;
    }
    get(id) {
        const model = this.items.get(id);
        if (!model)
            throw new ModelGateError(`unknown model ${id}`);
        return model;
    }
    approve(id) {
        const item = this.get(id);
        if (item.status !== "allowed")
            throw new ModelGateError(`model ${id} is ${item.status}; use the manual fallback`);
        verifyRecord(item, this.licences);
        return item;
    }
    ready(id) {
        try {
            this.approve(id);
            return true;
        }
        catch {
            return false;
        }
    }
}
/** The upstream URL records provenance. Execution only uses this exact local path. */
export function modelAssetPath(item) {
    if (!item.sha256 || !SHA256.test(item.sha256) || !item.bytes || !FILE_NAME.test(item.filename)) {
        throw new ModelGateError(`model ${item.id}: exact asset pin required`);
    }
    return `${siteRoot()}models/${item.sha256}/${item.filename}`;
}
/** Byte-for-byte SHA-256, using the same lowercase hex encoding as hashlib. */
export async function hashModel(bytes) {
    if (!globalThis.crypto?.subtle)
        throw new ModelGateError("SHA-256 not available in this browser");
    return [...new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes))]
        .map((b) => b.toString(16).padStart(2, "0")).join("");
}
/** Safe stream download with size bounds, no redirect or credentials. Does not run
 * on pending models. Both length *and* hash are mandatory before execution. */
export async function fetchVerifiedModel(name, registry, fetcher = fetch, signal) {
    const item = registry.approve(name); // no network before the policy decision
    signal?.throwIfAborted();
    const response = await fetcher(modelAssetPath(item), {
        method: "GET", mode: "same-origin", credentials: "omit", redirect: "error", cache: "no-store", signal,
    });
    if (response.status === 404)
        throw new ModelGateError(`model ${name}: download rejected; assets are not staged on this origin`);
    if (!response.ok || response.type === "opaque" || response.type === "opaqueredirect" || response.redirected) {
        throw new ModelGateError(`model ${name}: download rejected`);
    }
    const length = response.headers.get("content-length");
    // Hosts such as GitHub Pages gzip the transfer, so the header then counts compressed bytes;
    // the decoded size and SHA-256 below are still checked exactly.
    const encoded = (response.headers.get("content-encoding") ?? "identity").toLowerCase() !== "identity";
    if (length && !encoded && Number(length) !== item.bytes)
        throw new ModelGateError(`model ${name}: length header mismatch`);
    if (!response.body)
        throw new ModelGateError(`model ${name}: no readable response body`);
    const chunks = [];
    let total = 0;
    const reader = response.body.getReader();
    try {
        while (true) {
            const next = await reader.read();
            if (next.done)
                break;
            total += next.value.byteLength;
            if (total > MAX_MODEL_BYTES || total > item.bytes)
                throw new ModelGateError(`model ${name}: oversize download`);
            chunks.push(next.value);
        }
    }
    catch (error) {
        await reader.cancel().catch(() => undefined);
        throw error;
    }
    finally {
        reader.releaseLock();
    }
    if (total !== item.bytes)
        throw new ModelGateError(`model ${name}: downloaded size mismatch`);
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const part of chunks) {
        bytes.set(part, offset);
        offset += part.byteLength;
    }
    if (await hashModel(bytes.buffer) !== item.sha256)
        throw new ModelGateError(`model ${name}: sha256 mismatch`);
    return bytes;
}
/** Concurrency-safe cache for the worker. Failed attempts do not poison retry;
 * shutdown drops every verified model buffer. */
export class ModelDownloads {
    registry;
    fetcher;
    pending = new Map();
    constructor(registry, fetcher = fetch) {
        this.registry = registry;
        this.fetcher = fetcher;
    }
    load(name, signal) {
        this.registry.approve(name);
        let job = this.pending.get(name);
        if (!job) {
            job = fetchVerifiedModel(name, this.registry, this.fetcher, signal).catch((error) => {
                this.pending.delete(name);
                throw error;
            });
            this.pending.set(name, job);
        }
        return job;
    }
    clear() { this.pending.clear(); }
}
export const DEFAULT_MODELS = new BrowserModelRegistry();
//# sourceMappingURL=model-registry.js.map